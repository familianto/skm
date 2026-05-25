import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole, requireSession } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForHewan } from '@/lib/qurban/daftar-hewan-context';
import {
  getDaftarHewanRecordById,
  updateDaftarHewanAt,
  namaDisplay,
} from '@/lib/qurban/daftar-hewan-repo';
import { isTerminalHewanStatus } from '@/lib/qurban/hewan-state-machine';
import { validateDaftarHewanPatch } from '@/lib/qurban/validators';
import {
  getOccupancyByHewan,
  slotTerisi,
  occupantsOf,
} from '@/lib/qurban/peserta-occupancy';
import { auditHewanUpdated } from '@/lib/qurban/daftar-hewan-audit';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * H3 — GET /api/qurban/hewan/[id]?edisi_id=EDS-...
 *
 * Detail satu hewan + ringkasan slot (kapasitas_slot, slot_terisi, occupants).
 * Selama qurban_peserta belum ada: slot_terisi=0, occupants=[].
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const gate = await resolveEdisiForHewan(request, guard.session.peran, {
      requireWritable: false,
    });
    if (!gate.ok) return gate.response;

    const rec = await getDaftarHewanRecordById(id);
    if (!rec || rec.hewan.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Hewan tidak ditemukan.', 404);
    }

    const occ = await getOccupancyByHewan(gate.edisi.id);
    const data = {
      ...rec.hewan,
      nama_display: namaDisplay(rec.hewan.jenis, rec.hewan.kelas, rec.hewan.nomor_urut),
      slot_terisi: slotTerisi(occ, rec.hewan.id),
      occupants: occupantsOf(occ, rec.hewan.id),
    };
    return success(data);
  } catch (err) {
    console.error('[GET /api/qurban/hewan/[id]] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat detail hewan.', 500);
  }
}

/**
 * H4 — PATCH /api/qurban/hewan/[id]?edisi_id=EDS-...
 *
 * Update field non-penomoran saja: vendor_nama, harga_beli_aktual,
 * tanggal_pembelian, notes. Status terminal ditolak; edisi SELESAI ditolak.
 * Idempoten: tanpa perubahan → no-op tanpa audit.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const gate = await resolveEdisiForHewan(request, guard.session.peran, {
      requireWritable: true,
    });
    if (!gate.ok) return gate.response;

    const rec = await getDaftarHewanRecordById(id);
    if (!rec || rec.hewan.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Hewan tidak ditemukan.', 404);
    }
    const current = rec.hewan;

    if (isTerminalHewanStatus(current.status)) {
      return error(
        ErrorCodes.BUSINESS_HEWAN_TERMINAL,
        `Hewan berstatus ${current.status} tidak dapat diubah.`,
        422,
        { status: current.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validateDaftarHewanPatch(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, {
        field: first.field,
        errors: parsed.errors,
      });
    }
    const patch = parsed.value;

    // BAWA_SENDIRI harus tetap harga 0.
    if (
      patch.harga_beli_aktual !== undefined &&
      current.tipe_pembelian === 'BAWA_SENDIRI' &&
      patch.harga_beli_aktual !== 0
    ) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'harga_beli_aktual harus 0 untuk hewan BAWA_SENDIRI.',
        422,
        { field: 'harga_beli_aktual' }
      );
    }

    const merged: QurbanDaftarHewan = {
      ...current,
      vendor_nama: patch.vendor_nama ?? current.vendor_nama,
      harga_beli_aktual: patch.harga_beli_aktual ?? current.harga_beli_aktual,
      tanggal_pembelian: patch.tanggal_pembelian ?? current.tanggal_pembelian,
      notes: patch.notes ?? current.notes,
    };

    const changedFields = (['vendor_nama', 'harga_beli_aktual', 'tanggal_pembelian', 'notes'] as const).filter(
      (f) => merged[f] !== current[f]
    );
    if (changedFields.length === 0) {
      return success(current); // idempotent no-op
    }

    merged.updated_at = new Date().toISOString();
    await updateDaftarHewanAt(rec.rowIndex, merged);

    const before: Partial<QurbanDaftarHewan> = {};
    const after: Partial<QurbanDaftarHewan> = {};
    for (const f of changedFields) {
      (before as Record<string, unknown>)[f] = current[f];
      (after as Record<string, unknown>)[f] = merged[f];
    }
    await auditHewanUpdated(id, before, after, { user_id: guard.session.user_id, ip_address: ip });

    return success(merged);
  } catch (err) {
    console.error('[PATCH /api/qurban/hewan/[id]] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memperbarui hewan.', 500);
  }
}
