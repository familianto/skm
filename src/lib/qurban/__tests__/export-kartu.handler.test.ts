import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/qurban/laporan/export/route';

import { PERAN } from '@/lib/api/permissions';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  type SessionPayload,
} from '@/lib/api/auth';
import { SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

import {
  installMockSheets,
  resetMockSheets,
  edisiRows,
  pesertaRows,
  hewanRows,
  muqoribRows,
  makeEdisi,
  makePeserta,
  makeHewan,
  makeMuqorib,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * LP6 Kartu/Label handler (F8 Milestone G). Verifikasi shape kartu & label →
 * PDF/Excel valid, gate, dan penolakan shape lain. `nomor_urut_pemotongan`
 * ditulis langsung ke sel (mapper F5a sengaja tak menulisnya).
 */

afterEach(() => resetMockSheets());

const COL_PEMOTONGAN = SHEET_HEADERS[QURBAN_SHEETS.DAFTAR_HEWAN].indexOf('nomor_urut_pemotongan');
function hewanRowsWithUrut(...hewan: QurbanDaftarHewan[]) {
  const rows = hewanRows(...hewan);
  hewan.forEach((h, i) => {
    if (h.nomor_urut_pemotongan != null && COL_PEMOTONGAN >= 0) rows[i][COL_PEMOTONGAN] = h.nomor_urut_pemotongan;
  });
  return rows;
}

async function makeReq(peran: string, body: unknown): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f8g';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  return new NextRequest('http://localhost/api/qurban/laporan/export', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function db(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1447 H' })),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'P1', hewan_id: 'S1', slot_number: 1, muqorib_id: 'M1', nama_atas_nama: 'Andi' }),
      makePeserta({ id: 'P2', hewan_id: 'S1', slot_number: 3, muqorib_id: 'M2', nama_atas_nama: 'Budi' }),
      makePeserta({ id: 'P3', hewan_id: 'K1', slot_number: 1, muqorib_id: 'M3', nama_atas_nama: 'Cici' })
    ),
    [SHEETS.DAFTAR_HEWAN]: hewanRowsWithUrut(
      makeHewan({ id: 'S1', jenis: 'SAPI', kelas: 'A', kapasitas_slot: 7, status: 'AKTIF', nomor_urut_pemotongan: 1 }),
      makeHewan({ id: 'K1', jenis: 'KAMBING', kelas: 'A', kapasitas_slot: 1, status: 'AKTIF', nomor_urut_pemotongan: 2 })
    ),
    [SHEETS.MUQORIB]: muqoribRows(
      makeMuqorib({ id: 'M1', rt: '01' }),
      makeMuqorib({ id: 'M2', rt: '02' }),
      makeMuqorib({ id: 'M3', rt: '03' })
    ),
  };
}

test('Kartu Sapi PDF → 200 application/pdf', async () => {
  installMockSheets(db());
  const res = await POST(await makeReq(PERAN.ADMIN_QURBAN, { shape: 'kartu', filter: { jenis: 'SAPI' }, format: 'pdf' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.ok((await res.arrayBuffer()).byteLength > 0);
});

test('Kartu Kambing Excel → 200 spreadsheet', async () => {
  installMockSheets(db());
  const res = await POST(await makeReq(PERAN.BENDAHARA, { shape: 'kartu', filter: { jenis: 'KAMBING' }, format: 'xlsx' }));
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

test('Label Bagikan PDF → 200 application/pdf', async () => {
  installMockSheets(db());
  const res = await POST(await makeReq(PERAN.PENDAFTARAN, { shape: 'label', filter: { jenis: 'SEMUA' }, format: 'pdf' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
});

test('shape lain (poster) → 400', async () => {
  installMockSheets(db());
  const res = await POST(await makeReq(PERAN.ADMIN_QURBAN, { shape: 'poster', format: 'pdf' }));
  assert.equal(res.status, 400);
});

test('Kartu tanpa sesi → 401', async () => {
  installMockSheets(db());
  const res = await POST(
    new NextRequest('http://localhost/api/qurban/laporan/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shape: 'kartu', filter: { jenis: 'SAPI' }, format: 'pdf' }),
    })
  );
  assert.equal(res.status, 401);
});
