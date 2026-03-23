import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { koreksiTransaksiSchema } from '@/lib/validators';
import { AuditAksi, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi } from '@/types';
import { nowISO, todayISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

type RouteParams = { params: Promise<{ id: string }> };

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: originalId } = await params;
    const body = await request.json();
    const parsed = koreksiTransaksiSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Verify original transaction exists
    const original = await sheetsService.getRowById(SHEET_NAMES.TRANSAKSI, originalId);
    if (!original) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Transaksi asli tidak ditemukan.' },
        { status: 404 }
      );
    }

    const { tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id, void_original } = parsed.data;
    const now = nowISO();
    const createdBy = session.role || 'Bendahara';

    // Create new correction transaction
    const newId = await sheetsService.getNextId(ID_PREFIXES.TRANSAKSI);

    await sheetsService.appendRow(SHEET_NAMES.TRANSAKSI, [
      newId, tanggal, jenis, kategori_id, deskripsi, jumlah.toString(),
      rekening_id, '', TransaksiStatus.AKTIF, '', '', originalId,
      createdBy, now, now,
    ]);

    await logAudit(
      AuditAksi.KOREKSI, SHEET_NAMES.TRANSAKSI, newId,
      JSON.stringify({ koreksi_dari: originalId, tanggal, jenis, jumlah }),
      createdBy
    );

    // Optionally void the original transaction
    if (void_original) {
      const existingTrx = rowToTransaksi(original.row);
      if (existingTrx.status === TransaksiStatus.AKTIF) {
        const today = todayISO();
        const voidedRow: string[] = [
          originalId,
          existingTrx.tanggal,
          existingTrx.jenis,
          existingTrx.kategori_id,
          existingTrx.deskripsi,
          existingTrx.jumlah.toString(),
          existingTrx.rekening_id,
          existingTrx.bukti_url,
          TransaksiStatus.VOID,
          `Dikoreksi oleh ${newId}`,
          today,
          existingTrx.koreksi_dari_id,
          existingTrx.created_by,
          existingTrx.created_at,
          now,
        ];
        await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, original.rowIndex, voidedRow);

        await logAudit(
          AuditAksi.VOID, SHEET_NAMES.TRANSAKSI, originalId,
          JSON.stringify({ reason: `Dikoreksi oleh ${newId}` }),
          createdBy
        );
      }
    }

    const newTransaksi: Transaksi = {
      id: newId, tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id,
      bukti_url: '', status: TransaksiStatus.AKTIF,
      void_reason: '', void_date: '', koreksi_dari_id: originalId,
      created_by: createdBy, created_at: now, updated_at: now,
    };

    return NextResponse.json<ApiResponse<Transaksi>>(
      { success: true, data: newTransaksi },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/transaksi/[id]/koreksi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat koreksi transaksi.' },
      { status: 500 }
    );
  }
}
