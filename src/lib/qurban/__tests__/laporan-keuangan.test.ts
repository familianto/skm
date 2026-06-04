import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLaporanKeuangan } from '@/lib/qurban/laporan-keuangan';
import type { Edisi } from '@/lib/qurban/edisi-repo';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';
import type { Pembayaran } from '@/lib/qurban/pembayaran-repo';

/**
 * LP4 — agregasi Laporan Keuangan (F8 Milestone D). Mengunci: dana terhimpun
 * (LUNAS) + kategori (Sapi/Kambing/Jasa Titip), reuse biaya LP2, saldo, mode
 * arsip & korelasi ledger (N/A bukan selisih), pembagian-nol.
 */

const NOW = '2026-05-01T00:00:00.000Z';

function edisi(over: Partial<Edisi> = {}): Edisi {
  return {
    id: 'EDS-1',
    tahun_hijriah: '1447 H',
    tahun_masehi: 2026,
    tanggal_idul_adha: '2026-05-27',
    tanggal_pendaftaran_buka: '2026-04-01',
    tanggal_pendaftaran_tutup: '2026-05-20',
    status: 'AKTIF',
    parent_edisi_id: '',
    cloned_at: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    pemetaan_version: NOW,
    ...over,
  };
}

let pSeq = 0;
function pst(over: Partial<QurbanPeserta>): QurbanPeserta {
  pSeq += 1;
  return {
    id: `PST-${pSeq}`,
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-SAPI',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 2_500_000,
    kode_bayar: 'QRB-1447-001',
    sumber_pendaftaran: 'IMPORT_1447H',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: NOW,
    notes: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

function hwn(over: Partial<QurbanDaftarHewan>): QurbanDaftarHewan {
  return {
    id: 'HWN-SAPI',
    edisi_id: 'EDS-1',
    master_hewan_id: 'MHW-1',
    jenis: 'SAPI',
    kelas: 'A',
    nomor_urut: 1,
    kapasitas_slot: 7,
    tipe_pembelian: 'BELI',
    vendor_nama: '',
    harga_beli_aktual: 0,
    tanggal_pembelian: '',
    status: 'AKTIF',
    notes: '',
    nomor_urut_pemotongan: null,
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

let bSeq = 0;
function pay(over: Partial<Pembayaran>): Pembayaran {
  bSeq += 1;
  return {
    id: `BYR-${bSeq}`,
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1447-001',
    muqorib_id: 'MQR-1',
    nominal_total: 2_500_000,
    nominal_transfer: 2_500_000,
    metode: 'IMPORT_1447H',
    status: 'LUNAS',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: NOW,
    bank_ref: '',
    skm_transaksi_id: '',
    bukti_url: '',
    match_metadata: '',
    notes: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

test('buildLaporanKeuangan: dana terhimpun (LUNAS) + kategori + saldo + arsip', () => {
  const hewan: QurbanDaftarHewan[] = [
    hwn({ id: 'HWN-SAPI', jenis: 'SAPI', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 22_750_000 }),
    hwn({ id: 'HWN-KAMBING', jenis: 'KAMBING', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 3_000_000 }),
    hwn({ id: 'HWN-BAWA', jenis: 'SAPI', tipe_pembelian: 'BAWA_SENDIRI', status: 'AKTIF', harga_beli_aktual: 0 }),
  ];
  const peserta: QurbanPeserta[] = [
    pst({ tipe_qurban: 'BELI', hewan_id: 'HWN-SAPI', harga_disepakati: 5_000_000 }),
    pst({ tipe_qurban: 'BELI', hewan_id: 'HWN-KAMBING', harga_disepakati: 3_500_000 }),
    pst({ tipe_qurban: 'BAWA_SENDIRI', hewan_id: 'HWN-BAWA', harga_disepakati: 250_000 }),
    pst({ tipe_qurban: 'BELI', hewan_id: 'HWN-SAPI', harga_disepakati: 9_999_999, status_pendaftaran: 'BATAL' }), // dibuang
  ];
  const pembayaran: Pembayaran[] = [
    pay({ status: 'LUNAS', nominal_total: 5_000_000 }),
    pay({ status: 'LUNAS', nominal_total: 3_500_000 }),
    pay({ status: 'LUNAS', nominal_total: 250_000 }),
    pay({ status: 'BELUM_BAYAR', nominal_total: 9_999_999 }), // tidak dihitung
  ];

  const dto = buildLaporanKeuangan({ edisi: edisi(), isArsip: true, pembayaran, peserta, hewan });

  // Dana terhimpun = Σ LUNAS = 8.75jt; 3 pembayaran LUNAS.
  assert.equal(dto.dana_terhimpun.total, 8_750_000);
  assert.equal(dto.dana_terhimpun.jumlah_pembayaran_lunas, 3);
  // nilai pendaftaran = Σ harga TERDAFTAR = 5 + 3.5 + 0.25 = 8.75jt.
  assert.equal(dto.dana_terhimpun.nilai_pendaftaran, 8_750_000);

  // Kategori (urut stabil): Sapi / Kambing / Jasa Titip.
  assert.deepEqual(
    dto.dana_terhimpun.per_kategori.map((k) => [k.key, k.peserta, k.nominal]),
    [
      ['QURBAN_SAPI', 1, 5_000_000],
      ['QURBAN_KAMBING', 1, 3_500_000],
      ['JASA_TITIP', 1, 250_000],
    ]
  );

  // Biaya reuse LP2: BELI & AKTIF → 22.75jt (sapi) + 3jt (kambing) = 25.75jt.
  assert.equal(dto.biaya_pengadaan.sapi, 22_750_000);
  assert.equal(dto.biaya_pengadaan.kambing, 3_000_000);
  assert.equal(dto.biaya_pengadaan.total, 25_750_000);

  // Saldo = 8.75jt − 25.75jt = −17jt.
  assert.equal(dto.saldo_qurban, 8_750_000 - 25_750_000);

  // Mode arsip + korelasi N/A (skm_transaksi_id semua kosong).
  assert.equal(dto.mode, 'arsip');
  assert.equal(dto.korelasi_ledger.mode, 'arsip');
  assert.equal(dto.korelasi_ledger.status, 'N/A');
  assert.equal(dto.korelasi_ledger.pembayaran_total, 4);
  assert.equal(dto.korelasi_ledger.pembayaran_tertaut, 0);
});

test('buildLaporanKeuangan: kategori selalu 3 baris walau 0', () => {
  const dto = buildLaporanKeuangan({
    edisi: edisi(),
    isArsip: true,
    pembayaran: [],
    peserta: [],
    hewan: [],
  });
  assert.deepEqual(dto.dana_terhimpun.per_kategori.map((k) => k.key), [
    'QURBAN_SAPI',
    'QURBAN_KAMBING',
    'JASA_TITIP',
  ]);
  assert.equal(dto.dana_terhimpun.total, 0);
  assert.equal(dto.saldo_qurban, 0);
});

test('buildLaporanKeuangan: mode live bila ada pembayaran tertaut & bukan arsip', () => {
  const pembayaran: Pembayaran[] = [
    pay({ status: 'LUNAS', skm_transaksi_id: 'TRX-1' }),
    pay({ status: 'LUNAS', skm_transaksi_id: '' }),
  ];
  const dto = buildLaporanKeuangan({
    edisi: edisi(),
    isArsip: false,
    pembayaran,
    peserta: [],
    hewan: [],
  });
  assert.equal(dto.mode, 'live');
  assert.equal(dto.korelasi_ledger.mode, 'live');
  assert.equal(dto.korelasi_ledger.status, 'LIVE');
  assert.equal(dto.korelasi_ledger.pembayaran_tertaut, 1);
  assert.equal(dto.korelasi_ledger.pembayaran_total, 2);
});

test('buildLaporanKeuangan: live tapi 0 tertaut → korelasi tetap arsip (N/A)', () => {
  const dto = buildLaporanKeuangan({
    edisi: edisi(),
    isArsip: false,
    pembayaran: [pay({ status: 'LUNAS', skm_transaksi_id: '' })],
    peserta: [],
    hewan: [],
  });
  // Top-level mode mengikuti is_arsip (live), tapi korelasi N/A karena 0 tertaut.
  assert.equal(dto.mode, 'live');
  assert.equal(dto.korelasi_ledger.mode, 'arsip');
  assert.equal(dto.korelasi_ledger.status, 'N/A');
});

test('buildLaporanKeuangan: BELI tanpa hewan ter-resolve tak masuk kategori (langka)', () => {
  const peserta: QurbanPeserta[] = [
    pst({ tipe_qurban: 'BELI', hewan_id: 'HILANG', harga_disepakati: 1_000_000 }),
  ];
  const dto = buildLaporanKeuangan({
    edisi: edisi(),
    isArsip: true,
    pembayaran: [],
    peserta,
    hewan: [],
  });
  // nilai_pendaftaran tetap menghitung peserta, tapi tak ada kategori cocok.
  assert.equal(dto.dana_terhimpun.nilai_pendaftaran, 1_000_000);
  assert.equal(dto.dana_terhimpun.per_kategori.every((k) => k.peserta === 0), true);
});
