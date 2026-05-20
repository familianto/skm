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
  listEdisi,
  updateEdisiAt,
  type Edisi,
} from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import { hasKonfigurasi } from '@/lib/qurban/konfigurasi-repo';
import { countActivePanitiaByEdisi } from '@/lib/qurban/panitia-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

const bodySchema = z
  .object({
    force_close_existing_aktif: z.boolean().optional(),
  })
  .optional()
  .transform((v) => v ?? {});

/**
 * E5 — POST /api/qurban/edisi/[id]/activate
 *
 * Transition DRAFT → AKTIF. Pre-flight (F02 scope):
 *   1. status == DRAFT (else BUSINESS_INVALID_STATE_TRANSITION 422)
 *   2. konfigurasi row exists for this edisi (BUSINESS_PREFLIGHT_FAILED 422)
 *   3. ≥1 active panitia for this edisi (BUSINESS_PREFLIGHT_FAILED 422)
 *   4. no other edisi in AKTIF (else 422 unless force_close_existing_aktif)
 *
 * If `force_close_existing_aktif=true` and another AKTIF edisi exists, it is
 * closed first (status → SELESAI, audit edisi.closed with "auto-closed" notes).
 */
export async function POST(
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
    const parsed = bodySchema.safeParse(body);
    const force = parsed.success ? parsed.data.force_close_existing_aktif === true : false;

    // 1. State precondition.
    if (rec.edisi.status !== EDISI_STATUS.DRAFT) {
      return error(
        ErrorCodes.BUSINESS_INVALID_STATE_TRANSITION,
        `Hanya edisi berstatus DRAFT yang dapat diaktifkan (status saat ini: ${rec.edisi.status}).`,
        422,
        { from: rec.edisi.status, to: EDISI_STATUS.AKTIF }
      );
    }

    // 2. Konfigurasi exists.
    if (!(await hasKonfigurasi(id))) {
      return error(
        ErrorCodes.BUSINESS_PREFLIGHT_FAILED,
        'Konfigurasi edisi belum diisi.',
        422,
        { check: 'konfigurasi' }
      );
    }

    // 3. ≥1 active panitia.
    if ((await countActivePanitiaByEdisi(id)) < 1) {
      return error(
        ErrorCodes.BUSINESS_PREFLIGHT_FAILED,
        'Minimal 1 panitia aktif diperlukan sebelum aktivasi.',
        422,
        { check: 'panitia_active' }
      );
    }

    // TODO(F3): pre-flight — wajib ≥1 master_hewan aktif untuk edisi ini
    // TODO(F4): pre-flight — wajib ≥1 hewan berstatus AKTIF untuk edisi ini

    // 4. Single-AKTIF rule.
    const all = await listEdisi();
    const otherAktif = all.find(
      (e) => e.id !== id && e.status === EDISI_STATUS.AKTIF
    );

    const now = new Date().toISOString();

    if (otherAktif) {
      if (!force) {
        return error(
          ErrorCodes.BUSINESS_PREFLIGHT_FAILED,
          `Sudah ada edisi AKTIF lain (${otherAktif.tahun_hijriah}). Tutup terlebih dahulu atau aktifkan dengan force.`,
          422,
          {
            check: 'single_aktif',
            existing_aktif: { id: otherAktif.id, tahun_hijriah: otherAktif.tahun_hijriah },
          }
        );
      }

      // Auto-close the existing AKTIF edisi.
      const otherRec = await findEdisiRecordById(otherAktif.id);
      if (otherRec) {
        const closed: Edisi = {
          ...otherRec.edisi,
          status: EDISI_STATUS.SELESAI,
          updated_at: now,
        };
        await updateEdisiAt(otherRec.rowIndex, closed);
        await writeAuditLog({
          aksi: AuditAksi.UPDATE,
          entitas: 'edisi',
          entitas_id: otherRec.edisi.id,
          event_type: 'edisi.closed',
          before: { status: otherRec.edisi.status },
          after: { status: EDISI_STATUS.SELESAI },
          notes: `auto-closed by activation of ${id}`,
          user_id: guard.session.user_id,
          ip_address: ip,
        });
      }
    }

    const activated: Edisi = {
      ...rec.edisi,
      status: EDISI_STATUS.AKTIF,
      updated_at: now,
    };
    await updateEdisiAt(rec.rowIndex, activated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'edisi',
      entitas_id: id,
      event_type: 'edisi.activated',
      before: { status: EDISI_STATUS.DRAFT },
      after: { status: EDISI_STATUS.AKTIF },
      notes: force ? 'DRAFT → AKTIF (force_close_existing_aktif)' : 'DRAFT → AKTIF',
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(activated);
  } catch (err) {
    console.error('[POST /api/qurban/edisi/[id]/activate] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal mengaktifkan edisi.', 500);
  }
}
