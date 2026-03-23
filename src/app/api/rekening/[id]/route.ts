import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { rekeningUpdateSchema } from '@/lib/validators';
import { AuditAksi } from '@/types';
import type { ApiResponse, RekeningBank } from '@/types';
import { nowISO } from '@/lib/utils';

type RouteParams = { params: Promise<{ id: string }> };

function rowToRekening(row: string[]): RekeningBank {
  const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    saldo_awal: parseInt(obj.saldo_awal, 10) || 0,
    is_active: obj.is_active === 'TRUE',
  } as unknown as RekeningBank;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = rekeningUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await sheetsService.getRowById(SHEET_NAMES.REKENING_BANK, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Rekening tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToRekening(result.row);
    const updates = parsed.data;
    const now = nowISO();

    const updated: string[] = [
      id,
      updates.nama_bank ?? existing.nama_bank,
      updates.nomor_rekening ?? existing.nomor_rekening,
      updates.atas_nama ?? existing.atas_nama,
      String(updates.saldo_awal ?? existing.saldo_awal),
      String(updates.is_active ?? existing.is_active).toUpperCase(),
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.REKENING_BANK, result.rowIndex, updated);

    await logAudit(AuditAksi.UPDATE, SHEET_NAMES.REKENING_BANK, id, JSON.stringify(updates), 'Bendahara');

    return NextResponse.json<ApiResponse<RekeningBank>>(
      { success: true, data: rowToRekening(updated) }
    );
  } catch (error) {
    console.error('PUT /api/rekening/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate rekening.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await sheetsService.getRowById(SHEET_NAMES.REKENING_BANK, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Rekening tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToRekening(result.row);
    const now = nowISO();

    const updated: string[] = [
      id,
      existing.nama_bank,
      existing.nomor_rekening,
      existing.atas_nama,
      String(existing.saldo_awal),
      'FALSE',
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.REKENING_BANK, result.rowIndex, updated);

    void logAudit(AuditAksi.DELETE, SHEET_NAMES.REKENING_BANK, id, `Soft delete: ${existing.nama_bank}`, 'Bendahara');

    return NextResponse.json<ApiResponse<null>>({ success: true });
  } catch (error) {
    console.error('DELETE /api/rekening/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal menghapus rekening.' },
      { status: 500 }
    );
  }
}
