import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { listAvailableSlots, type SlotCandidateFilter } from '@/lib/qurban/peserta-slot-assignment';
import { isValidTipePembelian } from '@/lib/qurban/validators';
import type { TipeQurban } from '@/lib/qurban/peserta-types';

const ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * PS8 — GET /api/qurban/peserta/available-slots?edisi_id=EDS-...
 *        &master_hewan_id=&tipe_qurban=
 *
 * Slot kosong (AKTIF) untuk edisi. master_hewan_id & tipe_qurban opsional —
 * kalau diberikan, batasi ke kombinasi itu; kalau tidak, seluruh edisi.
 * Bungkus `listAvailableSlots` (B). Panitia hanya boleh edisi AKTIF (gate).
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, ROLES);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const url = new URL(request.url);
    const masterHewanId = (url.searchParams.get('master_hewan_id') || '').trim();
    const tipe = (url.searchParams.get('tipe_qurban') || '').trim().toUpperCase();

    if (tipe && !isValidTipePembelian(tipe)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'tipe_qurban tidak valid (BELI | BAWA_SENDIRI).', 400, { field: 'tipe_qurban' });
    }

    const filter: SlotCandidateFilter = {};
    if (masterHewanId) filter.master_hewan_id = masterHewanId;
    if (tipe) filter.tipe_qurban = tipe as TipeQurban;

    const slots = await listAvailableSlots(edisiId, filter);
    return success(
      { total: slots.length, slots },
      {
        total: slots.length,
        filters_applied: {
          edisi_id: edisiId,
          master_hewan_id: masterHewanId || null,
          tipe_qurban: tipe || null,
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/qurban/peserta/available-slots] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat slot tersedia.', 500);
  }
}
