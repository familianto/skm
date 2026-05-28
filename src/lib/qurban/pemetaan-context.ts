import type { NextRequest } from 'next/server';

import { error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { PERAN } from '@/lib/api/permissions';

import { findEdisiById, type Edisi } from './edisi-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * Edisi gate untuk endpoint Pemetaan F5b.
 *
 * Konvensi sengaja mirror `peserta-context.evaluatePesertaEdisiGate({})` mode
 * READ (PS1/PS3): panitia (PENDAFTARAN/DISTRIBUSI) hanya AKTIF; SA/BD/AQ
 * status apa pun. Ini menjaga konsistensi role-vs-edisi lintas Modul Qurban
 * — DS (DISTRIBUSI) yang sehari-hari read-only ke /qurban/distribusi tetap
 * diizinkan **read** PM2 di edisi AKTIF.
 *
 * Bukan write endpoint → tidak ada `requireWritable`/`requireAktif`. PM1 (A2)
 * akan punya gate-nya sendiri.
 */

export type EdisiGateOk = { ok: true; edisi: Edisi };
export type EdisiGateFail = { ok: false; response: Response };

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

export async function resolveEdisiForPemetaan(
  request: NextRequest,
  peran: string
): Promise<EdisiGateOk | EdisiGateFail> {
  const url = new URL(request.url);
  const edisiId = (url.searchParams.get('edisi_id') || '').trim();
  if (!edisiId) {
    return {
      ok: false,
      response: error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Query param `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      ),
    };
  }

  const edisi = await findEdisiById(edisiId);
  if (!edisi) {
    return {
      ok: false,
      response: error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404),
    };
  }
  if (isPanitiaRole(peran) && edisi.status !== EDISI_STATUS.AKTIF) {
    return {
      ok: false,
      response: error(
        ErrorCodes.FORBIDDEN_EDISI,
        'Anda hanya dapat mengakses pemetaan edisi yang berstatus AKTIF.',
        403,
        { edisi_status: edisi.status }
      ),
    };
  }
  return { ok: true, edisi };
}
