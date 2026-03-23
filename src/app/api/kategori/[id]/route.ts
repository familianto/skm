import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { kategoriUpdateSchema } from '@/lib/validators';
import { AuditAksi } from '@/types';
import type { ApiResponse, Kategori } from '@/types';
type RouteParams = { params: Promise<{ id: string }> };

function rowToKategori(row: string[]): Kategori {
  const headers = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return { ...obj, is_active: obj.is_active === 'TRUE' } as unknown as Kategori;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = kategoriUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await sheetsService.getRowById(SHEET_NAMES.KATEGORI, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Kategori tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToKategori(result.row);
    const updates = parsed.data;

    const updated: string[] = [
      id,
      updates.nama ?? existing.nama,
      updates.jenis ?? existing.jenis,
      updates.deskripsi ?? existing.deskripsi,
      String(updates.is_active ?? existing.is_active).toUpperCase(),
      existing.created_at,
    ];

    await sheetsService.updateRow(SHEET_NAMES.KATEGORI, result.rowIndex, updated);

    await logAudit(AuditAksi.UPDATE, SHEET_NAMES.KATEGORI, id, JSON.stringify(updates), 'Bendahara');

    return NextResponse.json<ApiResponse<Kategori>>(
      { success: true, data: rowToKategori(updated) }
    );
  } catch (error) {
    console.error('PUT /api/kategori/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate kategori.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await sheetsService.getRowById(SHEET_NAMES.KATEGORI, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Kategori tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToKategori(result.row);

    // Soft delete: set is_active to FALSE
    const updated: string[] = [
      id,
      existing.nama,
      existing.jenis,
      existing.deskripsi,
      'FALSE',
      existing.created_at,
    ];

    await sheetsService.updateRow(SHEET_NAMES.KATEGORI, result.rowIndex, updated);

    void logAudit(AuditAksi.DELETE, SHEET_NAMES.KATEGORI, id, `Soft delete: ${existing.nama}`, 'Bendahara');

    return NextResponse.json<ApiResponse<null>>({ success: true });
  } catch (error) {
    console.error('DELETE /api/kategori/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal menghapus kategori.' },
      { status: 500 }
    );
  }
}
