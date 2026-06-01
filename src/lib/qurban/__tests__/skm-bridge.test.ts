import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import {
  kategoriNamaForTipe,
  decideKategoriNama,
  resolveKategoriIdByNama,
  resolveRekeningByNama,
  listBankRekeningIds,
  listTransaksiMasukByRekeningIds,
  createTransaksiPemasukanQurban,
  KATEGORI_QURBAN,
} from '../skm-bridge';
import { installMockSheets, resetMockSheets } from './_pemetaan-handler-harness';

afterEach(() => resetMockSheets());

// ── Pure: kategoriNamaForTipe ────────────────────────────────────────────────

test('kategoriNamaForTipe: BELI per jenis; BAWA_SENDIRI → Jasa Titip (mengalahkan jenis)', () => {
  assert.equal(kategoriNamaForTipe({ jenisHewan: 'KAMBING', tipePembelian: 'BELI' }), KATEGORI_QURBAN.KAMBING);
  assert.equal(kategoriNamaForTipe({ jenisHewan: 'SAPI', tipePembelian: 'BELI' }), KATEGORI_QURBAN.SAPI);
  assert.equal(kategoriNamaForTipe({ jenisHewan: 'SAPI', tipePembelian: 'BAWA_SENDIRI' }), KATEGORI_QURBAN.JASA_TITIP);
  assert.equal(kategoriNamaForTipe({ jenisHewan: 'KAMBING', tipePembelian: 'BAWA_SENDIRI' }), KATEGORI_QURBAN.JASA_TITIP);
});

test('decideKategoriNama: seragam → {mixed:false}; lintas kategori → {mixed:true}', () => {
  const d1 = decideKategoriNama([
    { jenisHewan: 'SAPI', tipePembelian: 'BELI' },
    { jenisHewan: 'SAPI', tipePembelian: 'BELI' },
  ]);
  assert.deepEqual(d1, { mixed: false, nama: KATEGORI_QURBAN.SAPI });

  const d2 = decideKategoriNama([
    { jenisHewan: 'SAPI', tipePembelian: 'BELI' },
    { jenisHewan: 'KAMBING', tipePembelian: 'BELI' },
  ]);
  assert.equal(d2.mixed, true);
  if (d2.mixed) assert.equal(d2.nama.length, 2);
});

// ── Resolver (mock sheets) ───────────────────────────────────────────────────

function kategoriRow(id: string, nama: string, jenis: string): string[] {
  // headers: id, nama, jenis, deskripsi, is_active, created_at
  return [id, nama, jenis, '', 'TRUE', '2026-01-01'];
}
function rekeningRow(id: string, nama_bank: string, atas_nama: string): string[] {
  // headers: id, nama_bank, nomor_rekening, atas_nama, saldo_awal, is_active, created_at, updated_at
  return [id, nama_bank, '123', atas_nama, '0', 'TRUE', '2026-01-01', '2026-01-01'];
}

test('resolveKategoriIdByNama: cocok nama+MASUK → id; tak ketemu → throw', async () => {
  installMockSheets({
    [SHEET_NAMES.KATEGORI]: [
      kategoriRow('KAT-1', 'Qurban Sapi', 'MASUK'),
      kategoriRow('KAT-2', 'Qurban Kambing', 'MASUK'),
      kategoriRow('KAT-9', 'Qurban Sapi', 'KELUAR'), // jenis salah — diabaikan
    ],
  });
  assert.equal(await resolveKategoriIdByNama('Qurban Sapi'), 'KAT-1');
  await assert.rejects(() => resolveKategoriIdByNama('Qurban Unta'), /tidak ditemukan/);
});

test('resolveRekeningByNama: cocok nama_bank/atas_nama → id; tak ketemu → throw', async () => {
  installMockSheets({
    [SHEET_NAMES.REKENING_BANK]: [
      rekeningRow('REK-1', 'Bank Muamalat Indonesia', 'Masjid'),
      rekeningRow('REK-2', 'Kas Tunai', 'Masjid'),
    ],
  });
  assert.equal(await resolveRekeningByNama('Kas Tunai'), 'REK-2');
  await assert.rejects(() => resolveRekeningByNama('Bank Tak Ada'), /tidak ditemukan/);
});

test('listBankRekeningIds: DINAMIS — semua rekening minus Kas Tunai, tanpa nama hardcode', async () => {
  installMockSheets({
    [SHEET_NAMES.REKENING_BANK]: [
      // Nama bank SENGAJA bukan "Bank Muamalat Indonesia" (staging) — buktikan
      // tak ada ketergantungan nama spesifik.
      rekeningRow('REK-1', 'Bank Dummy Syariah', 'Masjid'),
      rekeningRow('REK-9', 'Bank Lain BPD', 'Masjid'),
      rekeningRow('REK-2', 'Kas Tunai', 'Masjid'),
    ],
  });
  const ids = await listBankRekeningIds();
  assert.deepEqual(ids.sort(), ['REK-1', 'REK-9']); // Kas Tunai dikecualikan
});

