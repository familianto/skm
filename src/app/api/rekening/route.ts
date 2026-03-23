import { NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { rekeningCreateSchema } from '@/lib/validators';
import { AuditAksi } from '@/types';
import type { ApiResponse, RekeningBank } from '@/types';
import { nowISO } from '@/lib/utils';
import { NextRequest } from 'next/server';

function rowToRekening(row: string[]): RekeningBank {
  const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    saldo_awal: parseInt(obj.saldo_awal, 10) || 0,
    is_active: obj.is_active === 'TRUE',
  } as unknown as RekeningBank;
}

export async function GET() {
  try {
    const rows = await sheetsService.getRows(SHEET_NAMES.REKENING_BANK);
    const rekenings = rows.map(rowToRekening).filter((r) => r.is_active);

    return NextResponse.json<ApiResponse<RekeningBank[]>>(
      { success: true, data: rekenings, meta: { total: rekenings.length } }
    );
  } catch (error) {
    console.error('GET /api/rekening error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data rekening.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = rekeningCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { nama_bank, nomor_rekening, atas_nama, saldo_awal } = parsed.data;
    const id = await sheetsService.getNextId(ID_PREFIXES.REKENING_BANK);
    const now = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.REKENING_BANK, [
      id, nama_bank, nomor_rekening, atas_nama, saldo_awal, 'TRUE', now, now,
    ]);

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.REKENING_BANK, id, JSON.stringify({ nama_bank, nomor_rekening }), 'Bendahara');

    const rekening: RekeningBank = {
      id, nama_bank, nomor_rekening, atas_nama, saldo_awal,
      is_active: true, created_at: now, updated_at: now,
    };

    return NextResponse.json<ApiResponse<RekeningBank>>(
      { success: true, data: rekening },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/rekening error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat rekening.' },
      { status: 500 }
    );
  }
}
