import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/qurban/laporan/peserta/route';

import { PERAN } from '@/lib/api/permissions';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  type SessionPayload,
} from '@/lib/api/auth';
import { mapPembayaranToRow, type Pembayaran } from '@/lib/qurban/pembayaran-repo';
import type { LaporanPesertaDTO } from '@/lib/qurban/laporan-peserta';

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
 * LP1 handler — GET /api/qurban/laporan/peserta. Verifikasi: role-gate,
 * resolusi edisi default-AKTIF + override, agregasi tiga grouping end-to-end,
 * gate panitia (non-AKTIF → 403), dan 401 tanpa sesi.
 */

afterEach(() => resetMockSheets());

async function makeReq(peran: string, edisiId?: string): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f8b';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  const url = new URL('http://localhost/api/qurban/laporan/peserta');
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
 *   - 4 peserta TERDAFTAR (3 BELI / 1 BAWA), 1 BATAL (dibuang).
 *   - Hewan: 2 Sapi A, 1 Kambing B.
 *   - Muqorib: RT04 (2 muqorib), RT01 (1), Lainnya (rt kosong).
 */
function archiveDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1447 H', tanggal_idul_adha: '2026-05-27' })),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', muqorib_id: 'MQR-A', hewan_id: 'HWN-SA', tipe_qurban: 'BELI' }),
      makePeserta({ id: 'PST-2', muqorib_id: 'MQR-A', hewan_id: 'HWN-SA', tipe_qurban: 'BELI' }),
      makePeserta({ id: 'PST-3', muqorib_id: 'MQR-B', hewan_id: 'HWN-KB', tipe_qurban: 'BELI' }),
      makePeserta({ id: 'PST-4', muqorib_id: 'MQR-C', hewan_id: 'HWN-SA2', tipe_qurban: 'BAWA_SENDIRI' }),
      makePeserta({ id: 'PST-5', muqorib_id: 'MQR-A', hewan_id: 'HWN-SA', tipe_qurban: 'BELI', status_pendaftaran: 'BATAL' })
    ),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'HWN-SA', jenis: 'SAPI', kelas: 'A' }),
      makeHewan({ id: 'HWN-SA2', jenis: 'SAPI', kelas: 'A' }),
      makeHewan({ id: 'HWN-KB', jenis: 'KAMBING', kelas: 'B' })
    ),
    [SHEETS.MUQORIB]: muqoribRows(
      makeMuqorib({ id: 'MQR-A', rt: '4.0' }),
      makeMuqorib({ id: 'MQR-B', rt: '04' }),
      makeMuqorib({ id: 'MQR-C', rt: '' })
    ),
    'qurban_pembayaran': pembayaranRows(pay({ id: 'BYR-1', status: 'LUNAS' })),
  };
}

test('LP1: default edisi AKTIF — tiga grouping benar (semua role)', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.DISTRIBUSI));
  const { status, body } = await read(res);

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const d = body.data as unknown as LaporanPesertaDTO;

  assert.equal(d.edisi.id, 'EDS-1');
  assert.equal(d.edisi.is_arsip, true);
  assert.equal(d.total_peserta, 4);
  assert.equal(d.peserta_batal, 1);

  // Tipe: 3 BELI / 1 BAWA.
  assert.deepEqual(d.groupings.tipe.map((t) => [t.key, t.peserta]), [
    ['BELI', 3],
    ['BAWA_SENDIRI', 1],
  ]);

  // Jenis–Kelas: Sapi A 3 (PST-1,2 via HWN-SA + PST-4 via HWN-SA2), Kambing B 1.
  assert.deepEqual(d.groupings.jenis_kelas.map((g) => [g.label, g.peserta]), [
    ['Sapi A', 3],
    ['Kambing B', 1],
  ]);

  // RT: 04 = MQR-A(2 peserta) + MQR-B(1) = 3 peserta / 2 muqorib; Lainnya = MQR-C 1/1.
  assert.deepEqual(d.groupings.rt.map((r) => [r.rt, r.peserta, r.muqorib]), [
    ['04', 3, 2],
    ['LAINNYA', 1, 1],
  ]);

  assert.equal(typeof body.meta?.generated_at, 'string');
});

test('LP1: override ?edisi_id= eksplisit', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.BENDAHARA, 'EDS-1'));
  const { status, body } = await read(res);
  assert.equal(status, 200);
  assert.equal((body.data as unknown as LaporanPesertaDTO).edisi.id, 'EDS-1');
});

test('LP1: edisi_id tak dikenal → 404', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.SUPER_ADMIN, 'EDS-404'));
  const { status, body } = await read(res);
  assert.equal(status, 404);
  assert.equal(body.ok, false);
});

test('LP1: panitia (PENDAFTARAN) menolak edisi non-AKTIF → 403', async () => {
  const db = archiveDb();
  db[SHEETS.EDISI] = edisiRows(makeEdisi({ id: 'EDS-1', status: 'SELESAI' }));
  installMockSheets(db);
  const res = await GET(await makeReq(PERAN.PENDAFTARAN, 'EDS-1'));
  const { status } = await read(res);
  assert.equal(status, 403);
});

test('LP1: tanpa sesi → 401', async () => {
  installMockSheets(archiveDb());
  const url = new URL('http://localhost/api/qurban/laporan/peserta');
  const res = await GET(new NextRequest(url, { method: 'GET' }));
  const { status } = await read(res);
  assert.equal(status, 401);
});
