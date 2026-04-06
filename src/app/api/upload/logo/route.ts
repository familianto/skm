import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

// Max base64 data URL size (~40KB image = ~55K chars base64, fits in Sheets cell limit of 50K)
const MAX_DATA_URL_LENGTH = 50_000;

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
    const { logoDataUrl } = body as { logoDataUrl?: string };

    if (!logoDataUrl || !logoDataUrl.startsWith('data:image/')) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Data logo tidak valid.' },
        { status: 400 }
      );
    }

    if (logoDataUrl.length > MAX_DATA_URL_LENGTH) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Ukuran logo terlalu besar. Coba gunakan gambar yang lebih kecil.' },
        { status: 400 }
      );
    }

    // Update master row with logo as base64 data URL
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
    row[logoUrlIndex] = logoDataUrl;
    row[updatedAtIndex] = nowISO();

    await sheetsService.updateRow(SHEET_NAMES.MASTER, 2, row);

    try {
      await logAudit(
        AuditAksi.UPDATE, SHEET_NAMES.MASTER, row[0],
        JSON.stringify({ logo_url: 'base64_data_url' }),
        session.role || 'Bendahara'
      );
    } catch { /* audit failure should not block */ }

    return NextResponse.json<ApiResponse<{ logo_url: string }>>(
      { success: true, data: { logo_url: logoDataUrl } }
    );
  } catch (error) {
    console.error('POST /api/upload/logo error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupload logo.' },
      { status: 500 }
    );
  }
}
