import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { kategoriCreateSchema } from '@/lib/validators';
import { AuditAksi } from '@/types';
import type { ApiResponse, Kategori } from '@/types';
import { nowISO } from '@/lib/utils';

function rowToKategori(row: string[]): Kategori {
  const headers = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Kategori;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const jenis = searchParams.get('jenis');

    const rows = await sheetsService.getRows(SHEET_NAMES.KATEGORI);
    let kategoris = rows.map(rowToKategori).filter((k) => k.is_active);

    if (jenis) {
      kategoris = kategoris.filter((k) => k.jenis === jenis);
    }

    return NextResponse.json<ApiResponse<Kategori[]>>(
      { success: true, data: kategoris, meta: { total: kategoris.length } }
    );
  } catch (error) {
    console.error('GET /api/kategori error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data kategori.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = kategoriCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { nama, jenis, deskripsi } = parsed.data;
    const id = await sheetsService.getNextId(ID_PREFIXES.KATEGORI);
    const now = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.KATEGORI, [
      id, nama, jenis, deskripsi, 'TRUE', now,
    ]);

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.KATEGORI, id, JSON.stringify({ nama, jenis }), 'Bendahara');

    const kategori: Kategori = { id, nama, jenis, deskripsi, is_active: true, created_at: now };

    return NextResponse.json<ApiResponse<Kategori>>(
      { success: true, data: kategori },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/kategori error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat kategori.' },
      { status: 500 }
    );
  }
}
