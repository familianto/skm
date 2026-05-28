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

/**
 * Street-name prefixes / common address keywords stripped before masking, so
 * the visible 2-letter hint comes from the actual street name (not "Jl.").
 * Case-insensitive match; the literal token must equal one of these.
 */
const ADDRESS_STOPWORDS = new Set<string>([
  'jl', 'jln', 'jalan',
  'gg', 'gang',
  'komp', 'komplek', 'kompleks',
  'perum', 'perumahan',
  'no', 'nomor',
  'rt', 'rw',
  'blok', 'kav',
]);

/**
 * F4d — Coarse address mask for PB2 lookup confirmation. By design lossy and
 * NOT harvestable: take the first non-stopword alphabetical token of the
 * address, keep its first 2 letters uppercased, replace the rest with a
 * fixed `****`. Strips house numbers, RT/RW tokens, and street prefixes.
 *
 *   "Jl. Gn. Sahari No. 5"  → "GN. ****"
 *   "Taman Mini Indonesia"  → "TA. ****"
 *   "Jl. Mawar 12A"         → "MA. ****"
 *
 * Empty input → `''`. No usable alpha token → `'****'`.
 */
export function maskAlamat(alamat: string): string {
  const trimmed = String(alamat ?? '').trim();
  if (!trimmed) return '';

  const tokens = trimmed
    .split(/[\s.,/\\\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && /^[a-zA-Z]+$/.test(t));

  const meaningful = tokens.filter((t) => !ADDRESS_STOPWORDS.has(t.toLowerCase()));

  if (meaningful.length === 0) return '****';

  const first = meaningful[0];
  const head = (first.length >= 2 ? first.slice(0, 2) : first).toUpperCase();
  return `${head}. ****`;
}
