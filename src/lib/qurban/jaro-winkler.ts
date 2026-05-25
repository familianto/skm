/**
 * Jaro-Winkler string similarity — pure, dependency-free.
 *
 * Used by the Muqorib smart-lookup (M7) to fuzzy-rank candidate names.
 * Returns a score in [0, 1]; 1 = identical, 0 = no similarity.
 *
 * Reference values (locked by unit tests):
 *   jaroWinkler('martha', 'marhta')  ≈ 0.961
 *   jaroWinkler('dixon', 'dicksonx') ≈ 0.813
 *   identical strings                =  1.0
 */

/** Standard Winkler prefix scaling factor. */
const PREFIX_SCALE = 0.1;
/** Max common prefix length the Winkler boost considers. */
const MAX_PREFIX = 4;

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  // Two chars match only if within this distance of each other.
  const matchWindow = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);

  const aMatched = new Array<boolean>(aLen).fill(false);
  const bMatched = new Array<boolean>(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatched[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions: matched chars out of order between the two strings.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  const m = matches;
  return (m / aLen + m / bLen + (m - transpositions) / m) / 3;
}

export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  if (j === 0) return 0;

  let prefix = 0;
  const maxPrefix = Math.min(MAX_PREFIX, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return j + prefix * PREFIX_SCALE * (1 - j);
}
