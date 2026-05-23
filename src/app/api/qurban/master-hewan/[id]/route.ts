import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import {
  getMasterHewanById,
  updateMasterHewan,
  type QurbanMasterHewan,
} from '@/lib/qurban/master-hewan-repo';
import { auditMasterHewanUpdate } from '@/lib/qurban/master-hewan-audit';
import { validateMasterHewanPatch } from '@/lib/qurban/validators';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * MH3 — PATCH /api/qurban/master-hewan/[id]?edisi_id=EDS-...
 *
 * Update kapasitas/harga. jenis & kelas are immutable. Allowed when edisi is
 * DRAFT or AKTIF; SELESAI → BUSINESS_EDISI_LOCKED. Idempotent no-op when the
 * merge produces no change. Audit splits into harga / kapasitas events.
 */
export async function PATCH(
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

    const body = await request.json().catch(() => ({}));
    const parsed = validateMasterHewanPatch(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        first.message,
        422,
        { field: first.field, errors: parsed.errors }
      );
    }
    const patch = parsed.value;

    const merged: QurbanMasterHewan = {
      ...current,
      kapasitas_slot: patch.kapasitas_slot ?? current.kapasitas_slot,
      harga_beli: patch.harga_beli ?? current.harga_beli,
      harga_bawa_sendiri: patch.harga_bawa_sendiri ?? current.harga_bawa_sendiri,
    };

    const changed =
      merged.kapasitas_slot !== current.kapasitas_slot ||
      merged.harga_beli !== current.harga_beli ||
      merged.harga_bawa_sendiri !== current.harga_bawa_sendiri;
    if (!changed) {
      // Idempotent no-op.
      return success(current);
    }

    merged.updated_at = new Date().toISOString();
    await updateMasterHewan(merged);

    await auditMasterHewanUpdate({
      id,
      before: current,
      after: merged,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(merged);
  } catch (err) {
    console.error('[PATCH /api/qurban/master-hewan/[id]] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memperbarui master hewan: ${err.message}`
        : 'Gagal memperbarui master hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
