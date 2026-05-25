import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForHewan } from '@/lib/qurban/daftar-hewan-context';
import {
  listDaftarHewanRecordsByEdisi,
  updateDaftarHewanAt,
} from '@/lib/qurban/daftar-hewan-repo';
import { isValidHewanTransition, HEWAN_STATUS } from '@/lib/qurban/hewan-state-machine';
import { validateBatchStatusPayload } from '@/lib/qurban/validators';
import { getOccupancyByHewan, hasPesertaTerdaftar } from '@/lib/qurban/peserta-occupancy';
import { auditHewanStatusChanged } from '@/lib/qurban/daftar-hewan-audit';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

// H6 = SA, AQ only (PENDAFTARAN excluded — status/pemotongan ranah admin).
const STATUS_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * H6 — POST /api/qurban/hewan/batch-status?edisi_id=EDS-...
 *
 * Batch update status. All-or-nothing: validasi SEMUA dulu (transisi sah,
 * tanggal_pemotongan wajib utk TERPOTONG, tak ada peserta TERDAFTAR utk BATAL),
 * baru terapkan. tanggal_pemotongan TIDAK disimpan kolom — masuk audit (Opsi A).
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, STATUS_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);
  const actor = { user_id: guard.session.user_id, ip_address: ip };

  try {
    const gate = await resolveEdisiForHewan(request, guard.session.peran, {
      requireWritable: true,
    });
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const body = await request.json().catch(() => ({}));
    const parsed = validateBatchStatusPayload(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, {
        field: first.field,
        errors: parsed.errors,
      });
    }
    const { target_status, tanggal_pemotongan, notes } = parsed.value;
    const ids = Array.from(new Set(parsed.value.hewan_ids));

    const records = await listDaftarHewanRecordsByEdisi(edisiId);
    const byId = new Map(records.map((r) => [r.hewan.id, r]));

    // --- Validate the WHOLE batch before any write ---
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return error(ErrorCodes.NOT_FOUND, 'Sebagian hewan tidak ditemukan di edisi ini.', 404, { missing });
    }

    const occ = target_status === HEWAN_STATUS.BATAL ? await getOccupancyByHewan(edisiId) : null;

    for (const id of ids) {
      const { hewan } = byId.get(id)!;
      if (!isValidHewanTransition(hewan.status, target_status)) {
        return error(
          ErrorCodes.BUSINESS_INVALID_STATE_TRANSITION,
          `Transisi ${hewan.status} → ${target_status} tidak diizinkan untuk hewan ${id}.`,
          422,
          { hewan_id: id, from: hewan.status, to: target_status }
        );
      }
      if (target_status === HEWAN_STATUS.BATAL && occ && hasPesertaTerdaftar(occ, id)) {
        return error(
          ErrorCodes.BUSINESS_HEWAN_HAS_PESERTA,
          `Hewan ${id} masih memiliki peserta TERDAFTAR — tidak dapat dibatalkan.`,
          422,
          { hewan_id: id }
        );
      }
    }

    // --- Apply ---
    const now = new Date().toISOString();
    for (const id of ids) {
      const rec = byId.get(id)!;
      const from = rec.hewan.status;
      const updated: QurbanDaftarHewan = {
        ...rec.hewan,
        status: target_status,
        updated_at: now,
      };
      await updateDaftarHewanAt(rec.rowIndex, updated);
      await auditHewanStatusChanged(id, from, target_status, actor, {
        tanggal_pemotongan: tanggal_pemotongan || undefined,
        notes: notes || undefined,
      });
    }

    return success({ count: ids.length, target_status });
  } catch (err) {
    console.error('[POST /api/qurban/hewan/batch-status] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memperbarui status hewan.', 500);
  }
}
