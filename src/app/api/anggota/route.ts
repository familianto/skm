import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { anggotaCreateSchema } from '@/lib/validators';
import { AuditAksi, UserPeran } from '@/types';
import type { ApiResponse, Anggota } from '@/types';
import { nowISO } from '@/lib/utils';

function rowToAnggota(row: string[]): Anggota {
  const headers = SHEET_HEADERS[SHEET_NAMES.ANGGOTA];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    peran: obj.peran as UserPeran,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Anggota;
}

export async function GET() {
  try {
    const rows = await sheetsService.getRows(SHEET_NAMES.ANGGOTA);
    const anggota = rows.map(rowToAnggota).filter((a) => a.is_active);

    return NextResponse.json<ApiResponse<Anggota[]>>(
      { success: true, data: anggota, meta: { total: anggota.length } }
    );
  } catch (error) {
    console.error('GET /api/anggota error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data anggota.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = anggotaCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { nama, telepon, email, peran } = parsed.data;
    const id = await sheetsService.getNextId(ID_PREFIXES.ANGGOTA);
    const now = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.ANGGOTA, [
      id, nama, telepon, email, peran, 'TRUE', now,
    ]);

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.ANGGOTA, id, JSON.stringify({ nama, peran }), 'Bendahara');

    const anggota: Anggota = {
      id, nama, telepon, email, peran, is_active: true, created_at: now,
    };

    return NextResponse.json<ApiResponse<Anggota>>(
      { success: true, data: anggota },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/anggota error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat anggota.' },
      { status: 500 }
    );
  }
}
