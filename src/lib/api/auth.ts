import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

/**
 * Multi-user JWT session per Tahap 3.E §2.1 + PROMPT_F01 §5.1.
 *
 * Cookie:    `skm_session`
 * Algorithm: HS256
 * TTL:       12 hours (no sliding refresh)
 * Secret:    `SESSION_SECRET` (preferred) with `AUTH_SECRET` fallback for
 *            backwards-compat during the F1 rollout window.
 *
 * Payload includes legacy fields (`role`, `masjidName`) so existing routes that
 * call `getSession()` from `@/lib/auth` and read `session.role` keep working.
 * `role` is mapped from `peran`; `masjidName` is best-effort snapshot.
 */

const COOKIE_NAME = 'skm_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionPayload {
  user_id: string;            // anggota.id, or 'LEGACY' for parallel login
  peran: string;              // SUPER_ADMIN | BENDAHARA | ADMIN_QURBAN | PENDAFTARAN | DISTRIBUSI
  // Backwards-compat fields read by existing /lib/auth.ts callsites
  role: string;               // mirror of peran for old code
  masjidName: string;         // best-effort snapshot, '' if unknown
  // Standard JWT claims surfaced after verification (read-only for callers)
  exp?: number;               // epoch seconds; set by jose at sign time
  iat?: number;               // epoch seconds; set by jose at sign time
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_TTL = SESSION_TTL_SECONDS;

export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET (or fallback AUTH_SECRET) is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const user_id = payload.user_id as string | undefined;
    const peran = payload.peran as string | undefined;
    if (!user_id || !peran) return null;
    return {
      user_id,
      peran,
      role: (payload.role as string | undefined) || peran,
      masjidName: (payload.masjidName as string | undefined) || '',
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Read + verify session from a NextRequest (use in API route handlers). */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Read + verify session from cookies() (use in Server Components / Server Actions). */
export async function getSessionFromCookieStore(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
