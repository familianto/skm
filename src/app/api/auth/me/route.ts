import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getSessionFromRequest } from '@/lib/api/auth';
import { findById, publicAnggota } from '@/lib/api/anggota-repo';
import {
  getCanAccess,
  getLandingUrl,
  isEdisiLockedToAktif,
  canManageAnggota,
} from '@/lib/api/permissions';

/**
 * A3 — GET /api/auth/me
 *
 * Returns the current authenticated user plus computed permissions and
 * derived UI state. Used by the dashboard shell to render the sidebar,
 * landing redirects, and Qurban edition switcher visibility.
 *
 * Response shape per Tahap 3.E §3.1 A3 (with F1 caveats):
 *   {
 *     user: { id, nama, telepon, email, peran, is_active, last_login_at, created_at },
 *     permissions: { can_access, qurban_edisi_locked_to_aktif, can_manage_anggota },
 *     current_edisi: null,  // F2 will populate with AKTIF edisi
 *     landing_url: string,
 *     session: { expires_at: ISO 8601 }
 *   }
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return error(
      ErrorCodes.AUTH_REQUIRED,
      'Sesi tidak ditemukan atau telah berakhir.',
      401
    );
  }

  const expiresAt = session.exp
    ? new Date(session.exp * 1000).toISOString()
    : '';

  // LEGACY session (parallel-login fallback): synthetic user response.
  if (session.user_id === 'LEGACY') {
    return success({
      user: {
        id: 'LEGACY',
        nama: 'Legacy Admin',
        telepon: '',
        email: '',
        peran: 'SUPER_ADMIN',
        is_active: true,
        created_at: '',
        last_login_at: '',
      },
      permissions: {
        can_access: getCanAccess('SUPER_ADMIN'),
        qurban_edisi_locked_to_aktif: isEdisiLockedToAktif('SUPER_ADMIN'),
        can_manage_anggota: canManageAnggota('SUPER_ADMIN'),
      },
      current_edisi: null,
      landing_url: getLandingUrl('SUPER_ADMIN'),
      session: { expires_at: expiresAt },
    });
  }

  // Multi-user session: re-fetch anggota for fresh is_active + last_login_at.
  const rec = await findById(session.user_id).catch(() => null);
  if (!rec) {
    return error(
      ErrorCodes.AUTH_INVALID,
      'Anggota tidak ditemukan. Silakan login ulang.',
      401
    );
  }
  if (!rec.anggota.is_active) {
    return error(
      ErrorCodes.AUTH_INACTIVE,
      'Akun anggota telah dinonaktifkan.',
      401
    );
  }

  return success({
    user: publicAnggota(rec.anggota),
    permissions: {
      can_access: getCanAccess(rec.anggota.peran),
      qurban_edisi_locked_to_aktif: isEdisiLockedToAktif(rec.anggota.peran),
      can_manage_anggota: canManageAnggota(rec.anggota.peran),
    },
    current_edisi: null,
    landing_url: getLandingUrl(rec.anggota.peran),
    session: { expires_at: expiresAt },
  });
}
