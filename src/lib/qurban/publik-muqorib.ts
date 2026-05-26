import { normalizeNoHp } from './validators';
import type { QurbanMuqorib } from './muqorib-repo';
import type { MuqoribCreateInput } from './validators';

/**
 * Pure helpers for PB3 muqorib resolution (F4b B2). I/O (read/create) stays in
 * the route; these encode the matching + conflict rules so they're unit-testable.
 */

/**
 * Find an existing muqorib by normalized `no_hp`. Active records win; falls
 * back to an inactive match so we never silently create a duplicate phone.
 * Returns `null` when nothing matches.
 */
export function findMuqoribByNoHp(
  list: readonly QurbanMuqorib[],
  noHp: string
): QurbanMuqorib | null {
  const target = normalizeNoHp(noHp);
  if (!target) return null;
  const matches = list.filter((m) => normalizeNoHp(m.no_hp) === target);
  if (matches.length === 0) return null;
  return matches.find((m) => m.is_active) ?? matches[0];
}

/**
 * `true` when the public-submitted data diverges from the existing record on
 * any identity field (name/address/rt). Phone is the match key so it's equal
 * by construction. Used to decide whether to emit `muqorib.data_conflict_detected`
 * — the existing record is ALWAYS kept; public input never overwrites it.
 */
export function muqoribDataDiffers(
  existing: QurbanMuqorib,
  submitted: MuqoribCreateInput
): boolean {
  const norm = (v: string) => (v || '').trim().toLowerCase();
  return (
    norm(existing.nama_lengkap) !== norm(submitted.nama_lengkap) ||
    norm(existing.alamat) !== norm(submitted.alamat) ||
    norm(existing.rt) !== norm(submitted.rt)
  );
}
