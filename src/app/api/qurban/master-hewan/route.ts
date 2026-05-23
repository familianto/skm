import { NextRequest } from 'next/server';

import { success, error, type ApiSuccess } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole, requireSession } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import {
  appendMasterHewan,
  findMasterHewanByJenisKelas,
  listMasterHewanByEdisi,
  type QurbanMasterHewan,
} from '@/lib/qurban/master-hewan-repo';
import { generateMasterHewanId } from '@/lib/qurban/id-generator';
import { validateMasterHewanCreate } from '@/lib/qurban/validators';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

const STATUS_FILTER = new Set(['active', 'inactive', 'all']);

/**
 * MH1 — GET /api/qurban/master-hewan?edisi_id=EDS-...&status=active
 *
 * List master_hewan types for one edisi (per-edisi). Mirrors the F02 K1/P1
 * `edisi_id` query-param resolution + panitia role lock. Sorted jenis asc,
 * then kelas asc.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();
    if (!edisiId) {
      return error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Query param `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      );
    }

    const statusParam = (url.searchParams.get('status') || 'active').toLowerCase();
    if (!STATUS_FILTER.has(statusParam)) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'status harus salah satu dari: active, inactive, all.',
        400,
        { field: 'status' }
      );
    }

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    if (isPanitiaRole(guard.session.peran) && edisi.status !== EDISI_STATUS.AKTIF) {
      return error(
        ErrorCodes.FORBIDDEN_EDISI,
        'Anda hanya dapat mengakses master hewan edisi yang berstatus AKTIF.',
        403,
        { edisi_status: edisi.status }
      );
    }

    let items = await listMasterHewanByEdisi(edisiId);
    if (statusParam === 'active') items = items.filter((m) => m.is_active);
    else if (statusParam === 'inactive') items = items.filter((m) => !m.is_active);

    items = [...items].sort((a, b) => {
      if (a.jenis !== b.jenis) return a.jenis < b.jenis ? -1 : 1;
      return a.kelas < b.kelas ? -1 : a.kelas > b.kelas ? 1 : 0;
    });

    const meta = {
      edisi_id: edisiId,
      count: items.length,
    } as unknown as ApiSuccess<typeof items>['meta'];
    return success(items, meta);
  } catch (err) {
    console.error('[GET /api/qurban/master-hewan] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat master hewan: ${err.message}`
        : 'Gagal memuat master hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}

/**
 * MH2 — POST /api/qurban/master-hewan?edisi_id=EDS-...
 *
 * Create a master_hewan type. Allowed when edisi is DRAFT or AKTIF; SELESAI →
 * BUSINESS_EDISI_LOCKED. Natural key `(edisi_id, jenis, kelas)` must be unique.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();
    if (!edisiId) {
      return error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Query param `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      );
    }

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }
    if (edisi.status === EDISI_STATUS.SELESAI) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Master hewan tidak dapat diubah.',
        422,
        { edisi_status: edisi.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validateMasterHewanCreate(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        first.message,
        422,
        { field: first.field, errors: parsed.errors }
      );
    }
    const input = parsed.value;

    const dup = await findMasterHewanByJenisKelas(edisiId, input.jenis, input.kelas);
    if (dup) {
      return error(
        ErrorCodes.DUPLICATE_MASTER_HEWAN,
        `Tipe ${input.jenis} kelas ${input.kelas} sudah ada di edisi ini.`,
        422,
        { existing_id: dup.id, jenis: input.jenis, kelas: input.kelas }
      );
    }

    const now = new Date().toISOString();
    const id = await generateMasterHewanId();
    const record: QurbanMasterHewan = {
      id,
      edisi_id: edisiId,
      jenis: input.jenis as QurbanMasterHewan['jenis'],
      kelas: input.kelas as QurbanMasterHewan['kelas'],
      kapasitas_slot: input.kapasitas_slot,
      harga_beli: input.harga_beli,
      harga_bawa_sendiri: input.harga_bawa_sendiri,
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: guard.session.user_id,
    };

    await appendMasterHewan(record);

    await writeAuditLog({
      aksi: AuditAksi.CREATE,
      entitas: 'master_hewan',
      entitas_id: id,
      event_type: 'master_hewan.created',
      after: record,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(record, undefined, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/master-hewan] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal membuat master hewan: ${err.message}`
        : 'Gagal membuat master hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
