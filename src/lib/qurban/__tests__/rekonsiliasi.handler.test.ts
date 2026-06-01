import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { POST as REKON } from '@/app/api/qurban/pembayaran/rekonsiliasi/route';
import { POST as LINK } from '@/app/api/qurban/pembayaran/[id]/link-transaksi/route';
import { POST as TERIMA } from '@/app/api/qurban/pembayaran/[id]/terima-panitia/route';
import { GET as LIST } from '@/app/api/qurban/pembayaran/route';

import { PERAN } from '@/lib/api/permissions';
import { SESSION_COOKIE_NAME, createSessionToken, type SessionPayload } from '@/lib/api/auth';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import { mapPembayaranToRow, type Pembayaran } from '@/lib/qurban/pembayaran-repo';
import { konfigurasiToRow, type Konfigurasi } from '@/lib/qurban/konfigurasi-repo';

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
 * F6 Milestone C — handler integration: pass rekonsiliasi (Layer 1 auto),
 * link manual (PY6), koreksi kategori transaksi, campur-tipe, dan peran C-0.
 */

afterEach(() => resetMockSheets());

async function makeReq(method: 'GET' | 'POST', path: string, peran: string, body?: unknown): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) process.env.SESSION_SECRET = 'test-secret-f6c';
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
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string }; meta?: Record<string, unknown> } };
}

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-X', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-000', muqorib_id: 'MQR-1',
    nominal_total: 1_500_000, nominal_transfer: 1_500_003, metode: 'TRANSFER', status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '', bank_ref: '',
    skm_transaksi_id: '', bukti_url: '', match_metadata: '', notes: '',
    created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', created_by: 'ANG-1', ...over,
  };
}

function kategoriRow(id: string, nama: string): string[] {
  return [id, nama, 'MASUK', '', 'TRUE', '2026-01-01'];
}
function rekeningRow(id: string, nama_bank: string): string[] {
  return [id, nama_bank, '123', 'Masjid', '0', 'TRUE', '2026-01-01', '2026-01-01'];
}
/** Baris transaksi 17-kolom (layout SHEET_HEADERS.transaksi). */
function trxRow(o: { id: string; tanggal: string; kategori_id: string; deskripsi: string; jumlah: number; rekening_id: string; bank_ref: string; jenis?: string; status?: string }): string[] {
  const h = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const row = new Array(h.length).fill('');
  row[h.indexOf('id')] = o.id;
  row[h.indexOf('tanggal')] = o.tanggal;
  row[h.indexOf('jenis')] = o.jenis ?? 'MASUK';
  row[h.indexOf('kategori_id')] = o.kategori_id;
  row[h.indexOf('deskripsi')] = o.deskripsi;
  row[h.indexOf('jumlah')] = String(o.jumlah);
  row[h.indexOf('rekening_id')] = o.rekening_id;
  row[h.indexOf('status')] = o.status ?? 'AKTIF';
  row[h.indexOf('bank_ref')] = o.bank_ref;
  return row;
}

const TRX_I = (h: string) => SHEET_HEADERS[SHEET_NAMES.TRANSAKSI].indexOf(h);

function makeKonfig(over: Partial<Konfigurasi> = {}): Konfigurasi {
  return {
    id: 'KFG-1', edisi_id: 'EDS-1', bop_per_ekor_sapi: 0, bop_per_ekor_kambing: 0,
    target_bungkus_total: 0, berat_target_per_bungkus: 0, tanggal_distribusi_mulai: '',
    tanggal_distribusi_selesai: '', payment_suffix: 3, wa_send_on_pendaftaran: false,
    wa_send_on_pembayaran_confirmed: false, notes: '', created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z', created_by: 'ANG-1', ...over,
  };
}

