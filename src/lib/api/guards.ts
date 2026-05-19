import type { NextRequest } from 'next/server';

import { getSessionFromRequest, type SessionPayload } from './auth';
import { error } from './response';
import { ErrorCodes } from './errors';
import { PERAN } from './permissions';

/**
 * Reusable session + role guards for route handlers.
 *
 * Usage:
 *   const guard = await requireSuperAdmin(request);
 *   if (!guard.ok) return guard.response;
 *   const session = guard.session;  // narrowed to SessionPayload
 *
 * Defense-in-depth note (F1 scope):
 *   These per-endpoint guards are the SECOND layer. The root middleware
 *   (Milestone D) enforces session presence at request entry and strict
 *   role check on `/pengaturan/anggota/**` and `/api/pengaturan/anggota/**`.
 *   API guards keep working even if middleware is misconfigured, and
 *   support routes that the middleware doesn't strictly check yet (F2+).
 */

export type GuardOk = { ok: true; session: SessionPayload };
export type GuardFail = { ok: false; response: Response };
export type GuardResult = GuardOk | GuardFail;

export async function requireSession(request: NextRequest): Promise<GuardResult> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: error(
        ErrorCodes.AUTH_REQUIRED,
        'Sesi tidak ditemukan atau telah berakhir.',
        401
      ),
    };
  }
  return { ok: true, session };
}

export async function requireRole(
  request: NextRequest,
  allowed: string[]
): Promise<GuardResult> {
  const sessionGuard = await requireSession(request);
  if (!sessionGuard.ok) return sessionGuard;
  if (!allowed.includes(sessionGuard.session.peran)) {
    return {
      ok: false,
      response: error(
        ErrorCodes.FORBIDDEN_ROLE,
        'Akses ditolak. Peran Anda tidak diizinkan untuk endpoint ini.',
        403,
        { required_role: allowed }
      ),
    };
  }
  return sessionGuard;
}

/** Convenience: SUPER_ADMIN-only. Used by all U1–U9 anggota endpoints. */
export async function requireSuperAdmin(request: NextRequest): Promise<GuardResult> {
  return requireRole(request, [PERAN.SUPER_ADMIN]);
}