test('listBankRekeningIds: Kas Tunai cocok via atas_nama juga dikecualikan; inactive di-skip', async () => {
  const inactive = (() => { const r = rekeningRow('REK-OFF', 'Bank Mati', 'Masjid'); r[5] = 'FALSE'; return r; })();
  installMockSheets({
    [SHEET_NAMES.REKENING_BANK]: [
      rekeningRow('REK-1', 'Bank Dummy Syariah', 'Masjid'),
      rekeningRow('REK-KAS', 'Rekening Tunai', 'Kas Tunai'), // Kas Tunai di atas_nama
      inactive,
    ],
  });
  assert.deepEqual(await listBankRekeningIds(), ['REK-1']);
});

test('listBankRekeningIds: tak ada rekening bank → [] (degradasi anggun)', async () => {
  installMockSheets({ [SHEET_NAMES.REKENING_BANK]: [rekeningRow('REK-2', 'Kas Tunai', 'Masjid')] });
  assert.deepEqual(await listBankRekeningIds(), []);
});

test('listTransaksiMasukByRekeningIds: pindai MASUK/AKTIF lintas banyak rekening; [] bila kosong', async () => {
  const h = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const trx = (id: string, jenis: string, status: string, rek: string): string[] => {
    const row = new Array(h.length).fill('');
    row[h.indexOf('id')] = id; row[h.indexOf('jenis')] = jenis; row[h.indexOf('status')] = status;
    row[h.indexOf('rekening_id')] = rek; row[h.indexOf('jumlah')] = '1000';
    return row;
  };
  installMockSheets({
    [SHEET_NAMES.TRANSAKSI]: [
      trx('T1', 'MASUK', 'AKTIF', 'REK-1'),
      trx('T2', 'MASUK', 'AKTIF', 'REK-9'),
      trx('T3', 'KELUAR', 'AKTIF', 'REK-1'), // bukan MASUK
      trx('T4', 'MASUK', 'VOID', 'REK-1'),   // bukan AKTIF
      trx('T5', 'MASUK', 'AKTIF', 'REK-2'),  // rekening tak termasuk
    ],
  });
  const out = await listTransaksiMasukByRekeningIds(['REK-1', 'REK-9']);
  assert.deepEqual(out.map((t) => t.id).sort(), ['T1', 'T2']);
  assert.deepEqual(await listTransaksiMasukByRekeningIds([]), []);
});

// ── createTransaksiPemasukanQurban ───────────────────────────────────────────

test('createTransaksiPemasukanQurban: tulis baris MASUK/AKTIF kanonik + audit, return TRX-', async () => {
  const cap = installMockSheets({ [SHEET_NAMES.TRANSAKSI]: [] });
  const id = await createTransaksiPemasukanQurban({
    kategori_id: 'KAT-1',
    rekening_id: 'REK-2',
    jumlah: 2_000_000,
    tanggal: '2026-05-31',
    deskripsi: 'Qurban 1448 - QRB-1448-007 - Fulan (Cash/Datang Langsung)',
    created_by: 'ANG-1',
  });
  assert.match(id, /^TRX-\d{8}-\d{4}$/);

  const trxAppend = cap.appends.find((a) => a.range.startsWith(`${SHEET_NAMES.TRANSAKSI}!`));
  assert.ok(trxAppend, 'ada append ke transaksi');
  const row = trxAppend!.values[0];
  // headers: id,tanggal,jenis,kategori_id,deskripsi,jumlah,rekening_id,bukti_url,status,...
  assert.equal(row[2], 'MASUK');
  assert.equal(row[3], 'KAT-1');
  assert.equal(row[5], '2000000'); // jumlah BULAT (tanpa suffix)
  assert.equal(row[6], 'REK-2');
  assert.equal(row[8], 'AKTIF');
});

test('createTransaksiPemasukanQurban: tanggal non YYYY-MM-DD → throw (jangan kirim ISO-Z)', async () => {
  installMockSheets({ [SHEET_NAMES.TRANSAKSI]: [] });
  await assert.rejects(
    () =>
      createTransaksiPemasukanQurban({
        kategori_id: 'KAT-1',
        rekening_id: 'REK-2',
        jumlah: 1000,
        tanggal: '2026-05-31T03:00:00.000Z',
        deskripsi: 'x',
        created_by: 'ANG-1',
      }),
    /YYYY-MM-DD/
  );
});