/** Edisi + master data; pembayaran/transaksi diisi per-test. */
function baseDb(over: { pembayaran: Pembayaran[]; transaksi: string[][] }): SheetDb {
  return {
    [QURBAN_SHEETS.KONFIGURASI_EDISI]: [konfigurasiToRow(makeKonfig())],
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1448H', status: 'AKTIF' })),
    [SHEETS.MUQORIB]: muqoribRows(makeMuqorib({ id: 'MQR-1', nama_lengkap: 'Fulan' })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'HSAPI', jenis: 'SAPI', tipe_pembelian: 'BELI' }),
      makeHewan({ id: 'HKMB', jenis: 'KAMBING', tipe_pembelian: 'BELI' })
    ),
    [SHEETS.PESERTA]: pesertaRows(
      // QRB-1448-001 = 1 slot KAMBING (kategori benar: Qurban Kambing)
      makePeserta({ id: 'PST-1', kode_bayar: 'QRB-1448-001', hewan_id: 'HKMB', tipe_qurban: 'BELI', harga_disepakati: 1_500_000 }),
      // QRB-1448-009 = campur (KAMBING + SAPI)
      makePeserta({ id: 'PST-9a', kode_bayar: 'QRB-1448-009', hewan_id: 'HKMB', tipe_qurban: 'BELI', harga_disepakati: 1_000_000 }),
      makePeserta({ id: 'PST-9b', kode_bayar: 'QRB-1448-009', hewan_id: 'HSAPI', tipe_qurban: 'BELI', harga_disepakati: 1_000_000 })
    ),
    [QURBAN_SHEETS.PEMBAYARAN]: over.pembayaran.map(mapPembayaranToRow) as string[][],
    [SHEET_NAMES.KATEGORI]: [kategoriRow('KAT-SAPI', 'Qurban Sapi'), kategoriRow('KAT-KMB', 'Qurban Kambing')],
    [SHEET_NAMES.REKENING_BANK]: [rekeningRow('REK-1', 'Bank Dummy Syariah'), rekeningRow('REK-2', 'Kas Tunai')],
    [SHEET_NAMES.TRANSAKSI]: over.transaksi,
  };
}

// ── Pass rekonsiliasi ────────────────────────────────────────────────────────

