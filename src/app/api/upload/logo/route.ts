import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { driveService } from '@/lib/google-drive';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const MAX_SIZE_BYTES = 500 * 1024; // 500KB for logo

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'File wajib diupload.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Hanya file JPG dan PNG yang diperbolehkan.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Ukuran file logo maksimal 500KB.' },
        { status: 400 }
      );
    }

    // Upload to Google Drive
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `logo_masjid_${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;

    let logoUrl: string;
    try {
      const fileId = await driveService.uploadFile(buffer, fileName, file.type);
      logoUrl = driveService.getFileUrl(fileId);
    } catch (driveError) {
      console.error('Google Drive upload failed:', driveError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Gagal mengupload logo. Pastikan Google Drive sudah dikonfigurasi.' },
        { status: 503 }
      );
    }

    // Update master row with logo_url
    const rows = await sheetsService.getRows(SHEET_NAMES.MASTER);
    if (rows.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Data master belum dikonfigurasi.' },
        { status: 404 }
      );
    }

    const headers = SHEET_HEADERS[SHEET_NAMES.MASTER];
    const row = [...rows[0]];
    while (row.length < headers.length) row.push('');

    const logoUrlIndex = headers.indexOf('logo_url');
    const updatedAtIndex = headers.indexOf('updated_at');
    row[logoUrlIndex] = logoUrl;
    row[updatedAtIndex] = nowISO();

    await sheetsService.updateRow(SHEET_NAMES.MASTER, 2, row);

    try {
      await logAudit(
        AuditAksi.UPDATE, SHEET_NAMES.MASTER, row[0],
        JSON.stringify({ logo_url: logoUrl }),
        session.role || 'Bendahara'
      );
    } catch { /* audit failure should not block */ }

    return NextResponse.json<ApiResponse<{ logo_url: string }>>(
      { success: true, data: { logo_url: logoUrl } }
    );
  } catch (error) {
    console.error('POST /api/upload/logo error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupload logo.' },
      { status: 500 }
    );
  }
}
