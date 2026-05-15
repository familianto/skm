import { NextRequest } from 'next/server';
import { z } from 'zod';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireSuperAdmin } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { normalizePhone, validatePhone } from '@/lib/api/phone';
import { VALID_PERAN, PERAN } from '@/lib/api/permissions';
import {
  findById,
  publicAnggota,
  isTeleponTakenByActive,
  countActiveSuperAdmins,
  updateAt,
  type AnggotaFull,
} from '@/lib/api/anggota-repo';
import { AuditAksi, UserPeran } from '@/types';

const peranSchema = z.enum(VALID_PERAN);

/**
 * U3 — GET /api/pengaturan/anggota/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const rec = await findById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Anggota tidak ditemukan.', 404);
    }
    return success(publicAnggota(rec.anggota));
  } catch (err) {
    console.error('[GET /api/pengaturan/anggota/[id]] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat detail anggota.', 500);
  }
}

/**
 * U4 — PATCH /api/pengaturan/anggota/[id]
 *
 * Body (all optional): { nama?, telepon?, email?, peran? }
 *
 * Business rules:
 *  - peran change away from SUPER_ADMIN: count active SA excluding this user;
 *    if zero → 422 BUSINESS_LAST_SUPER_ADMIN
 *  - telepon change: re-normalize + format check + uniqueness vs active rows
 *  - is_active is NOT togglable here — use U7/U8 explicitly
 *
 * Audit: anggota.updated with diff; additional anggota.peran_changed if peran changed.
 */
const updateSchema = z
  .object({
    nama: z.string().min(1).max(100).optional(),
    telepon: z.string().min(1).optional(),
    email: z.string().max(255).optional(),
    peran: peranSchema.optional(),
  })
  .refine(
    (v) =>
      v.nama !== undefined ||
      v.telepon !== undefined ||
      v.email !== undefined ||
      v.peran !== undefined,
    { message: 'Setidaknya satu field wajib diberikan untuk update.' }
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const { id } = await params;
    const rec = await findById(id);
    if (!rec) {
      return error(ErrorCodes.NOT_FOUND, 'Anggota tidak ditemukan.', 404);
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

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const updated: AnggotaFull = { ...rec.anggota };

    if (parsed.data.nama !== undefined && parsed.data.nama !== rec.anggota.nama) {
      before.nama = rec.anggota.nama;
      after.nama = parsed.data.nama;
      updated.nama = parsed.data.nama;
    }

    if (parsed.data.email !== undefined && parsed.data.email !== rec.anggota.email) {
      before.email = rec.anggota.email;
      after.email = parsed.data.email;
      updated.email = parsed.data.email;
    }

    if (parsed.data.telepon !== undefined) {
      const newTelepon = normalizePhone(parsed.data.telepon);
      if (!validatePhone(newTelepon)) {
        return error(
          ErrorCodes.VALIDATION_FORMAT,
          'Format telepon tidak valid.',
          400,
          { field: 'telepon' }
        );
      }
      if (newTelepon !== rec.anggota.telepon) {
        // Only check uniqueness against ACTIVE rows. Target's own row excluded.
        // If target is currently inactive but we're updating telepon, the check
        // still applies (because reactivation later would collide).
        if (await isTeleponTakenByActive(newTelepon, rec.anggota.id)) {
          return error(
            ErrorCodes.DUPLICATE_TELEPON,
            'Telepon sudah digunakan oleh anggota lain yang aktif.',
            409,
            { field: 'telepon' }
          );
        }
        before.telepon = rec.anggota.telepon;
        after.telepon = newTelepon;
        updated.telepon = newTelepon;
      }
    }

    let peranChanged = false;
    if (parsed.data.peran !== undefined && parsed.data.peran !== rec.anggota.peran) {
      // Last SUPER_ADMIN protection: changing the only active SA away from SA
      // would leave the system with no SUPER_ADMIN. Block.
      if (
        rec.anggota.peran === PERAN.SUPER_ADMIN &&
        parsed.data.peran !== PERAN.SUPER_ADMIN &&
        rec.anggota.is_active
      ) {
        const remaining = await countActiveSuperAdmins(rec.anggota.id);
        if (remaining === 0) {
          return error(
            ErrorCodes.BUSINESS_LAST_SUPER_ADMIN,
            'Tidak dapat mengubah peran SUPER_ADMIN terakhir. Tambah SUPER_ADMIN lain terlebih dahulu.',
            422,
            { field: 'peran', constraint: 'at_least_one_active_super_admin' }
          );
        }
      }
      before.peran = rec.anggota.peran;
      after.peran = parsed.data.peran;
      updated.peran = parsed.data.peran as UserPeran;
      peranChanged = true;
    }

    // Nothing actually changed → 200 with original (idempotent)
    if (Object.keys(after).length === 0) {
      return success(publicAnggota(rec.anggota));
    }

    const now = new Date().toISOString();
    updated.updated_at = now;
    await updateAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'anggota',
      entitas_id: rec.anggota.id,
      event_type: 'anggota.updated',
      before,
      after,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    if (peranChanged) {
      await writeAuditLog({
        aksi: AuditAksi.UPDATE,
        entitas: 'anggota',
        entitas_id: rec.anggota.id,
        event_type: 'anggota.peran_changed',
        before: { peran: before.peran },
        after: { peran: after.peran },
        user_id: guard.session.user_id,
        ip_address: ip,
      });
    }

    return success(publicAnggota(updated));
  } catch (err) {
    console.error('[PATCH /api/pengaturan/anggota/[id]] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memperbarui anggota.', 500);
  }
}
