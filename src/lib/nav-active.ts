/**
 * Resolve which sidebar nav href should be highlighted for the current path.
 *
 * Fixes the F4c-A quirk where a parent/index href (e.g. `/qurban`) lit up on
 * every sub-path (`/qurban/peserta`, …). Rule: an item is a candidate when its
 * href equals the pathname or is a path-segment prefix of it; the LONGEST such
 * href wins, so the most specific item highlights and its parent does not. Root
 * `/` matches only exactly (never as a prefix).
 */
export function resolveActiveHref(pathname: string, hrefs: readonly string[]): string {
  const matches = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
  return hrefs.filter(matches).reduce((best, h) => (h.length > best.length ? h : best), '');
}
