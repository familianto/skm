import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiStatus } from '@/types';
import type { ApiResponse } from '@/types';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const rows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);
    const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
    const rekeningIdx = headers.indexOf('rekening_id');
    const statusIdx = headers.indexOf('status');

    // Count active transactions using this rekening
    const count = rows.filter((row) => {
      return row[rekeningIdx] === id && row[statusIdx] !== TransaksiStatus.VOID;
    }).length;

    return NextResponse.json<ApiResponse<{ count: number }>>(
      { success: true, data: { count } }
    );
  } catch (error) {
    console.error('GET /api/rekening/[id]/usage-count error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal menghitung penggunaan rekening.' },
      { status: 500 }
    );
  }
}
