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
  createEdisi,
  isTahunHijriahTaken,
  listEdisi,
  sortEdisiByTahunDesc,
  type Edisi,
} from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS, isValidEdisiStatus } from '@/lib/qurban/edisi-state-machine';
import { generateEdisiId, generateKonfigurasiId, generatePanitiaId } from '@/lib/qurban/id-generator';
import {
  findKonfigurasiByEdisiId,
  createKonfigurasi,
  type Konfigurasi,
} from '@/lib/qurban/konfigurasi-repo';
import {
  listActivePanitiaByEdisi,
  createPanitia,
  type Panitia,
} from '@/lib/qurban/panitia-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];
const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * E1 — GET /api/qurban/edisi
 *
 * List edisi. Optional `?status=DRAFT|AKTIF|SELESAI`. Sorted by tahun_masehi
 * desc. PENDAFTARAN / DISTRIBUSI are auto-filtered to status=AKTIF.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const statusParam = (url.searchParams.get('status') || '').trim().toUpperCase();

    let items = sortEdisiByTahunDesc(await listEdisi());

    if (statusParam) {
      if (!isValidEdisiStatus(statusParam)) {
        return error(
          ErrorCodes.VALIDATION_FORMAT,
          'Filter status tidak valid.',
          400,
          { field: 'status' }
        );
      }
      items = items.filter((e) => e.status === statusParam);
    }

    const peran = guard.session.peran;
    if (peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI) {
      items = items.filter((e) => e.status === EDISI_STATUS.AKTIF);
    }

    const filters_applied: Record<string, unknown> = {};
    if (statusParam) filters_applied.status = statusParam;

    return success(items, {
      total: items.length,
      page: 1,
      page_size: items.length,
      has_more: false,
      filters_applied,
    });
  } catch (err) {
    console.error('[GET /api/qurban/edisi] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat daftar edisi.', 500);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD');

const createSchema = z
  .object({
    tahun_hijriah: z.string().min(1, 'Tahun hijriah wajib diisi').max(20),
    tahun_masehi: z.number().int().min(1900).max(3000),
    tanggal_idul_adha: dateField,
    tanggal_pendaftaran_buka: dateField,
    tanggal_pendaftaran_tutup: dateField,
    clone_from: z.string().optional(),
    clone_options: z
      .object({
        konfigurasi: z.boolean().optional(),
        panitia: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (v) => v.tanggal_pendaftaran_buka <= v.tanggal_pendaftaran_tutup,
    {
      message: 'Tanggal pendaftaran tutup harus ≥ tanggal pendaftaran buka.',
      path: ['tanggal_pendaftaran_tutup'],
    }
  );

/**
 * E2 — POST /api/qurban/edisi
 *
 * Body: { tahun_hijriah, tahun_masehi, tanggal_idul_adha,
 *         tanggal_pendaftaran_buka, tanggal_pendaftaran_tutup,
 *         clone_from?, clone_options?: { konfigurasi?, panitia? } }
 *
 * Defaults when `clone_from` is set: konfigurasi=true, panitia=false.
 * master_hewan cloning is intentionally NOT offered (F3 scope).
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.') }
      );
    }
    const data = parsed.data;

    if (await isTahunHijriahTaken(data.tahun_hijriah)) {
      return error(
        ErrorCodes.DUPLICATE_TAHUN_HIJRIAH,
        'Tahun hijriah sudah dipakai edisi lain.',
        409,
        { field: 'tahun_hijriah' }
      );
    }

    const now = new Date().toISOString();
    const id = await generateEdisiId();

    const newEdisi: Edisi = {
      id,
      tahun_hijriah: data.tahun_hijriah,
      tahun_masehi: data.tahun_masehi,
      tanggal_idul_adha: data.tanggal_idul_adha,
      tanggal_pendaftaran_buka: data.tanggal_pendaftaran_buka,
      tanggal_pendaftaran_tutup: data.tanggal_pendaftaran_tutup,
      status: EDISI_STATUS.DRAFT,
      parent_edisi_id: data.clone_from || '',
      cloned_at: data.clone_from ? now : '',
      created_at: now,
      updated_at: now,
      created_by: guard.session.user_id,
    };

    await createEdisi(newEdisi);

    // Clone side effects — best-effort. Each block guarded so a failure on
    // one branch doesn't roll back the edisi insert (which we cannot easily
    // undo on Google Sheets anyway). Errors surface via console; the user
    // sees a successful create and a stale clone they can re-trigger from
    // the konfigurasi / panitia pages once those endpoints ship.
    const cloneKonfigurasi = data.clone_from
      ? data.clone_options?.konfigurasi !== false
      : false;
    const clonePanitia = data.clone_from
      ? data.clone_options?.panitia === true
      : false;

    if (data.clone_from && cloneKonfigurasi) {
      try {
        const src = await findKonfigurasiByEdisiId(data.clone_from);
        if (src) {
          const kfgId = await generateKonfigurasiId();
          const newKfg: Konfigurasi = {
            ...src,
            id: kfgId,
            edisi_id: id,
            created_at: now,
            updated_at: now,
            created_by: guard.session.user_id,
          };
          await createKonfigurasi(newKfg);
        }
      } catch (err) {
        console.error('[POST /api/qurban/edisi] clone konfigurasi failed:', err);
      }
    }

    if (data.clone_from && clonePanitia) {
      try {
        const src = await listActivePanitiaByEdisi(data.clone_from);
        for (const p of src) {
          const pntId = await generatePanitiaId();
          const newPnt: Panitia = {
            id: pntId,
            edisi_id: id,
            anggota_id: p.anggota_id,
            is_active: true,
            assigned_at: now,
            assigned_by: guard.session.user_id,
            notes: p.notes,
          };
          await createPanitia(newPnt);
        }
      } catch (err) {
        console.error('[POST /api/qurban/edisi] clone panitia failed:', err);
      }
    }

    await writeAuditLog({
      aksi: AuditAksi.CREATE,
      entitas: 'edisi',
      entitas_id: id,
      event_type: 'edisi.created',
      after: newEdisi,
      notes: data.clone_from
        ? `clone from ${data.clone_from} (konfigurasi=${cloneKonfigurasi}, panitia=${clonePanitia})`
        : undefined,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(newEdisi, undefined, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/edisi] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal membuat edisi.', 500);
  }
}
