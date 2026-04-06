import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { rekonsiliasiCreateSchema } from '@/lib/validators';
import { AuditAksi, TransaksiJenis, TransaksiStatus, RekonsiliasiStatus } from '@/types';
import type { ApiResponse, Rekonsiliasi, RekeningBank } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

function rowToRekonsiliasi(row: string[]): Rekonsiliasi {
  const headers = SHEET_HEADERS[SHEET_NAMES.REKONSILIASI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    saldo_bank: parseInt(obj.saldo_bank, 10) || 0,
    saldo_sistem: parseInt(obj.saldo_sistem, 10) || 0,
    selisih: parseInt(obj.selisih, 10) || 0,
  } as unknown as Rekonsiliasi;
}

function rowToRekening(row: string[]): RekeningBank {
  const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    saldo_awal: parseInt(obj.saldo_awal, 10) || 0,
    is_active: obj.is_active === 'true',
  } as unknown as RekeningBank;
}

/**
 * Calculate system balance for a specific bank account:
 * saldo_awal + SUM(MASUK AKTIF) - SUM(KELUAR AKTIF)
 */
function hitungSaldoSistem(
  rekeningId: string,
  saldoAwal: number,
  transaksiRows: string[][]
): number {
  const transaksiHeaders = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const idxRekening = transaksiHeaders.indexOf('rekening_id');
  const idxJenis = transaksiHeaders.indexOf('jenis');
  const idxJumlah = transaksiHeaders.indexOf('jumlah');
  const idxStatus = transaksiHeaders.indexOf('status');

  let totalMasuk = 0;
  let totalKeluar = 0;

  for (const row of transaksiRows) {
    if (row[idxRekening] !== rekeningId) continue;
    if (row[idxStatus] !== TransaksiStatus.AKTIF) continue;

    const jumlah = parseInt(row[idxJumlah], 10) || 0;
    if (row[idxJenis] === TransaksiJenis.MASUK) {
      totalMasuk += jumlah;
    } else if (row[idxJenis] === TransaksiJenis.KELUAR) {
      totalKeluar += jumlah;
    }
  }

  return saldoAwal + totalMasuk - totalKeluar;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const rekeningId = searchParams.get('rekening_id');

    const rows = await sheetsService.getRows(SHEET_NAMES.REKONSILIASI);
    let rekonsiliasis = rows.map(rowToRekonsiliasi);

    if (rekeningId) {
      rekonsiliasis = rekonsiliasis.filter((r) => r.rekening_id === rekeningId);
    }

    // Sort by date descending
    rekonsiliasis.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));

    return NextResponse.json<ApiResponse<Rekonsiliasi[]>>(
      { success: true, data: rekonsiliasis, meta: { total: rekonsiliasis.length } }
    );
  } catch (error) {
    console.error('GET /api/rekonsiliasi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data rekonsiliasi.' },
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
    const parsed = rekonsiliasiCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { rekening_id, tanggal, saldo_bank, catatan } = parsed.data;

    // Fetch rekening and transaksi data in batch
    const [rekeningRows, transaksiRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.REKENING_BANK}!A2:H`,
      `${SHEET_NAMES.TRANSAKSI}!A2:O`,
    ]);

    // Find the rekening
    const rekeningHeaderIdx = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK].indexOf('id');
    const rekening = (rekeningRows || []).find((r) => r[rekeningHeaderIdx] === rekening_id);
    if (!rekening) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Rekening tidak ditemukan.' },
        { status: 404 }
      );
    }

    const rekeningData = rowToRekening(rekening);
    const saldoSistem = hitungSaldoSistem(rekening_id, rekeningData.saldo_awal, transaksiRows || []);
    const selisih = saldo_bank - saldoSistem;
    const status = selisih === 0 ? RekonsiliasiStatus.SESUAI : RekonsiliasiStatus.TIDAK_SESUAI;

    const id = await sheetsService.getNextId(ID_PREFIXES.REKONSILIASI);
    const now = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.REKONSILIASI, [
      id, rekening_id, tanggal, saldo_bank.toString(), saldoSistem.toString(),
      selisih.toString(), status, catatan || '', now,
    ]);

    await logAudit(
      AuditAksi.CREATE, SHEET_NAMES.REKONSILIASI, id,
      JSON.stringify({ rekening_id, saldo_bank, saldo_sistem: saldoSistem, selisih, status }),
      session.role || 'Bendahara'
    );

    const rekonsiliasi: Rekonsiliasi = {
      id, rekening_id, tanggal, saldo_bank, saldo_sistem: saldoSistem,
      selisih, status, catatan: catatan || '', created_at: now,
    };

    return NextResponse.json<ApiResponse<Rekonsiliasi>>(
      { success: true, data: rekonsiliasi },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/rekonsiliasi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat rekonsiliasi.' },
      { status: 500 }
    );
  }
}
