import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import type { ApiResponse, Master } from '@/types';
import { nowISO } from '@/lib/utils';

function rowToMaster(row: string[]): Master {
  const headers = SHEET_HEADERS[SHEET_NAMES.MASTER];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return obj as unknown as Master;
}

function omitPinHash(master: Master): Omit<Master, 'pin_hash'> {
  const result = { ...master };
  delete (result as Record<string, unknown>).pin_hash;
  return result;
}

export async function GET() {
  try {
    const rows = await sheetsService.getRows(SHEET_NAMES.MASTER);
    if (rows.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Data master belum dikonfigurasi.' },
        { status: 404 }
      );
    }

    const master = rowToMaster(rows[0]);

    return NextResponse.json<ApiResponse<Omit<Master, 'pin_hash'>>>(
      { success: true, data: omitPinHash(master) }
    );
  } catch (error) {
    console.error('GET /api/master error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data master.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const rows = await sheetsService.getRows(SHEET_NAMES.MASTER);

    if (rows.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Data master belum dikonfigurasi.' },
        { status: 404 }
      );
    }

    const existing = rowToMaster(rows[0]);
    const now = nowISO();

    const updated: string[] = [
      existing.id,
      body.nama_masjid ?? existing.nama_masjid,
      body.alamat ?? existing.alamat,
      body.kota ?? existing.kota,
      body.provinsi ?? existing.provinsi,
      body.telepon ?? existing.telepon,
      body.email ?? existing.email,
      existing.pin_hash, // Don't allow PIN change through this endpoint
      body.logo_url ?? existing.logo_url,
      body.tahun_buku_aktif ?? existing.tahun_buku_aktif,
      body.mata_uang ?? existing.mata_uang,
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.MASTER, 2, updated);

    return NextResponse.json<ApiResponse<Omit<Master, 'pin_hash'>>>(
      { success: true, data: omitPinHash(rowToMaster(updated)) }
    );
  } catch (error) {
    console.error('PUT /api/master error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate data master.' },
      { status: 500 }
    );
  }
}
