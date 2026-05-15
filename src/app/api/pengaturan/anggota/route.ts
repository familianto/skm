import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireSuperAdmin } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { generateId } from '@/lib/api/id-gen';
import { normalizePhone, validatePhone } from '@/lib/api/phone';
import { validatePin } from '@/lib/api/pin-policy';
import { VALID_PERAN } from '@/lib/api/permissions';
import {
  listAll,
  publicAnggota,
  isTeleponTakenByActive,
  anggotaToRow,
  type AnggotaFull,
} from '@/lib/api/anggota-repo';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { AuditAksi, UserPeran } from '@/types';

const BCRYPT_ROUNDS = 10;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const peranSchema = z.enum(VALID_PERAN);

const sortableFields = ['nama', 'created_at', 'last_login_at', 'peran'] as const;
type SortField = (typeof sortableFields)[number];

/**
 * U1 — GET /api/pengaturan/anggota
 *
 * Query params (per Tahap 3.E §2.6 + §3.2):
 *   page, page_size (default 50, max 200)
 *   search       — substring match on nama OR telepon
 *   peran        — filter by exact role
 *   is_active    — 'true' | 'false'
 *   sort         — `<field>:asc|desc` (default `nama:asc`); whitelist:
 *                  nama | created_at | last_login_at | peran
 *
 * Response: { items: AnggotaPublic[], meta: { total, page, page_size, has_more, filters_applied } }
 */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const params = url.searchParams;

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(params.get('page_size') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
    );
    const search = (params.get('search') || '').trim().toLowerCase();
    const peranFilter = (params.get('peran') || '').trim();
    const isActiveParam = params.get('is_active');
    const sortRaw = (params.get('sort') || 'nama:asc').trim();

    const [sortFieldRaw, sortDirRaw] = sortRaw.split(':');
    const sortField: SortField = (sortableFields as readonly string[]).includes(sortFieldRaw)
      ? (sortFieldRaw as SortField)
      : 'nama';
    const sortDir: 'asc' | 'desc' = sortDirRaw === 'desc' ? 'desc' : 'asc';

    // Read all rows once, filter + sort in memory (anggota typically tens of rows)
    const all = await listAll();
    let items = all.map(({ anggota }) => anggota);

    if (search) {
      items = items.filter(
        (a) =>
          a.nama.toLowerCase().includes(search) ||
          a.telepon.toLowerCase().includes(search)
      );
    }
    if (peranFilter) {
      items = items.filter((a) => a.peran === peranFilter);
    }
    if (isActiveParam === 'true') items = items.filter((a) => a.is_active);
    if (isActiveParam === 'false') items = items.filter((a) => !a.is_active);

    items.sort((a, b) => {
      const av = (a[sortField] || '').toString();
      const bv = (b[sortField] || '').toString();
      const cmp = av.localeCompare(bv, 'id');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    const filters_applied: Record<string, unknown> = {};
    if (search) filters_applied.search = search;
    if (peranFilter) filters_applied.peran = peranFilter;
    if (isActiveParam !== null) filters_applied.is_active = isActiveParam === 'true';

    return success(
      paged.map(publicAnggota),
      {
        total,
        page,
        page_size: pageSize,
        has_more: start + pageSize < total,
        filters_applied,
      }
    );
  } catch (err) {
    console.error('[GET /api/pengaturan/anggota] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat daftar anggota.', 500);
  }
}

/**
 * U2 — POST /api/pengaturan/anggota
 *
 * Body: { nama, telepon, email?, peran, initial_pin }
 *
 * Business rules:
 *  - telepon normalized + validated; uniqueness checked vs is_active=TRUE rows
 *  - initial_pin validated against PIN policy (4-6 digit, not weak/sequential)
 *  - peran from VALID_PERAN (SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN,
 *    PENDAFTARAN, DISTRIBUSI). All five accepted in F1 — strict role
 *    enforcement on Qurban routes lands in F2 (see HANDOFF_SPRINT_F01.md
 *    Milestone D decision).
 *
 * Audit: anggota.created.
 */
const createSchema = z.object({
  nama: z.string().min(1, 'Nama wajib diisi').max(100),
  telepon: z.string().min(1, 'Telepon wajib diisi'),
  email: z.string().max(255).optional(),
  peran: peranSchema,
  initial_pin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN awal harus 4-6 digit numerik'),
});

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
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
    const { nama, email, peran, initial_pin } = parsed.data;

    const telepon = normalizePhone(parsed.data.telepon);
    if (!validatePhone(telepon)) {
      return error(
        ErrorCodes.VALIDATION_FORMAT,
        'Format telepon tidak valid. Gunakan 628xxx atau 08xxx.',
        400,
        { field: 'telepon' }
      );
    }

    const pinCheck = validatePin(initial_pin);
    if (!pinCheck.valid) {
      return error(
        ErrorCodes.VALIDATION_PIN_POLICY,
        pinCheck.constraint || 'PIN tidak memenuhi kebijakan.',
        400,
        { field: 'initial_pin', violation: pinCheck.violation, constraint: pinCheck.constraint }
      );
    }

    if (await isTeleponTakenByActive(telepon)) {
      return error(
        ErrorCodes.DUPLICATE_TELEPON,
        'Telepon sudah digunakan oleh anggota lain yang aktif.',
        409,
        { field: 'telepon' }
      );
    }

    const id = await generateId('ANG', SHEET_NAMES.ANGGOTA);
    const now = new Date().toISOString();
    const pinHash = await bcrypt.hash(initial_pin, BCRYPT_ROUNDS);

    const newAnggota: AnggotaFull = {
      id,
      nama,
      telepon,
      email: email || '',
      peran: peran as UserPeran,
      is_active: true,
      created_at: now,
      pin_hash: pinHash,
      created_by: guard.session.user_id,
      updated_at: now,
      last_login_at: '',
      failed_attempts: 0,
      locked_until: '',
    };
    await sheetsService.appendRow(SHEET_NAMES.ANGGOTA, anggotaToRow(newAnggota));

    await writeAuditLog({
      aksi: AuditAksi.CREATE,
      entitas: 'anggota',
      entitas_id: id,
      event_type: 'anggota.created',
      after: { nama, telepon, peran, email: email || '' },
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(publicAnggota(newAnggota));
  } catch (err) {
    console.error('[POST /api/pengaturan/anggota] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal membuat anggota.', 500);
  }
}
