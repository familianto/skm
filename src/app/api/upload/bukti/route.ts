import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, APP_CONFIG } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { driveService } from '@/lib/google-drive';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const MAX_SIZE_BYTES = APP_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;

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
    const transaksiId = formData.get('transaksi_id') as string | null;

    if (!file) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'File wajib diupload.' },
        { status: 400 }
      );
    }

    if (!transaksiId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'ID transaksi wajib diisi.' },
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
        { success: false, error: `Ukuran file maksimal ${APP_CONFIG.MAX_FILE_SIZE_MB}MB.` },
        { status: 400 }
      );
    }

    // Verify transaction exists
    const result = await sheetsService.getRowById(SHEET_NAMES.TRANSAKSI, transaksiId);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Transaksi tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Upload to Google Drive
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `bukti_${transaksiId}_${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;

    let buktiUrl: string;
    try {
      const fileId = await driveService.uploadFile(buffer, fileName, file.type);
      buktiUrl = driveService.getFileUrl(fileId);
    } catch (driveError) {
      console.error('Google Drive upload failed:', driveError);
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Gagal mengupload file. Pastikan Google Drive sudah dikonfigurasi.' },
        { status: 503 }
      );
    }

    // Update transaction with bukti_url
    const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
    const row = [...result.row];
    // Ensure row has enough elements
    while (row.length < headers.length) row.push('');

    const buktiUrlIndex = headers.indexOf('bukti_url');
    const updatedAtIndex = headers.indexOf('updated_at');
    row[buktiUrlIndex] = buktiUrl;
    row[updatedAtIndex] = nowISO();

    await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, result.rowIndex, row);

    await logAudit(
      AuditAksi.UPDATE, SHEET_NAMES.TRANSAKSI, transaksiId,
      JSON.stringify({ bukti_url: buktiUrl }),
      session.role || 'Bendahara'
    );

    return NextResponse.json<ApiResponse<{ bukti_url: string }>>(
      { success: true, data: { bukti_url: buktiUrl } }
    );
  } catch (error) {
    console.error('POST /api/upload/bukti error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupload bukti.' },
      { status: 500 }
    );
  }
}
