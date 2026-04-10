import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';
import { getSession } from '@/lib/auth';
import { nowISO } from '@/lib/utils';

const bulkUpdateKategoriSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1, 'Pilih minimal 1 transaksi'),
  newKategoriId: z.string().min(1, 'Kategori baru wajib dipilih'),
});

const CHUNK_SIZE = 50;

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
    const parsed = bulkUpdateKategoriSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { transactionIds, newKategoriId } = parsed.data;
    const now = nowISO();
    const userInfo = session.role || 'Bendahara';

    // Verify the new kategori exists
    const katResult = await sheetsService.getRowById(SHEET_NAMES.KATEGORI, newKategoriId);
    if (!katResult) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Kategori baru tidak ditemukan.' },
        { status: 400 }
      );
    }

    // Fetch all transaksi rows
    const rows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);
    const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
    const kategoriIdx = headers.indexOf('kategori_id');
    const updatedAtIdx = headers.indexOf('updated_at');

    // Generate a batch_id for audit logging
    const batchId = `BULK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`;

    // Build a map of transaction ID → { rowIndex, oldKategoriId }
    const updateTargets: { rowIndex: number; oldKategoriId: string; row: string[] }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (transactionIds.includes(row[0])) {
        updateTargets.push({
          rowIndex: i + 2, // +2: header row + 0-based index
          oldKategoriId: row[kategoriIdx] || '',
          row: [...row],
        });
      }
    }

    if (updateTargets.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Tidak ada transaksi yang ditemukan.' },
        { status: 404 }
      );
    }

    // Process in chunks of CHUNK_SIZE
    let updatedCount = 0;
    for (let i = 0; i < updateTargets.length; i += CHUNK_SIZE) {
      const chunk = updateTargets.slice(i, i + CHUNK_SIZE);

      for (const target of chunk) {
        const updatedRow = [...target.row];
        // Pad row to full header length if needed
        while (updatedRow.length < headers.length) {
          updatedRow.push('');
        }
        updatedRow[kategoriIdx] = newKategoriId;
        updatedRow[updatedAtIdx] = now;

        await sheetsService.updateRow(SHEET_NAMES.TRANSAKSI, target.rowIndex, updatedRow);
        updatedCount++;

        // Log audit per transaction (non-blocking)
        void logAudit(
          AuditAksi.UPDATE,
          SHEET_NAMES.TRANSAKSI,
          target.row[0],
          JSON.stringify({
            aksi: 'BULK_EDIT_KATEGORI',
            transaction_id: target.row[0],
            old_kategori_id: target.oldKategoriId,
            new_kategori_id: newKategoriId,
            batch_id: batchId,
          }),
          userInfo
        );
      }
    }

    return NextResponse.json<ApiResponse<{ updatedCount: number; batchId: string }>>(
      { success: true, data: { updatedCount, batchId } }
    );
  } catch (error) {
    console.error('POST /api/transaksi/bulk-update-kategori error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengubah kategori transaksi.' },
      { status: 500 }
    );
  }
}
