import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireSuperAdmin } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import {
  findById,
  updateAt,
  countActiveSuperAdmins,
  publicAnggota,
} from '@/lib/api/anggota-repo';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

/**
 * U7 — POST /api/pengaturan/anggota/[id]/deactivate
 *
 * Soft-delete via `is_active=FALSE`. The row remains in the sheet so
 * historical audit references resolve.
 *
 * Business guards:
 *  - Self-deactivate is BLOCKED (BUSINESS_CANNOT_DEACTIVATE_SELF).
 *    Per spec: SUPER_ADMIN must not lock themselves out — another SA must
 *    deactivate them.
 *  - Last-SUPER_ADMIN protection: if target is SA and removing them leaves
 *    zero active SAs → BUSINESS_LAST_SUPER_ADMIN.
 *
 * Idempotent on already-inactive: returns 200 without re-writing or audit.
 *
 * Audit: anggota.deactivated.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const rec = await findById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Anggota tidak ditemukan.', 404);
    }

    if (rec.anggota.id === guard.session.user_id) {
      return error(
        ErrorCodes.BUSINESS_CANNOT_DEACTIVATE_SELF,
        'Anda tidak dapat menonaktifkan akun Anda sendiri.',
        422,
        { constraint: 'self_deactivate_blocked' }
      );
    }

    if (!rec.anggota.is_active) {
      // Already inactive — idempotent success without state change or audit.
      return success(publicAnggota(rec.anggota));
    }

    if (rec.anggota.peran === PERAN.SUPER_ADMIN) {
      const remaining = await countActiveSuperAdmins(rec.anggota.id);
      if (remaining === 0) {
        return error(
          ErrorCodes.BUSINESS_LAST_SUPER_ADMIN,
          'Tidak dapat menonaktifkan SUPER_ADMIN terakhir. Tambah SUPER_ADMIN lain terlebih dahulu.',
          422,
          { constraint: 'at_least_one_active_super_admin' }
        );
      }
    }

    const now = new Date().toISOString();
    const updated = { ...rec.anggota, is_active: false, updated_at: now };
    await updateAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'anggota',
      entitas_id: rec.anggota.id,
      event_type: 'anggota.deactivated',
      before: { is_active: true },
      after: { is_active: false },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(publicAnggota(updated));
  } catch (err) {
    console.error('[POST /api/pengaturan/anggota/[id]/deactivate] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal menonaktifkan anggota.', 500);
  }
}
