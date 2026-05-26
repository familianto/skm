import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

import { isPathAllowedForRole } from '@/lib/api/path-rules';
import { isQurbanModulePath } from '@/lib/api/qurban-kill-switch';

/**
 * Root middleware — defense-in-depth per Tahap 3.E §2.1.
 *
 * Sequence per request:
 *   1. Static + Next internals (`/_next/*`, `/favicon*`)            → pass
 *   2. Qurban module kill switch — `/qurban/**` + `/api/qurban/**` +
 *      `/api/publik/qurban/**` → 404 when `QURBAN_MODULE_ENABLED === 'false'`.
 *      Runs before the allow-list so killed public endpoints are hidden too.
 *   3. Public allow-list (`/login`, `/api/auth/{login,logout}`,
 *      `/api/health`, `/publik/*`, `/api/publik/*`, `/mockup`)       → pass
 *   4. Session check — verify `skm_session` JWT                      → 401 if missing/invalid
 *   5. Strict role gate — `STRICT_PATH_RULES` from path-rules.ts     → 403 if disallowed
 *   6. Inject `x-user-id` + `x-user-peran` request headers           → next()
 *
 * Scope:
 *   - F1: strict gates on `/pengaturan/anggota/**` (SUPER_ADMIN).
 *   - F02-A: strict gates on `/qurban/**` per-role allow-list. Pure page-level
 *     gating; full-write vs read-only distinction is enforced inside route
 *     handlers (F02-B+). Edisi context resolution (read of qurban_edisi sheet)
 *     happens in a Node-runtime server helper invoked from the /qurban layout,
 *     NOT in this middleware (Edge runtime cannot use the googleapis SDK).
 *   - F02-B: restored the Qurban module kill switch as a FAIL-OPEN guard.
 *     Module is active unless `QURBAN_MODULE_ENABLED` is explicitly set to
 *     `'false'`. Unset / `'true'` / any other value → module on. Acts as a
 *     rollback lever (PROMPT_F02 §9.2 Level 2).
 *
 * Edge-runtime constraint: this middleware MUST only import Edge-safe modules.
 * `lib/api/path-rules.ts` is pure regex/arrays; JWT verification is inlined
 * with `jose` instead of importing from `lib/api/auth.ts` (which pulls in
 * `next/headers`).
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

  // 2. Qurban module kill switch — FAIL-OPEN: only `'false'` (exact string)
  //    disables the module. Unset / `'true'` / anything else keeps it on.
  //    When disabled, Qurban paths are surfaced as 404 to hide the module
  //    from users entirely (per PROMPT_F02 §9.2 Level 2 rollback). Runs BEFORE
  //    the public allow-list so killed `/api/publik/qurban/*` endpoints (F4b)
  //    are hidden too — the allow-list would otherwise short-circuit them.
  if (process.env.QURBAN_MODULE_ENABLED === 'false' && isQurbanModulePath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Not found.' } },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 404 });
  }

  // 3. Public allow-list
  if (isPublic(pathname)) {
    return NextResponse.next();
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

  // 7. Sticky `qurban_edisi` cookie. When a user picks an edisi via the
  //    EditionSwitcher dropdown, the client pushes `?edisi=EDS-…` to the
  //    URL. We persist that choice as a cookie here so subsequent
  //    navigations (without the query param) keep the same edisi context.
  //    Regex-only validation — no Sheet I/O — keeps this edge-safe. The
  //    Server-Component resolver re-validates the cookie's edisi against
  //    the role+status rules on every render.
  if (pathname.startsWith('/qurban') && !pathname.startsWith('/api/')) {
    const queryEdisi = request.nextUrl.searchParams.get('edisi');
    if (queryEdisi && EDISI_ID_RE.test(queryEdisi)) {
      const current = request.cookies.get(QURBAN_EDISI_COOKIE)?.value;
      if (current !== queryEdisi) {
        response.cookies.set(QURBAN_EDISI_COOKIE, queryEdisi, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
      }
    }
  }

  return response;
}

const QURBAN_EDISI_COOKIE = 'qurban_edisi';
/** Regex match only — Server Component resolver re-validates the edisi exists. */
const EDISI_ID_RE = /^EDS-\d{8}-\d{4}$/;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
