import type { NextRequest } from 'next/server';

import { error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { PERAN } from '@/lib/api/permissions';

import { findEdisiById, type Edisi } from './edisi-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * Shared `?edisi_id=` resolution + edisi gate for the PS1–PS5 peserta endpoints.
 * Mirrors `daftar-hewan-context.ts`; pure decision in `evaluatePesertaEdisiGate`.
 *
 * Modes:
 *   - read  (PS1/PS3): panitia (PENDAFTARAN/DISTRIBUSI) may only touch AKTIF.
 *   - write (PS4/PS5): + reject SELESAI (locked) for everyone.
 *   - requireAktif (PS2 create): edisi MUST be AKTIF for ALL roles — pendaftaran
 *     hanya menerima edisi aktif (kontrak in-repo: tidak ada konsep "pendaftaran
 *     dibuka/ditutup" terpisah dari status; guard ke AKTIF saja).
 */

export type EdisiGateOk = { ok: true; edisi: Edisi };
export type EdisiGateFail = { ok: false; response: Response };

export type EdisiGateDecision =
  | { ok: true }
  | { ok: false; code: string; status: number; message: string; details?: Record<string, unknown> };

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

export interface PesertaGateOpts {
  /** Reject SELESAI for everyone (PS4/PS5 writes). */
  requireWritable?: boolean;
  /** Edisi MUST be AKTIF for all roles (PS2 create). */
  requireAktif?: boolean;
}

/** Pure gate decision given an already-resolved edisi (null → not found). */
export function evaluatePesertaEdisiGate(
  edisi: Edisi | null,
  peran: string,
  opts: PesertaGateOpts
): EdisiGateDecision {
  if (!edisi) {
    return { ok: false, code: ErrorCodes.NOT_FOUND, status: 404, message: 'Edisi tidak ditemukan.' };
  }

  if (opts.requireAktif) {
    if (edisi.status !== EDISI_STATUS.AKTIF) {
      return {
        ok: false,
        code: ErrorCodes.BUSINESS_EDISI_NOT_AKTIF,
        status: 422,
        message: 'Pendaftaran peserta hanya dapat dilakukan pada edisi berstatus AKTIF.',
        details: { edisi_status: edisi.status },
      };
    }
    return { ok: true };
  }

  if (isPanitiaRole(peran) && edisi.status !== EDISI_STATUS.AKTIF) {
    return {
      ok: false,
      code: ErrorCodes.FORBIDDEN_EDISI,
      status: 403,
      message: 'Anda hanya dapat mengakses peserta edisi yang berstatus AKTIF.',
      details: { edisi_status: edisi.status },
    };
  }
  if (opts.requireWritable && edisi.status === EDISI_STATUS.SELESAI) {
    return {
      ok: false,
      code: ErrorCodes.BUSINESS_EDISI_LOCKED,
      status: 422,
      message: 'Edisi sudah SELESAI. Data peserta tidak dapat diubah.',
      details: { edisi_status: edisi.status },
    };
  }
  return { ok: true };
}

export async function resolveEdisiForPeserta(
  request: NextRequest,
  peran: string,
  opts: PesertaGateOpts
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
  const decision = evaluatePesertaEdisiGate(edisi, peran, opts);
  if (!decision.ok) {
    return { ok: false, response: error(decision.code, decision.message, decision.status, decision.details) };
  }
  return { ok: true, edisi: edisi as Edisi };
}
