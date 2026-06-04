import type { TipeOption } from './publik-options';
import type { TipeQurban } from './peserta-types';

/**
 * Pure transforms for the F4c-E public registration wizard
 * (`/publik/qurban/daftar`). Dependency-free (type-only imports erased) so it
 * runs in the client wizard and in unit tests.
 *
 * Shapes the flat PB1 `options.tipe_hewan` list (one entry per master×tipe with
 * `slot_tersedia > 0`) into the cascading tipe → jenis → kelas selectors, and
 * dedupes the per-row `kode_bayar` from a PB3 response into the single code
 * (F4c-C model: one registration = one kode_bayar shared across N rows).
 */

export const TIPE_QURBAN_LABEL: Record<TipeQurban, string> = {
  BELI: 'Beli (disediakan panitia)',
  BAWA_SENDIRI: 'Bawa Sendiri',
};

export function tipeQurbanLabel(tipe: string): string {
  return TIPE_QURBAN_LABEL[tipe as TipeQurban] ?? tipe;
}

/**
 * True bila masih ada minimal satu kombinasi yang dapat dibooking (`slot_tersedia
 * > 0`). `buildTipeOptions` (PB1) sudah menyaring kombinasi ber-slot-0, jadi
 * daftar kosong = semua penuh; pengecekan eksplisit ini agar wizard publik bisa
 * memutuskan menampilkan banner "pendaftaran penuh" tanpa menebak. Pendaftaran
 * "penuh" = status BUKA tetapi `hasAvailableOptions` false. (Live di modul
 * client-safe ini, bukan `publik-options.ts`, agar tak menyeret google-sheets
 * ke bundle klien.)
 */
export function hasAvailableOptions(
  options: readonly Pick<TipeOption, 'slot_tersedia'>[]
): boolean {
  return options.some((o) => o.slot_tersedia > 0);
}

/** Distinct tipe_qurban present among bookable options, BELI before BAWA_SENDIRI. */
export function availableTipeQurban(options: TipeOption[]): TipeQurban[] {
  const set = new Set<TipeQurban>(options.map((o) => o.tipe_qurban));
  return (['BELI', 'BAWA_SENDIRI'] as TipeQurban[]).filter((t) => set.has(t));
}

/** Distinct jenis available for a tipe, sorted. */
export function jenisForTipe(options: TipeOption[], tipe: TipeQurban | ''): string[] {
  if (!tipe) return [];
  return Array.from(new Set(options.filter((o) => o.tipe_qurban === tipe).map((o) => o.jenis))).sort();
}

/** Bookable options for a (tipe, jenis) pair — the kelas dropdown source, sorted by kelas. */
export function kelasForTipeJenis(
  options: TipeOption[],
  tipe: TipeQurban | '',
  jenis: string
): TipeOption[] {
  if (!tipe || !jenis) return [];
  return options
    .filter((o) => o.tipe_qurban === tipe && o.jenis === jenis)
    .sort((a, b) => (a.kelas < b.kelas ? -1 : a.kelas > b.kelas ? 1 : 0));
}

/** Resolve the single option for a (tipe, jenis, kelas) triple. */
export function findOption(
  options: TipeOption[],
  tipe: TipeQurban | '',
  jenis: string,
  kelas: string
): TipeOption | undefined {
  if (!tipe || !jenis || !kelas) return undefined;
  return options.find((o) => o.tipe_qurban === tipe && o.jenis === jenis && o.kelas === kelas);
}

/**
 * Dedupe the per-row `kode_bayar` from a PB3 response into the one code. Rows
 * share the same value; returns the first non-empty, or '' if none.
 */
export function dedupeKodeBayar(rows: { kode_bayar: string }[]): string {
  for (const r of rows) {
    if (r.kode_bayar) return r.kode_bayar;
  }
  return '';
}

/**
 * Friendly Indonesian message for PB2/PB3 failures. Prefers the server's own
 * (already-localised) message; falls back per error code / HTTP status so the
 * user never sees a raw error screen.
 */
export function friendlyPublikError(
  code: string,
  status: number,
  serverMessage?: string
): string {
  if (serverMessage && serverMessage.trim()) return serverMessage.trim();
  switch (code) {
    case 'DUPLICATE_PESERTA':
      return 'Anda sudah terdaftar pada edisi ini.';
    case 'BUSINESS_EDISI_NOT_AKTIF':
      return 'Pendaftaran qurban sedang ditutup.';
    case 'BUSINESS_INSUFFICIENT_SLOTS':
      return 'Maaf, slot yang Anda pilih sudah tidak tersedia. Silakan pilih hewan lain.';
    case 'RATE_LIMITED':
      return 'Terlalu banyak permintaan. Mohon coba lagi beberapa saat.';
    case 'VALIDATION_FAILED':
      return 'Data yang dikirim belum lengkap atau tidak valid.';
    default:
      return status === 429
        ? 'Terlalu banyak permintaan. Mohon coba lagi beberapa saat.'
        : 'Terjadi kesalahan. Silakan coba lagi.';
  }
}
