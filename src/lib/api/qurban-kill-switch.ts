/**
 * Path matcher for the `QURBAN_MODULE_ENABLED` kill switch (F02-B + F4b-C).
 *
 * When the module is disabled, these paths are surfaced as 404 by the
 * middleware. Covers the Qurban pages, the authenticated `/api/qurban/*` API,
 * AND (F4b-C) the public `/api/publik/qurban/*` API — so killing the module
 * hides the public pendaftaran endpoints too.
 *
 * Pure regex/string checks only (Edge-safe, dependency-free) so it can be
 * imported by both `src/middleware.ts` and unit tests.
 */
export function isQurbanModulePath(pathname: string): boolean {
  return (
    pathname === '/qurban' ||
    pathname.startsWith('/qurban/') ||
    pathname === '/api/qurban' ||
    pathname.startsWith('/api/qurban/') ||
    pathname.startsWith('/api/publik/qurban/')
  );
}
