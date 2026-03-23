import { NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi, RekeningBank, Master } from '@/types';

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

function rowToMaster(row: string[]): Master {
  const headers = SHEET_HEADERS[SHEET_NAMES.MASTER];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return obj as unknown as Master;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

export interface PublicRingkasan {
  namaMasjid: string;
  alamat: string;
  logoUrl: string;
  bulanIni: {
    totalMasuk: number;
    totalKeluar: number;
    saldo: number;
  };
  saldoTotal: number;
  tren6Bulan: {
    bulan: string;
    masuk: number;
    keluar: number;
  }[];
  transaksiTerakhir: {
    tanggal: string;
    deskripsi: string;
    jenis: string;
    jumlah: number;
  }[];
}

export async function GET() {
  try {
    const [masterRows, transaksiRows, rekeningRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.MASTER}!A2:ZZ`,
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
      `${SHEET_NAMES.REKENING_BANK}!A2:ZZ`,
    ]);

    // Master info
    const master = masterRows.length > 0 ? rowToMaster(masterRows[0]) : null;

    // All active transactions
    const allTransaksi = transaksiRows.map(rowToTransaksi);
    const aktifTransaksi = allTransaksi.filter(t => t.status === TransaksiStatus.AKTIF);

    // Current month filter
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const bulanIniTx = aktifTransaksi.filter(t => t.tanggal.startsWith(currentMonthPrefix));

    const totalMasuk = bulanIniTx
      .filter(t => t.jenis === TransaksiJenis.MASUK)
      .reduce((sum, t) => sum + t.jumlah, 0);
    const totalKeluar = bulanIniTx
      .filter(t => t.jenis === TransaksiJenis.KELUAR)
      .reduce((sum, t) => sum + t.jumlah, 0);

    // Total saldo across all active rekening
    const rekeningList = rekeningRows.map(rowToRekening).filter(r => r.is_active);
    const saldoTotal = rekeningList.reduce((total, rek) => {
      const masuk = aktifTransaksi
        .filter(t => t.rekening_id === rek.id && t.jenis === TransaksiJenis.MASUK)
        .reduce((sum, t) => sum + t.jumlah, 0);
      const keluar = aktifTransaksi
        .filter(t => t.rekening_id === rek.id && t.jenis === TransaksiJenis.KELUAR)
        .reduce((sum, t) => sum + t.jumlah, 0);
      return total + rek.saldo_awal + masuk - keluar;
    }, 0);

    // 6-month trend (current month and 5 previous)
    const tren6Bulan: { bulan: string; masuk: number; keluar: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthTx = aktifTransaksi.filter(t => t.tanggal.startsWith(prefix));
      tren6Bulan.push({
        bulan: MONTH_NAMES[d.getMonth()],
        masuk: monthTx.filter(t => t.jenis === TransaksiJenis.MASUK).reduce((s, t) => s + t.jumlah, 0),
        keluar: monthTx.filter(t => t.jenis === TransaksiJenis.KELUAR).reduce((s, t) => s + t.jumlah, 0),
      });
    }

    // Last 10 transactions (safe for public - no sensitive fields)
    const transaksiTerakhir = aktifTransaksi
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.created_at.localeCompare(a.created_at))
      .slice(0, 10)
      .map(t => ({
        tanggal: t.tanggal,
        deskripsi: t.deskripsi,
        jenis: t.jenis,
        jumlah: t.jumlah,
      }));

    const ringkasan: PublicRingkasan = {
      namaMasjid: master?.nama_masjid || 'Masjid',
      alamat: master?.alamat || '',
      logoUrl: master?.logo_url || '',
      bulanIni: { totalMasuk, totalKeluar, saldo: totalMasuk - totalKeluar },
      saldoTotal,
      tren6Bulan,
      transaksiTerakhir,
    };

    return NextResponse.json<ApiResponse<PublicRingkasan>>(
      { success: true, data: ringkasan },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('GET /api/publik/ringkasan error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data ringkasan publik.' },
      { status: 500 }
    );
  }
}
