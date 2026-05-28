import { isValidNoHp, normalizeNoHp } from './validators';
import { listAllMuqorib, type QurbanMuqorib } from './muqorib-repo';
import type { MuqoribCreateInput } from './validators';

/**
 * Pure helpers for PB3 muqorib resolution (F4b B2). I/O (read/create) stays in
 * the route; these encode the matching + conflict rules so they're unit-testable.
 *
 * F4d adds the thin I/O wrapper `lookupMuqoribByPhone` reused by PB2 (publik
 * lookup) and M7 (panitia smart-lookup, Milestone B).
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

/**
 * F4d — pure variant of the PB2 lookup. Given a pre-fetched muqorib list and
 * a raw `no_hp` (any of `08…`, `8…`, `62…`), returns the active match — or
 * `null` for empty/malformed input, no match, or inactive-only match.
 * Inactive-only matches are treated as "not found" because PB2 must never
 * reveal an inactive record's identity hints. PB3 keeps using
 * `findMuqoribByNoHp` directly so it can detect & reject inactive-only matches
 * with its own error path.
 */
export function selectActiveMuqoribByPhone(
  list: readonly QurbanMuqorib[],
  no_hp: string
): QurbanMuqorib | null {
  const target = normalizeNoHp(no_hp);
  if (!target || !isValidNoHp(target)) return null;
  const match = findMuqoribByNoHp(list, target);
  if (!match || !match.is_active) return null;
  return match;
}

/**
 * F4d — single entry point for "find ONE muqorib by phone" used by PB2 (and
 * planned for M7 re-use in Milestone B). Thin async I/O wrapper over
 * `selectActiveMuqoribByPhone`.
 */
export async function lookupMuqoribByPhone(
  no_hp: string
): Promise<{ muqorib: QurbanMuqorib } | null> {
  const target = normalizeNoHp(no_hp);
  if (!target || !isValidNoHp(target)) return null;
  const all = await listAllMuqorib();
  const match = selectActiveMuqoribByPhone(all, target);
  return match ? { muqorib: match } : null;
}
