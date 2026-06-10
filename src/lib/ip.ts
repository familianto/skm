/**
 * Client IP extraction helpers.
 *
 * Reads the real client IP from standard proxy headers. On Vercel / behind a
 * reverse proxy, `x-forwarded-for` is the most reliable source; this helper
 * picks the leftmost entry (original client) from the comma-separated list.
 *
 * Fallback chain (in order of preference):
 *   1. x-forwarded-for  (first entry)
 *   2. x-real-ip
 *   3. 'unknown'
 */

/**
 * Extract the client IP from a Headers object (API routes, Middleware).
 * Returns the first entry of `x-forwarded-for`, or `x-real-ip`, or 'unknown'.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return headers.get('x-real-ip') || 'unknown';
}

/**
 * Same extraction from a plain record (useful when headers are already
 * destructured, e.g. in some test contexts).
 */
export function getClientIpFromRecord(
  headers: Record<string, string | string[] | undefined>
): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0]?.trim() || 'unknown';
  }
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return 'unknown';
}