import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireSuperAdmin } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { findById, updateAt, isLocked } from '@/lib/api/anggota-repo';
import { AuditAksi } from '@/types';

/**
 * U6 — POST /api/pengaturan/anggota/[id]/unlock
 *
 * Manually unlock an anggota that's currently locked (or just clear the
 * lockout state). Always clears `failed_attempts` and `locked_until`.
 *
 * Idempotent: returns 200 even if the user wasn't locked.
 *
 * Audit: auth.unlocked_manual (aksi=UPDATE, entitas=anggota).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const rec = await findById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Anggota tidak ditemukan.', 404);
    }

    const wasLocked = isLocked(rec.anggota);
    const wasCountedFails = rec.anggota.failed_attempts > 0;
    const now = new Date().toISOString();
    const updated = {
      ...rec.anggota,
      failed_attempts: 0,
      locked_until: '',
      updated_at: now,
    };
    await updateAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'anggota',
      entitas_id: rec.anggota.id,
      event_type: 'auth.unlocked_manual',
      before: {
        failed_attempts: rec.anggota.failed_attempts,
        locked_until: rec.anggota.locked_until,
      },
      after: { failed_attempts: 0, locked_until: '' },
      notes: wasLocked
        ? 'unlocked'
        : wasCountedFails
          ? 'cleared counter (was not locked)'
          : 'idempotent (no state change)',
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success({ unlocked: true, was_locked: wasLocked });
  } catch (err) {
    console.error('[POST /api/pengaturan/anggota/[id]/unlock] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal unlock anggota.', 500);
  }
}
