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
  findPanitiaRecordById,
  updatePanitiaAt,
  type Panitia,
} from '@/lib/qurban/panitia-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * P3 — DELETE /api/qurban/panitia/[id]
 *
 * Soft-remove: flips `is_active` to FALSE (the row stays for audit trail).
 * Idempotent: already-inactive row → 200 OK no-op.
 *
 * Locked when the parent edisi is SELESAI (422 BUSINESS_EDISI_LOCKED).
 *
 * Uses the same updateRow path as updateKonfigurasiAt / updateEdisiAt — the
 * one proven to work after the F02-C SHEET_HEADERS fix.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const rec = await findPanitiaRecordById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Panitia tidak ditemukan.', 404);
    }

    const edisi = await findEdisiById(rec.panitia.edisi_id);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi panitia tidak ditemukan.', 404);
    }

    if (edisi.status === EDISI_STATUS.SELESAI) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Panitia tidak dapat diubah.',
        422,
        { edisi_status: edisi.status }
      );
    }

    if (!rec.panitia.is_active) {
      // Idempotent no-op — skip the sheet write and the audit entry.
      return success(rec.panitia);
    }

    const updated: Panitia = { ...rec.panitia, is_active: false };
    await updatePanitiaAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'panitia',
      entitas_id: id,
      event_type: 'panitia.removed',
      before: { is_active: true },
      after: { is_active: false },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(updated);
  } catch (err) {
    console.error('[DELETE /api/qurban/panitia/[id]] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal menghapus panitia: ${err.message}`
        : 'Gagal menghapus panitia.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
