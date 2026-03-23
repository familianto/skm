import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { donaturUpdateSchema } from '@/lib/validators';
import { AuditAksi, DonaturKelompok } from '@/types';
import type { ApiResponse, Donatur } from '@/types';
import { nowISO } from '@/lib/utils';

type RouteParams = { params: Promise<{ id: string }> };

function rowToDonatur(row: string[]): Donatur {
  const headers = SHEET_HEADERS[SHEET_NAMES.DONATUR];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    kelompok: obj.kelompok as DonaturKelompok,
    jumlah_komitmen: parseInt(obj.jumlah_komitmen, 10) || 0,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Donatur;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const result = await sheetsService.getRowById(SHEET_NAMES.DONATUR, id);

    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Donatur tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<Donatur>>(
      { success: true, data: rowToDonatur(result.row) }
    );
  } catch (error) {
    console.error('GET /api/donatur/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data donatur.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = donaturUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await sheetsService.getRowById(SHEET_NAMES.DONATUR, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Donatur tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToDonatur(result.row);
    const updates = parsed.data;
    const now = nowISO();

    const updated: string[] = [
      id,
      updates.nama ?? existing.nama,
      updates.telepon ?? existing.telepon,
      updates.alamat ?? existing.alamat,
      updates.kelompok ?? existing.kelompok,
      String(updates.jumlah_komitmen ?? existing.jumlah_komitmen),
      updates.catatan ?? existing.catatan,
      String(updates.is_active ?? existing.is_active).toUpperCase(),
      existing.created_at,
      now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.DONATUR, result.rowIndex, updated);
    await logAudit(AuditAksi.UPDATE, SHEET_NAMES.DONATUR, id, JSON.stringify(updates), 'Bendahara');

    return NextResponse.json<ApiResponse<Donatur>>(
      { success: true, data: rowToDonatur(updated) }
    );
  } catch (error) {
    console.error('PUT /api/donatur/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengupdate donatur.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await sheetsService.getRowById(SHEET_NAMES.DONATUR, id);
    if (!result) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Donatur tidak ditemukan.' },
        { status: 404 }
      );
    }

    const existing = rowToDonatur(result.row);
    const now = nowISO();

    const updated: string[] = [
      id, existing.nama, existing.telepon, existing.alamat, existing.kelompok,
      String(existing.jumlah_komitmen), existing.catatan, 'FALSE', existing.created_at, now,
    ];

    await sheetsService.updateRow(SHEET_NAMES.DONATUR, result.rowIndex, updated);
    void logAudit(AuditAksi.DELETE, SHEET_NAMES.DONATUR, id, `Soft delete: ${existing.nama}`, 'Bendahara');

    return NextResponse.json<ApiResponse<null>>({ success: true });
  } catch (error) {
    console.error('DELETE /api/donatur/[id] error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal menghapus donatur.' },
      { status: 500 }
    );
  }
}
