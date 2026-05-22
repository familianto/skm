import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import {
  findEdisiRecordById,
  updateEdisiAt,
  type Edisi,
} from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * E6 — POST /api/qurban/edisi/[id]/close
 *
 * Transition AKTIF → SELESAI. F02 pre-flight is just the state check.
 *
 * TODO(F4+): pre-flight — block close if there are peserta TERDAFTAR yet to
 * pay in full (would surface as BUSINESS_EDISI_TUTUP_BLOCKED).
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
    const rec = await findEdisiRecordById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    if (rec.edisi.status !== EDISI_STATUS.AKTIF) {
      return error(
        ErrorCodes.BUSINESS_INVALID_STATE_TRANSITION,
        `Hanya edisi berstatus AKTIF yang dapat ditutup (status saat ini: ${rec.edisi.status}).`,
        422,
        { from: rec.edisi.status, to: EDISI_STATUS.SELESAI }
      );
    }

    const now = new Date().toISOString();
    const closed: Edisi = {
      ...rec.edisi,
      status: EDISI_STATUS.SELESAI,
      updated_at: now,
    };
    await updateEdisiAt(rec.rowIndex, closed);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'edisi',
      entitas_id: id,
      event_type: 'edisi.closed',
      before: { status: EDISI_STATUS.AKTIF },
      after: { status: EDISI_STATUS.SELESAI },
      notes: 'AKTIF → SELESAI',
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(closed);
  } catch (err) {
    console.error('[POST /api/qurban/edisi/[id]/close] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal menutup edisi: ${err.message}`
        : 'Gagal menutup edisi.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
