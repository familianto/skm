import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireSuperAdmin } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import {
  findById,
  updateAt,
  isTeleponTakenByActive,
  publicAnggota,
} from '@/lib/api/anggota-repo';
import { AuditAksi } from '@/types';

/**
 * U8 — POST /api/pengaturan/anggota/[id]/reactivate
 *
 * Toggle `is_active=TRUE`. Re-checks telepon uniqueness in case another
 * active anggota now occupies the same telepon (since uniqueness is only
 * enforced against active rows).
 *
 * Idempotent on already-active.
 *
 * Audit: anggota.reactivated.
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

    if (rec.anggota.is_active) {
      return success(publicAnggota(rec.anggota));
    }

    if (await isTeleponTakenByActive(rec.anggota.telepon, rec.anggota.id)) {
      return error(
        ErrorCodes.DUPLICATE_TELEPON,
        'Telepon kini digunakan oleh anggota aktif lain. Ubah telepon anggota ini sebelum reaktivasi.',
        409,
        { field: 'telepon', constraint: 'unique_among_active' }
      );
    }

    const now = new Date().toISOString();
    const updated = { ...rec.anggota, is_active: true, updated_at: now };
    await updateAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'anggota',
      entitas_id: rec.anggota.id,
      event_type: 'anggota.reactivated',
      before: { is_active: false },
      after: { is_active: true },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(publicAnggota(updated));
  } catch (err) {
    console.error('[POST /api/pengaturan/anggota/[id]/reactivate] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal mengaktifkan anggota.', 500);
  }
}
