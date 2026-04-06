import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { donaturCreateSchema } from '@/lib/validators';
import { AuditAksi, DonaturKelompok } from '@/types';
import type { ApiResponse, Donatur } from '@/types';
import { nowISO } from '@/lib/utils';

function rowToDonatur(row: string[]): Donatur {
  const headers = SHEET_HEADERS[SHEET_NAMES.DONATUR];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    kelompok: obj.kelompok as DonaturKelompok,
    jumlah_komitmen: parseInt(obj.jumlah_komitmen, 10) || 0,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Donatur;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const kelompok = searchParams.get('kelompok');
    const semua = searchParams.get('semua') === 'true';

    const rows = await sheetsService.getRows(SHEET_NAMES.DONATUR);
    let donaturs = rows.map(rowToDonatur);

    if (!semua) {
      donaturs = donaturs.filter((d) => d.is_active);
    }

    if (kelompok) {
      donaturs = donaturs.filter((d) => d.kelompok === kelompok);
    }

    return NextResponse.json<ApiResponse<Donatur[]>>(
      { success: true, data: donaturs, meta: { total: donaturs.length } }
    );
  } catch (error) {
    console.error('GET /api/donatur error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data donatur.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = donaturCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { nama, telepon, alamat, kelompok, jumlah_komitmen, catatan } = parsed.data;
    const id = await sheetsService.getNextId(ID_PREFIXES.DONATUR);
    const now = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.DONATUR, [
      id, nama, telepon, alamat, kelompok, jumlah_komitmen, catatan, 'TRUE', now, now,
    ]);

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.DONATUR, id, JSON.stringify({ nama, kelompok }), 'Bendahara');

    const donatur: Donatur = {
      id, nama, telepon, alamat, kelompok, jumlah_komitmen, catatan,
      is_active: true, created_at: now, updated_at: now,
    };

    return NextResponse.json<ApiResponse<Donatur>>(
      { success: true, data: donatur },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/donatur error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat donatur.' },
      { status: 500 }
    );
  }
}
