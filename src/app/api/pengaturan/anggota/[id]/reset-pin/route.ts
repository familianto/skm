import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireSuperAdmin } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { validatePin } from '@/lib/api/pin-policy';
import { findById, updateAt } from '@/lib/api/anggota-repo';
import { AuditAksi } from '@/types';

/**
 * U5 — POST /api/pengaturan/anggota/[id]/reset-pin
 *
 * SUPER_ADMIN-initiated PIN reset for another user.
 * Side-effect (per Tahap 3.E §3.2): clears `failed_attempts=0` and
 * `locked_until=''` so the user can log in immediately after reset.
 *
 * Audit: auth.pin_reset_by_admin (aksi=UPDATE, entitas=anggota).
 */

const BCRYPT_ROUNDS = 10;

const schema = z.object({
  new_pin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN baru harus 4-6 digit numerik'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.') }
      );
    }

    const policy = validatePin(parsed.data.new_pin);
    if (!policy.valid) {
      return error(
        ErrorCodes.VALIDATION_PIN_POLICY,
        policy.constraint || 'PIN tidak memenuhi kebijakan.',
        400,
        { field: 'new_pin', violation: policy.violation, constraint: policy.constraint }
      );
    }

    const rec = await findById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Anggota tidak ditemukan.', 404);
    }

    const newHash = await bcrypt.hash(parsed.data.new_pin, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const updated = {
      ...rec.anggota,
      pin_hash: newHash,
      failed_attempts: 0,
      locked_until: '',
      updated_at: now,
    };
    await updateAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'anggota',
      entitas_id: rec.anggota.id,
      event_type: 'auth.pin_reset_by_admin',
      notes: `reset by ${guard.session.user_id}`,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success({ pin_reset: true });
  } catch (err) {
    console.error('[POST /api/pengaturan/anggota/[id]/reset-pin] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal reset PIN anggota.', 500);
  }
}
