import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import {
  getMasterHewanById,
  updateMasterHewan,
  type QurbanMasterHewan,
} from '@/lib/qurban/master-hewan-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * MH6 — POST /api/qurban/master-hewan/[id]/reactivate?edisi_id=EDS-...
 *
 * Inverse of MH4. Allowed when edisi is DRAFT or AKTIF; SELESAI →
 * BUSINESS_EDISI_LOCKED. Idempotent when already active. Pairs with MH4 so a
 * type deactivated by mistake (and blocked from re-create by MH2's all-scope
 * duplicate check) can be brought back without a duplicate row.
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
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();
    if (!edisiId) {
      return error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Query param `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      );
    }

    const current = await getMasterHewanById(id);
    if (!current || current.edisi_id !== edisiId) {
      return error(ErrorCodes.NOT_FOUND, 'Master hewan tidak ditemukan.', 404);
    }

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }
    if (edisi.status === EDISI_STATUS.SELESAI) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Master hewan tidak dapat diubah.',
        422,
        { edisi_status: edisi.status }
      );
    }

    if (current.is_active) {
      // Idempotent no-op.
      return success(current);
    }

    const updated: QurbanMasterHewan = {
      ...current,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    await updateMasterHewan(updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'master_hewan',
      entitas_id: id,
      event_type: 'master_hewan.reactivated',
      before: { is_active: false },
      after: { is_active: true },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/master-hewan/[id]/reactivate] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal mengaktifkan kembali master hewan: ${err.message}`
        : 'Gagal mengaktifkan kembali master hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
