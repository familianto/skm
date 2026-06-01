import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { GET as QUEUE } from '@/app/api/qurban/pembayaran/rekonsiliasi/queue/route';

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

/** F6 C2 — PY7 antrian rekonsiliasi READ-ONLY (Layer 2 suggestions). */

afterEach(() => resetMockSheets());

async function makeReq(path: string, peran: string): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) process.env.SESSION_SECRET = 'test-secret-f6c2';
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  return new NextRequest(`http://localhost${path}`, { method: 'GET', headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
}
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as { ok: boolean; data?: Record<string, unknown> } };
}

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    nominal_total: 1_500_000, nominal_transfer: 1_500_003, metode: 'TRANSFER', status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '', bank_ref: '',
    skm_transaksi_id: '', bukti_url: '', match_metadata: '', notes: '',
    created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', created_by: 'ANG-1', ...over,
  };
}
function kategoriRow(id: string, nama: string): string[] { return [id, nama, 'MASUK', '', 'TRUE', '2026-01-01']; }
function rekeningRow(id: string, nama_bank: string): string[] { return [id, nama_bank, '123', 'Masjid', '0', 'TRUE', '2026-01-01', '2026-01-01']; }
function trxRow(o: { id: string; tanggal: string; deskripsi: string; jumlah: number; rekening_id: string; bank_ref: string }): string[] {
  const h = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const row = new Array(h.length).fill('');
  row[h.indexOf('id')] = o.id;
  row[h.indexOf('tanggal')] = o.tanggal;
  row[h.indexOf('jenis')] = 'MASUK';
  row[h.indexOf('kategori_id')] = 'KAT-SAPI';
  row[h.indexOf('deskripsi')] = o.deskripsi;
  row[h.indexOf('jumlah')] = String(o.jumlah);
  row[h.indexOf('rekening_id')] = o.rekening_id;
  row[h.indexOf('status')] = 'AKTIF';
  row[h.indexOf('bank_ref')] = o.bank_ref;
  return row;
}
function konfig(): Konfigurasi {
  return {
    id: 'KFG-1', edisi_id: 'EDS-1', bop_per_ekor_sapi: 0, bop_per_ekor_kambing: 0, target_bungkus_total: 0,
    berat_target_per_bungkus: 0, tanggal_distribusi_mulai: '', tanggal_distribusi_selesai: '', payment_suffix: 3,
    wa_send_on_pendaftaran: false, wa_send_on_pembayaran_confirmed: false, notes: '',
    created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', created_by: 'ANG-1',
  };
}

function db(transaksi: string[][]): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1448H', status: 'AKTIF' })),
    [SHEETS.MUQORIB]: muqoribRows(makeMuqorib({ id: 'MQR-1', nama_lengkap: 'Ahmad Fauzi', no_hp: '628123456789' })),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(makeHewan({ id: 'HSAPI', jenis: 'SAPI', tipe_pembelian: 'BELI' })),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', kode_bayar: 'QRB-1448-001', hewan_id: 'HSAPI', tipe_qurban: 'BELI', harga_disepakati: 1_500_000, tanggal_daftar: '2026-05-15T00:00:00.000Z' })
    ),
    [QURBAN_SHEETS.PEMBAYARAN]: [mapPembayaranToRow(pay({ id: 'BYR-1', kode_bayar: 'QRB-1448-001' }))] as string[][],
    [QURBAN_SHEETS.KONFIGURASI_EDISI]: [konfigurasiToRow(konfig())],
    [SHEET_NAMES.KATEGORI]: [kategoriRow('KAT-SAPI', 'Qurban Sapi')],
    [SHEET_NAMES.REKENING_BANK]: [rekeningRow('REK-1', 'Bank Muamalat Indonesia'), rekeningRow('REK-2', 'Kas Tunai')],
    [SHEET_NAMES.TRANSAKSI]: transaksi,
  };
}

test('PY7: read-only — scored suggestion utk transfer tanpa kode, TIDAK menulis', async () => {
  const cap = installMockSheets(
    db([
      // tanpa kode tapi sinyal kuat (keyword + nama + tanggal + nominal±1%) → suggestion scored.
      trxRow({ id: 'TRX-A', tanggal: '2026-05-16', deskripsi: 'QURBAN Ahmad Fauzy', jumlah: 1_500_000, rekening_id: 'REK-1', bank_ref: 'RA' }),
      // betul-betul tak match → unmatched.
      trxRow({ id: 'TRX-B', tanggal: '2026-09-01', deskripsi: 'Infaq jumat', jumlah: 50_000, rekening_id: 'REK-1', bank_ref: 'RB' }),
    ])
  );
  const { status, body } = await read(await QUEUE(await makeReq('/api/qurban/pembayaran/rekonsiliasi/queue?edisi_id=EDS-1', PERAN.BENDAHARA)));
  assert.equal(status, 200, JSON.stringify(body));
  const data = body.data as {
    pending_auto: unknown[];
    suggestions: Array<{ transaksi: { id: string }; kandidat: Array<{ pembayaran_id: string; score: number }> }>;
    unmatched: Array<{ transaksi_id: string }>;
  };
  const sa = data.suggestions.find((s) => s.transaksi.id === 'TRX-A');
  assert.ok(sa, 'TRX-A jadi suggestion');
  assert.equal(sa!.kandidat[0].pembayaran_id, 'BYR-1');
  assert.ok(sa!.kandidat[0].score >= 50);
  assert.deepEqual(data.unmatched.map((u) => u.transaksi_id), ['TRX-B']);

  // READ-ONLY: tak ada update/append ke sheet apa pun.
  assert.equal(cap.updates.length, 0, 'tidak ada update');
  assert.equal(cap.appends.length, 0, 'tidak ada append');
});

test('PY7: AUTO_MATCH yang belum di-apply tampil di pending_auto (tetap tak menulis)', async () => {
  const cap = installMockSheets(
    db([trxRow({ id: 'TRX-OK', tanggal: '2026-05-16', deskripsi: 'QRB-1448-001', jumlah: 1_500_003, rekening_id: 'REK-1', bank_ref: 'ROK' })])
  );
  const { status, body } = await read(await QUEUE(await makeReq('/api/qurban/pembayaran/rekonsiliasi/queue?edisi_id=EDS-1', PERAN.SUPER_ADMIN)));
  assert.equal(status, 200);
  const data = body.data as { pending_auto: Array<{ transaksi_id: string; pembayaran_id: string }> };
  assert.equal(data.pending_auto.length, 1);
  assert.equal(data.pending_auto[0].transaksi_id, 'TRX-OK');
  assert.equal(data.pending_auto[0].pembayaran_id, 'BYR-1');
  assert.equal(cap.updates.length, 0);
});

test('PY7: tolak PENDAFTARAN (403)', async () => {
  installMockSheets(db([]));
  const { status } = await read(await QUEUE(await makeReq('/api/qurban/pembayaran/rekonsiliasi/queue?edisi_id=EDS-1', PERAN.PENDAFTARAN)));
  assert.equal(status, 403);
});
