import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import {
  appendMuqorib,
  listAllMuqorib,
  type QurbanMuqorib,
} from '@/lib/qurban/muqorib-repo';
import { generateMuqoribId } from '@/lib/qurban/id-generator';
import { validateMuqoribCreate } from '@/lib/qurban/validators';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
];
const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

const SORT_WHITELIST = new Set([
  'nama_lengkap:asc',
  'nama_lengkap:desc',
  'created_at:asc',
  'created_at:desc',
]);

const STATUS_FILTER = new Set(['active', 'inactive', 'all']);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * M1 — GET /api/qurban/muqorib
 *
 * List muqorib LINTAS-EDISI (no edisi-context). Query:
 *   page, page_size (≤200), search, status (active|inactive|all), sort.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const requestedPageSize = parseInt(
      url.searchParams.get('page_size') || String(DEFAULT_PAGE_SIZE),
      10
    );
    if (!Number.isFinite(requestedPageSize) || requestedPageSize < 1) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'page_size harus bilangan positif.',
        400,
        { field: 'page_size' }
      );
    }
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

    const statusParam = (url.searchParams.get('status') || 'active').toLowerCase();
    if (!STATUS_FILTER.has(statusParam)) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'status harus salah satu dari: active, inactive, all.',
        400,
        { field: 'status' }
      );
    }

    const sortParam = url.searchParams.get('sort') || 'nama_lengkap:asc';
    if (!SORT_WHITELIST.has(sortParam)) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'sort tidak valid.',
        400,
        { field: 'sort', allowed: Array.from(SORT_WHITELIST) }
      );
    }

    const search = (url.searchParams.get('search') || '').trim().toLowerCase();

    let items = await listAllMuqorib();

    if (statusParam === 'active') items = items.filter((m) => m.is_active);
    else if (statusParam === 'inactive') items = items.filter((m) => !m.is_active);

    if (search) {
      items = items.filter(
        (m) =>
          m.nama_lengkap.toLowerCase().includes(search) ||
          m.no_hp.toLowerCase().includes(search) ||
          m.alamat.toLowerCase().includes(search)
      );
    }

    const [sortField, sortDir] = sortParam.split(':') as [
      'nama_lengkap' | 'created_at',
      'asc' | 'desc'
    ];
    items = [...items].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'desc' ? -cmp : cmp;
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    const has_more = start + slice.length < total;

    const filters_applied: Record<string, unknown> = {
      status: statusParam,
      sort: sortParam,
    };
    if (search) filters_applied.search = search;

    return success(slice, {
      total,
      page,
      page_size: pageSize,
      has_more,
      filters_applied,
    });
  } catch (err) {
    console.error('[GET /api/qurban/muqorib] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat daftar muqorib: ${err.message}`
        : 'Gagal memuat daftar muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}

/**
 * M2 — POST /api/qurban/muqorib
 *
 * Create. Lintas-edisi: no edisi-context. `no_hp` is normalized before save;
 * uniqueness is intentionally NOT enforced here.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = validateMuqoribCreate(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        first.message,
        400,
        { field: first.field, errors: parsed.errors }
      );
    }
    const input = parsed.value;

    const now = new Date().toISOString();
    const id = await generateMuqoribId();

    const record: QurbanMuqorib = {
      id,
      nama_lengkap: input.nama_lengkap,
      alamat: input.alamat,
      rt: input.rt,
      no_hp: input.no_hp,
      is_active: true,
      data_induk_ref_1447h: '',
      notes: input.notes ?? '',
      created_at: now,
      created_by: guard.session.user_id,
      updated_at: now,
    };

    await appendMuqorib(record);

    await writeAuditLog({
      aksi: AuditAksi.CREATE,
      entitas: 'muqorib',
      entitas_id: id,
      event_type: 'muqorib.created',
      after: record,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(record, undefined, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/muqorib] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal membuat muqorib: ${err.message}`
        : 'Gagal membuat muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
