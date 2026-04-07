import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse, Kelompok } from '@/types';
import { nowISO } from '@/lib/utils';

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

export async function GET() {
  try {
    // Auto-create sheet if it doesn't exist yet
    await sheetsService.ensureSheet(SHEET_NAMES.KELOMPOK);

    const rows = await sheetsService.getRows(SHEET_NAMES.KELOMPOK);
    const kelompoks = rows.map(rowToKelompok).filter(k => k.id);

    // Sort by created_at descending (newest first)
    kelompoks.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json<ApiResponse<Kelompok[]>>(
      { success: true, data: kelompoks, meta: { total: kelompoks.length } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('GET /api/kelompok error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Gagal mengambil data kelompok: ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nama, deskripsi, warna, kategori_masuk, kategori_keluar } = body;

    if (!nama || typeof nama !== 'string' || nama.trim().length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Nama kelompok wajib diisi.' },
        { status: 400 }
      );
    }

    const masukIds = Array.isArray(kategori_masuk) ? kategori_masuk.filter(Boolean) : [];
    const keluarIds = Array.isArray(kategori_keluar) ? kategori_keluar.filter(Boolean) : [];

    if (masukIds.length === 0 && keluarIds.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Pilih minimal satu kategori (MASUK atau KELUAR).' },
        { status: 400 }
      );
    }

    // Auto-create sheet if it doesn't exist yet (first-time use)
    await sheetsService.ensureSheet(SHEET_NAMES.KELOMPOK);

    const id = await sheetsService.getNextId(ID_PREFIXES.KELOMPOK);
    const now = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.KELOMPOK, [
      id,
      nama.trim(),
      (deskripsi || '').trim(),
      warna || '#059669',
      masukIds.join(','),
      keluarIds.join(','),
      now,
      now,
    ]);

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.KELOMPOK, id, JSON.stringify({ nama, masuk: masukIds.length, keluar: keluarIds.length }), 'Bendahara');

    const kelompok: Kelompok = {
      id,
      nama: nama.trim(),
      deskripsi: (deskripsi || '').trim(),
      warna: warna || '#059669',
      kategori_masuk: masukIds,
      kategori_keluar: keluarIds,
      created_at: now,
      updated_at: now,
    };

    return NextResponse.json<ApiResponse<Kelompok>>(
      { success: true, data: kelompok },
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/kelompok error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Gagal membuat kelompok: ${msg}` },
      { status: 500 }
    );
  }
}
