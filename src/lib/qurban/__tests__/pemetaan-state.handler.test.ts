import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { PERAN } from '@/lib/api/permissions';
import { GET } from '@/app/api/qurban/pemetaan/state/route';

import {
  installMockSheets,
  resetMockSheets,
  makeGetRequest,
  readResponse,
  edisiRows,
  pesertaRows,
  hewanRows,
  masterRows,
  muqoribRows,
  makeEdisi,
  makePeserta,
  makeHewan,
  makeMaster,
  makeMuqorib,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * F5b polish (bonus) — handler-level integration tests for PM2
 * (`GET /api/qurban/pemetaan/state`). Read-only, so lighter than PM1: verifies
 * the read → lookup-build → snapshot wiring and the edisi/role gates.
 */

afterEach(() => resetMockSheets());

/** edisi AKTIF (VER-1) + 1 AKTIF hewan (occupied) + 1 DRAFT hewan (must be hidden). */
function baseDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', pemetaan_version: 'VER-1' })),
    [SHEETS.MASTER_HEWAN]: masterRows(makeMaster({ id: 'MHW-1' })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'HWN-1', nomor_urut: 1, status: 'AKTIF', kapasitas_slot: 7 }),
      makeHewan({ id: 'HWN-2', nomor_urut: 2, status: 'DRAFT' })
    ),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', hewan_id: 'HWN-1', slot_number: 1, muqorib_id: 'MQR-1' })
    ),
    [SHEETS.MUQORIB]: muqoribRows(makeMuqorib({ id: 'MQR-1', nama_lengkap: 'Fulan bin Fulan' })),
  };
}

test('PM2 GET success → 200 snapshot with version + enriched AKTIF hewan only', async () => {
  installMockSheets(baseDb());
  const req = await makeGetRequest('EDS-1', PERAN.PENDAFTARAN);

  const { status, body } = await readResponse(await GET(req));

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const data = body.data as {
    edisi_id: string;
    version: string;
    hewan: Array<{
      id: string;
      kapasitas_slot: number;
      nama_tipe: string;
      slots: Array<{ slot_number: number; peserta: { id: string; muqorib_nama: string } | null }>;
    }>;
  };

  assert.equal(data.edisi_id, 'EDS-1');
  assert.equal(data.version, 'VER-1');
  // Only the AKTIF hewan surfaces (DRAFT HWN-2 filtered out).
  assert.equal(data.hewan.length, 1);
  assert.equal(data.hewan[0].id, 'HWN-1');
  assert.equal(data.hewan[0].nama_tipe, 'SAPI Kelas A');
  assert.equal(data.hewan[0].slots.length, 7, 'slots = kapasitas_slot');
  // Slot 1 occupied by PST-1, enriched with muqorib name.
  assert.equal(data.hewan[0].slots[0].peserta?.id, 'PST-1');
  assert.equal(data.hewan[0].slots[0].peserta?.muqorib_nama, 'Fulan bin Fulan');
  assert.equal(data.hewan[0].slots[1].peserta, null);
});

test('PM2 edisi not found → 404 NOT_FOUND', async () => {
  installMockSheets(baseDb());
  const req = await makeGetRequest('EDS-DOES-NOT-EXIST', PERAN.PENDAFTARAN);

  const { status, body } = await readResponse(await GET(req));

  assert.equal(status, 404);
  assert.equal(body.error?.code, 'NOT_FOUND');
});

test('PM2 role DISTRIBUSI → 200 (read-only whitelist, edisi AKTIF)', async () => {
  installMockSheets(baseDb());
  const req = await makeGetRequest('EDS-1', PERAN.DISTRIBUSI);

  const { status, body } = await readResponse(await GET(req));

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const data = body.data as { version: string };
  assert.equal(data.version, 'VER-1');
});
