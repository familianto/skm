/**
 * Pure validators for Qurban resources.
 *
 * Side-effect-free predicates extracted from the route handlers so they can
 * be unit-tested in isolation (no Sheets I/O, no `next/headers`). Route
 * handlers import these to enforce the same invariants the tests cover.
 */

import { UserPeran } from '@/types';

/**
 * Peran yang boleh ditugaskan sebagai panitia.
 *
 * BENDAHARA secara eksplisit dikecualikan — peran SKM-only tidak terlibat
 * dalam operasional Qurban. Diekspos sebagai readonly array supaya route
 * handler dapat menyertakannya di `details.allowed_peran` saat menolak.
 */
export const ALLOWED_PANITIA_PERAN: readonly string[] = [
  UserPeran.SUPER_ADMIN,
  UserPeran.ADMIN_QURBAN,
  UserPeran.PENDAFTARAN,
  UserPeran.DISTRIBUSI,
];

export function isAllowedPanitiaPeran(peran: string): boolean {
  return ALLOWED_PANITIA_PERAN.includes(peran);
}

/**
 * Distribusi date range — start must be ≤ end when both are provided.
 *
 * Either side empty is treated as "not yet set" and returns `true` so the
 * UI/route accepts partial saves while the user is still filling the form.
 * The route's cross-field check runs on the MERGED row, so a missing field
 * only matters after merge.
 */
export function isValidDistribusiDateRange(start: string, end: string): boolean {
  if (!start || !end) return true;
  return start <= end;
}

/** `payment_suffix` is an integer in 0–9 inclusive. */
export function isValidPaymentSuffix(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 9;
}

// ---------------------------------------------------------------------------
// F03 — Master Qurban (Muqorib + Master Hewan) primitives.
// ---------------------------------------------------------------------------

/** RT yang valid untuk muqorib (lingkup masjid). */
export const RT_VALUES = ['001', '002', '003', '004', '005', '006', 'Lainnya'] as const;

/** Jenis hewan qurban yang didukung. */
export const JENIS_HEWAN = ['SAPI', 'KAMBING'] as const;

/** Kelas/tier hewan qurban (membedakan bobot/harga di dalam satu jenis). */
export const KELAS_HEWAN = ['A', 'B', 'C', 'D'] as const;

/**
 * Normalisasi nomor telepon ke format `628xxxxxxxxxx`.
 *
 * - Buang semua karakter non-digit.
 * - `0xxx` → `62xxx`.
 * - `8xxx` → `628xxx`.
 * - `62xxx` → biarkan.
 * - Selain itu → kembalikan apa adanya (biarkan `isValidNoHp` yang menolak).
 * - String kosong → `''`.
 */
export function normalizeNoHp(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

/** `true` kalau cocok pola nomor seluler Indonesia ter-normalisasi. */
export function isValidNoHp(value: string): boolean {
  return /^628\d{7,12}$/.test(value);
}

export function isValidRt(value: string): boolean {
  return (RT_VALUES as readonly string[]).includes(value);
}

export function isValidJenisHewan(value: string): boolean {
  return (JENIS_HEWAN as readonly string[]).includes(value);
}

export function isValidKelasHewan(value: string): boolean {
  return (KELAS_HEWAN as readonly string[]).includes(value);
}
