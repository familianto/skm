import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { evaluatePesertaEdisiGate } from '@/lib/qurban/peserta-context';
import { findDuplikatTerdaftar } from '@/lib/qurban/peserta-repo';

const ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * PS6 — POST /api/qurban/peserta/check-duplicate
 *
 * Body `{ muqorib_id, edisi_id }`. Pra-submit Layer 1: bungkus
 * `findDuplikatTerdaftar` (B). Kembalikan peserta TERDAFTAR existing milik
 * muqorib itu di edisi (kosong = tidak ada duplikat). INFORMASIONAL — tidak
 * memblokir; pemblokiran tetap di PS2.
 *
 * `edisi_id` di body (sesuai kontrak request PS6) — beda dari PS1–PS5/PS8 yang
 * pakai query param; gate edisi (akses + panitia-lock) tetap diterapkan manual.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, ROLES);
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const muqoribId = typeof raw.muqorib_id === 'string' ? raw.muqorib_id.trim() : '';
    const edisiId = typeof raw.edisi_id === 'string' ? raw.edisi_id.trim() : '';
    if (!muqoribId) {
      return error(ErrorCodes.VALIDATION_REQUIRED, '`muqorib_id` wajib diisi.', 400, { field: 'muqorib_id' });
    }
    if (!edisiId) {
      return error(ErrorCodes.VALIDATION_REQUIRED, '`edisi_id` wajib diisi.', 400, { field: 'edisi_id' });
    }

    const edisi = await findEdisiById(edisiId);
    const decision = evaluatePesertaEdisiGate(edisi, guard.session.peran, {});
    if (!decision.ok) {
      return error(decision.code, decision.message, decision.status, decision.details);
    }

    const existing = await findDuplikatTerdaftar(edisiId, muqoribId);
    return success(
      { has_duplicate: existing.length > 0, existing },
      { total: existing.length }
    );
  } catch (err) {
    console.error('[POST /api/qurban/peserta/check-duplicate] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memeriksa duplikat peserta.', 500);
  }
}
