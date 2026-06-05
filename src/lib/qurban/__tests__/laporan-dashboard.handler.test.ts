import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/qurban/laporan/dashboard/route';

import { PERAN } from '@/lib/api/permissions';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  type SessionPayload,
} from '@/lib/api/auth';
import { mapPembayaranToRow, type Pembayaran } from '@/lib/qurban/pembayaran-repo';
import { mapDaftarHewanToRow } from '@/lib/qurban/daftar-hewan-repo';
import { SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';
import type { DashboardDTO } from '@/lib/qurban/laporan-dashboard';

/**
 * F5a `mapDaftarHewanToRow` SENGAJA tidak pernah menulis kolom
 * `nomor_urut_pemotongan` (milik F7; diisi langsung oleh impor F9 di
 * produksi). `hewanRows` dari harness karenanya selalu mengosongkan kolom itu
 * — untuk menguji `ter_assign` kita tulis kolom tersebut langsung di sel,
 * meniru data hasil impor 1447H.
 */
const COL_PEMOTONGAN = SHEET_HEADERS[QURBAN_SHEETS.DAFTAR_HEWAN].indexOf(
  'nomor_urut_pemotongan'
);
function hewanRowsWithPemotongan(...hewan: QurbanDaftarHewan[]): (string | number)[][] {
  return hewan.map((h) => {
    const cells = mapDaftarHewanToRow(h);
    if (h.nomor_urut_pemotongan != null && COL_PEMOTONGAN >= 0) {
      cells[COL_PEMOTONGAN] = h.nomor_urut_pemotongan;
    }
    return cells;
  });
}

import {
  installMockSheets,
  resetMockSheets,
  edisiRows,
  pesertaRows,
  makeEdisi,
  makePeserta,
  makeHewan,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * LP5 handler — GET /api/qurban/laporan/dashboard. Verifikasi: role-gate (semua
 * peran login), resolusi edisi default-AKTIF + override `?edisi_id=`, agregasi
 * end-to-end terhadap canned sheet, gate panitia (non-AKTIF → 403), dan
 * aktivitas terakhir dari audit_log.
 */

afterEach(() => resetMockSheets());

async function makeReq(peran: string, edisiId?: string): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f8a';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  const url = new URL('http://localhost/api/qurban/laporan/dashboard');
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

/** audit_log row: id|timestamp|aksi|entitas|entitas_id|detail|user_info|user_id|ip_address */
function auditRow(
  id: string,
  timestamp: string,
  entitas: string,
  entitasId: string,
  detail: object
): string[] {
  return [id, timestamp, 'CREATE', entitas, entitasId, JSON.stringify(detail), 'Admin', 'ANG-1', '127.0.0.1'];
}

/** Edisi 1447H gaya arsip: Idul Adha lewat + pembayaran IMPORT_1447H. */
function archiveDb(): SheetDb {
  const edisi = makeEdisi({ id: 'EDS-1', tahun_hijriah: '1447 H', tanggal_idul_adha: '2026-05-27' });
  return {
    [SHEETS.EDISI]: edisiRows(edisi),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', tipe_qurban: 'BELI', harga_disepakati: 1_500_000, status_pendaftaran: 'TERDAFTAR' }),
      makePeserta({ id: 'PST-2', tipe_qurban: 'BAWA_SENDIRI', harga_disepakati: 1_000_000, status_pendaftaran: 'TERDAFTAR' }),
      makePeserta({ id: 'PST-3', tipe_qurban: 'BELI', harga_disepakati: 9_999_999, status_pendaftaran: 'BATAL' })
    ),
    [SHEETS.DAFTAR_HEWAN]: hewanRowsWithPemotongan(
      makeHewan({ id: 'HWN-1', jenis: 'SAPI', status: 'AKTIF', tipe_pembelian: 'BELI', nomor_urut_pemotongan: 1 }),
      makeHewan({ id: 'HWN-2', jenis: 'KAMBING', kelas: 'B', status: 'BATAL', tipe_pembelian: 'BELI', nomor_urut_pemotongan: null })
    ),
    'qurban_pembayaran': pembayaranRows(
      pay({ id: 'BYR-1', kode_bayar: 'QRB-1447-001', status: 'LUNAS', nominal_total: 1_500_000 }),
      pay({ id: 'BYR-2', kode_bayar: 'QRB-1447-002', status: 'LUNAS', nominal_total: 1_000_000 })
    ),
    [SHEETS.AUDIT_LOG]: [
      auditRow('LOG-1', '2026-05-01T01:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.created', after: { edisi_id: 'EDS-1' } }),
      auditRow('LOG-2', '2026-05-01T05:00:00.000Z', 'pembayaran', 'BYR-1', { event_type: 'pembayaran.lunas', after: { edisi_id: 'EDS-1' } }),
      auditRow('LOG-3', '2026-05-01T03:00:00.000Z', 'transaksi', 'TRX-1', { event_type: 'transaksi.created' }),
    ],
  };
}

