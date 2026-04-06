import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi } from '@/types';

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

export interface YearlyTrendItem {
  tahun: string;
  masuk: number;
  keluar: number;
}

export interface CumulativeDashboard {
  totalMasuk: number;
  totalKeluar: number;
  saldo: number;
  jumlahTransaksi: number;
  yearlyTrend: YearlyTrendItem[];
}

export async function GET(request: NextRequest) {
  try {
    const [transaksiRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
    ]);

    const transaksis = transaksiRows
      .map(rowToTransaksi)
      .filter(t => t.status === TransaksiStatus.AKTIF);

    const totalMasuk = transaksis
      .filter(t => t.jenis === TransaksiJenis.MASUK)
      .reduce((sum, t) => sum + t.jumlah, 0);

    const totalKeluar = transaksis
      .filter(t => t.jenis === TransaksiJenis.KELUAR)
      .reduce((sum, t) => sum + t.jumlah, 0);

    // Build yearly trend — extract unique years from data
    const yearMap = new Map<string, { masuk: number; keluar: number }>();
    for (const t of transaksis) {
      const year = t.tanggal.substring(0, 4);
      if (!year || year.length !== 4) continue;
      if (!yearMap.has(year)) {
        yearMap.set(year, { masuk: 0, keluar: 0 });
      }
      const entry = yearMap.get(year)!;
      if (t.jenis === TransaksiJenis.MASUK) {
        entry.masuk += t.jumlah;
      } else {
        entry.keluar += t.jumlah;
      }
    }

    const yearlyTrend: YearlyTrendItem[] = Array.from(yearMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tahun, vals]) => ({ tahun, masuk: vals.masuk, keluar: vals.keluar }));

    const result: CumulativeDashboard = {
      totalMasuk,
      totalKeluar,
      saldo: totalMasuk - totalKeluar,
      jumlahTransaksi: transaksis.length,
      yearlyTrend,
    };

    return NextResponse.json<ApiResponse<CumulativeDashboard>>(
      { success: true, data: result }
    );
  } catch (error) {
    console.error('GET /api/dashboard/cumulative error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data kumulatif.' },
      { status: 500 }
    );
  }
}
