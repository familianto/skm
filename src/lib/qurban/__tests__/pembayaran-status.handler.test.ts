import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { POST as TERIMA } from '@/app/api/qurban/pembayaran/[id]/terima-panitia/route';
import { POST as LUNASKAN } from '@/app/api/qurban/pembayaran/[id]/lunaskan/route';
import { GET as LIST } from '@/app/api/qurban/pembayaran/route';
import { POST as CANCEL } from '@/app/api/qurban/peserta/[id]/cancel/route';

import { PERAN } from '@/lib/api/permissions';
import { SESSION_COOKIE_NAME, createSessionToken, type SessionPayload } from '@/lib/api/auth';
import { SHEET_NAMES } from '@/lib/constants';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import { konfigurasiToRow, type Konfigurasi } from '@/lib/qurban/konfigurasi-repo';
import { mapPembayaranToRow, type Pembayaran } from '@/lib/qurban/pembayaran-repo';

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
 * F6 Milestone B — handler-level integration tests untuk transisi status TUNAI
 * (PY2/PY3 Model A), list (PY4), dan kaskade recompute cancel (B-6). Mock
 * googleapis client via `__testing__` (pola repo yang sudah ada).
 */

afterEach(() => resetMockSheets());

async function makeReq(
  method: 'GET' | 'POST',
  path: string,
  peran: string,
  body?: unknown
): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f6b';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new NextRequest(`http://localhost${path}`, init);
}

async function read(res: Response): Promise<{ status: number; body: { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> }; meta?: Record<string, unknown> } }> {
  return { status: res.status, body: await res.json() };
}

function makePembayaran(over: Partial<Pembayaran> = {}): Pembayaran {
  return {
    id: 'BYR-20260531-0001',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-2026-001',
    muqorib_id: 'MQR-1',
    nominal_total: 2_000_000,
    nominal_transfer: 2_000_003,
    metode: 'TUNAI',
    status: 'TERIMA_PANITIA',
    tanggal_terima_panitia: '2026-05-30T00:00:00.000Z',
    panitia_terima_id: 'ANG-2',
    tanggal_lunas: '',
    bank_ref: '',
    skm_transaksi_id: '',
    bukti_url: '',
    match_metadata: '',
    notes: '',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: 'ANG-1',
    ...over,
  };
}

function makeKonfig(over: Partial<Konfigurasi> = {}): Konfigurasi {
  return {
    id: 'KFG-1', edisi_id: 'EDS-1', bop_per_ekor_sapi: 0, bop_per_ekor_kambing: 0,
    target_bungkus_total: 0, berat_target_per_bungkus: 0, tanggal_distribusi_mulai: '',
    tanggal_distribusi_selesai: '', payment_suffix: 3, wa_send_on_pendaftaran: false,
    wa_send_on_pembayaran_confirmed: false, notes: '', created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z', created_by: 'ANG-1', ...over,
  };
}

function kategoriRow(id: string, nama: string, jenis: string): string[] {
  return [id, nama, jenis, '', 'TRUE', '2026-01-01'];
}
function rekeningRow(id: string, nama_bank: string): string[] {
  return [id, nama_bank, '123', 'Masjid', '0', 'TRUE', '2026-01-01', '2026-01-01'];
}

