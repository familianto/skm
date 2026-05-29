import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { PERAN } from '@/lib/api/permissions';
import { POST } from '@/app/api/qurban/pemetaan/batch-save/route';

import {
  installMockSheets,
  resetMockSheets,
  makePostRequest,
  readResponse,
  edisiRows,
  pesertaRows,
  hewanRows,
  masterRows,
  makeEdisi,
  makePeserta,
  makeHewan,
  makeMaster,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * F5b polish — handler-level integration tests for PM1
 * (`POST /api/qurban/pemetaan/batch-save`).
 *
 * Exercises the full orchestration (parse → role guard → resolve edisi →
 * version check → re-read state → simulate → atomic batch write → audit →
 * lean response) against a mock googleapis client injected via the stable
 * `__testing__` hook. Pure-unit coverage for validators/engine/board-logic
 * already exists; these tests guard the WIRING between them.
 */

afterEach(() => resetMockSheets());

/** Standard fixture: edisi AKTIF (VER-1), 1 master, 2 hewan, 2 peserta on HWN-1. */
function baseDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', pemetaan_version: 'VER-1' })),
    [SHEETS.MASTER_HEWAN]: masterRows(makeMaster({ id: 'MHW-1' })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'HWN-1', nomor_urut: 1 }),
      makeHewan({ id: 'HWN-2', nomor_urut: 2 })
    ),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', hewan_id: 'HWN-1', slot_number: 1 }),
      makePeserta({ id: 'PST-2', hewan_id: 'HWN-1', slot_number: 2 })
    ),
  };
}

const MOVE_PST1_TO_HWN2 = {
  type: 'move_peserta' as const,
  peserta_id: 'PST-1',
  target_hewan_id: 'HWN-2',
  target_slot_number: 1,
  harga_decision: 'use_old' as const,
};

test('PM1 happy path: version match + sim ok → 200, 1 atomic batchUpdate, audit, lean response', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makePostRequest(
    { edisi_id: 'EDS-1', expected_version: 'VER-1', operations: [MOVE_PST1_TO_HWN2] },
    PERAN.PENDAFTARAN
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 200);
  assert.equal(body.ok, true);

  // batchUpdateRanges called exactly once (atomic).
  assert.equal(cap.batchUpdates.length, 1, 'tepat 1 batchUpdate');
  const data = cap.batchUpdates[0].data;
  // updates = peserta_changed (1: PST-1) + hewan_changed (0) + 1 edisi = 2.
  assert.equal(data.length, 2, 'jumlah update = 1 peserta + 0 hewan + 1 edisi');
  const ranges = data.map((d) => d.range);
  assert.ok(ranges.some((r) => r.startsWith(`${SHEETS.PESERTA}!`)), 'ada update peserta');
  assert.ok(ranges.some((r) => r.startsWith(`${SHEETS.EDISI}!`)), 'ada bump edisi');

  // Audit called once with event_type pemetaan.batch_save.
  const auditAppends = cap.appends.filter(
    (a) => a.range.startsWith(`${SHEETS.AUDIT_LOG}!`) && a.values[0]?.[3] === 'pemetaan'
  );
  assert.equal(auditAppends.length, 1, 'tepat 1 audit append');
  assert.match(String(auditAppends[0].values[0][5]), /pemetaan\.batch_save/);

  // Lean response shape.
  const resData = body.data as {
    version: string;
    applied: number;
    affected_peserta_ids: string[];
    affected_hewan_ids: string[];
  };
  assert.equal(typeof resData.version, 'string');
  assert.notEqual(resData.version, 'VER-1', 'version di-bump ke nilai baru');
  assert.equal(resData.applied, 1);
  assert.deepEqual(resData.affected_peserta_ids, ['PST-1']);
  assert.deepEqual(resData.affected_hewan_ids, []);
});

test('PM1 version mismatch → 409 CONFLICT_VERSION, no write', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makePostRequest(
    { edisi_id: 'EDS-1', expected_version: 'STALE', operations: [MOVE_PST1_TO_HWN2] },
    PERAN.PENDAFTARAN
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 409);
  assert.equal(body.error?.code, 'CONFLICT_VERSION');
  assert.equal(body.error?.details?.current_version, 'VER-1');
  assert.equal(body.error?.details?.expected_version, 'STALE');
  assert.equal(cap.batchUpdates.length, 0, 'tidak ada penulisan saat konflik versi');
});

test('PM1 simulator fail (slot collision) → 422 BUSINESS_PEMETAAN_INVALID + failed_op_index, no write', async () => {
  const cap = installMockSheets(baseDb());
  // Pindahkan PST-2 ke slot yang sudah ditempati PST-1 → kolisi final-state.
  const req = await makePostRequest(
    {
      edisi_id: 'EDS-1',
      expected_version: 'VER-1',
      operations: [
        {
          type: 'move_peserta',
          peserta_id: 'PST-2',
          target_hewan_id: 'HWN-1',
          target_slot_number: 1,
          harga_decision: 'use_old',
        },
      ],
    },
    PERAN.PENDAFTARAN
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 422);
  assert.equal(body.error?.code, 'BUSINESS_PEMETAAN_INVALID');
  assert.equal(body.error?.details?.failed_op_index, 0);
  assert.equal(cap.batchUpdates.length, 0, 'tidak ada penulisan saat simulasi gagal');
});

test('PM1 simulator fail (capacity overflow) → 422, no write', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makePostRequest(
    {
      edisi_id: 'EDS-1',
      expected_version: 'VER-1',
      operations: [
        {
          type: 'move_peserta',
          peserta_id: 'PST-1',
          target_hewan_id: 'HWN-2',
          target_slot_number: 99, // > kapasitas_slot (7)
          harga_decision: 'use_old',
        },
      ],
    },
    PERAN.PENDAFTARAN
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 422);
  assert.equal(body.error?.code, 'BUSINESS_PEMETAAN_INVALID');
  assert.equal(cap.batchUpdates.length, 0);
});

test('PM1 edisi DRAFT → 422 BUSINESS_EDISI_NOT_AKTIF, no write', async () => {
  const db = baseDb();
  db[SHEETS.EDISI] = edisiRows(makeEdisi({ id: 'EDS-1', status: 'DRAFT', pemetaan_version: 'VER-1' }));
  const cap = installMockSheets(db);
  const req = await makePostRequest(
    { edisi_id: 'EDS-1', expected_version: 'VER-1', operations: [MOVE_PST1_TO_HWN2] },
    PERAN.PENDAFTARAN
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 422);
  assert.equal(body.error?.code, 'BUSINESS_EDISI_NOT_AKTIF');
  assert.equal(cap.batchUpdates.length, 0);
});

test('PM1 role BENDAHARA → 403 FORBIDDEN_ROLE (guard before any read/write)', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makePostRequest(
    { edisi_id: 'EDS-1', expected_version: 'VER-1', operations: [MOVE_PST1_TO_HWN2] },
    PERAN.BENDAHARA
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 403);
  assert.equal(body.error?.code, 'FORBIDDEN_ROLE');
  assert.equal(cap.batchUpdates.length, 0);
});

test('PM1 body invalid (empty operations) → 400 VALIDATION_FAILED', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makePostRequest(
    { edisi_id: 'EDS-1', expected_version: 'VER-1', operations: [] },
    PERAN.PENDAFTARAN
  );

  const { status, body } = await readResponse(await POST(req));

  assert.equal(status, 400);
  assert.equal(body.error?.code, 'VALIDATION_FAILED');
  assert.equal(cap.batchUpdates.length, 0);
});
