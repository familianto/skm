import type { NextRequest } from 'next/server';

import { error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { PERAN } from '@/lib/api/permissions';

import { findEdisiById, type Edisi } from './edisi-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * Shared `?edisi_id=` resolution + edisi gate for the H1–H7 hewan endpoints.
 *
 * Mirrors MH1/MH2/MH3 (F03): edisi_id is a REQUIRED query param (the prompt
 * mentioned an "edisi-context helper", but the in-repo F03 contract uses an
 * explicit query param — kode in-repo menang). Layers the panitia lock on top:
 *
 *   - PENDAFTARAN/DISTRIBUSI (panitia) may only touch the AKTIF edisi.
 *   - write endpoints additionally reject SELESAI (locked) for everyone.
 *
 * Decision logic is split into a pure `evaluateEdisiGate` (unit-testable, no
 * I/O) wrapped by `resolveEdisiForHewan` (reads query + Sheets).
 */

export type EdisiGateOk = { ok: true; edisi: Edisi };
export type EdisiGateFail = { ok: false; response: Response };

export type EdisiGateDecision =
  | { ok: true }
  | { ok: false; code: string; status: number; message: string; details?: Record<string, unknown> };

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

/** Pure gate decision given an already-resolved edisi (null → not found). */
export function evaluateEdisiGate(
  edisi: Edisi | null,
  peran: string,
  opts: { requireWritable: boolean }
): EdisiGateDecision {
  if (!edisi) {
    return { ok: false, code: ErrorCodes.NOT_FOUND, status: 404, message: 'Edisi tidak ditemukan.' };
  }
  if (isPanitiaRole(peran) && edisi.status !== EDISI_STATUS.AKTIF) {
    return {
      ok: false,
      code: ErrorCodes.FORBIDDEN_EDISI,
      status: 403,
      message: 'Anda hanya dapat mengakses inventaris hewan edisi yang berstatus AKTIF.',
      details: { edisi_status: edisi.status },
    };
  }
  if (opts.requireWritable && edisi.status === EDISI_STATUS.SELESAI) {
    return {
      ok: false,
      code: ErrorCodes.BUSINESS_EDISI_LOCKED,
      status: 422,
      message: 'Edisi sudah SELESAI. Inventaris hewan tidak dapat diubah.',
      details: { edisi_status: edisi.status },
    };
  }
  return { ok: true };
}

export async function resolveEdisiForHewan(
  request: NextRequest,
  peran: string,
  opts: { requireWritable: boolean }
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
  const decision = evaluateEdisiGate(edisi, peran, opts);
  if (!decision.ok) {
    return { ok: false, response: error(decision.code, decision.message, decision.status, decision.details) };
  }
  return { ok: true, edisi: edisi as Edisi };
}
