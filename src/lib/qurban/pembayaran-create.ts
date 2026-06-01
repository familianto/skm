import { computeNominalTransfer } from './publik-nominal';
import type { MetodePembayaran, Pembayaran } from './pembayaran-repo';

/**
 * Pure builders untuk auto-create pembayaran saat registrasi (F6 Milestone A).
 *
 * Dipakai oleh PS2 (admin) & PB3 (publik): SETELAH insert peserta sukses, satu
 * baris `qurban_pembayaran` dibuat per pendaftaran (`kode_bayar`), status awal
 * `BELUM_BAYAR`. Logika murni di sini agar bisa diuji tanpa mem-mock Sheets.
 */

/** Metode yang diterima dari body registrasi di Milestone A. */
const ACCEPTED_AT_REGISTRATION: MetodePembayaran[] = ['TRANSFER', 'TUNAI'];

export type MetodeResolution =
  | { ok: true; metode: MetodePembayaran }
  | { ok: false; reason: 'COMING_SOON' | 'INVALID'; message: string };

/**
 * Validasi field `metode_pembayaran` dari body registrasi.
 * - Kosong/undefined → default `TRANSFER` (form dropdown menyusul di M-D).
 * - `VA` → ditolak "segera hadir".
 * - Selain TRANSFER/TUNAI → invalid.
 */
export function resolveMetodePembayaranInput(raw: unknown): MetodeResolution {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return { ok: true, metode: 'TRANSFER' };
  }
  const v = String(raw).trim().toUpperCase();
  if (v === 'VA') {
    return { ok: false, reason: 'COMING_SOON', message: 'Metode pembayaran VA segera hadir.' };
  }
  if ((ACCEPTED_AT_REGISTRATION as string[]).includes(v)) {
    return { ok: true, metode: v as MetodePembayaran };
  }
  return {
    ok: false,
    reason: 'INVALID',
    message: 'metode_pembayaran tidak valid (TRANSFER | TUNAI).',
  };
}

export interface BuildPembayaranArgs {
  id: string;
  edisi_id: string;
  kode_bayar: string;
  muqorib_id: string;
  /** harga_disepakati setiap slot dalam pendaftaran ini (frozen). */
  slot_harga: number[];
  /** payment_suffix per-edisi (dari konfigurasi); ditambahkan SEKALI ke total. */
  payment_suffix: number | string;
  metode: MetodePembayaran;
  created_by: string;
  /** ISO-8601 Z. */
  now: string;
}

/**
 * Bangun satu baris pembayaran `BELUM_BAYAR` untuk satu pendaftaran.
 *
 * - `nominal_total` = Σ `slot_harga` (semua slot dalam `kode_bayar`).
 * - `nominal_transfer` = `nominal_total + payment_suffix` via
 *   `computeNominalTransfer` (rumus suffix tidak diduplikasi di sini).
 */
export function buildPembayaranFromPendaftaran(args: BuildPembayaranArgs): Pembayaran {
  const nominal_total = args.slot_harga.reduce((sum, h) => sum + h, 0);
  return {
    id: args.id,
    edisi_id: args.edisi_id,
    kode_bayar: args.kode_bayar,
    muqorib_id: args.muqorib_id,
    nominal_total,
    nominal_transfer: computeNominalTransfer(nominal_total, args.payment_suffix),
    metode: args.metode,
    status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: '',
    bank_ref: '',
    skm_transaksi_id: '',
    bukti_url: '',
    match_metadata: '',
    notes: '',
    created_at: args.now,
    updated_at: args.now,
    created_by: args.created_by,
  };
}
