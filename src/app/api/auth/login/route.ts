import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { setSessionCookie, type SessionPayload } from '@/lib/api/auth';
import { normalizePhone, validatePhone } from '@/lib/api/phone';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { writeAuditLog } from '@/lib/api/audit';
import {
  findByTelepon,
  updateAt,
  isLocked,
  publicAnggota,
  type AnggotaFull,
} from '@/lib/api/anggota-repo';
import { getLandingUrl } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

/**
 * A1 — POST /api/auth/login
 *
 * Spec: HANDOFF Tahap 3.E §3.1 + PROMPT_F01 §5.2.
 *
 * Flow:
 *  1. IP rate limit: 10/menit per IP
 *  2. Validate {telepon, pin} body
 *  3. Normalize telepon → 628xxx
 *  4. Lookup anggota by telepon (is_active=TRUE)
 *  5. If anggota found:
 *     - locked_until > now → 423 AUTH_LOCKED
 *     - bcrypt mismatch → increment failed_attempts; ≥5 → lock 15 min;
 *       audit auth.login_failed / auth.locked
 *     - bcrypt match → reset failed_attempts, set last_login_at, issue JWT
 *  6. If anggota NOT found AND QURBAN_LEGACY_LOGIN_ENABLED=true:
 *     - bcrypt against master.pin_hash → issue LEGACY session (Opsi B parallel)
 *  7. Otherwise → 401 AUTH_INVALID (do not leak whether telepon exists)
 *
 * Audit events: auth.login_success, auth.login_failed, auth.locked
 */

const loginSchema = z.object({
  telepon: z.string().min(1, 'Telepon wajib diisi'),
  pin: z
    .string()
    .min(1, 'PIN wajib diisi')
    .regex(/^\d{4,6}$/, 'PIN harus 4-6 digit numerik'),
});

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  // 1. IP-level rate limit (10/minute)
  const rl = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS);
  if (!rl.allowed) {
    return error(
      ErrorCodes.RATE_LIMITED,
      'Terlalu banyak percobaan login. Coba lagi nanti.',
      429,
      { retry_after_sec: rl.retryAfterSec },
      { headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    // 2. Parse + validate body
    const body = await request.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.'), violation: issue.code }
      );
    }

    // 3. Normalize telepon and validate format (do not leak telepon-existence)
    const teleponNormalized = normalizePhone(parsed.data.telepon);
    if (!validatePhone(teleponNormalized)) {
      return error(
        ErrorCodes.AUTH_INVALID,
        'Telepon atau PIN salah.',
        401
      );
    }
    const { pin } = parsed.data;

    // 4. Lookup anggota
    const found = await findByTelepon(teleponNormalized);

    // 5. Multi-user path
    if (found) {
      const { anggota, rowIndex } = found;

      if (!anggota.is_active) {
        await writeAuditLog({
          aksi: AuditAksi.LOGIN,
          entitas: 'auth',
          entitas_id: anggota.id,
          event_type: 'auth.login_failed',
          notes: 'account inactive',
          user_id: anggota.id,
          user_info: anggota.nama,
          ip_address: ip,
        });
        return error(ErrorCodes.AUTH_INVALID, 'Telepon atau PIN salah.', 401);
      }

      if (isLocked(anggota)) {
        return error(
          ErrorCodes.AUTH_LOCKED,
          'Akun dikunci sementara karena terlalu banyak percobaan gagal. Silakan coba lagi setelah waktu pembukaan.',
          423,
          { locked_until: anggota.locked_until }
        );
      }

      // Empty pin_hash means this anggota cannot multi-user login yet
      // (existing 2 rows pre-migration). Fall through to legacy fallback.
      const hasMultiUserPin = !!anggota.pin_hash;
      const pinValid = hasMultiUserPin
        ? await bcrypt.compare(pin, anggota.pin_hash)
        : false;

      if (pinValid) {
        return await handleLoginSuccess(anggota, rowIndex, ip);
      }

      // Wrong PIN → increment counter, maybe lock
      if (hasMultiUserPin) {
        return await handleLoginFailed(anggota, rowIndex, ip);
      }

      // hasMultiUserPin === false → no multi-user account yet for this telepon;
      // fall through to legacy fallback as if no anggota match.
    }

    // 6. Legacy fallback (Opsi B parallel login)
    const legacyEnabled = process.env.QURBAN_LEGACY_LOGIN_ENABLED === 'true';
    if (legacyEnabled) {
      const masterRows = await sheetsService.getRows(SHEET_NAMES.MASTER);
      const masterPinHash = masterRows[0]?.[7] || '';
      if (masterPinHash) {
        const legacyOk = await bcrypt.compare(pin, masterPinHash);
        if (legacyOk) {
          const payload: SessionPayload = {
            user_id: 'LEGACY',
            peran: 'SUPER_ADMIN',
            role: 'SUPER_ADMIN',
            masjidName: masterRows[0]?.[1] || '',
          };
          await setSessionCookie(payload);
          await writeAuditLog({
            aksi: AuditAksi.LOGIN,
            entitas: 'auth',
            entitas_id: 'LEGACY',
            event_type: 'auth.login_success',
            notes: 'legacy fallback (master.pin_hash)',
            user_id: 'LEGACY',
            user_info: 'Legacy Admin',
            ip_address: ip,
          });
          return success({
            user: {
              id: 'LEGACY',
              nama: 'Legacy Admin',
              telepon: '',
              email: '',
              peran: 'SUPER_ADMIN',
              is_active: true,
              last_login_at: '',
            },
            landing_url: getLandingUrl('SUPER_ADMIN'),
            edisi_aktif: null,
            warnings: ['Anda login via mode legacy. Migrasikan ke akun multi-user.'],
          });
        }
      }
    }

    // 7. No path matched → generic invalid (no leak)
    await writeAuditLog({
      aksi: AuditAksi.LOGIN,
      entitas: 'auth',
      entitas_id: '-',
      event_type: 'auth.login_failed',
      notes: legacyEnabled ? 'no anggota match + legacy fallback miss' : 'no anggota match',
      user_id: 'SYSTEM',
      ip_address: ip,
    });
    return error(ErrorCodes.AUTH_INVALID, 'Telepon atau PIN salah.', 401);
  } catch (err) {
    console.error('[POST /api/auth/login] error:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Terjadi kesalahan saat login.',
      500
    );
  }
}

