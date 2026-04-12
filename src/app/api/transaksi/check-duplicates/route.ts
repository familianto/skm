import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse } from '@/types';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

// ============================================================
// Types
// ============================================================

type DuplicateEntry =
  | { type: 'exact'; transactionId: string }
  | { type: 'split'; transactionIds: string[] };

interface PossibleDuplicate {
  /** YYYY-MM-DD */
  tanggal: string;
  jumlah: number;
  jenis: TransaksiJenis;
  /** Nomor referensi dari CSV yang memicu match */
  bank_ref: string;
  /** ID transaksi existing yang kemungkinan duplikat */
  existingTransactionId: string;
  /** Deskripsi transaksi existing (untuk ditampilkan ke user) */
  existingDescription: string;
}

interface CheckDuplicatesResponse {
  duplicates: Record<string, DuplicateEntry>;
  possibleDuplicates: PossibleDuplicate[];
}

// ============================================================
// Request schemas
// ============================================================

const checkItemSchema = z.object({
  /** Nomor referensi CSV bank (mandatory) */
  bank_ref: z.string().min(1),
  /** Tanggal YYYY-MM-DD — required for Layer 2 */
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jumlah: z.number().int().positive(),
  jenis: z.nativeEnum(TransaksiJenis),
});

const checkBatchSchema = z.object({
  items: z.array(checkItemSchema).min(1).max(2000),
});

type CheckItem = z.infer<typeof checkItemSchema>;

// ============================================================
// Handler
// ============================================================

async function runCheck(items: CheckItem[]): Promise<CheckDuplicatesResponse> {
  // Ensure the `bank_ref` column exists on the sheet — idempotent.
  await sheetsService.ensureColumnHeader(SHEET_NAMES.TRANSAKSI, 'bank_ref');

  // Fetch ALL transaksi rows once. We need id + tanggal + jumlah + jenis
  // + status + bank_ref for matching. Keep the fetch narrow to the columns
  // we actually need to reduce payload size.
  //
  // Column layout (after ensureColumnHeader):
  //   A id, B tanggal, C jenis, D kategori_id, E deskripsi, F jumlah,
  //   G rekening_id, H bukti_url, I status, ..., P mutasi_ref, Q bank_ref
  const existingRows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);

  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const IDX = {
    id: headers.indexOf('id'),
    tanggal: headers.indexOf('tanggal'),
    jenis: headers.indexOf('jenis'),
    deskripsi: headers.indexOf('deskripsi'),
    jumlah: headers.indexOf('jumlah'),
    status: headers.indexOf('status'),
    bank_ref: headers.indexOf('bank_ref'),
  };

  // Build fast lookup tables in a single pass.
  //
  // - exactMap: bank_ref (as-is) → transaction id
  // - splitMap: base ref → [{ id, splitIndex }] (so callers can list all child ids)
  // - manualIndex: tanggal|jumlah|jenis key → [{ id, deskripsi }]
  //   (only includes rows where bank_ref is empty — candidates for Layer 2)
  const exactMap = new Map<string, string>();
  const splitMap = new Map<string, string[]>();
  const manualIndex = new Map<string, { id: string; deskripsi: string }[]>();

  for (const row of existingRows) {
    const status = row[IDX.status] || '';
    // Ignore VOID rows — they should not block a re-import.
    if (status === TransaksiStatus.VOID) continue;

    const id = row[IDX.id] || '';
    const bankRef = row[IDX.bank_ref] || '';

    if (bankRef) {
      // Layer 1 data
      const splitMatch = bankRef.match(/^(.+)_split_\d+$/);
      if (splitMatch) {
        const base = splitMatch[1];
        const arr = splitMap.get(base) || [];
        arr.push(id);
        splitMap.set(base, arr);
        // Also index the exact split ref so individual children can be
        // detected when the same CSV is re-split and re-imported.
        exactMap.set(bankRef, id);
      } else {
        exactMap.set(bankRef, id);
      }
    } else {
      // Layer 2 data — manual input or pre-bank_ref rows
      const tanggalPart = (row[IDX.tanggal] || '').slice(0, 10);
      const jumlah = row[IDX.jumlah] || '';
      const jenis = row[IDX.jenis] || '';
      const key = `${tanggalPart}|${jumlah}|${jenis}`;
      const arr = manualIndex.get(key) || [];
      arr.push({ id, deskripsi: row[IDX.deskripsi] || '' });
      manualIndex.set(key, arr);
    }
  }

  // Now walk each requested item and classify it.
  const duplicates: Record<string, DuplicateEntry> = {};
  const possibleDuplicates: PossibleDuplicate[] = [];

  for (const item of items) {
    const ref = item.bank_ref;

    // Layer 1a: exact bank_ref match
    const exactId = exactMap.get(ref);
    if (exactId) {
      duplicates[ref] = { type: 'exact', transactionId: exactId };
      continue;
    }

    // Layer 1b: split prefix match (ref has been imported as N split children)
    const splitIds = splitMap.get(ref);
    if (splitIds && splitIds.length > 0) {
      duplicates[ref] = { type: 'split', transactionIds: splitIds };
      continue;
    }

    // Layer 2: fallback — check manual-input transactions by tanggal+jumlah+jenis
    const key = `${item.tanggal}|${item.jumlah}|${item.jenis}`;
    const manualMatches = manualIndex.get(key);
    if (manualMatches && manualMatches.length > 0) {
      // Report the first match as the "suggested existing". Multiple matches
      // on the same day/amount/type are rare and the user can see from the
      // description whether they're the same.
      const first = manualMatches[0];
      possibleDuplicates.push({
        tanggal: item.tanggal,
        jumlah: item.jumlah,
        jenis: item.jenis,
        bank_ref: ref,
        existingTransactionId: first.id,
        existingDescription: first.deskripsi,
      });
    }
  }

  return { duplicates, possibleDuplicates };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = checkBatchSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue.path.join('.');
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Validasi gagal di ${path}: ${issue.message}` },
        { status: 400 }
      );
    }

    const result = await runCheck(parsed.data.items);
    return NextResponse.json<ApiResponse<CheckDuplicatesResponse>>(
      { success: true, data: result }
    );
  } catch (error) {
    const err = error as Error;
    console.error('POST /api/transaksi/check-duplicates error:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Cek duplikat gagal: ${err.message || 'Terjadi kesalahan'}` },
      { status: 500 }
    );
  }
}
