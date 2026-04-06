import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { AuditAksi, TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const importItemSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jenis: z.nativeEnum(TransaksiJenis),
  kategori_id: z.string().min(1),
  deskripsi: z.string().min(1).max(500),
  jumlah: z.number().int().positive(),
  rekening_id: z.string().min(1),
});

const importBatchSchema = z.object({
  items: z.array(importItemSchema).min(1).max(500),
});

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
    const parsed = importBatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { items } = parsed.data;
    const now = nowISO();
    const createdBy = session.role || 'Bendahara';
    const results: { id: string; deskripsi: string }[] = [];

    for (const item of items) {
      const id = await sheetsService.getNextId(ID_PREFIXES.TRANSAKSI);

      await sheetsService.appendRow(SHEET_NAMES.TRANSAKSI, [
        id, item.tanggal, item.jenis, item.kategori_id, item.deskripsi,
        item.jumlah.toString(), item.rekening_id, '',
        TransaksiStatus.AKTIF, '', '', '',
        createdBy, now, now,
      ]);

      results.push({ id, deskripsi: item.deskripsi });
    }

    await logAudit(
      AuditAksi.CREATE, SHEET_NAMES.TRANSAKSI, 'BATCH_IMPORT',
      JSON.stringify({ count: items.length, ids: results.map((r) => r.id) }),
      createdBy
    );

    return NextResponse.json<ApiResponse<{ imported: number; ids: string[] }>>(
      { success: true, data: { imported: results.length, ids: results.map((r) => r.id) } },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/transaksi/import error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengimport transaksi.' },
      { status: 500 }
    );
  }
}
