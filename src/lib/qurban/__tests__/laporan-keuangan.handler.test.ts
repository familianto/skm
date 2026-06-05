import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/qurban/laporan/keuangan/route';

import { PERAN } from '@/lib/api/permissions';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  type SessionPayload,
} from '@/lib/api/auth';
import { mapPembayaranToRow, type Pembayaran } from '@/lib/qurban/pembayaran-repo';
import type { LaporanKeuanganDTO } from '@/lib/qurban/laporan-keuangan';

import {
  installMockSheets,
  resetMockSheets,
  edisiRows,
  pesertaRows,
  hewanRows,
  makeEdisi,
  makePeserta,
  makeHewan,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * LP4 handler — GET /api/qurban/laporan/keuangan. Verifikasi: role-gate,
 * resolusi edisi default-AKTIF + override, dana/kategori/biaya/saldo/korelasi
 * end-to-end, gate panitia (non-AKTIF → 403), 401 tanpa sesi.
 */

afterEach(() => resetMockSheets());

async function makeReq(peran: string, edisiId?: string): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f8d';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  const url = new URL('http://localhost/api/qurban/laporan/keuangan');
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

let bSeq = 0;
function pay(over: Partial<Pembayaran>): Pembayaran {
  bSeq += 1;
  return {
    id: `BYR-${bSeq}`,
    edisi_id: 'EDS-1',
    kode_bayar: `QRB-1447-${bSeq}`,
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
 * Edisi 1447H gaya arsip:
 *   Peserta: BELI Sapi (5jt), BELI Kambing (3.5jt), BAWA (0.25jt) → 8.75jt.
 *   Hewan: Sapi BELI aktif 22.75jt, Kambing BELI aktif 3jt → biaya 25.75jt.
 *   Pembayaran: 3 LUNAS (8.75jt) + 1 BELUM_BAYAR; semua skm_transaksi_id kosong.
 */
function archiveDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1447 H', tanggal_idul_adha: '2026-05-27' })),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', tipe_qurban: 'BELI', hewan_id: 'HWN-SAPI', harga_disepakati: 5_000_000 }),
      makePeserta({ id: 'PST-2', tipe_qurban: 'BELI', hewan_id: 'HWN-KAMBING', harga_disepakati: 3_500_000 }),
      makePeserta({ id: 'PST-3', tipe_qurban: 'BAWA_SENDIRI', hewan_id: 'HWN-BAWA', harga_disepakati: 250_000 })
    ),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'HWN-SAPI', jenis: 'SAPI', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 22_750_000 }),
      makeHewan({ id: 'HWN-KAMBING', jenis: 'KAMBING', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 3_000_000 }),
      makeHewan({ id: 'HWN-BAWA', jenis: 'SAPI', tipe_pembelian: 'BAWA_SENDIRI', status: 'AKTIF', harga_beli_aktual: 0 })
    ),
    'qurban_pembayaran': pembayaranRows(
      pay({ status: 'LUNAS', nominal_total: 5_000_000 }),
      pay({ status: 'LUNAS', nominal_total: 3_500_000 }),
      pay({ status: 'LUNAS', nominal_total: 250_000 }),
      pay({ status: 'BELUM_BAYAR', nominal_total: 9_999_999 })
    ),
  };
}

test('LP4: default edisi AKTIF — dana/kategori/biaya/saldo/korelasi (semua role)', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.BENDAHARA));
  const { status, body } = await read(res);

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const d = body.data as unknown as LaporanKeuanganDTO;

  assert.equal(d.edisi.id, 'EDS-1');
  assert.equal(d.mode, 'arsip');

  assert.equal(d.dana_terhimpun.total, 8_750_000);
  assert.equal(d.dana_terhimpun.jumlah_pembayaran_lunas, 3);
  assert.deepEqual(d.dana_terhimpun.per_kategori.map((k) => [k.key, k.peserta, k.nominal]), [
    ['QURBAN_SAPI', 1, 5_000_000],
    ['QURBAN_KAMBING', 1, 3_500_000],
    ['JASA_TITIP', 1, 250_000],
  ]);

  assert.equal(d.biaya_pengadaan.total, 25_750_000);
  assert.equal(d.biaya_pengadaan.sapi, 22_750_000);
  assert.equal(d.biaya_pengadaan.kambing, 3_000_000);

  assert.equal(d.saldo_qurban, 8_750_000 - 25_750_000);

  assert.equal(d.korelasi_ledger.status, 'N/A');
  assert.equal(d.korelasi_ledger.pembayaran_total, 4);
  assert.equal(d.korelasi_ledger.pembayaran_tertaut, 0);

  assert.equal(typeof body.meta?.generated_at, 'string');
});

test('LP4: override ?edisi_id= eksplisit', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.SUPER_ADMIN, 'EDS-1'));
  const { status, body } = await read(res);
  assert.equal(status, 200);
  assert.equal((body.data as unknown as LaporanKeuanganDTO).edisi.id, 'EDS-1');
});

test('LP4: edisi_id tak dikenal → 404', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.SUPER_ADMIN, 'EDS-404'));
  const { status, body } = await read(res);
  assert.equal(status, 404);
  assert.equal(body.ok, false);
});

test('LP4: panitia (PENDAFTARAN) menolak edisi non-AKTIF → 403', async () => {
  const db = archiveDb();
  db[SHEETS.EDISI] = edisiRows(makeEdisi({ id: 'EDS-1', status: 'SELESAI' }));
  installMockSheets(db);
  const res = await GET(await makeReq(PERAN.PENDAFTARAN, 'EDS-1'));
  const { status } = await read(res);
  assert.equal(status, 403);
});

test('LP4: tanpa sesi → 401', async () => {
  installMockSheets(archiveDb());
  const url = new URL('http://localhost/api/qurban/laporan/keuangan');
  const res = await GET(new NextRequest(url, { method: 'GET' }));
  const { status } = await read(res);
  assert.equal(status, 401);
});
