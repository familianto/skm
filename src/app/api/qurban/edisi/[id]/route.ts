import { NextRequest } from 'next/server';
import { z } from 'zod';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import {
  findEdisiRecordById,
  isTahunHijriahTaken,
  updateEdisiAt,
  type Edisi,
} from '@/lib/qurban/edisi-repo';
import {
  EDISI_STATUS,
  getEditableFields,
} from '@/lib/qurban/edisi-state-machine';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];
const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * E3 — GET /api/qurban/edisi/[id]
 *
 * PENDAFTARAN / DISTRIBUSI may only view AKTIF edisi → 403 FORBIDDEN_EDISI
 * on non-AKTIF.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const rec = await findEdisiRecordById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    const peran = guard.session.peran;
    if (
      (peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI) &&
      rec.edisi.status !== EDISI_STATUS.AKTIF
    ) {
      return error(
        ErrorCodes.FORBIDDEN_EDISI,
        'Anda hanya dapat mengakses edisi yang berstatus AKTIF.',
        403,
        { edisi_status: rec.edisi.status }
      );
    }

    return success(rec.edisi);
  } catch (err) {
    console.error('[GET /api/qurban/edisi/[id]] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat detail edisi: ${err.message}`
        : 'Gagal memuat detail edisi.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD');

const updateSchema = z
  .object({
    tahun_hijriah: z.string().min(1).max(20).optional(),
    tahun_masehi: z.number().int().min(1900).max(3000).optional(),
    tanggal_idul_adha: dateField.optional(),
    tanggal_pendaftaran_buka: dateField.optional(),
    tanggal_pendaftaran_tutup: dateField.optional(),
  })
  .refine(
    (v) =>
      v.tahun_hijriah !== undefined ||
      v.tahun_masehi !== undefined ||
      v.tanggal_idul_adha !== undefined ||
      v.tanggal_pendaftaran_buka !== undefined ||
      v.tanggal_pendaftaran_tutup !== undefined,
    { message: 'Minimal satu field wajib diberikan untuk update.' }
  );

/**
 * E4 — PATCH /api/qurban/edisi/[id]
 *
 * Field-level lock per status:
 *   DRAFT   — all fields editable
 *   AKTIF   — only the 3 tanggal_* fields editable
 *   SELESAI — read-only
 *
 * Date order validated against the EFFECTIVE row (existing values overlaid
 * with patch values) so a patch that updates only one end of the range is
 * still rejected if the resulting buka > tutup.
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
    const rec = await findEdisiRecordById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.') }
      );
    }
    const patch = parsed.data;

    const editable = new Set(getEditableFields(rec.edisi.status));
    if (rec.edisi.status === EDISI_STATUS.SELESAI) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Tidak ada field yang dapat diubah.',
        422,
        { status: rec.edisi.status, editable_fields: [] }
      );
    }
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      if (patch[k] === undefined) continue;
      if (!editable.has(k)) {
        return error(
          ErrorCodes.BUSINESS_EDISI_LOCKED,
          `Field '${k}' tidak dapat diubah saat status edisi ${rec.edisi.status}.`,
          422,
          {
            field: k,
            status: rec.edisi.status,
            editable_fields: Array.from(editable),
          }
        );
      }
    }

    const merged: Edisi = {
      ...rec.edisi,
      tahun_hijriah: patch.tahun_hijriah ?? rec.edisi.tahun_hijriah,
      tahun_masehi: patch.tahun_masehi ?? rec.edisi.tahun_masehi,
      tanggal_idul_adha: patch.tanggal_idul_adha ?? rec.edisi.tanggal_idul_adha,
      tanggal_pendaftaran_buka:
        patch.tanggal_pendaftaran_buka ?? rec.edisi.tanggal_pendaftaran_buka,
      tanggal_pendaftaran_tutup:
        patch.tanggal_pendaftaran_tutup ?? rec.edisi.tanggal_pendaftaran_tutup,
      updated_at: new Date().toISOString(),
    };

    if (merged.tanggal_pendaftaran_buka > merged.tanggal_pendaftaran_tutup) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'Tanggal pendaftaran tutup harus ≥ tanggal pendaftaran buka.',
        400,
        { field: 'tanggal_pendaftaran_tutup' }
      );
    }

    if (
      patch.tahun_hijriah !== undefined &&
      patch.tahun_hijriah !== rec.edisi.tahun_hijriah &&
      (await isTahunHijriahTaken(patch.tahun_hijriah, id))
    ) {
      return error(
        ErrorCodes.DUPLICATE_TAHUN_HIJRIAH,
        'Tahun hijriah sudah dipakai edisi lain.',
        409,
        { field: 'tahun_hijriah' }
      );
    }

    // Build diff for audit (only changed fields).
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of [
      'tahun_hijriah',
      'tahun_masehi',
      'tanggal_idul_adha',
      'tanggal_pendaftaran_buka',
      'tanggal_pendaftaran_tutup',
    ] as const) {
      if (rec.edisi[k] !== merged[k]) {
        before[k] = rec.edisi[k];
        after[k] = merged[k];
      }
    }
    if (Object.keys(after).length === 0) {
      return success(rec.edisi);
    }

    await updateEdisiAt(rec.rowIndex, merged);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'edisi',
      entitas_id: id,
      event_type: 'edisi.updated',
      before,
      after,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(merged);
  } catch (err) {
    console.error('[PATCH /api/qurban/edisi/[id]] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memperbarui edisi: ${err.message}`
        : 'Gagal memperbarui edisi.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
