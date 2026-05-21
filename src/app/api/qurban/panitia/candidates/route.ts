import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';
import { listAll } from '@/lib/api/anggota-repo';
import { UserPeran } from '@/types';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { listActivePanitiaByEdisi } from '@/lib/qurban/panitia-repo';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * Candidate list for the "Tambah Panitia" dropdown. Scoped narrowly to keep
 * AQ from needing the SA-only /api/pengaturan/anggota endpoint.
 *
 * Returns active anggota whose peran is allowed as panitia (BENDAHARA
 * excluded) and who are NOT already active panitia for the given edisi.
 *
 * Response items intentionally minimal — only what the dropdown renders.
 */
const ALLOWED_PANITIA_PERAN: readonly string[] = [
  UserPeran.SUPER_ADMIN,
  UserPeran.ADMIN_QURBAN,
  UserPeran.PENDAFTARAN,
  UserPeran.DISTRIBUSI,
];

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
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

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }

    const [anggotaList, activePanitia] = await Promise.all([
      listAll(),
      listActivePanitiaByEdisi(edisiId),
    ]);
    const takenIds = new Set(activePanitia.map((p) => p.anggota_id));

    const items = anggotaList
      .filter(
        ({ anggota }) =>
          anggota.is_active &&
          ALLOWED_PANITIA_PERAN.includes(anggota.peran) &&
          !takenIds.has(anggota.id)
      )
      .map(({ anggota }) => ({
        id: anggota.id,
        nama: anggota.nama,
        peran: anggota.peran,
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

    return success(items, {
      total: items.length,
      page: 1,
      page_size: items.length,
      has_more: false,
      filters_applied: { edisi_id: edisiId },
    });
  } catch (err) {
    console.error('[GET /api/qurban/panitia/candidates] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat kandidat panitia: ${err.message}`
        : 'Gagal memuat kandidat panitia.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
