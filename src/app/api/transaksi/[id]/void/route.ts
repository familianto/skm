import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { voidTransaksiSchema } from '@/lib/validators';
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

    const { id } = await params;
    const body = await request.json();
    const parsed = voidTransaksiSchema.safeParse(body);

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
        { success: false, error: 'Hanya transaksi AKTIF yang bisa di-void.' },
        { status: 400 }
      );
    }

    const now = nowISO();
    const today = todayISO();

    const updated: string[] = [
      id,
      existing.tanggal,
      existing.jenis,
      existing.kategori_id,
      existing.deskripsi,
      existing.jumlah.toString(),
      existing.rekening_id,
      existing.bukti_url,
      TransaksiStatus.VOID,
      parsed.data.reason,
      today,
      existing.koreksi_dari_id,
      existing.created_by,
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, result.rowIndex, updated);

    await logAudit(
      AuditAksi.VOID, SHEET_NAMES.TRANSAKSI, id,
      JSON.stringify({ reason: parsed.data.reason }),
      session.role || 'Bendahara'
    );

    return NextResponse.json<ApiResponse<Transaksi>>(
      { success: true, data: rowToTransaksi(updated) }
    );
  } catch (error) {
    console.error('POST /api/transaksi/[id]/void error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal melakukan void transaksi.' },
      { status: 500 }
    );
  }
}
