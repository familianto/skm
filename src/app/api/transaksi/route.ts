import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { transaksiCreateSchema } from '@/lib/validators';
import { AuditAksi, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tahun = searchParams.get('tahun');
    const bulan = searchParams.get('bulan');

    const rows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);
    let transaksis = rows.map(rowToTransaksi);

    if (tahun) {
      transaksis = transaksis.filter((t) => t.tanggal.startsWith(tahun));
    }

    if (bulan) {
      const monthPrefix = tahun ? `${tahun}-${bulan.padStart(2, '0')}` : `-${bulan.padStart(2, '0')}-`;
      transaksis = transaksis.filter((t) =>
        tahun ? t.tanggal.startsWith(monthPrefix) : t.tanggal.includes(monthPrefix)
      );
    }

    // Sort by date descending (newest first)
    transaksis.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));

    return NextResponse.json<ApiResponse<Transaksi[]>>(
      { success: true, data: transaksis, meta: { total: transaksis.length } }
    );
  } catch (error) {
    console.error('GET /api/transaksi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data transaksi.' },
      { status: 500 }
    );
  }
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
    const parsed = transaksiCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id } = parsed.data;
    const id = await sheetsService.getNextId(ID_PREFIXES.TRANSAKSI);
    const now = nowISO();
    const createdBy = session.role || 'Bendahara';

    // columns: id, tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id,
    //          bukti_url, status, void_reason, void_date, koreksi_dari_id, created_by, created_at, updated_at
    await sheetsService.appendRow(SHEET_NAMES.TRANSAKSI, [
      id, tanggal, jenis, kategori_id, deskripsi, jumlah.toString(),
      rekening_id, '', TransaksiStatus.AKTIF, '', '', '',
      createdBy, now, now,
    ]);

    await logAudit(
      AuditAksi.CREATE, SHEET_NAMES.TRANSAKSI, id,
      JSON.stringify({ tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id }),
      createdBy
    );

    const transaksi: Transaksi = {
      id, tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id,
      bukti_url: '', status: TransaksiStatus.AKTIF,
      void_reason: '', void_date: '', koreksi_dari_id: '',
      created_by: createdBy, created_at: now, updated_at: now,
    };

    return NextResponse.json<ApiResponse<Transaksi>>(
      { success: true, data: transaksi },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/transaksi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat transaksi.' },
      { status: 500 }
    );
  }
}
