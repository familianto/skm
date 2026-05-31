import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi, TransaksiStatus, TransaksiJenis } from '@/types';
import { nowISO } from '@/lib/utils';
import type { JenisHewan, TipePembelian } from './daftar-hewan-types';

/**
 * Jembatan island Qurban → ledger SKM-core (F6 Model A).
 *
 * Modul qurban TIDAK memiliki/menyentuh schema `transaksi`/`kategori`/
 * `rekening_bank`; ia hanya:
 *   1. me-RESOLVE id kategori/rekening yang sudah ada by-name (read-only), dan
 *   2. menulis baris pemasukan lewat jalur kanonik SKM (id `TRX-`, status
 *      AKTIF, audit SKM) — transaksi yang dihasilkan tak terbedakan dari
 *      transaksi yang dibuat manual via `POST /api/transaksi`.
 *
 * Catatan jalur (B-2): di repo TIDAK ada service pembuat-transaksi yang bisa
 * di-reuse — logika create di-INLINE pada handler `POST /api/transaksi`
 * (`src/app/api/transaksi/route.ts`). Helper di bawah MEREPLIKASI urutan
 * kanonik itu persis (`getNextId(TRX)` → append baris berlayout
 * `SHEET_HEADERS.transaksi` → `logAudit`), bukan `appendRow` mentah tanpa
 * id/status/audit.
 */

// Nama kategori income qurban yang SUDAH ada di sheet `kategori` (jenis MASUK).
export const KATEGORI_QURBAN = {
  KAMBING: 'Qurban Kambing',
  SAPI: 'Qurban Sapi',
  JASA_TITIP: 'Qurban Jasa Titip & Pakan',
} as const;

/** Nama rekening Kas Tunai (Model A) di sheet `rekening_bank`. */
export const REKENING_KAS_TUNAI = 'Kas Tunai';

/**
 * Tentukan NAMA kategori income untuk satu slot qurban.
 * - BAWA_SENDIRI (bawa sendiri / titip) → Jasa Titip & Pakan (mengalahkan jenis).
 * - BELI → per jenis hewan (Kambing / Sapi).
 */
export function kategoriNamaForTipe(args: {
  jenisHewan: JenisHewan;
  tipePembelian: TipePembelian;
}): string {
  if (args.tipePembelian === 'BAWA_SENDIRI') return KATEGORI_QURBAN.JASA_TITIP;
  if (args.jenisHewan === 'KAMBING') return KATEGORI_QURBAN.KAMBING;
  if (args.jenisHewan === 'SAPI') return KATEGORI_QURBAN.SAPI;
  throw new Error(`Jenis hewan tidak dikenal untuk resolusi kategori: ${args.jenisHewan}`);
}

export interface SlotTipe {
  jenisHewan: JenisHewan;
  tipePembelian: TipePembelian;
}

export type KategoriDecision =
  | { mixed: false; nama: string }
  | { mixed: true; nama: string[] };

/**
 * Putuskan kategori untuk seluruh slot satu `kode_bayar` (pure).
 * - Semua slot → satu nama kategori → `{mixed:false}`.
 * - Lintas kategori (mis. pasca-pemetaan dipindah ke hewan beda jenis) →
 *   `{mixed:true}` (caller TIDAK boleh auto-create transaksi campur).
 */
export function decideKategoriNama(slots: SlotTipe[]): KategoriDecision {
  const names = Array.from(new Set(slots.map(kategoriNamaForTipe)));
  if (names.length === 1) return { mixed: false, nama: names[0] };
  return { mixed: true, nama: names };
}

/**
 * Resolve id kategori income qurban by NAMA persis + `jenis==='MASUK'`.
 * Lempar error bila tak ditemukan (jangan diam-diam pakai default).
 */
export async function resolveKategoriIdByNama(nama: string): Promise<string> {
  const rows = await sheetsService.getRows(SHEET_NAMES.KATEGORI);
  const headers = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
  const idIdx = headers.indexOf('id');
  const namaIdx = headers.indexOf('nama');
  const jenisIdx = headers.indexOf('jenis');
  for (const r of rows) {
    if (r[namaIdx] === nama && r[jenisIdx] === 'MASUK' && r[idIdx]) {
      return r[idIdx];
    }
  }
  throw new Error(`Kategori "${nama}" (MASUK) tidak ditemukan di sheet kategori. Buat dulu di halaman Kategori.`);
}

/** Resolve id kategori dari (jenisHewan, tipePembelian) satu slot. */
export function resolveKategoriQurbanByTipe(args: {
  jenisHewan: JenisHewan;
  tipePembelian: TipePembelian;
}): Promise<string> {
  return resolveKategoriIdByNama(kategoriNamaForTipe(args));
}

/**
 * Resolve id rekening by `nama_bank` ATAU `atas_nama` persis (case-sensitive).
 * Lempar error bila tak ditemukan.
 */
export async function resolveRekeningByNama(nama: string): Promise<string> {
  const rows = await sheetsService.getRows(SHEET_NAMES.REKENING_BANK);
  const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
  const idIdx = headers.indexOf('id');
  const bankIdx = headers.indexOf('nama_bank');
  const anIdx = headers.indexOf('atas_nama');
  for (const r of rows) {
    if ((r[bankIdx] === nama || r[anIdx] === nama) && r[idIdx]) {
      return r[idIdx];
    }
  }
  throw new Error(`Rekening "${nama}" tidak ditemukan di sheet rekening_bank.`);
}

export interface CreateTransaksiPemasukanArgs {
  kategori_id: string;
  rekening_id: string;
  /** Rupiah integer (tanpa desimal). */
  jumlah: number;
  /** Format tanggal SKM-core: `YYYY-MM-DD` (BUKAN ISO-Z). */
  tanggal: string;
  deskripsi: string;
  bukti_url?: string;
  created_by: string;
}

/**
 * Tulis SATU transaksi pemasukan (MASUK, AKTIF) lewat jalur kanonik SKM.
 * Layout kolom mengikuti `SHEET_HEADERS.transaksi` (17 kolom). Mengembalikan
 * id `TRX-` yang dibuat.
 */
export async function createTransaksiPemasukanQurban(
  args: CreateTransaksiPemasukanArgs
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.tanggal)) {
    throw new Error(`tanggal transaksi harus format YYYY-MM-DD, diterima: "${args.tanggal}"`);
  }
  const now = nowISO();
  const id = await sheetsService.getNextId(ID_PREFIXES.TRANSAKSI);

  // Kolom: id, tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id,
  //        bukti_url, status, void_reason, void_date, koreksi_dari_id,
  //        created_by, created_at, updated_at, mutasi_ref, bank_ref
  await sheetsService.appendRow(SHEET_NAMES.TRANSAKSI, [
    id, args.tanggal, TransaksiJenis.MASUK, args.kategori_id, args.deskripsi,
    args.jumlah.toString(), args.rekening_id, args.bukti_url || '',
    TransaksiStatus.AKTIF, '', '', '',
    args.created_by, now, now, '', '',
  ]);

  await logAudit(
    AuditAksi.CREATE,
    SHEET_NAMES.TRANSAKSI,
    id,
    JSON.stringify({
      tanggal: args.tanggal,
      jenis: TransaksiJenis.MASUK,
      kategori_id: args.kategori_id,
      deskripsi: args.deskripsi,
      jumlah: args.jumlah,
      rekening_id: args.rekening_id,
      sumber: 'qurban_pembayaran_tunai',
    }),
    args.created_by
  );

  return id;
}
