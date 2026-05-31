import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { SHEET_NAMES } from '@/lib/constants';
import {
  kategoriNamaForTipe,
  decideKategoriNama,
  resolveKategoriIdByNama,
  resolveRekeningByNama,
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
