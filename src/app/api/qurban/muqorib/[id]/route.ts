import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { sheetsService } from '@/lib/google-sheets';
import { AuditAksi } from '@/types';

import {
  getMuqoribById,
  updateMuqorib,
  type QurbanMuqorib,
} from '@/lib/qurban/muqorib-repo';
import { validateMuqoribPatch } from '@/lib/qurban/validators';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
];
const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * `qurban_peserta` ships in F04. We probe the sheet to surface real failures
 * (auth, network) in logs while gracefully swallowing the "sheet missing"
 * case so M3 stays usable in pre-F04 environments. Until F04 defines the
 * peserta schema, history is always [].
 */
async function loadHistory(): Promise<unknown[]> {
  try {
    await sheetsService.getRows('qurban_peserta');
  } catch {
    // Sheet missing or any other read failure → degrade to empty history.
  }
  return [];
}

/**
 * M3 — GET /api/qurban/muqorib/[id]
 *
 * Detail + participation history (always [] in Milestone B; populated in F04).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const muqorib = await getMuqoribById(id);
    if (!muqorib) {
      return error(ErrorCodes.NOT_FOUND, 'Muqorib tidak ditemukan.', 404);
    }
    const history = await loadHistory();
    return success({ muqorib, history });
  } catch (err) {
    console.error('[GET /api/qurban/muqorib/[id]] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat detail muqorib: ${err.message}`
        : 'Gagal memuat detail muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}

/**
 * M4 — PATCH /api/qurban/muqorib/[id]
 *
 * Subset update. Idempotent: a no-op patch returns the current record
 * without touching the sheet or the audit log.
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
    const current = await getMuqoribById(id);
    if (!current) {
      return error(ErrorCodes.NOT_FOUND, 'Muqorib tidak ditemukan.', 404);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validateMuqoribPatch(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        first.message,
        400,
        { field: first.field, errors: parsed.errors }
      );
    }
    const patch = parsed.value;

    const merged: QurbanMuqorib = {
      ...current,
      nama_lengkap: patch.nama_lengkap ?? current.nama_lengkap,
      alamat: patch.alamat ?? current.alamat,
      rt: patch.rt ?? current.rt,
      no_hp: patch.no_hp ?? current.no_hp,
      notes: patch.notes ?? current.notes,
    };

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of ['nama_lengkap', 'alamat', 'rt', 'no_hp', 'notes'] as const) {
      if (current[k] !== merged[k]) {
        before[k] = current[k];
        after[k] = merged[k];
      }
    }
    if (Object.keys(after).length === 0) {
      // Idempotent no-op — return current without writing.
      return success(current);
    }

    merged.updated_at = new Date().toISOString();
    await updateMuqorib(merged);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'muqorib',
      entitas_id: id,
      event_type: 'muqorib.updated',
      before,
      after,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(merged);
  } catch (err) {
    console.error('[PATCH /api/qurban/muqorib/[id]] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memperbarui muqorib: ${err.message}`
        : 'Gagal memperbarui muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
