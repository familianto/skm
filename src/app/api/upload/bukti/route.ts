import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

// Max base64 data URL size (fits in Google Sheets cell limit of 50K chars)
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
    const { transaksiId, buktiDataUrl } = body as { transaksiId?: string; buktiDataUrl?: string };

    if (!transaksiId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'ID transaksi wajib diisi.' },
        { status: 400 }
      );
    }

    if (!buktiDataUrl || !buktiDataUrl.startsWith('data:image/')) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Data bukti tidak valid.' },
        { status: 400 }
      );
    }

    if (buktiDataUrl.length > MAX_DATA_URL_LENGTH) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Ukuran bukti terlalu besar. Coba gunakan gambar yang lebih kecil.' },
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

    // Update transaction with bukti as base64 data URL
    const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
    const row = [...result.row];
    while (row.length < headers.length) row.push('');

    const buktiUrlIndex = headers.indexOf('bukti_url');
    const updatedAtIndex = headers.indexOf('updated_at');
    row[buktiUrlIndex] = buktiDataUrl;
    row[updatedAtIndex] = nowISO();

    await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, result.rowIndex, row);

    try {
      await logAudit(
        AuditAksi.UPDATE, SHEET_NAMES.TRANSAKSI, transaksiId,
        JSON.stringify({ bukti_url: 'base64_data_url' }),
        session.role || 'Bendahara'
      );
    } catch { /* audit failure should not block */ }

    return NextResponse.json<ApiResponse<{ bukti_url: string }>>(
      { success: true, data: { bukti_url: buktiDataUrl } }
    );
  } catch (error) {
    console.error('POST /api/upload/bukti error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupload bukti.' },
      { status: 500 }
    );
  }
}
