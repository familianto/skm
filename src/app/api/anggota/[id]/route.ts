import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { anggotaUpdateSchema } from '@/lib/validators';
import { AuditAksi, UserPeran } from '@/types';
import type { ApiResponse, Anggota } from '@/types';

type RouteParams = { params: Promise<{ id: string }> };

function rowToAnggota(row: string[]): Anggota {
  const headers = SHEET_HEADERS[SHEET_NAMES.ANGGOTA];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    peran: obj.peran as UserPeran,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Anggota;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = anggotaUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await sheetsService.getRowById(SHEET_NAMES.ANGGOTA, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Anggota tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToAnggota(result.row);
    const updates = parsed.data;

    const updated: string[] = [
      id,
      updates.nama ?? existing.nama,
      updates.telepon ?? existing.telepon,
      updates.email ?? existing.email,
      updates.peran ?? existing.peran,
      String(updates.is_active ?? existing.is_active).toUpperCase(),
      existing.created_at,
    ];

    await sheetsService.updateRow(SHEET_NAMES.ANGGOTA, result.rowIndex, updated);

    await logAudit(AuditAksi.UPDATE, SHEET_NAMES.ANGGOTA, id, JSON.stringify(updates), 'Bendahara');

    return NextResponse.json<ApiResponse<Anggota>>(
      { success: true, data: rowToAnggota(updated) }
    );
  } catch (error) {
    console.error('PUT /api/anggota/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate anggota.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await sheetsService.getRowById(SHEET_NAMES.ANGGOTA, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Anggota tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToAnggota(result.row);

    const updated: string[] = [
      id,
      existing.nama,
      existing.telepon,
      existing.email,
      existing.peran,
      'FALSE',
      existing.created_at,
    ];

    await sheetsService.updateRow(SHEET_NAMES.ANGGOTA, result.rowIndex, updated);

    void logAudit(AuditAksi.DELETE, SHEET_NAMES.ANGGOTA, id, `Soft delete: ${existing.nama}`, 'Bendahara');

    return NextResponse.json<ApiResponse<null>>({ success: true });
  } catch (error) {
    console.error('DELETE /api/anggota/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal menghapus anggota.' },
      { status: 500 }
    );
  }
}
