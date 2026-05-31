import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/qurban/peserta/route';
import { PERAN } from '@/lib/api/permissions';
import { SESSION_COOKIE_NAME, createSessionToken, type SessionPayload } from '@/lib/api/auth';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import { konfigurasiToRow, type Konfigurasi } from '@/lib/qurban/konfigurasi-repo';

import {
  installMockSheets,
  resetMockSheets,
  edisiRows,
  masterRows,
  hewanRows,
  muqoribRows,
  makeEdisi,
  makeMaster,
  makeHewan,
  makeMuqorib,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * F6 Milestone A — handler-level integration test untuk auto-create pembayaran.
 *
 * Membuktikan WIRING: PS2 (`POST /api/qurban/peserta`) menulis SATU baris
 * `qurban_pembayaran` per pendaftaran dengan `nominal_transfer = total + suffix`.
 * Memakai mock googleapis client via hook `__testing__` (pola yang sudah ada,
 * bukan experimental module mocks).
 */

afterEach(() => resetMockSheets());

function makeKonfig(over: Partial<Konfigurasi> = {}): Konfigurasi {
  return {
    id: 'KFG-1',
    edisi_id: 'EDS-1',
    bop_per_ekor_sapi: 0,
    bop_per_ekor_kambing: 0,
    target_bungkus_total: 0,
    berat_target_per_bungkus: 0,
    tanggal_distribusi_mulai: '',
    tanggal_distribusi_selesai: '',
    payment_suffix: 3,
    wa_send_on_pendaftaran: false,
    wa_send_on_pembayaran_confirmed: false,
    notes: '',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: 'ANG-1',
    ...over,
  };
}

/** Edisi AKTIF, 1 master (sapi 7-slot @ harga_beli 7jt → 1jt/slot), 1 hewan, 1 muqorib, konfig suffix=3. */
function baseDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', status: 'AKTIF' })),
    [SHEETS.MASTER_HEWAN]: masterRows(makeMaster({ id: 'MHW-1', kapasitas_slot: 7, harga_beli: 7_000_000 })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(makeHewan({ id: 'HWN-1', master_hewan_id: 'MHW-1', kapasitas_slot: 7 })),
    [SHEETS.MUQORIB]: muqoribRows(makeMuqorib({ id: 'MQR-1', is_active: true })),
    [QURBAN_SHEETS.KONFIGURASI_EDISI]: [konfigurasiToRow(makeKonfig())],
  };
}

async function makeReq(body: unknown, peran: string = PERAN.ADMIN_QURBAN): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f6-pembayaran';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  return new NextRequest('http://localhost/api/qurban/peserta?edisi_id=EDS-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  });
}

test('PS2 auto-create: 2 slot → 201, satu baris pembayaran, nominal_transfer = total + suffix', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makeReq({
    muqorib_id: 'MQR-1',
    master_hewan_id: 'MHW-1',
    tipe_qurban: 'BELI',
    jumlah_slot: 2,
    keterangan_bagian: '',
    metode_pembayaran: 'TRANSFER',
  });

  const res = await POST(req);
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));

  // Tepat satu append ke qurban_pembayaran.
  const payAppends = cap.appends.filter((a) => a.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.equal(payAppends.length, 1, 'tepat 1 baris pembayaran');

  const row = payAppends[0].values[0]; // appendRow → satu baris (sudah di-String-kan)
  // Kolom: 4=nominal_total, 5=nominal_transfer, 6=metode, 7=status.
  assert.equal(row[4], '2000000'); // 2 slot × 1.000.000
  assert.equal(row[5], '2000003'); // + suffix 3
  assert.equal(row[6], 'TRANSFER');
  assert.equal(row[7], 'BELUM_BAYAR');
});

test('PS2 auto-create: metode VA ditolak 422 dan TIDAK menulis peserta/pembayaran', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makeReq({
    muqorib_id: 'MQR-1',
    master_hewan_id: 'MHW-1',
    tipe_qurban: 'BELI',
    jumlah_slot: 1,
    keterangan_bagian: '',
    metode_pembayaran: 'VA',
  });

  const res = await POST(req);
  const body = await res.json();
  assert.equal(res.status, 422, JSON.stringify(body));
  assert.equal(body.error.details.field, 'metode_pembayaran');

  // Tidak ada penulisan peserta maupun pembayaran (validasi sebelum mutasi).
  const writes = cap.appends.filter(
    (a) =>
      a.range.startsWith(`${QURBAN_SHEETS.PESERTA}!`) ||
      a.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`)
  );
  assert.equal(writes.length, 0, 'tidak ada peserta/pembayaran yatim');
});

test('PS2 auto-create: tanpa field metode → default TRANSFER', async () => {
  const cap = installMockSheets(baseDb());
  const req = await makeReq({
    muqorib_id: 'MQR-1',
    master_hewan_id: 'MHW-1',
    tipe_qurban: 'BELI',
    jumlah_slot: 1,
    keterangan_bagian: '',
  });

  const res = await POST(req);
  assert.equal(res.status, 201);
  const payAppends = cap.appends.filter((a) => a.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.equal(payAppends.length, 1);
  assert.equal(payAppends[0].values[0][6], 'TRANSFER'); // metode default
});
