import { NextRequest } from 'next/server';
import { z } from 'zod';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import {
  getMuqoribById,
  updateMuqorib,
  type QurbanMuqorib,
} from '@/lib/qurban/muqorib-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

const bodySchema = z
  .object({
    // Cap mirrors F01 U7 (anggota deactivate) — keeps audit `notes` bounded.
    notes: z.string().max(200, 'notes maksimum 200 karakter.').optional(),
  })
  .optional()
  .transform((v) => v ?? {});

/**
 * M5 — POST /api/qurban/muqorib/[id]/deactivate
 *
 * Soft-delete (is_active=false). Idempotent: already-inactive returns
 * current record without writing or auditing.
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
    const current = await getMuqoribById(id);
    if (!current) {
      return error(ErrorCodes.NOT_FOUND, 'Muqorib tidak ditemukan.', 404);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.') }
      );
    }
    const notes = parsed.data.notes;

    if (!current.is_active) {
      // Idempotent no-op.
      return success(current);
    }

    const updated: QurbanMuqorib = {
      ...current,
      is_active: false,
      updated_at: new Date().toISOString(),
    };
    await updateMuqorib(updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'muqorib',
      entitas_id: id,
      event_type: 'muqorib.deactivated',
      before: { is_active: true },
      after: { is_active: false },
      notes,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/muqorib/[id]/deactivate] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal menonaktifkan muqorib: ${err.message}`
        : 'Gagal menonaktifkan muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
