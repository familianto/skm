import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi, RekeningBank } from '@/types';

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

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

export interface DashboardSummary {
  totalMasuk: number;
  totalKeluar: number;
  saldo: number;
  jumlahTransaksi: number;
  saldoPerRekening: {
    rekening_id: string;
    nama_bank: string;
    nomor_rekening: string;
    saldo: number;
  }[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tahun = searchParams.get('tahun');
    const bulan = searchParams.get('bulan');

    // Batch fetch transaksi and rekening in a single API call
    const [transaksiRows, rekeningRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
      `${SHEET_NAMES.REKENING_BANK}!A2:ZZ`,
    ]);

    const allTransaksi = transaksiRows.map(rowToTransaksi);
    const rekeningList = rekeningRows.map(rowToRekening).filter(r => r.is_active);

    // Filter active transaksi only
    let transaksis = allTransaksi.filter(t => t.status === TransaksiStatus.AKTIF);

    // Apply period filter
    if (tahun) {
      transaksis = transaksis.filter(t => t.tanggal.startsWith(tahun));
    }
    if (bulan) {
      const monthPrefix = tahun ? `${tahun}-${bulan.padStart(2, '0')}` : `-${bulan.padStart(2, '0')}-`;
      transaksis = transaksis.filter(t =>
        tahun ? t.tanggal.startsWith(monthPrefix) : t.tanggal.includes(monthPrefix)
      );
    }

    const totalMasuk = transaksis
      .filter(t => t.jenis === TransaksiJenis.MASUK)
      .reduce((sum, t) => sum + t.jumlah, 0);

    const totalKeluar = transaksis
      .filter(t => t.jenis === TransaksiJenis.KELUAR)
      .reduce((sum, t) => sum + t.jumlah, 0);

    // Calculate saldo per rekening (all-time active transactions, no period filter)
    const aktifTransaksi = allTransaksi.filter(t => t.status === TransaksiStatus.AKTIF);
    const saldoPerRekening = rekeningList.map(rek => {
      const masuk = aktifTransaksi
        .filter(t => t.rekening_id === rek.id && t.jenis === TransaksiJenis.MASUK)
        .reduce((sum, t) => sum + t.jumlah, 0);
      const keluar = aktifTransaksi
        .filter(t => t.rekening_id === rek.id && t.jenis === TransaksiJenis.KELUAR)
        .reduce((sum, t) => sum + t.jumlah, 0);
      return {
        rekening_id: rek.id,
        nama_bank: rek.nama_bank,
        nomor_rekening: rek.nomor_rekening,
        saldo: rek.saldo_awal + masuk - keluar,
      };
    });

    const summary: DashboardSummary = {
      totalMasuk,
      totalKeluar,
      saldo: totalMasuk - totalKeluar,
      jumlahTransaksi: transaksis.length,
      saldoPerRekening,
    };

    return NextResponse.json<ApiResponse<DashboardSummary>>(
      { success: true, data: summary }
    );
  } catch (error) {
    console.error('GET /api/dashboard/summary error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data ringkasan.' },
      { status: 500 }
    );
  }
}