test('LP5: default edisi AKTIF — agregasi 1447H benar (semua role login)', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.ADMIN_QURBAN));
  const { status, body } = await read(res);

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const d = body.data as unknown as DashboardDTO;

  assert.equal(d.edisi.id, 'EDS-1');
  assert.equal(d.edisi.is_arsip, true);
  assert.equal(d.edisi.fase, 'finalisasi');

  // 2 terdaftar (1 BELI / 1 BAWA), PST-3 batal dibuang.
  assert.equal(d.kartu.peserta.total, 2);
  assert.equal(d.kartu.peserta.beli, 1);
  assert.equal(d.kartu.peserta.bawa_sendiri, 1);
  assert.equal(d.kartu.peserta.trend, null);

  // Dana LUNAS = 2.5jt; nilai pendaftaran aktif = 2.5jt → 100%.
  assert.equal(d.kartu.dana_terhimpun.nominal, 2_500_000);
  assert.equal(d.kartu.dana_terhimpun.jumlah_pembayaran, 2);
  assert.equal(d.kartu.dana_terhimpun.persen_lunas, 100);

  // Hewan: total 2, aktif 1, batal 1; sapi 1 / kambing 1; tanpa terpotong.
  assert.equal(d.kartu.hewan.total, 2);
  assert.equal(d.kartu.hewan.aktif, 1);
  assert.equal(d.kartu.hewan.batal, 1);
  assert.equal(d.kartu.hewan.terpotong_tersedia, false);
  assert.equal(d.kartu.hewan.siap_metric, 'aktif');

  // Operasional & F7 placeholder.
  assert.equal(d.operasional.urutan_pemotongan.ter_assign, 1);
  assert.equal(d.operasional.urutan_pemotongan.total_aktif, 1);
  assert.equal(d.operasional.distribusi_tersedia, false);

  // Aktivitas: transaksi (non-qurban) dibuang, urut terbaru dulu.
  assert.equal(d.aktivitas_terakhir.length, 2);
  assert.equal(d.aktivitas_terakhir[0].label, 'Pembayaran LUNAS');

  // meta.generated_at hadir.
  assert.equal(typeof body.meta?.generated_at, 'string');
});

test('LP5: override ?edisi_id= eksplisit', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.BENDAHARA, 'EDS-1'));
  const { status, body } = await read(res);
  assert.equal(status, 200);
  assert.equal((body.data as unknown as DashboardDTO).edisi.id, 'EDS-1');
});

test('LP5: edisi_id tak dikenal → 404', async () => {
  installMockSheets(archiveDb());
  const res = await GET(await makeReq(PERAN.SUPER_ADMIN, 'EDS-404'));
  const { status, body } = await read(res);
  assert.equal(status, 404);
  assert.equal(body.ok, false);
});

test('LP5: panitia (PENDAFTARAN) menolak edisi non-AKTIF → 403', async () => {
  const db = archiveDb();
  db[SHEETS.EDISI] = edisiRows(makeEdisi({ id: 'EDS-1', status: 'SELESAI' }));
  installMockSheets(db);
  const res = await GET(await makeReq(PERAN.PENDAFTARAN, 'EDS-1'));
  const { status } = await read(res);
  assert.equal(status, 403);
});

test('LP5: tanpa sesi → 401', async () => {
  installMockSheets(archiveDb());
  const url = new URL('http://localhost/api/qurban/laporan/dashboard');
  const res = await GET(new NextRequest(url, { method: 'GET' }));
  const { status } = await read(res);
  assert.equal(status, 401);
});