/** Pembayaran TUNAI TERIMA_PANITIA siap dilunaskan; 2 slot Sapi BELI @1jt. */
function lunasDb(payOver: Partial<Pembayaran> = {}): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1448H', status: 'AKTIF' })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(makeHewan({ id: 'HWN-1', jenis: 'SAPI', tipe_pembelian: 'BELI' })),
    [SHEETS.MUQORIB]: muqoribRows(makeMuqorib({ id: 'MQR-1', nama_lengkap: 'Fulan' })),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', hewan_id: 'HWN-1', slot_number: 1, kode_bayar: 'QRB-2026-001', tipe_qurban: 'BELI', harga_disepakati: 1_000_000 }),
      makePeserta({ id: 'PST-2', hewan_id: 'HWN-1', slot_number: 2, kode_bayar: 'QRB-2026-001', tipe_qurban: 'BELI', harga_disepakati: 1_000_000 })
    ),
    [QURBAN_SHEETS.PEMBAYARAN]: [mapPembayaranToRow(makePembayaran(payOver))],
    [QURBAN_SHEETS.KONFIGURASI_EDISI]: [konfigurasiToRow(makeKonfig())],
    [SHEET_NAMES.KATEGORI]: [kategoriRow('KAT-SAPI', 'Qurban Sapi', 'MASUK'), kategoriRow('KAT-KMB', 'Qurban Kambing', 'MASUK')],
    [SHEET_NAMES.REKENING_BANK]: [rekeningRow('REK-1', 'Bank Muamalat Indonesia'), rekeningRow('REK-2', 'Kas Tunai')],
    [SHEET_NAMES.TRANSAKSI]: [],
  };
}

// ── PY2 ──────────────────────────────────────────────────────────────────────

test('PY2: TUNAI BELUM_BAYAR → 200 TERIMA_PANITIA + update', async () => {
  const cap = installMockSheets(lunasDb({ status: 'BELUM_BAYAR', panitia_terima_id: '', tanggal_terima_panitia: '' }));
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/terima-panitia?edisi_id=EDS-1', PERAN.PENDAFTARAN, {
    panitia_terima_id: 'ANG-9',
    tanggal_terima_panitia: '2026-05-31T01:00:00.000Z',
  });
  const { status, body } = await read(await TERIMA(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data!.status, 'TERIMA_PANITIA');
  const upd = cap.updates.find((u) => u.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.ok(upd, 'ada update pembayaran');
  assert.equal(upd!.values[0][7], 'TERIMA_PANITIA'); // kolom status
  assert.equal(upd!.values[0][9], 'ANG-9'); // panitia_terima_id
});

test('PY2: tolak bila bukan BELUM_BAYAR (409)', async () => {
  installMockSheets(lunasDb({ status: 'TERIMA_PANITIA' }));
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/terima-panitia?edisi_id=EDS-1', PERAN.PENDAFTARAN, {
    panitia_terima_id: 'ANG-9',
  });
  const { status } = await read(await TERIMA(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 409);
});

test('PY2: tolak metode TRANSFER (409)', async () => {
  installMockSheets(lunasDb({ status: 'BELUM_BAYAR', metode: 'TRANSFER' }));
  // C-0: BD bukan peran PY2; pakai ADMIN_QURBAN agar lolos guard → kena gate metode.
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/terima-panitia?edisi_id=EDS-1', PERAN.ADMIN_QURBAN, {
    panitia_terima_id: 'ANG-9',
  });
  const { status } = await read(await TERIMA(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 409);
});

// ── PY3 ──────────────────────────────────────────────────────────────────────

test('PY3: TERIMA_PANITIA → 200 LUNAS, transaksi jumlah=nominal_total (BUKAN +suffix), kategori per-tipe, link', async () => {
  const cap = installMockSheets(lunasDb());
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/lunaskan?edisi_id=EDS-1', PERAN.BENDAHARA, {
    tanggal_lunas: '2026-05-31T02:00:00.000Z',
  });
  const { status, body } = await read(await LUNASKAN(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data!.status, 'LUNAS');

  // Transaksi dibuat: MASUK, jumlah = 2.000.000 (BULAT), kategori Sapi, rekening Kas Tunai.
  const trx = cap.appends.find((a) => a.range.startsWith(`${SHEET_NAMES.TRANSAKSI}!`));
  assert.ok(trx, 'ada transaksi dibuat');
  assert.equal(trx!.values[0][2], 'MASUK');
  assert.equal(trx!.values[0][3], 'KAT-SAPI');
  assert.equal(trx!.values[0][5], '2000000'); // nominal_total, TANPA suffix
  assert.equal(trx!.values[0][6], 'REK-2');
  assert.equal(trx!.values[0][1], '2026-05-31'); // ISO-Z → YYYY-MM-DD

  // Pembayaran ter-update LUNAS + skm_transaksi_id.
  const upd = cap.updates.find((u) => u.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.ok(upd, 'ada update pembayaran');
  assert.equal(upd!.values[0][7], 'LUNAS');
  assert.match(String(upd!.values[0][12]), /^TRX-/); // skm_transaksi_id
  assert.equal(body.data!.skm_transaksi_id, upd!.values[0][12]);
});

