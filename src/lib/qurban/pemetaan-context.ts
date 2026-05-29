import type { NextRequest } from 'next/server';

import { error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { PERAN } from '@/lib/api/permissions';

import { findEdisiById, findEdisiRecordById, type Edisi, type EdisiRecord } from './edisi-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * Edisi gate untuk endpoint Pemetaan F5b.
 *
 * Read (PM2): panitia (PENDAFTARAN/DISTRIBUSI) AKTIF-only; SA/BD/AQ status
 * apa pun — mirror `peserta-context.evaluatePesertaEdisiGate({})`. DS yang
 * sehari-hari read-only tetap boleh **read** PM2 di edisi AKTIF.
 *
 * Write (PM1, A2): edisi WAJIB AKTIF untuk SEMUA peran — mirror PS2 create
 * (`requireAktif`). DRAFT/SELESAI → 422. PM1 sendiri di handler juga
 * memastikan role guard SA/AQ/PD (BD/DS tidak boleh menulis).
 */

export type EdisiGateOk = { ok: true; edisi: Edisi };
export type EdisiGateFail = { ok: false; response: Response };
export type EdisiRecordGateOk = { ok: true; record: EdisiRecord };
export type EdisiRecordGateFail = { ok: false; response: Response };

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

function readEdisiIdQuery(request: NextRequest): { ok: true; id: string } | EdisiRecordGateFail {
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
  return { ok: true, id: edisiId };
}

export async function resolveEdisiForPemetaan(
  request: NextRequest,
  peran: string
): Promise<EdisiGateOk | EdisiGateFail> {
  const idRes = readEdisiIdQuery(request);
  if (!idRes.ok) return idRes;

  const edisi = await findEdisiById(idRes.id);
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

/**
 * Write gate PM1: resolve edisi by `edisi_id` di **body** (POST, bukan query).
 * Wajib AKTIF untuk semua peran (mirror PS2). Return `EdisiRecord` (incl.
 * rowIndex) karena PM1 harus menulis ulang baris edisi untuk bump
 * `pemetaan_version`.
 */
export async function resolveEdisiRecordForPemetaanWrite(
  edisiId: string,
  peran: string
): Promise<EdisiRecordGateOk | EdisiRecordGateFail> {
  if (!edisiId) {
    return {
      ok: false,
      response: error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Field `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      ),
    };
  }
  const record = await findEdisiRecordById(edisiId);
  if (!record) {
    return {
      ok: false,
      response: error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404),
    };
  }
  if (record.edisi.status === EDISI_STATUS.SELESAI) {
    return {
      ok: false,
      response: error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Pemetaan tidak dapat diubah.',
        422,
        { edisi_status: record.edisi.status }
      ),
    };
  }
  if (record.edisi.status !== EDISI_STATUS.AKTIF) {
    // Panitia dan non-panitia sama: DRAFT → 422 (mirror PS2 requireAktif).
    return {
      ok: false,
      response: error(
        ErrorCodes.BUSINESS_EDISI_NOT_AKTIF,
        'Pemetaan hanya dapat diubah pada edisi berstatus AKTIF.',
        422,
        { edisi_status: record.edisi.status }
      ),
    };
  }
  // Defense-in-depth: panitia di edisi non-AKTIF mustinya tidak sampai sini
  // karena cek di atas, tapi tetap eksplisit.
  if (isPanitiaRole(peran) && record.edisi.status !== EDISI_STATUS.AKTIF) {
    return {
      ok: false,
      response: error(
        ErrorCodes.FORBIDDEN_EDISI,
        'Anda hanya dapat mengakses pemetaan edisi yang berstatus AKTIF.',
        403,
        { edisi_status: record.edisi.status }
      ),
    };
  }
  return { ok: true, record };
}
