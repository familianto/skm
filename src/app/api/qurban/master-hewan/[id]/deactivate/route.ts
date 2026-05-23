import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { sheetsService } from '@/lib/google-sheets';
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
 * Count active inventory rows in `qurban_daftar_hewan` that reference a
 * master_hewan. The sheet ships in F05 — until then we probe it and treat a
 * missing sheet as zero references (mirrors M3's history probe).
 *
 * TODO F05: cascade-block kalau ada daftar_hewan AKTIF — once the sheet and
 * its schema exist, take the master_hewan id and count rows where
 * master_hewan_id == id && status active.
 */
async function countActiveInventoryRefs(): Promise<number> {
  try {
    await sheetsService.getRows('qurban_daftar_hewan');
  } catch {
    // Sheet missing or read failure → degrade to zero references.
    return 0;
  }
  return 0;
}

/**
 * MH4 — POST /api/qurban/master-hewan/[id]/deactivate?edisi_id=EDS-...
 *
 * Soft-delete. Allowed when edisi is DRAFT or AKTIF; SELESAI →
 * BUSINESS_EDISI_LOCKED. Idempotent when already inactive. No reactivate
 * counterpart by design.
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

    // Cascade guard — inert until F05 (always 0 refs while the sheet is absent).
    await countActiveInventoryRefs();

    if (!current.is_active) {
      // Idempotent no-op.
      return success(current);
    }

    const updated: QurbanMasterHewan = {
      ...current,
      is_active: false,
      updated_at: new Date().toISOString(),
    };
    await updateMasterHewan(updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'master_hewan',
      entitas_id: id,
      event_type: 'master_hewan.deactivated',
      before: { is_active: true },
      after: { is_active: false },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/master-hewan/[id]/deactivate] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal menonaktifkan master hewan: ${err.message}`
        : 'Gagal menonaktifkan master hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