test('PY3: idempotensi — tolak bila skm_transaksi_id sudah terisi (409), TIDAK buat transaksi', async () => {
  const cap = installMockSheets(lunasDb({ skm_transaksi_id: 'TRX-20260531-0001' }));
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/lunaskan?edisi_id=EDS-1', PERAN.BENDAHARA, {});
  const { status } = await read(await LUNASKAN(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 409);
  assert.equal(cap.appends.filter((a) => a.range.startsWith(`${SHEET_NAMES.TRANSAKSI}!`)).length, 0);
});

test('PY3: tolak bila status bukan TERIMA_PANITIA (409)', async () => {
  installMockSheets(lunasDb({ status: 'BELUM_BAYAR' }));
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/lunaskan?edisi_id=EDS-1', PERAN.BENDAHARA, {});
  const { status } = await read(await LUNASKAN(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 409);
});

test('PY3: peran PENDAFTARAN ditolak (403)', async () => {
  installMockSheets(lunasDb());
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-20260531-0001/lunaskan?edisi_id=EDS-1', PERAN.PENDAFTARAN, {});
  const { status } = await read(await LUNASKAN(req, { params: Promise.resolve({ id: 'BYR-20260531-0001' }) }));
  assert.equal(status, 403);
});

// ── PY4 ──────────────────────────────────────────────────────────────────────

test('PY4: list + filter metode + enrichment', async () => {
  installMockSheets(lunasDb({ status: 'LUNAS' }));
  const req = await makeReq('GET', '/api/qurban/pembayaran?edisi_id=EDS-1&metode=TUNAI', PERAN.BENDAHARA); // C-0: DISTRIBUSI bukan peran PY4
  const { status, body } = await read(await LIST(req));
  assert.equal(status, 200, JSON.stringify(body));
  const items = body.data as unknown as Array<Record<string, unknown>>;
  assert.equal(items.length, 1);
  assert.equal(items[0].muqorib_nama, 'Fulan');
  assert.equal(items[0].jumlah_slot, 2);

  const empty = await makeReq('GET', '/api/qurban/pembayaran?edisi_id=EDS-1&metode=TRANSFER', PERAN.BENDAHARA); // C-0: DISTRIBUSI bukan peran PY4
  const r2 = await read(await LIST(empty));
  assert.equal((r2.body.data as unknown as unknown[]).length, 0);
});

// ── B-6 kaskade recompute ────────────────────────────────────────────────────

test('B-6: cancel 1 dari 2 slot → pembayaran BELUM_BAYAR di-recompute (1jt + suffix)', async () => {
  const cap = installMockSheets(lunasDb({ status: 'BELUM_BAYAR', panitia_terima_id: '', tanggal_terima_panitia: '' }));
  const req = await makeReq('POST', '/api/qurban/peserta/PST-1/cancel?edisi_id=EDS-1', PERAN.ADMIN_QURBAN, { alasan: 'uji' });
  const { status, body } = await read(await CANCEL(req, { params: Promise.resolve({ id: 'PST-1' }) }));
  assert.equal(status, 200, JSON.stringify(body));

  const payUpd = cap.updates.find((u) => u.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.ok(payUpd, 'pembayaran di-recompute');
  assert.equal(payUpd!.values[0][4], '1000000'); // nominal_total sisa 1 slot
  assert.equal(payUpd!.values[0][5], '1000003'); // nominal_transfer = total + suffix(3)
  assert.equal(payUpd!.values[0][7], 'BELUM_BAYAR'); // status tetap
});
