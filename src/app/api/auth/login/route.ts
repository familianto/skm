import { NextRequest, NextResponse } from 'next/server';
import { verifyPin, createSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, RATE_LIMIT } from '@/lib/constants';
import { loginSchema } from '@/lib/validators';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';
import {
  getClientId,
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
  getAttemptCount,
} from '@/lib/rate-limit';

interface LoginData {
  masjidName: string;
}

interface LoginErrorData {
  remainingAttempts?: number;
  locked?: boolean;
  lockoutUntil?: number | null;
  attemptCount?: number;
}

export async function POST(request: NextRequest) {
  try {
    const clientId = getClientId(request.headers);

    // Check if client is locked out
    const lockoutRemaining = checkLockout(clientId);
    if (lockoutRemaining > 0) {
      const lockoutUntil = Date.now() + lockoutRemaining;
      return NextResponse.json<ApiResponse<LoginErrorData>>(
        {
          success: false,
          error: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
          data: {
            locked: true,
            lockoutUntil,
            remainingAttempts: 0,
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { pin } = parsed.data;

    // Get master row (pin_hash is column H, index 7)
    const rows = await sheetsService.getRows(SHEET_NAMES.MASTER);
    if (rows.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Sistem belum dikonfigurasi. Jalankan seed terlebih dahulu.' },
        { status: 500 }
      );
    }

    const masterRow = rows[0];
    const pinHash = masterRow[7]; // pin_hash column
    const masjidName = masterRow[1]; // nama_masjid column

    if (!pinHash) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'PIN belum dikonfigurasi.' },
        { status: 500 }
      );
    }

    const isValid = await verifyPin(pin, pinHash);
    if (!isValid) {
      const result = recordFailedAttempt(clientId);
      const currentAttempts = getAttemptCount(clientId);

      if (result.locked) {
        return NextResponse.json<ApiResponse<LoginErrorData>>(
          {
            success: false,
            error: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
            data: {
              locked: true,
              lockoutUntil: result.lockoutUntil,
              remainingAttempts: 0,
              attemptCount: currentAttempts,
            },
          },
          { status: 429 }
        );
      }

      const showWarning = currentAttempts >= RATE_LIMIT.WARNING_THRESHOLD;
      return NextResponse.json<ApiResponse<LoginErrorData>>(
        {
          success: false,
          error: showWarning
            ? `PIN salah. Sisa ${result.remainingAttempts} percobaan sebelum akun di-lock.`
            : 'PIN salah.',
          data: {
            locked: false,
            remainingAttempts: result.remainingAttempts,
            attemptCount: currentAttempts,
          },
        },
        { status: 401 }
      );
    }

    // Successful login — reset rate limit counter
    resetAttempts(clientId);

    await createSession({ role: 'BENDAHARA', masjidName: masjidName || 'SKM' });

    await logAudit(AuditAksi.LOGIN, 'auth', '', 'Login berhasil', 'Bendahara');

    return NextResponse.json<ApiResponse<LoginData>>(
      { success: true, data: { masjidName: masjidName || 'SKM' } }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Terjadi kesalahan saat login.' },
      { status: 500 }
    );
  }
}
