import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import {
  loadBagianMap,
  seedBagianKanonik,
  addKanonik,
  addAlias,
  removeAlias,
  setBagianActive,
} from '@/lib/qurban/bagian-kanonik-repo';
import type { TipeBagian } from '@/lib/qurban/rekap-bagian';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];
const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * GET  /api/qurban/laporan/bagian-map — baca peta bagian (semua role login).
 * POST /api/qurban/laporan/bagian-map — ubah peta (SA/AQ). Aksi:
 *   { action:'seed' }
 *   { action:'add_kanonik', nama_kanonik, tipe? }
 *   { action:'add_alias',   nama_kanonik, alias }
 *   { action:'remove_alias',nama_kanonik, alias }
 *   { action:'set_active',  nama_kanonik, is_active }
 *
 * Peta bersifat GLOBAL (lintas-edisi). Read-only: agregasi rekap memakai peta
 * ini; tulis hanya di sini.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;
  try {
    const map = await loadBagianMap();
    return success({ map }, { generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /api/qurban/laporan/bagian-map] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat peta bagian.', 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const nama = typeof body.nama_kanonik === 'string' ? body.nama_kanonik.trim() : '';
    const alias = typeof body.alias === 'string' ? body.alias : '';
    const actor = guard.session.user_id;

    let map;
    switch (action) {
      case 'seed':
        map = await seedBagianKanonik(actor);
        break;
      case 'add_kanonik': {
        if (!nama) return error(ErrorCodes.VALIDATION_FAILED, 'nama_kanonik wajib.', 400, { field: 'nama_kanonik' });
        const tipe: TipeBagian = body.tipe === 'BAKU' ? 'BAKU' : 'TAMBAHAN';
        map = await addKanonik(nama, tipe, actor);
        break;
      }
      case 'add_alias':
        if (!nama || !alias.trim()) return error(ErrorCodes.VALIDATION_FAILED, 'nama_kanonik & alias wajib.', 400);
        map = await addAlias(nama, alias, actor);
        break;
      case 'remove_alias':
        if (!nama || !alias.trim()) return error(ErrorCodes.VALIDATION_FAILED, 'nama_kanonik & alias wajib.', 400);
        map = await removeAlias(nama, alias, actor);
        break;
      case 'set_active':
        if (!nama) return error(ErrorCodes.VALIDATION_FAILED, 'nama_kanonik wajib.', 400, { field: 'nama_kanonik' });
        map = await setBagianActive(nama, body.is_active !== false, actor);
        break;
      default:
        return error(ErrorCodes.VALIDATION_FAILED, 'action tidak dikenal.', 400, { field: 'action' });
    }

    return success({ map });
  } catch (err) {
    console.error('[POST /api/qurban/laporan/bagian-map] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal mengubah peta bagian.', 500);
  }
}
