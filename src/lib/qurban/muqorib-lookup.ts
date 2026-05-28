import { listAllMuqorib, type QurbanMuqorib } from './muqorib-repo';
import { isValidNoHp, normalizeNoHp } from './validators';
import { findMuqoribByNoHp } from './publik-muqorib';

/**
 * F4d — shared phone-lookup primitives, used by BOTH the public PB2 wizard
 * (masked response) and the panitia M7 endpoint (full response).
 *
 * The matching is grain-aware: 1 HP = 1 muqorib (Opsi A seed 1447H), so a
 * phone hit returns at most one record. `findMuqoribByNoHp` (the inactive-
 * tolerant variant) stays in `publik-muqorib.ts` because PB3 needs the
 * inactive case to fire its own reject path; consumers that ONLY want the
 * active match — PB2, M7-by-HP, future smart-lookup panitia — call the
 * helpers here.
 */

const PHONE_QUERY_MIN_DIGITS = 7;
const PHONE_QUERY_MIN_DIGIT_RATIO = 0.7;

/**
 * Heuristik "input ini terlihat seperti nomor HP?" untuk routing M7:
 * minimal 7 digit, dan ≥70% karakter non-spasi adalah digit. `+`/`-`/spasi
 * dianggap sah (umum di nomor disalin dari WhatsApp). Di bawah ambang ini,
 * caller jatuh ke jalur autocomplete-by-nama yang lama.
 */
export function isPhoneQuery(q: string): boolean {
  const trimmed = String(q ?? '').trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length < PHONE_QUERY_MIN_DIGITS) return false;
  const nonSpace = trimmed.replace(/\s+/g, '').length;
  if (nonSpace === 0) return false;
  return digits.length / nonSpace >= PHONE_QUERY_MIN_DIGIT_RATIO;
}

/**
 * Pure variant of the phone-lookup. Given a pre-fetched muqorib list and a
 * raw `no_hp` (any of `08…`, `8…`, `62…`), returns the ACTIVE match — or
 * `null` for empty/malformed input, no match, or inactive-only match.
 *
 * PB2 must never reveal an inactive record's identity hints; M7-by-HP makes
 * the same call (panitia can re-activate via M6 separately). PB3 keeps using
 * `findMuqoribByNoHp` directly so it can explicitly reject inactive-only
 * matches with its own error path.
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
 * Single async entry point for "find ONE muqorib by phone". Thin I/O
 * wrapper over `selectActiveMuqoribByPhone` — used by PB2 (publik, masked
 * response) and M7-by-HP (panitia, full response).
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
