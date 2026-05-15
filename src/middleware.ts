import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

import { isPathAllowedForRole } from '@/lib/api/path-rules';

/**
 * Root middleware — F1 defense-in-depth per PROMPT_F01 §7 + Tahap 3.E §2.1.
 *
 * Sequence per request:
 *   1. Static + Next internals (`/_next/*`, `/favicon*`)            → pass
 *   2. Public allow-list (`/login`, `/api/auth/{login,logout}`,
 *      `/api/health`, `/publik/*`, `/api/publik/*`, `/mockup`)       → pass
 *   3. Module kill switch — `/qurban/*` + `/api/qurban/*` blocked
 *      when `QURBAN_MODULE_ENABLED !== 'true'`                       → 503 / redirect
 *   4. Session check — verify `skm_session` JWT                      → 401 if missing/invalid
 *   5. Strict role gate — `STRICT_PATH_RULES` from path-rules.ts     → 403 if disallowed
 *   6. Inject `x-user-id` + `x-user-peran` request headers           → next()
 *
 * F1 scope (per Hopy's Milestone D decision):
 *   - Strict gate covers ONLY `/pengaturan/anggota/**` and
 *     `/api/pengaturan/anggota/**` (SUPER_ADMIN). All other authenticated
 *     routes pass at step 4 with session-only auth.
 *   - F2 extends `STRICT_PATH_RULES` to enforce per-role allow-list for
 *     `/qurban/**` routes as they ship.
 *
 * This middleware runs in Edge Runtime, so it can ONLY import from
 * Edge-safe modules. `lib/api/path-rules.ts` is pure regex/arrays; we
 * inline JWT verification with `jose` instead of importing from
 * `lib/api/auth.ts` (which imports `next/headers`).
 */

const COOKIE_NAME = 'skm_session';

/** Paths that bypass auth entirely. */
const PUBLIC_PATHS: readonly string[] = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',   // intentionally public: clearing your own cookie shouldn't require valid session
  '/api/health',
  '/publik',
  '/api/publik',
  '/mockup',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('SESSION_SECRET (or fallback AUTH_SECRET) is not set');
  return new TextEncoder().encode(secret);
}

interface MiddlewareSession {
  user_id: string;
  peran: string;
}

async function verifyToken(token: string): Promise<MiddlewareSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const user_id = payload.user_id as string | undefined;
    const peran = payload.peran as string | undefined;
    if (!user_id || !peran) return null;
    return { user_id, peran };
  } catch {
    return null;
  }
}

/** Build a 401/403/503 response in the right format (JSON for API, redirect for HTML). */
function rejectRequest(
  pathname: string,
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  redirectTo: string
): NextResponse {
  const isApi = pathname.startsWith('/api/');
  if (isApi) {
    return NextResponse.json(
      { ok: false, error: { code, message } },
      { status }
    );
  }
  const url = new URL(redirectTo, request.url);
  // Preserve original path for post-login bounce-back (only for 401, not 403).
  if (status === 401 && pathname !== '/login') {
    url.searchParams.set('redirect', pathname);
  }
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Static assets + Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  // 2. Public allow-list
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // 3. Module kill switch for Qurban routes (forward-compat for F2)
  const isQurbanScope =
    pathname.startsWith('/qurban') || pathname.startsWith('/api/qurban');
  if (isQurbanScope && process.env.QURBAN_MODULE_ENABLED !== 'true') {
    return rejectRequest(
      pathname,
      request,
      503,
      'MODULE_DISABLED',
      'Modul Qurban sedang tidak aktif.',
      '/'
    );
  }

  // 4. Session check
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return rejectRequest(
      pathname,
      request,
      401,
      'AUTH_REQUIRED',
      'Sesi tidak ditemukan. Silakan login.',
      '/login'
    );
  }

  const session = await verifyToken(token);
  if (!session) {
    // Invalid or expired token. Redirect to /login; the cookie will be
    // overwritten on successful re-login. For API requests, return 401.
    return rejectRequest(
      pathname,
      request,
      401,
      'AUTH_EXPIRED',
      'Sesi telah berakhir. Silakan login kembali.',
      '/login'
    );
  }

  // 5. Strict role gate
  if (!isPathAllowedForRole(pathname, session.peran)) {
    return rejectRequest(
      pathname,
      request,
      403,
      'FORBIDDEN_ROLE',
      'Akses ditolak. Peran Anda tidak diizinkan untuk halaman ini.',
      '/'
    );
  }

  // 6. Pass through with user context headers so handlers can read
  //    session info without re-verifying the cookie (cheap optimization
  //    for non-edge route handlers).
  const response = NextResponse.next();
  response.headers.set('x-user-id', session.user_id);
  response.headers.set('x-user-peran', session.peran);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
