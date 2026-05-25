import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForHewan } from '@/lib/qurban/daftar-hewan-context';
import {
  getDaftarHewanRecordById,
  updateDaftarHewanAt,
} from '@/lib/qurban/daftar-hewan-repo';
import {
  isValidHewanTransition,
  isTerminalHewanStatus,
  HEWAN_STATUS,
} from '@/lib/qurban/hewan-state-machine';
import { getOccupancyByHewan, hasPesertaTerdaftar } from '@/lib/qurban/peserta-occupancy';
import { auditHewanCancelled } from '@/lib/qurban/daftar-hewan-audit';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

// H7 = SA, AQ only.
const STATUS_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * H7 — POST /api/qurban/hewan/[id]/cancel?edisi_id=EDS-...
 *
 * Batalkan satu hewan (DRAFT|AKTIF → BATAL). Terminal ditolak; hewan dengan
 * peserta TERDAFTAR ditolak; edisi SELESAI ditolak.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, STATUS_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const gate = await resolveEdisiForHewan(request, guard.session.peran, {
      requireWritable: true,
    });
    if (!gate.ok) return gate.response;

    const rec = await getDaftarHewanRecordById(id);
    if (!rec || rec.hewan.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Hewan tidak ditemukan.', 404);
    }
    const current = rec.hewan;

    if (isTerminalHewanStatus(current.status) || !isValidHewanTransition(current.status, HEWAN_STATUS.BATAL)) {
      return error(
        ErrorCodes.BUSINESS_HEWAN_TERMINAL,
        `Hewan berstatus ${current.status} tidak dapat dibatalkan.`,
        422,
        { status: current.status }
      );
    }

    const occ = await getOccupancyByHewan(gate.edisi.id);
    if (hasPesertaTerdaftar(occ, id)) {
      return error(
        ErrorCodes.BUSINESS_HEWAN_HAS_PESERTA,
        'Hewan masih memiliki peserta TERDAFTAR — tidak dapat dibatalkan.',
        422,
        { hewan_id: id }
      );
    }

    const body = await request.json().catch(() => ({}));
    const notes = typeof (body as { notes?: unknown }).notes === 'string'
      ? (body as { notes: string }).notes
      : undefined;

    const updated: QurbanDaftarHewan = {
      ...current,
      status: HEWAN_STATUS.BATAL,
      updated_at: new Date().toISOString(),
    };
    await updateDaftarHewanAt(rec.rowIndex, updated);
    await auditHewanCancelled(id, current.status, { user_id: guard.session.user_id, ip_address: ip }, notes);

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/hewan/[id]/cancel] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal membatalkan hewan.', 500);
  }
}
