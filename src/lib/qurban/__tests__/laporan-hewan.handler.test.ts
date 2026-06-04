import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/qurban/laporan/hewan/route';

import { PERAN } from '@/lib/api/permissions';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  type SessionPayload,
} from '@/lib/api/auth';
import { mapPembayaranToRow, type Pembayaran } from '@/lib/qurban/pembayaran-repo';
import type { LaporanHewanDTO } from '@/lib/qurban/laporan-hewan';

import {
  installMockSheets,
  resetMockSheets,
  edisiRows,
  hewanRows,
  makeEdisi,
  makeHewan,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * LP2 handler — GET /api/qurban/laporan/hewan. Verifikasi: role-gate, resolusi
 * edisi default-AKTIF + override, matriks + biaya end-to-end, gate panitia
 * (non-AKTIF → 403), dan 401 tanpa sesi.
 */

afterEach(() => resetMockSheets());

async function makeReq(peran: string, edisiId?: string): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f8c';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  const url = new URL('http://localhost/api/qurban/laporan/hewan');
  if (edisiId) url.searchParams.set('edisi_id', edisiId);
  return new NextRequest(url, { method: 'GET', headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
}

async function read(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as {
      ok: boolean;
      data?: Record<string, unknown>;
      error?: { code: string };
      meta?: Record<string, unknown>;
    },
  };
}

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1447-001',
    muqorib_id: 'MQR-1',
    nominal_total: 2_500_000,
    nominal_transfer: 2_500_000,
    metode: 'IMPORT_1447H',
    status: 'LUNAS',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: '2026-05-01T00:00:00.000Z',
    bank_ref: '',
    skm_transaksi_id: '',
    bukti_url: '',
    match_metadata: '',
    notes: '',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: 'IMPORT',
    ...over,
  };
}

function pembayaranRows(...rows: Pembayaran[]): (string | number)[][] {
  return rows.map(mapPembayaranToRow);
}

/**
 * Edisi 1447H gaya arsip dengan data kecil:
 *   Sapi A: 2 BELI aktif (22.75jt ea) + 1 BAWA aktif + 1 BELI batal (22.75jt).
 *   Kambing A: 1 BELI aktif harga kosong (0) + 1 BAWA aktif.
 */
function archiveDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1447 H', tanggal_idul_adha: '2026-05-27' })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'H1', jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 22_750_000 }),
      makeHewan({ id: 'H2', jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 22_750_000 }),
      makeHewan({ id: 'H3', jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI', status: 'AKTIF', harga_beli_aktual: 0 }),
      makeHewan({ id: 'H4', jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BELI', status: 'BATAL', harga_beli_aktual: 22_750_000 }),
      makeHewan({ id: 'H5', jenis: 'KAMBING', kelas: 'A', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 0 }),
      makeHewan({ id: 'H6', jenis: 'KAMBING', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI', status: 'AKTIF', harga_beli_aktual: 0 })
    ),
    'qurban_pembayaran': pembayaranRows(pay({ id: 'BYR-1', status: 'LUNAS' })),
  };
}

test('LP2: default edisi AKTIF — matriks + biaya benar (semua role)', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.ADMIN_QURBAN));
  const { status, body } = await read(res);

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const d = body.data as unknown as LaporanHewanDTO;

  assert.equal(d.edisi.id, 'EDS-1');
  assert.equal(d.edisi.is_arsip, true);

  // Inventaris: Sapi A lalu Kambing A.
  assert.deepEqual(d.inventaris.map((r) => r.label), ['Sapi A', 'Kambing A']);

  const sapiA = d.inventaris[0];
  assert.equal(sapiA.total, 4);
  assert.equal(sapiA.aktif, 3); // 2 BELI aktif + 1 BAWA aktif
  assert.equal(sapiA.batal, 1);
  assert.equal(sapiA.beli, 3); // 2 aktif + 1 batal
  assert.equal(sapiA.bawa_sendiri, 1);
  assert.equal(sapiA.biaya_pengadaan, 45_500_000); // 2 × 22.75jt

  // Ringkasan.
  assert.equal(d.ringkasan.total, 6);
  assert.equal(d.ringkasan.aktif, 5);
  assert.equal(d.ringkasan.batal, 1);
  assert.equal(d.ringkasan.beli, 4);
  assert.equal(d.ringkasan.bawa_sendiri, 2);
  assert.equal(d.ringkasan.biaya_pengadaan_total, 45_500_000);
  assert.equal(d.ringkasan.biaya_pengadaan_sapi, 45_500_000);
  assert.equal(d.ringkasan.biaya_pengadaan_kambing, 0);
  assert.equal(d.ringkasan.hewan_beli_tanpa_harga, 1); // H5 (Kambing A BELI aktif, harga 0)

  assert.equal(typeof body.meta?.generated_at, 'string');
});

test('LP2: override ?edisi_id= eksplisit', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.BENDAHARA, 'EDS-1'));
  const { status, body } = await read(res);
  assert.equal(status, 200);
  assert.equal((body.data as unknown as LaporanHewanDTO).edisi.id, 'EDS-1');
});

test('LP2: edisi_id tak dikenal → 404', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.SUPER_ADMIN, 'EDS-404'));
  const { status, body } = await read(res);
  assert.equal(status, 404);
  assert.equal(body.ok, false);
});

test('LP2: panitia (DISTRIBUSI) menolak edisi non-AKTIF → 403', async () => {
  const db = archiveDb();
  db[SHEETS.EDISI] = edisiRows(makeEdisi({ id: 'EDS-1', status: 'SELESAI' }));
  installMockSheets(db);
  const res = await GET(await makeReq(PERAN.DISTRIBUSI, 'EDS-1'));
  const { status } = await read(res);
  assert.equal(status, 403);
});

test('LP2: tanpa sesi → 401', async () => {
  installMockSheets(archiveDb());
  const url = new URL('http://localhost/api/qurban/laporan/hewan');
  const res = await GET(new NextRequest(url, { method: 'GET' }));
  const { status } = await read(res);
  assert.equal(status, 401);
});
