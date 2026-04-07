import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi, TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

// Accept "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" (SKM convention for imports)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;

const importItemSchema = z.object({
  tanggal: z.string().regex(DATE_REGEX, 'Tanggal harus format YYYY-MM-DD atau YYYY-MM-DD HH:MM:SS'),
  jenis: z.nativeEnum(TransaksiJenis),
  kategori_id: z.string().min(1),
  deskripsi: z.string().min(1).max(500),
  jumlah: z.number().int().positive(),
  rekening_id: z.string().min(1),
});

const importBatchSchema = z.object({
  items: z.array(importItemSchema).min(1).max(500),
});

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
    const parsed = importBatchSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue.path.join('.');
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Validasi gagal di ${path}: ${issue.message}` },
        { status: 400 }
      );
    }

    const { items } = parsed.data;
    const now = nowISO();
    const createdBy = session.role || 'Bendahara';

    // ============================================================
    // Optimization: read existing rows ONCE, generate IDs in memory,
    // then a single batch append. Avoids 1204 API calls for 602 items.
    // ============================================================

    // 1. Read existing transaksi rows once (1 API call)
    const existingRows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);

    // 2. Compute starting counter from today's prefix
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefixPattern = `${ID_PREFIXES.TRANSAKSI}-${today}-`;
    let maxCounter = 0;
    for (const row of existingRows) {
      const id = row[0];
      if (id && id.startsWith(prefixPattern)) {
        const counter = parseInt(id.slice(prefixPattern.length), 10);
        if (counter > maxCounter) maxCounter = counter;
      }
    }

    // 3. Generate IDs in memory + build all rows
    const ids: string[] = [];
    const rowsToAppend: string[][] = items.map((item, idx) => {
      const counter = maxCounter + idx + 1;
      const id = `${prefixPattern}${String(counter).padStart(4, '0')}`;
      ids.push(id);
      return [
        id, item.tanggal, item.jenis, item.kategori_id, item.deskripsi,
        item.jumlah.toString(), item.rekening_id, '',
        TransaksiStatus.AKTIF, '', '', '',
        createdBy, now, now,
      ];
    });

    // 4. Single batch append (1 API call instead of N)
    await sheetsService.appendRows(SHEET_NAMES.TRANSAKSI, rowsToAppend);

    // Audit log: fire-and-forget
    void logAudit(
      AuditAksi.CREATE, SHEET_NAMES.TRANSAKSI, 'BATCH_IMPORT',
      JSON.stringify({ count: items.length, firstId: ids[0], lastId: ids[ids.length - 1] }),
      createdBy
    );

    return NextResponse.json<ApiResponse<{ imported: number; ids: string[] }>>(
      { success: true, data: { imported: ids.length, ids } },
      { status: 201 }
    );
  } catch (error) {
    // Detailed error logging — surface the real reason to the client
    const err = error as Error;
    console.error('POST /api/transaksi/import error:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    const errorMessage = err.message || 'Gagal mengimport transaksi.';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Import gagal: ${errorMessage}` },
      { status: 500 }
    );
  }
}
