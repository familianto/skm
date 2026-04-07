import { NextResponse } from 'next/server';
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

export interface CumulativeCategoryItem {
  kategori_id: string;
  nama: string;
  jumlah: number;
  persentase: number;
}

export interface CumulativeDashboard {
  totalMasuk: number;
  totalKeluar: number;
  saldo: number;
  jumlahTransaksi: number;
  jumlahMasuk: number;
  jumlahKeluar: number;
  yearlyTrend: YearlyTrendItem[];
  categoryBreakdown: {
    masuk: CumulativeCategoryItem[];
    keluar: CumulativeCategoryItem[];
  };
}

export async function GET() {
  try {
    const [transaksiRows, kategoriRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
      `${SHEET_NAMES.KATEGORI}!A2:ZZ`,
    ]);

    const transaksis = transaksiRows
      .map(rowToTransaksi)
      .filter(t => t.status === TransaksiStatus.AKTIF && !t.mutasi_ref);

    const kategoriHeaders = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
    const kategoriMap = new Map<string, string>();
    for (const row of kategoriRows) {
      const obj: Record<string, string> = {};
      kategoriHeaders.forEach((h, i) => { obj[h] = row[i] || ''; });
      kategoriMap.set(obj.id, obj.nama);
    }

    const masukTx = transaksis.filter(t => t.jenis === TransaksiJenis.MASUK);
    const keluarTx = transaksis.filter(t => t.jenis === TransaksiJenis.KELUAR);

    const totalMasuk = masukTx.reduce((sum, t) => sum + t.jumlah, 0);
    const totalKeluar = keluarTx.reduce((sum, t) => sum + t.jumlah, 0);

    // Build yearly trend — extract unique years from data, start from 2025
    const yearMap = new Map<string, { masuk: number; keluar: number }>();
    for (const t of transaksis) {
      const year = t.tanggal.substring(0, 4);
      if (!year || year.length !== 4 || year < '2025') continue;
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

    // Category breakdown for all-time
    function buildCategoryBreakdown(txList: Transaksi[], total: number): CumulativeCategoryItem[] {
      const catMap = new Map<string, number>();
      for (const t of txList) {
        catMap.set(t.kategori_id, (catMap.get(t.kategori_id) || 0) + t.jumlah);
      }
      const items: CumulativeCategoryItem[] = Array.from(catMap.entries())
        .map(([kid, jml]) => ({
          kategori_id: kid,
          nama: kategoriMap.get(kid) || kid,
          jumlah: jml,
          persentase: total > 0 ? Math.round((jml / total) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.jumlah - a.jumlah);

      // Top 10 + Lainnya
      if (items.length > 10) {
        const top = items.slice(0, 10);
        const rest = items.slice(10);
        const restTotal = rest.reduce((s, r) => s + r.jumlah, 0);
        top.push({
          kategori_id: 'lainnya',
          nama: 'Lainnya',
          jumlah: restTotal,
          persentase: total > 0 ? Math.round((restTotal / total) * 10000) / 100 : 0,
        });
        return top;
      }
      return items;
    }

    const result: CumulativeDashboard = {
      totalMasuk,
      totalKeluar,
      saldo: totalMasuk - totalKeluar,
      jumlahTransaksi: transaksis.length,
      jumlahMasuk: masukTx.length,
      jumlahKeluar: keluarTx.length,
      yearlyTrend,
      categoryBreakdown: {
        masuk: buildCategoryBreakdown(masukTx, totalMasuk),
        keluar: buildCategoryBreakdown(keluarTx, totalKeluar),
      },
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
