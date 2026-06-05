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
 * LP6 handler — POST /api/qurban/laporan/export. Verifikasi: role-gate, validasi
 * (shape/format/columns), file PDF/Excel ter-generate (content-type + non-kosong),
 * preset baris-level & ringkasan, gate panitia non-AKTIF.
 */

afterEach(() => resetMockSheets());

async function makeReq(peran: string, body: unknown): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-f8e';
  }
  const payload: SessionPayload = { user_id: 'ANG-1', peran, role: peran, masjidName: 'Masjid Uji' };
  const token = await createSessionToken(payload);
  return new NextRequest('http://localhost/api/qurban/laporan/export', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1',
    muqorib_id: 'MQR-1',
    nominal_total: 5_000_000,
    nominal_transfer: 5_000_000,
    metode: 'IMPORT_1447H',
    status: 'LUNAS',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: '2026-05-02T00:00:00.000Z',
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

function archiveDb(): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1447 H', tanggal_idul_adha: '2026-05-27' })),
    [SHEETS.PESERTA]: pesertaRows(
      makePeserta({ id: 'PST-1', muqorib_id: 'MQR-1', hewan_id: 'HWN-1', kode_bayar: 'QRB-1', keterangan_bagian: '5 bks (kupon),Paha' }),
      makePeserta({ id: 'PST-2', muqorib_id: 'MQR-2', hewan_id: 'HWN-2', kode_bayar: 'QRB-2', tipe_qurban: 'BAWA_SENDIRI' })
    ),
    [SHEETS.DAFTAR_HEWAN]: hewanRows(
      makeHewan({ id: 'HWN-1', jenis: 'SAPI', kelas: 'A', status: 'AKTIF', harga_beli_aktual: 22_750_000 }),
      makeHewan({ id: 'HWN-2', jenis: 'KAMBING', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI', status: 'AKTIF' })
    ),
    [SHEETS.MUQORIB]: muqoribRows(
      makeMuqorib({ id: 'MQR-1', rt: '01', no_hp: '628111' }),
      makeMuqorib({ id: 'MQR-2', rt: '4.0', no_hp: '628222' })
    ),
    'qurban_pembayaran': [mapPembayaranToRow(pay({ id: 'BYR-1', kode_bayar: 'QRB-1' })), mapPembayaranToRow(pay({ id: 'BYR-2', kode_bayar: 'QRB-2' }))],
  };
}

test('LP6: tanpa sesi → 401', async () => {
  installMockSheets(archiveDb());
  const res = await POST(
    new NextRequest('http://localhost/api/qurban/laporan/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shape: 'tabel', columns: ['kode_peserta'], format: 'pdf' }),
    })
  );
  assert.equal(res.status, 401);
});

test('LP6: shape Kartu/Label (di luar tabel|rekap) → 400', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.ADMIN_QURBAN, { shape: 'kartu', columns: ['kode_peserta'], format: 'pdf' }));
  assert.equal(res.status, 400);
});

test('LP6: shape rekap PDF → 200 application/pdf', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.ADMIN_QURBAN, { shape: 'rekap', format: 'pdf' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
});

test('LP6: shape rekap Excel + filter jenis → 200 spreadsheet', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.BENDAHARA, { shape: 'rekap', format: 'xlsx', filter: { jenis: 'SAPI' } }));
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

test('LP6: format invalid → 400', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.ADMIN_QURBAN, { shape: 'tabel', columns: ['kode_peserta'], format: 'docx' }));
  assert.equal(res.status, 400);
});

test('LP6: kolom kosong → 400', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.ADMIN_QURBAN, { shape: 'tabel', columns: [], format: 'pdf' }));
  assert.equal(res.status, 400);
});

test('LP6: custom columns PDF → 200 application/pdf, non-kosong', async () => {
  installMockSheets(archiveDb());
  const res = await POST(
    await makeReq(PERAN.ADMIN_QURBAN, {
      shape: 'tabel',
      columns: ['no_baris', 'atas_nama', 'no_hp', 'label_hewan'],
      format: 'pdf',
    })
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition') || '', /attachment; filename=".*\.pdf"/);
  const buf = await res.arrayBuffer();
  assert.ok(buf.byteLength > 0);
});

test('LP6: custom columns Excel → 200 spreadsheet, non-kosong', async () => {
  installMockSheets(archiveDb());
  const res = await POST(
    await makeReq(PERAN.BENDAHARA, {
      shape: 'tabel',
      columns: ['kode_peserta', 'atas_nama', 'harga_disepakati'],
      manual_columns: ['Petugas Distribusi'],
      format: 'xlsx',
    })
  );
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  const buf = await res.arrayBuffer();
  assert.ok(buf.byteLength > 0);
});

test('LP6: preset baris-level tim_muqorib → 200 PDF', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.PENDAFTARAN, { shape: 'tabel', preset: 'tim_muqorib', format: 'pdf' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
});

test('LP6: preset ringkasan ringkasan_keuangan → 200 PDF', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.BENDAHARA, { shape: 'tabel', preset: 'ringkasan_keuangan', format: 'pdf' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
});

test('LP6: preset ringkasan inventaris Excel → 200 spreadsheet', async () => {
  installMockSheets(archiveDb());
  const res = await POST(await makeReq(PERAN.SUPER_ADMIN, { shape: 'tabel', preset: 'inventaris_hewan', format: 'xlsx' }));
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

test('LP6: panitia (DISTRIBUSI) edisi non-AKTIF → 403', async () => {
  const db = archiveDb();
  db[SHEETS.EDISI] = edisiRows(makeEdisi({ id: 'EDS-1', status: 'SELESAI' }));
  installMockSheets(db);
  const res = await POST(
    await makeReq(PERAN.DISTRIBUSI, { shape: 'tabel', preset: 'tim_muqorib', format: 'pdf', edisi_id: 'EDS-1' })
  );
  assert.equal(res.status, 403);
});
