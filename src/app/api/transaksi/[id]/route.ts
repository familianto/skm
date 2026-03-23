import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { transaksiUpdateSchema } from '@/lib/validators';
import { AuditAksi, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi } from '@/types';
import { nowISO } from '@/lib/utils';
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

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await sheetsService.getRowById(SHEET_NAMES.TRANSAKSI, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Transaksi tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<Transaksi>>(
      { success: true, data: rowToTransaksi(result.row) }
    );
  } catch (error) {
    console.error('GET /api/transaksi/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data transaksi.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = transaksiUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await sheetsService.getRowById(SHEET_NAMES.TRANSAKSI, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Transaksi tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToTransaksi(result.row);

    if (existing.status !== TransaksiStatus.AKTIF) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Hanya transaksi AKTIF yang bisa diubah.' },
        { status: 400 }
      );
    }

    const updates = parsed.data;
    const now = nowISO();

    const updated: string[] = [
      id,
      updates.tanggal ?? existing.tanggal,
      updates.jenis ?? existing.jenis,
      updates.kategori_id ?? existing.kategori_id,
      updates.deskripsi ?? existing.deskripsi,
      (updates.jumlah ?? existing.jumlah).toString(),
      updates.rekening_id ?? existing.rekening_id,
      existing.bukti_url,
      existing.status,
      existing.void_reason,
      existing.void_date,
      existing.koreksi_dari_id,
      existing.created_by,
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, result.rowIndex, updated);

    await logAudit(
      AuditAksi.UPDATE, SHEET_NAMES.TRANSAKSI, id,
      JSON.stringify(updates), session.role || 'Bendahara'
    );

    return NextResponse.json<ApiResponse<Transaksi>>(
      { success: true, data: rowToTransaksi(updated) }
    );
  } catch (error) {
    console.error('PUT /api/transaksi/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate transaksi.' },
      { status: 500 }
    );
  }
}
