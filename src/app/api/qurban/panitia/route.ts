import { NextRequest } from 'next/server';
import { z } from 'zod';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole, requireSession } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { listAll } from '@/lib/api/anggota-repo';
import { AuditAksi } from '@/types';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import {
  ALLOWED_PANITIA_PERAN,
  isAllowedPanitiaPeran,
} from '@/lib/qurban/validators';
import {
  createPanitia,
  findActivePanitiaByEdisiAndAnggota,
  listActivePanitiaByEdisi,
  listPanitiaByEdisi,
  type Panitia,
} from '@/lib/qurban/panitia-repo';
import { generatePanitiaId } from '@/lib/qurban/id-generator';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

export interface EnrichedPanitia extends Panitia {
  anggota_nama: string;
  anggota_peran: string;
  assigned_by_nama: string;
}

function buildLookup(rows: Awaited<ReturnType<typeof listAll>>) {
  const map = new Map<string, { nama: string; peran: string }>();
  for (const { anggota } of rows) {
    map.set(anggota.id, { nama: anggota.nama, peran: anggota.peran });
  }
  return map;
}

/**
 * P1 — GET /api/qurban/panitia?edisi_id=EDS-...&include_inactive=false
 *
 * Returns ACTIVE panitia by default (unless `include_inactive=true`).
 * Each row enriched with `anggota_nama`, `anggota_peran`, and
 * `assigned_by_nama` for the table UI.
 *
 * PENDAFTARAN/DISTRIBUSI: only edisi AKTIF (else 403 FORBIDDEN_EDISI).
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

    if (!edisiId) {
      return error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Query param `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      );
    }

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    if (isPanitiaRole(guard.session.peran) && edisi.status !== EDISI_STATUS.AKTIF) {
      return error(
        ErrorCodes.FORBIDDEN_EDISI,
        'Anda hanya dapat mengakses panitia edisi yang berstatus AKTIF.',
        403,
        { edisi_status: edisi.status }
      );
    }

    const list = includeInactive
      ? await listPanitiaByEdisi(edisiId)
      : await listActivePanitiaByEdisi(edisiId);

    // One Sheet read for all anggota; build lookup map once.
    const anggotaList = await listAll();
    const lookup = buildLookup(anggotaList);

    const items: EnrichedPanitia[] = list
      .map((p) => {
        const anggota = lookup.get(p.anggota_id);
        const assignedBy = lookup.get(p.assigned_by);
        return {
          ...p,
          anggota_nama: anggota?.nama || '',
          anggota_peran: anggota?.peran || '',
          assigned_by_nama: assignedBy?.nama || p.assigned_by || '',
        };
      })
      // Stable order: assigned_at desc (newest first).
      .sort((a, b) =>
        a.assigned_at < b.assigned_at ? 1 : a.assigned_at > b.assigned_at ? -1 : 0
      );

    return success(items, {
      total: items.length,
      page: 1,
      page_size: items.length,
      has_more: false,
      filters_applied: { edisi_id: edisiId, include_inactive: includeInactive },
    });
  } catch (err) {
    console.error('[GET /api/qurban/panitia] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat panitia: ${err.message}`
        : 'Gagal memuat panitia.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}

const assignSchema = z.object({
  anggota_id: z.string().min(1, 'anggota_id wajib diisi.'),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter.').optional(),
});

/**
 * P2 — POST /api/qurban/panitia?edisi_id=EDS-...
 *
 * Assign an anggota as panitia for `edisi_id`.
 *
 * Validation:
 *   - edisi must exist; status SELESAI → 422 BUSINESS_EDISI_LOCKED.
 *   - anggota must exist and be is_active=true.
 *   - anggota.peran must be in {SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN,
 *     DISTRIBUSI}. BENDAHARA → 422 BUSINESS_INVALID_PERAN_FOR_PANITIA.
 *   - no existing active panitia for the same (edisi_id, anggota_id) →
 *     409 DUPLICATE_PANITIA.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
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

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    if (edisi.status === EDISI_STATUS.SELESAI) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Panitia tidak dapat diubah.',
        422,
        { edisi_status: edisi.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        422,
        { field: issue.path.join('.') }
      );
    }
    const { anggota_id, notes } = parsed.data;

    // Validate anggota: must exist and be active.
    const anggotaList = await listAll();
    const anggota = anggotaList.find((a) => a.anggota.id === anggota_id)?.anggota;
    if (!anggota) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'Anggota tidak ditemukan.',
        422,
        { field: 'anggota_id' }
      );
    }
    if (!anggota.is_active) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'Anggota tidak aktif tidak dapat ditugaskan sebagai panitia.',
        422,
        { field: 'anggota_id' }
      );
    }

    if (!isAllowedPanitiaPeran(anggota.peran)) {
      return error(
        ErrorCodes.BUSINESS_INVALID_PERAN_FOR_PANITIA,
        `Peran ${anggota.peran} tidak diizinkan menjadi panitia.`,
        422,
        { field: 'anggota_id', peran: anggota.peran, allowed_peran: ALLOWED_PANITIA_PERAN }
      );
    }

    // Dedupe: one active panitia row per (edisi_id, anggota_id).
    const existing = await findActivePanitiaByEdisiAndAnggota(edisiId, anggota_id);
    if (existing) {
      return error(
        ErrorCodes.DUPLICATE_PANITIA,
        'Anggota sudah menjadi panitia aktif di edisi ini.',
        409,
        { existing_panitia_id: existing.id }
      );
    }

    const id = await generatePanitiaId();
    const now = new Date().toISOString();
    const newPanitia: Panitia = {
      id,
      edisi_id: edisiId,
      anggota_id,
      is_active: true,
      assigned_at: now,
      assigned_by: guard.session.user_id,
      notes: notes ?? '',
    };

    await createPanitia(newPanitia);

    await writeAuditLog({
      aksi: AuditAksi.CREATE,
      entitas: 'panitia',
      entitas_id: id,
      event_type: 'panitia.assigned',
      after: newPanitia,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(newPanitia, undefined, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/panitia] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal menugaskan panitia: ${err.message}`
        : 'Gagal menugaskan panitia.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
