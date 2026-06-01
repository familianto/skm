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

/**
 * Nama rekening Kas Tunai (Model A) di sheet `rekening_bank`. SATU titik
 * konstanta untuk pengecualian "bukan tujuan transfer" — JANGAN tebar literal
 * "Kas Tunai" di tempat lain. Rekening bank (tujuan transfer) di-resolve DINAMIS
 * via `listBankRekeningIds()` (semua rekening minus ini); tak ada nama bank
 * produksi yang di-hardcode (pelajaran `migrate_F01`).
 */
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

/**
 * Resolve id SEMUA rekening "bank" (tujuan transfer) secara DINAMIS — yaitu
 * seluruh `rekening_bank` aktif MINUS Kas Tunai. Dipakai rekonsiliasi untuk
 * memindai transaksi MASUK kandidat tanpa meng-hardcode nama bank tertentu
 * (mis. "Bank Muamalat Indonesia"), konsisten dengan blok transfer di WA publik.
 *
 * Kas Tunai dikecualikan via `REKENING_KAS_TUNAI` (satu titik konstanta) karena
 * itu rekening setoran cash (Model A), bukan tujuan transfer. Kembalikan `[]`
 * bila tak ada rekening bank — caller wajib degradasi anggun (jangan crash).
 */
export async function listBankRekeningIds(): Promise<string[]> {
  const rows = await sheetsService.getRows(SHEET_NAMES.REKENING_BANK);
  const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
  const idIdx = headers.indexOf('id');
  const bankIdx = headers.indexOf('nama_bank');
  const anIdx = headers.indexOf('atas_nama');
  const activeIdx = headers.indexOf('is_active');
  const ids: string[] = [];
  for (const r of rows) {
    if (!r[idIdx]) continue;
    if (activeIdx !== -1 && String(r[activeIdx] ?? '').toUpperCase() === 'FALSE') continue;
    // Kecualikan Kas Tunai (cocok di nama_bank atau atas_nama).
    if (r[bankIdx] === REKENING_KAS_TUNAI || r[anIdx] === REKENING_KAS_TUNAI) continue;
    ids.push(r[idIdx]);
  }
  return ids;
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

// ============================================================
// F6 M-C — baca transaksi + koreksi kategori (jalur kanonik SKM)
// ============================================================

/** Subset kolom transaksi yang dipakai rekonsiliasi. */
export interface TransaksiLite {
  id: string;
  tanggal: string;
  jenis: string;
  kategori_id: string;
  deskripsi: string;
  jumlah: number;
  rekening_id: string;
  status: string;
  bank_ref: string;
}

function rowToTransaksiLite(row: string[]): TransaksiLite {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const idx = (h: string) => headers.indexOf(h);
  return {
    id: row[idx('id')] || '',
    tanggal: row[idx('tanggal')] || '',
    jenis: row[idx('jenis')] || '',
    kategori_id: row[idx('kategori_id')] || '',
    deskripsi: row[idx('deskripsi')] || '',
    jumlah: parseInt(row[idx('jumlah')] || '0', 10) || 0,
    rekening_id: row[idx('rekening_id')] || '',
    status: row[idx('status')] || '',
    bank_ref: row[idx('bank_ref')] || '',
  };
}

/**
 * Kandidat rekonsiliasi: transaksi `MASUK` + `AKTIF` pada satu rekening.
 * Read-only — TIDAK menyentuh schema.
 */
export async function listTransaksiMasukByRekening(rekeningId: string): Promise<TransaksiLite[]> {
  return listTransaksiMasukByRekeningIds([rekeningId]);
}

/**
 * Kandidat rekonsiliasi lintas-beberapa rekening bank (transaksi `MASUK`+`AKTIF`).
 * `rekeningIds` kosong → `[]` (tak ada rekening bank → tak ada kandidat).
 * Read-only.
 */
export async function listTransaksiMasukByRekeningIds(rekeningIds: string[]): Promise<TransaksiLite[]> {
  if (rekeningIds.length === 0) return [];
  const allow = new Set(rekeningIds);
  const rows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);
  return rows
    .map(rowToTransaksiLite)
    .filter(
      (t) => t.id && t.jenis === TransaksiJenis.MASUK && t.status === TransaksiStatus.AKTIF && allow.has(t.rekening_id)
    );
}

/** Baca satu transaksi (lite) by id, atau null. */
export async function getTransaksiLiteById(id: string): Promise<TransaksiLite | null> {
  const res = await sheetsService.getRowById(SHEET_NAMES.TRANSAKSI, id);
  return res ? rowToTransaksiLite(res.row) : null;
}

/**
 * Koreksi `kategori_id` satu baris transaksi lewat jalur UPDATE kanonik SKM
 * (mirror `PUT /api/transaksi/[id]`: getRowById → updateRow full-layout →
 * `logAudit(UPDATE)`). Hanya transaksi `AKTIF`. No-op bila kategori sama.
 *
 * Catatan drift (sama seperti `createTransaksiPemasukanQurban`): tidak ada
 * service update transaksi yang reusable — logika di-INLINE pada route PUT;
 * helper ini mereplikasinya dengan setia, bukan `updateRow` mentah tanpa audit.
 */
export async function correctTransaksiKategori(
  transaksiId: string,
  newKategoriId: string,
  createdBy: string
): Promise<{ changed: boolean; from: string }> {
  const res = await sheetsService.getRowById(SHEET_NAMES.TRANSAKSI, transaksiId);
  if (!res) throw new Error(`Transaksi ${transaksiId} tidak ditemukan untuk koreksi kategori.`);
  const t = rowToTransaksiLite(res.row);
  if (t.status !== TransaksiStatus.AKTIF) {
    throw new Error(`Transaksi ${transaksiId} berstatus ${t.status}; hanya AKTIF yang bisa dikoreksi.`);
  }
  if (t.kategori_id === newKategoriId) return { changed: false, from: t.kategori_id };

  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const updated = [...res.row];
  while (updated.length < headers.length) updated.push('');
  updated[headers.indexOf('kategori_id')] = newKategoriId;
  updated[headers.indexOf('updated_at')] = nowISO();

  await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, res.rowIndex, updated);
  await logAudit(
    AuditAksi.UPDATE,
    SHEET_NAMES.TRANSAKSI,
    transaksiId,
    JSON.stringify({ kategori_id: newKategoriId, from: t.kategori_id, sumber: 'qurban_rekonsiliasi' }),
    createdBy
  );
  return { changed: true, from: t.kategori_id };
}
