import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getSessionFromRequest } from '@/lib/api/auth';
import { validatePin } from '@/lib/api/pin-policy';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { findById, updateAt } from '@/lib/api/anggota-repo';
import { AuditAksi } from '@/types';

/**
 * A4 — POST /api/auth/change-pin
 *
 * Self-change PIN for the currently authenticated anggota.
 *
 * Flow:
 *  1. Session required (any role)
 *  2. Validate body { old_pin, new_pin }
 *  3. LEGACY session → reject (no anggota row to update)
 *  4. Run PIN policy on new_pin
 *  5. bcrypt(old_pin) against anggota.pin_hash. Wrong → 401 AUTH_INVALID
 *     IMPORTANT: do NOT increment failed_attempts here (per spec §3.1 A4).
 *     The failed_attempts counter is for login lockout, not self-change.
 *  6. new_pin must differ from old_pin
 *  7. bcrypt-hash new_pin, write to anggota; update updated_at
 *  8. Audit auth.pin_changed
 *  9. Session remains valid (no rotation) per spec §3.5
 */

const BCRYPT_ROUNDS = 10;

const changePinSchema = z.object({
  old_pin: z
    .string()
    .min(1, 'PIN lama wajib diisi')
    .regex(/^\d{4,6}$/, 'PIN lama harus 4-6 digit numerik'),
  new_pin: z
    .string()
    .min(1, 'PIN baru wajib diisi')
    .regex(/^\d{4,6}$/, 'PIN baru harus 4-6 digit numerik'),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return error(ErrorCodes.AUTH_REQUIRED, 'Sesi tidak ditemukan.', 401);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = changePinSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.') }
      );
    }
    const { old_pin, new_pin } = parsed.data;

    if (session.user_id === 'LEGACY') {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'Akun legacy tidak dapat mengubah PIN. Silakan login dengan akun multi-user.',
        422
      );
    }

    // PIN policy on the new PIN
    const policy = validatePin(new_pin);
    if (!policy.valid) {
      return error(
        ErrorCodes.VALIDATION_PIN_POLICY,
        policy.constraint || 'PIN baru tidak memenuhi kebijakan.',
        400,
        { field: 'new_pin', violation: policy.violation, constraint: policy.constraint }
      );
    }

    // Lookup current anggota
    const rec = await findById(session.user_id);
    if (!rec) {
      return error(
        ErrorCodes.AUTH_INVALID,
        'Anggota tidak ditemukan. Silakan login ulang.',
        401
      );
    }
    if (!rec.anggota.is_active) {
      return error(ErrorCodes.AUTH_INACTIVE, 'Akun telah dinonaktifkan.', 401);
    }
    if (!rec.anggota.pin_hash) {
      return error(
        ErrorCodes.AUTH_INVALID,
        'PIN belum diatur untuk akun ini. Hubungi admin.',
        401
      );
    }

    const oldOk = await bcrypt.compare(old_pin, rec.anggota.pin_hash);
    if (!oldOk) {
      // Per spec: do NOT increment failed_attempts on change-pin (only login does).
      return error(ErrorCodes.AUTH_INVALID, 'PIN lama salah.', 401);
    }

    if (new_pin === old_pin) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'PIN baru harus berbeda dari PIN lama.',
        400,
        { field: 'new_pin', violation: 'unchanged' }
      );
    }

    const newHash = await bcrypt.hash(new_pin, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const updated = {
      ...rec.anggota,
      pin_hash: newHash,
      updated_at: now,
    };
    await updateAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'anggota',
      entitas_id: rec.anggota.id,
      event_type: 'auth.pin_changed',
      notes: 'self-change via /api/auth/change-pin',
      user_id: rec.anggota.id,
      user_info: rec.anggota.nama,
      ip_address: ip,
    });

    return success({ pin_changed: true });
  } catch (err) {
    console.error('[POST /api/auth/change-pin] error:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Terjadi kesalahan saat mengubah PIN.',
      500
    );
  }
}
