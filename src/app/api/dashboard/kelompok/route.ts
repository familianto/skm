import { NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse, Kelompok, Transaksi } from '@/types';

function rowToKelompok(row: string[]): Kelompok {
  const headers = SHEET_HEADERS[SHEET_NAMES.KELOMPOK];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    id: obj.id,
    nama: obj.nama,
    deskripsi: obj.deskripsi,
    warna: obj.warna || '#059669',
    kategori_masuk: obj.kategori_masuk ? obj.kategori_masuk.split(',').filter(Boolean) : [],
    kategori_keluar: obj.kategori_keluar ? obj.kategori_keluar.split(',').filter(Boolean) : [],
    created_at: obj.created_at,
    updated_at: obj.updated_at,
  };
}

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

export interface KelompokSummaryItem {
  id: string;
  nama: string;
  warna: string;
  totalMasuk: number;
  totalKeluar: number;
  saldo: number;
  jumlahKategoriMasuk: number;
  jumlahKategoriKeluar: number;
  jumlahTransaksi: number;
}

export async function GET() {
  try {
    // Auto-create sheet if missing (first-time use before any kelompok exists)
    await sheetsService.ensureSheet(SHEET_NAMES.KELOMPOK);

    const [kelompokRows, transaksiRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.KELOMPOK}!A2:ZZ`,
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
    ]);

    const kelompoks = kelompokRows.map(rowToKelompok).filter(k => k.id);
    const transaksis = transaksiRows.map(rowToTransaksi).filter(t => t.status === TransaksiStatus.AKTIF);

    const summary: KelompokSummaryItem[] = kelompoks.map(k => {
      const masukSet = new Set(k.kategori_masuk);
      const keluarSet = new Set(k.kategori_keluar);

      const masukTx = transaksis.filter(t => t.jenis === TransaksiJenis.MASUK && masukSet.has(t.kategori_id));
      const keluarTx = transaksis.filter(t => t.jenis === TransaksiJenis.KELUAR && keluarSet.has(t.kategori_id));

      const totalMasuk = masukTx.reduce((s, t) => s + t.jumlah, 0);
      const totalKeluar = keluarTx.reduce((s, t) => s + t.jumlah, 0);

      return {
        id: k.id,
        nama: k.nama,
        warna: k.warna,
        totalMasuk,
        totalKeluar,
        saldo: totalMasuk - totalKeluar,
        jumlahKategoriMasuk: k.kategori_masuk.length,
        jumlahKategoriKeluar: k.kategori_keluar.length,
        jumlahTransaksi: masukTx.length + keluarTx.length,
      };
    });

    return NextResponse.json<ApiResponse<KelompokSummaryItem[]>>(
      { success: true, data: summary }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('GET /api/dashboard/kelompok error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Gagal mengambil data ringkasan kelompok: ${msg}` },
      { status: 500 }
    );
  }
}
