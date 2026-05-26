import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPesertaById, getPesertaRecordById, updatePesertaAt, STATUS_BATAL } from '@/lib/qurban/peserta-repo';
import { validatePesertaPatch } from '@/lib/qurban/peserta-validators';
import { auditPesertaUpdated } from '@/lib/qurban/peserta-audit';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

const READ_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];
const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/** PS3 — GET /api/qurban/peserta/[id]?edisi_id=EDS-... — detail satu peserta. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;

    const peserta = await getPesertaById(id);
    if (!peserta || peserta.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Peserta tidak ditemukan.', 404);
    }
    return success(peserta);
  } catch (err) {
    console.error('[GET /api/qurban/peserta/[id]] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat detail peserta.', 500);
  }
}

/**
 * PS4 — PATCH /api/qurban/peserta/[id]?edisi_id=EDS-...
 *
 * Update field non-slot saja: nama_atas_nama, keterangan_bagian, notes.
 * hewan_id/slot_number (Pemetaan F5b), status_pendaftaran (PS5),
 * harga_disepakati (PS7), kode_bayar (immutable) ditolak oleh validator.
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
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    const rec = await getPesertaRecordById(id);
    if (!rec || rec.peserta.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Peserta tidak ditemukan.', 404);
    }
    const current = rec.peserta;

    // Peserta BATAL = catatan historis, tidak boleh diubah (mirror H4 terminal
    // → 422 BUSINESS_*). PS5 yang menangani perubahan status.
    if (current.status_pendaftaran === STATUS_BATAL) {
      return error(
        ErrorCodes.BUSINESS_PESERTA_NOT_TERDAFTAR,
        'Peserta berstatus BATAL tidak dapat diubah.',
        422,
        { status_pendaftaran: current.status_pendaftaran }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validatePesertaPatch(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const patch = parsed.value;

    const merged: QurbanPeserta = {
      ...current,
      nama_atas_nama: patch.nama_atas_nama ?? current.nama_atas_nama,
      keterangan_bagian: patch.keterangan_bagian ?? current.keterangan_bagian,
      notes: patch.notes ?? current.notes,
    };

    const changedFields = (['nama_atas_nama', 'keterangan_bagian', 'notes'] as const).filter(
      (f) => merged[f] !== current[f]
    );
    if (changedFields.length === 0) {
      return success(current); // idempotent no-op
    }

    merged.updated_at = new Date().toISOString();
    await updatePesertaAt(rec.rowIndex, merged);

    const before: Partial<QurbanPeserta> = {};
    const after: Partial<QurbanPeserta> = {};
    for (const f of changedFields) {
      (before as Record<string, unknown>)[f] = current[f];
      (after as Record<string, unknown>)[f] = merged[f];
    }
    await auditPesertaUpdated(id, before, after, { user_id: guard.session.user_id, ip_address: ip });

    return success(merged);
  } catch (err) {
    console.error('[PATCH /api/qurban/peserta/[id]] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memperbarui peserta.', 500);
  }
}
