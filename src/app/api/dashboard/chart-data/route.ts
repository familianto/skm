import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi, Kategori } from '@/types';

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

function rowToKategori(row: string[]): Kategori {
  const headers = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Kategori;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

export interface MonthlyTrendItem {
  bulan: string;
  bulanIndex: number;
  masuk: number;
  keluar: number;
}

export interface CategoryBreakdownItem {
  kategori_id: string;
  nama: string;
  jumlah: number;
  persentase: number;
}

export interface ChartData {
  type: string;
  data: MonthlyTrendItem[] | CategoryBreakdownItem[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type');
    const tahun = searchParams.get('tahun') || new Date().getFullYear().toString();

    if (!type || !['monthly-trend', 'category-breakdown'].includes(type)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Parameter type harus monthly-trend atau category-breakdown' },
        { status: 400 }
      );
    }

    // Batch fetch transaksi and kategori
    const [transaksiRows, kategoriRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
      `${SHEET_NAMES.KATEGORI}!A2:ZZ`,
    ]);

    const allTransaksi = transaksiRows.map(rowToTransaksi);
    const kategoriList = kategoriRows.map(rowToKategori);

    // Filter: active transactions in the given year
    const transaksis = allTransaksi.filter(
      t => t.status === TransaksiStatus.AKTIF && t.tanggal.startsWith(tahun)
    );

    if (type === 'monthly-trend') {
      const data: MonthlyTrendItem[] = MONTH_NAMES.map((nama, idx) => {
        const monthStr = `${tahun}-${String(idx + 1).padStart(2, '0')}`;
        const monthTx = transaksis.filter(t => t.tanggal.startsWith(monthStr));
        return {
          bulan: nama,
          bulanIndex: idx + 1,
          masuk: monthTx
            .filter(t => t.jenis === TransaksiJenis.MASUK)
            .reduce((sum, t) => sum + t.jumlah, 0),
          keluar: monthTx
            .filter(t => t.jenis === TransaksiJenis.KELUAR)
            .reduce((sum, t) => sum + t.jumlah, 0),
        };
      });

      return NextResponse.json<ApiResponse<ChartData>>(
        { success: true, data: { type, data } }
      );
    }

    // category-breakdown
    const jenis = searchParams.get('jenis') as TransaksiJenis || TransaksiJenis.KELUAR;
    const filtered = transaksis.filter(t => t.jenis === jenis);
    const total = filtered.reduce((sum, t) => sum + t.jumlah, 0);

    // Group by kategori
    const kategoriMap = new Map<string, number>();
    for (const t of filtered) {
      kategoriMap.set(t.kategori_id, (kategoriMap.get(t.kategori_id) || 0) + t.jumlah);
    }

    // Build breakdown with names, sorted by amount descending
    let breakdown: CategoryBreakdownItem[] = [];
    for (const [kategori_id, jumlah] of kategoriMap) {
      const kat = kategoriList.find(k => k.id === kategori_id);
      breakdown.push({
        kategori_id,
        nama: kat?.nama || kategori_id,
        jumlah,
        persentase: total > 0 ? Math.round((jumlah / total) * 10000) / 100 : 0,
      });
    }
    breakdown.sort((a, b) => b.jumlah - a.jumlah);

    // Top 5 + "Lainnya"
    if (breakdown.length > 5) {
      const top5 = breakdown.slice(0, 5);
      const rest = breakdown.slice(5);
      const restTotal = rest.reduce((sum, r) => sum + r.jumlah, 0);
      top5.push({
        kategori_id: 'lainnya',
        nama: 'Lainnya',
        jumlah: restTotal,
        persentase: total > 0 ? Math.round((restTotal / total) * 10000) / 100 : 0,
      });
      breakdown = top5;
    }

    return NextResponse.json<ApiResponse<ChartData>>(
      { success: true, data: { type, data: breakdown } }
    );
  } catch (error) {
    console.error('GET /api/dashboard/chart-data error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data grafik.' },
      { status: 500 }
    );
  }
}
