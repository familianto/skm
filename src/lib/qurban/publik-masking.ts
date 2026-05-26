/**
 * Privacy masking for data shown on PUBLIC qurban surfaces (F4b — e.g. PB4
 * cek-status, public participant lists). Pure, I/O-free string helpers.
 */

/**
 * Mask a word: keep the first 2 letters, replace the rest with `*`. Words of
 * length ≤ 2 are left untouched (nothing meaningful to hide).
 */
function maskWord(word: string): string {
  if (word.length <= 2) return word;
  return word.slice(0, 2) + '*'.repeat(word.length - 2);
}

/**
 * Per-word name masking, re-joined with single spaces.
 *   "Hopy Familianto" → "Ho** Fa********"
 *   "Ahmad Fauzi"     → "Ah*** Fa***"
 *   "Pak Budi"        → "Pa* Bu**"
 */
export function maskNama(nama: string): string {
  return String(nama ?? '')
    .split(' ')
    .map(maskWord)
    .join(' ');
}

/**
 * Mask a normalized phone number (`628...`): keep the first 3 and last 4
 * characters visible, replace the middle with `*` (one per hidden digit).
 *   "628226083451" → "628*****3451"
 *   "62812346789"  → "628****6789"
 * Numbers too short to keep both ends distinct keep only the last 2 visible.
 */
export function maskNoHp(no_hp: string): string {
  const s = String(no_hp ?? '').trim();
  const VISIBLE_PREFIX = 3;
  const VISIBLE_SUFFIX = 4;

  if (s.length <= VISIBLE_PREFIX + VISIBLE_SUFFIX) {
    if (s.length <= 2) return s;
    return '*'.repeat(s.length - 2) + s.slice(-2);
  }

  const prefix = s.slice(0, VISIBLE_PREFIX);
  const suffix = s.slice(-VISIBLE_SUFFIX);
  const masked = '*'.repeat(s.length - VISIBLE_PREFIX - VISIBLE_SUFFIX);
  return prefix + masked + suffix;
}
