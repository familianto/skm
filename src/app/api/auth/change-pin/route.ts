import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { getSession, verifyPin, hashPin, deleteSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse, Master } from '@/types';
import { nowISO } from '@/lib/utils';

function rowToMaster(row: string[]): Master {
  const headers = SHEET_HEADERS[SHEET_NAMES.MASTER];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return obj as unknown as Master;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { pinLama, pinBaru, konfirmasiPin } = body;

    // Validation
    if (!pinLama || !pinBaru || !konfirmasiPin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Semua field wajib diisi.' },
        { status: 400 }
      );
    }

    if (!/^\d{4,6}$/.test(pinBaru)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'PIN baru harus 4-6 digit angka.' },
        { status: 400 }
      );
    }

    if (pinBaru !== konfirmasiPin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'PIN baru dan konfirmasi tidak cocok.' },
        { status: 400 }
      );
    }

    // Fetch master data
    const rows = await sheetsService.getRows(SHEET_NAMES.MASTER);
    if (rows.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Data master belum dikonfigurasi.' },
        { status: 404 }
      );
    }

    const master = rowToMaster(rows[0]);

    // Verify old PIN
    const isValid = await verifyPin(pinLama, master.pin_hash);
    if (!isValid) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'PIN lama salah.' },
        { status: 400 }
      );
    }

    // Hash new PIN and update
    const newHash = await hashPin(pinBaru);
    const headers = SHEET_HEADERS[SHEET_NAMES.MASTER];
    const row = [...rows[0]];
    while (row.length < headers.length) row.push('');

    const pinHashIndex = headers.indexOf('pin_hash');
    const updatedAtIndex = headers.indexOf('updated_at');
    row[pinHashIndex] = newHash;
    row[updatedAtIndex] = nowISO();

    await sheetsService.updateRow(SHEET_NAMES.MASTER, 2, row);

    try {
      await logAudit(
        AuditAksi.UPDATE, SHEET_NAMES.MASTER, master.id,
        'PIN berhasil diubah',
        session.role || 'Bendahara'
      );
    } catch { /* audit failure should not block */ }

    // Destroy session to force re-login
    await deleteSession();

    return NextResponse.json<ApiResponse<{ message: string }>>(
      { success: true, data: { message: 'PIN berhasil diubah. Silakan login kembali.' } }
    );
  } catch (error) {
    console.error('POST /api/auth/change-pin error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengubah PIN.' },
      { status: 500 }
    );
  }
}
