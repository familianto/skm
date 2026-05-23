import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import {
  getMuqoribById,
  updateMuqorib,
  type QurbanMuqorib,
} from '@/lib/qurban/muqorib-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * M6 — POST /api/qurban/muqorib/[id]/reactivate
 *
 * Inverse of M5. Idempotent: already-active returns current record without
 * writing or auditing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const current = await getMuqoribById(id);
    if (!current) {
      return error(ErrorCodes.NOT_FOUND, 'Muqorib tidak ditemukan.', 404);
    }

    if (current.is_active) {
      // Idempotent no-op.
      return success(current);
    }

    const updated: QurbanMuqorib = {
      ...current,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    await updateMuqorib(updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'muqorib',
      entitas_id: id,
      event_type: 'muqorib.reactivated',
      before: { is_active: false },
      after: { is_active: true },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/muqorib/[id]/reactivate] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal mengaktifkan kembali muqorib: ${err.message}`
        : 'Gagal mengaktifkan kembali muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
