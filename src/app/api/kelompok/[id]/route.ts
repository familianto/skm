import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse, Kelompok } from '@/types';
import { nowISO } from '@/lib/utils';

type RouteParams = { params: Promise<{ id: string }> };

function rowToKelompok(row: string[]): Kelompok {
  const headers = SHEET_HEADERS[SHEET_NAMES.KELOMPOK];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    id: obj.id,
    nama: obj.nama,
    deskripsi: obj.deskripsi,
    warna: obj.warna || '#059669',
    kategori_masuk: obj.kategori_masuk ? obj.kategori_masuk.split(',').filter(Boolean) : [],
    kategori_keluar: obj.kategori_keluar ? obj.kategori_keluar.split(',').filter(Boolean) : [],
    created_at: obj.created_at,
    updated_at: obj.updated_at,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const result = await sheetsService.getRowById(SHEET_NAMES.KELOMPOK, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Kelompok tidak ditemukan.' },
        { status: 404 }
      );
    }
    return NextResponse.json<ApiResponse<Kelompok>>(
      { success: true, data: rowToKelompok(result.row) }
    );
  } catch (error) {
    console.error('GET /api/kelompok/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil kelompok.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nama, deskripsi, warna, kategori_masuk, kategori_keluar } = body;

    if (!nama || typeof nama !== 'string' || nama.trim().length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Nama kelompok wajib diisi.' },
        { status: 400 }
      );
    }

    const result = await sheetsService.getRowById(SHEET_NAMES.KELOMPOK, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Kelompok tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToKelompok(result.row);
    const masukIds = Array.isArray(kategori_masuk) ? kategori_masuk.filter(Boolean) : existing.kategori_masuk;
    const keluarIds = Array.isArray(kategori_keluar) ? kategori_keluar.filter(Boolean) : existing.kategori_keluar;

    if (masukIds.length === 0 && keluarIds.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Pilih minimal satu kategori (MASUK atau KELUAR).' },
        { status: 400 }
      );
    }

    const now = nowISO();
    const updated: string[] = [
      id,
      nama.trim(),
      (deskripsi || '').trim(),
      warna || existing.warna || '#059669',
      masukIds.join(','),
      keluarIds.join(','),
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.KELOMPOK, result.rowIndex, updated);

    await logAudit(AuditAksi.UPDATE, SHEET_NAMES.KELOMPOK, id, JSON.stringify({ nama }), 'Bendahara');

    return NextResponse.json<ApiResponse<Kelompok>>(
      { success: true, data: rowToKelompok(updated) }
    );
  } catch (error) {
    console.error('PUT /api/kelompok/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate kelompok.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const result = await sheetsService.getRowById(SHEET_NAMES.KELOMPOK, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Kelompok tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToKelompok(result.row);

    // Hard delete by clearing the row — keep row index, blank fields
    const blanked: string[] = ['', '', '', '', '', '', '', ''];
    await sheetsService.updateRow(SHEET_NAMES.KELOMPOK, result.rowIndex, blanked);

    void logAudit(AuditAksi.DELETE, SHEET_NAMES.KELOMPOK, id, `Hapus kelompok: ${existing.nama}`, 'Bendahara');

    return NextResponse.json<ApiResponse<null>>({ success: true });
  } catch (error) {
    console.error('DELETE /api/kelompok/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal menghapus kelompok.' },
      { status: 500 }
    );
  }
}