async function handleLoginSuccess(
  anggota: AnggotaFull,
  rowIndex: number,
  ip: string
): Promise<Response> {
  const now = new Date().toISOString();
  const updated: AnggotaFull = {
    ...anggota,
    failed_attempts: 0,
    locked_until: '',
    last_login_at: now,
    updated_at: now,
  };
  await updateAt(rowIndex, updated);

  const payload: SessionPayload = {
    user_id: anggota.id,
    peran: anggota.peran,
    role: anggota.peran,
    masjidName: '',
  };
  await setSessionCookie(payload);

  await writeAuditLog({
    aksi: AuditAksi.LOGIN,
    entitas: 'auth',
    entitas_id: anggota.id,
    event_type: 'auth.login_success',
    user_id: anggota.id,
    user_info: anggota.nama,
    ip_address: ip,
  });

  return success({
    user: publicAnggota(updated),
    landing_url: getLandingUrl(anggota.peran),
    edisi_aktif: null,
    warnings: [] as string[],
  });
}

async function handleLoginFailed(
  anggota: AnggotaFull,
  rowIndex: number,
  ip: string
): Promise<Response> {
  const newAttempts = (anggota.failed_attempts || 0) + 1;
  const now = new Date();
  const shouldLock = newAttempts >= LOCKOUT_THRESHOLD;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + LOCKOUT_DURATION_MS).toISOString()
    : '';

  const updated: AnggotaFull = {
    ...anggota,
    failed_attempts: newAttempts,
    locked_until: lockedUntil || anggota.locked_until,
    updated_at: now.toISOString(),
  };
  await updateAt(rowIndex, updated);

  await writeAuditLog({
    aksi: AuditAksi.LOGIN,
    entitas: 'auth',
    entitas_id: anggota.id,
    event_type: shouldLock ? 'auth.locked' : 'auth.login_failed',
    after: { failed_attempts: newAttempts, ...(shouldLock && { locked_until: lockedUntil }) },
    user_id: anggota.id,
    user_info: anggota.nama,
    ip_address: ip,
  });

  if (shouldLock) {
    return error(
      ErrorCodes.AUTH_LOCKED,
      'Akun dikunci 15 menit karena terlalu banyak percobaan gagal.',
      423,
      { locked_until: lockedUntil }
    );
  }
  return error(
    ErrorCodes.AUTH_INVALID,
    'Telepon atau PIN salah.',
    401,
    { remaining_attempts: Math.max(0, LOCKOUT_THRESHOLD - newAttempts) }
  );
}
