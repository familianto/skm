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
