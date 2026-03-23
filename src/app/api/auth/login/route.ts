import { NextRequest, NextResponse } from 'next/server';
import { verifyPin, createSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { loginSchema } from '@/lib/validators';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'PIN salah.' },
        { status: 401 }
      );
    }

    await createSession({ role: 'BENDAHARA', masjidName: masjidName || 'SKM' });

    await logAudit(AuditAksi.LOGIN, 'auth', '', 'Login berhasil', 'Bendahara');

    return NextResponse.json<ApiResponse<{ masjidName: string }>>(
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