test('REKON: AUTO-match Layer 1 → LUNAS + koreksi kategori (Sapi→Kambing); anomali & unmatched dilaporkan', async () => {
  const cap = installMockSheets(
    baseDb({
      pembayaran: [
        pay({ id: 'BYR-1', kode_bayar: 'QRB-1448-001', metode: 'TRANSFER', status: 'BELUM_BAYAR', nominal_total: 1_500_000, nominal_transfer: 1_500_003 }),
        pay({ id: 'BYR-2', kode_bayar: 'QRB-1448-002', metode: 'TRANSFER', status: 'BELUM_BAYAR', nominal_transfer: 2_000_003 }),
        pay({ id: 'BYR-3', kode_bayar: 'QRB-1448-003', metode: 'TUNAI', status: 'BELUM_BAYAR', nominal_transfer: 500_000 }),
        pay({ id: 'BYR-4', kode_bayar: 'QRB-1448-004', metode: 'TRANSFER', status: 'LUNAS', nominal_transfer: 700_000, skm_transaksi_id: 'TRX-OLD' }),
      ],
      transaksi: [
        // import meng-auto-kategorikan SEMUA "QRB" → Qurban Sapi (KAT-SAPI). Untuk
        // QRB-1448-001 (kambing) ini SALAH → harus dikoreksi ke KAT-KMB.
        trxRow({ id: 'TRX-1', tanggal: '2026-05-20', kategori_id: 'KAT-SAPI', deskripsi: 'TRF QRB-1448-001 Fulan', jumlah: 1_500_003, rekening_id: 'REK-1', bank_ref: 'REF1' }),
        trxRow({ id: 'TRX-2', tanggal: '2026-05-20', kategori_id: 'KAT-SAPI', deskripsi: 'QRB-1448-002', jumlah: 2_000_000, rekening_id: 'REK-1', bank_ref: 'REF2' }), // nominal beda
        trxRow({ id: 'TRX-3', tanggal: '2026-05-20', kategori_id: 'KAT-SAPI', deskripsi: 'QRB-1448-003', jumlah: 500_000, rekening_id: 'REK-1', bank_ref: 'REF3' }), // metode TUNAI
        trxRow({ id: 'TRX-4', tanggal: '2026-05-20', kategori_id: 'KAT-SAPI', deskripsi: 'QRB-1448-004', jumlah: 700_000, rekening_id: 'REK-1', bank_ref: 'REF4' }), // sudah LUNAS
        trxRow({ id: 'TRX-5', tanggal: '2026-05-20', kategori_id: 'KAT-SAPI', deskripsi: 'Infaq jumat', jumlah: 5_000_000, rekening_id: 'REK-1', bank_ref: 'REF5' }), // unmatched (dalam band, tanpa kode/skor)
        trxRow({ id: 'TRX-6', tanggal: '2026-05-20', kategori_id: 'KAT-SAPI', deskripsi: 'QRB-1448-001 lain bank', jumlah: 1_500_003, rekening_id: 'REK-2', bank_ref: 'REF6' }), // bukan Bank Muamalat → diabaikan
      ],
    })
  );

  const req = await makeReq('POST', '/api/qurban/pembayaran/rekonsiliasi?edisi_id=EDS-1', PERAN.BENDAHARA);
  const { status, body } = await read(await REKON(req));
  assert.equal(status, 200, JSON.stringify(body));
  const data = body.data as {
    auto_lunas: unknown[];
    suggestions: Array<{ transaksi: { id: string }; kandidat: Array<{ kode_bayar: string }> }>;
    anomali: Array<{ transaksi_id: string }>;
    unmatched: Array<{ transaksi_id: string }>;
  };

  assert.equal(data.auto_lunas.length, 1);
  const am = data.auto_lunas[0] as { transaksi_id: string; pembayaran_id: string; kode_bayar: string; kategori_corrected: boolean; mixed: boolean };
  assert.equal(am.transaksi_id, 'TRX-1');
  assert.equal(am.pembayaran_id, 'BYR-1');
  assert.equal(am.kode_bayar, 'QRB-1448-001');
  assert.equal(am.kategori_corrected, true);
  assert.equal(am.mixed, false);
  // TRX-2: kode cocok tapi nominal di luar {total, transfer} → suggestion_high (Q3).
  const sugg2 = data.suggestions.find((s) => s.transaksi.id === 'TRX-2');
  assert.ok(sugg2, 'TRX-2 jadi suggestion');
  assert.equal(sugg2!.kandidat[0].kode_bayar, 'QRB-1448-002');
  // TRX-3 (TUNAI) & TRX-4 (sudah LUNAS) → anomali.
  assert.deepEqual(data.anomali.map((a) => a.transaksi_id).sort(), ['TRX-3', 'TRX-4']);
  // TRX-5 "Infaq jumat" tak match & skor < 50 → unmatched.
  assert.deepEqual(data.unmatched.map((u) => u.transaksi_id), ['TRX-5']);

  // Koreksi kategori transaksi TRX-1 → KAT-KMB (update ke sheet transaksi).
  const trxUpd = cap.updates.find((u) => u.range.startsWith(`${SHEET_NAMES.TRANSAKSI}!`));
  assert.ok(trxUpd, 'ada koreksi kategori transaksi');
  assert.equal(trxUpd!.values[0][TRX_I('kategori_id')], 'KAT-KMB');

  // Pembayaran BYR-1 → LUNAS + link + bank_ref.
  const payUpd = cap.updates.find((u) => u.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.ok(payUpd, 'ada update pembayaran');
  assert.equal(payUpd!.values[0][7], 'LUNAS'); // status
  assert.equal(payUpd!.values[0][12], 'TRX-1'); // skm_transaksi_id
  assert.equal(payUpd!.values[0][11], 'REF1'); // bank_ref
  assert.equal(payUpd!.values[0][10], '2026-05-20T00:00:00.000Z'); // tanggal_lunas ISO-Z
});

test('REKON idempoten: transaksi yang sudah ter-link dilewati (tak ada match ulang)', async () => {
  const cap = installMockSheets(
    baseDb({
      pembayaran: [pay({ id: 'BYR-1', kode_bayar: 'QRB-1448-001', metode: 'TRANSFER', status: 'LUNAS', nominal_transfer: 1_500_003, skm_transaksi_id: 'TRX-1' })],
      transaksi: [trxRow({ id: 'TRX-1', tanggal: '2026-05-20', kategori_id: 'KAT-KMB', deskripsi: 'QRB-1448-001', jumlah: 1_500_003, rekening_id: 'REK-1', bank_ref: 'REF1' })],
    })
  );
  const req = await makeReq('POST', '/api/qurban/pembayaran/rekonsiliasi?edisi_id=EDS-1', PERAN.SUPER_ADMIN);
  const { status, body } = await read(await REKON(req));
  assert.equal(status, 200);
  const data = body.data as { auto_lunas: unknown[]; anomali: unknown[]; unmatched: unknown[] };
  assert.equal(data.auto_lunas.length, 0);
  assert.equal(data.anomali.length, 0);
  assert.equal(data.unmatched.length, 0);
  assert.equal(cap.updates.length, 0, 'tidak ada tulisan pada run idempoten');
});

// ── PY6 link manual ──────────────────────────────────────────────────────────

test('PY6: link manual nominal beda → LUNAS + warning + selisih di match_metadata', async () => {
  const cap = installMockSheets(
    baseDb({
      pembayaran: [pay({ id: 'BYR-1', kode_bayar: 'QRB-1448-001', metode: 'TRANSFER', status: 'BELUM_BAYAR', nominal_transfer: 1_500_003 })],
      transaksi: [trxRow({ id: 'TRX-9', tanggal: '2026-05-21', kategori_id: 'KAT-SAPI', deskripsi: 'transfer tanpa kode', jumlah: 1_500_000, rekening_id: 'REK-1', bank_ref: 'REF9' })],
    })
  );
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-1/link-transaksi?edisi_id=EDS-1', PERAN.BENDAHARA, { transaksi_id: 'TRX-9' });
  const { status, body } = await read(await LINK(req, { params: Promise.resolve({ id: 'BYR-1' }) }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data!.status, 'LUNAS');
  assert.ok(body.meta?.warning, 'ada warning selisih');
  const payUpd = cap.updates.find((u) => u.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.match(String(payUpd!.values[0][14]), /selisih/); // match_metadata kolom 14
});

test('PY6: campur-tipe → LUNAS tanpa koreksi kategori, flag mixed di match_metadata', async () => {
  const cap = installMockSheets(
    baseDb({
      pembayaran: [pay({ id: 'BYR-9', kode_bayar: 'QRB-1448-009', metode: 'TRANSFER', status: 'BELUM_BAYAR', nominal_transfer: 2_000_003 })],
      transaksi: [trxRow({ id: 'TRX-M', tanggal: '2026-05-22', kategori_id: 'KAT-SAPI', deskripsi: 'QRB-1448-009', jumlah: 2_000_003, rekening_id: 'REK-1', bank_ref: 'REFM' })],
    })
  );
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-9/link-transaksi?edisi_id=EDS-1', PERAN.SUPER_ADMIN, { transaksi_id: 'TRX-M' });
  const { status, body } = await read(await LINK(req, { params: Promise.resolve({ id: 'BYR-9' }) }));
  assert.equal(status, 200, JSON.stringify(body));
  // Tidak ada koreksi kategori transaksi (campur).
  assert.equal(cap.updates.filter((u) => u.range.startsWith(`${SHEET_NAMES.TRANSAKSI}!`)).length, 0);
  const payUpd = cap.updates.find((u) => u.range.startsWith(`${QURBAN_SHEETS.PEMBAYARAN}!`));
  assert.equal(payUpd!.values[0][7], 'LUNAS');
  assert.match(String(payUpd!.values[0][14]), /mixed/);
});

test('PY6: tolak bila transaksi sudah ter-link ke pembayaran lain (409)', async () => {
  installMockSheets(
    baseDb({
      pembayaran: [
        pay({ id: 'BYR-1', kode_bayar: 'QRB-1448-001', metode: 'TRANSFER', status: 'BELUM_BAYAR' }),
        pay({ id: 'BYR-2', kode_bayar: 'QRB-1448-002', metode: 'TRANSFER', status: 'LUNAS', skm_transaksi_id: 'TRX-9' }),
      ],
      transaksi: [trxRow({ id: 'TRX-9', tanggal: '2026-05-21', kategori_id: 'KAT-SAPI', deskripsi: 'x', jumlah: 100, rekening_id: 'REK-1', bank_ref: 'R' })],
    })
  );
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-1/link-transaksi?edisi_id=EDS-1', PERAN.BENDAHARA, { transaksi_id: 'TRX-9' });
  const { status } = await read(await LINK(req, { params: Promise.resolve({ id: 'BYR-1' }) }));
  assert.equal(status, 409);
});

// ── C-0 peran ────────────────────────────────────────────────────────────────

test('C-0: PY2 menolak BENDAHARA (403)', async () => {
  installMockSheets(baseDb({ pembayaran: [pay({ id: 'BYR-1', metode: 'TUNAI', status: 'BELUM_BAYAR' })], transaksi: [] }));
  const req = await makeReq('POST', '/api/qurban/pembayaran/BYR-1/terima-panitia?edisi_id=EDS-1', PERAN.BENDAHARA, { panitia_terima_id: 'ANG-2' });
  const { status } = await read(await TERIMA(req, { params: Promise.resolve({ id: 'BYR-1' }) }));
  assert.equal(status, 403);
});

test('C-0: PY4 menolak DISTRIBUSI (403)', async () => {
  installMockSheets(baseDb({ pembayaran: [pay({ id: 'BYR-1' })], transaksi: [] }));
  const req = await makeReq('GET', '/api/qurban/pembayaran?edisi_id=EDS-1', PERAN.DISTRIBUSI);
  const { status } = await read(await LIST(req));
  assert.equal(status, 403);
});

test('C-0/REKON: peran PENDAFTARAN ditolak di rekonsiliasi (403)', async () => {
  installMockSheets(baseDb({ pembayaran: [], transaksi: [] }));
  const req = await makeReq('POST', '/api/qurban/pembayaran/rekonsiliasi?edisi_id=EDS-1', PERAN.PENDAFTARAN);
  const { status } = await read(await REKON(req));
  assert.equal(status, 403);
});
