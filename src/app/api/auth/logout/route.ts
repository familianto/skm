import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import {
  getSessionFromRequest,
  clearSessionCookie,
} from '@/lib/api/auth';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { findById } from '@/lib/api/anggota-repo';
import { AuditAksi } from '@/types';

/**
 * A2 — POST /api/auth/logout
 *
 * Idempotent: returns 200 whether or not a session exists.
 * Always clears the cookie. Audits `auth.logout` when a session was present.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  try {
    const session = await getSessionFromRequest(request);
    await clearSessionCookie();

    if (session) {
      let userInfo = session.user_id;
      if (session.user_id !== 'LEGACY') {
        const rec = await findById(session.user_id).catch(() => null);
        if (rec) userInfo = rec.anggota.nama;
      } else {
        userInfo = 'Legacy Admin';
      }

      await writeAuditLog({
        aksi: AuditAksi.LOGOUT,
        entitas: 'auth',
        entitas_id: session.user_id,
        event_type: 'auth.logout',
        user_id: session.user_id,
        user_info: userInfo,
        ip_address: ip,
      });
    }

    return success({ logged_out: true });
  } catch (err) {
    console.error('[POST /api/auth/logout] error:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Terjadi kesalahan saat logout.',
      500
    );
  }
}
