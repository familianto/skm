import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLaporanHewan } from '@/lib/qurban/laporan-hewan';
import type { Edisi } from '@/lib/qurban/edisi-repo';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

/**
 * LP2 — agregasi Laporan Hewan (F8 Milestone C). Mengunci: matriks inventaris
 * per jenis–kelas (urut kanonik), split status/tipe, biaya pengadaan dari
 * harga_beli_aktual (BELI & AKTIF only), handle harga kosong, pembagian-nol.
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

let seq = 0;
function hwn(over: Partial<QurbanDaftarHewan>): QurbanDaftarHewan {
  seq += 1;
  return {
    id: `HWN-${seq}`,
    edisi_id: 'EDS-1',
    master_hewan_id: 'MHW-1',
    jenis: 'SAPI',
    kelas: 'A',
    nomor_urut: seq,
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

test('buildLaporanHewan: inventaris urut kanonik (Sapi A→D lalu Kambing) + count', () => {
  const hewan: QurbanDaftarHewan[] = [
    hwn({ jenis: 'KAMBING', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI', harga_beli_aktual: 0 }),
    hwn({ jenis: 'SAPI', kelas: 'B', tipe_pembelian: 'BELI', harga_beli_aktual: 26_250_000 }),
    hwn({ jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BELI', harga_beli_aktual: 22_750_000 }),
    hwn({ jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI', harga_beli_aktual: 0 }),
    hwn({ jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BELI', status: 'BATAL', harga_beli_aktual: 22_750_000 }),
  ];
  const dto = buildLaporanHewan({ edisi: edisi(), isArsip: true, hewan });

  // Urut: Sapi A, Sapi B, Kambing A.
  assert.deepEqual(
    dto.inventaris.map((r) => r.label),
    ['Sapi A', 'Sapi B', 'Kambing A']
  );

  const sapiA = dto.inventaris[0];
  assert.equal(sapiA.total, 3); // 2 BELI (1 aktif 1 batal) + 1 BAWA
  assert.equal(sapiA.aktif, 2); // 1 BELI aktif + 1 BAWA aktif
  assert.equal(sapiA.batal, 1);
  assert.equal(sapiA.beli, 2);
  assert.equal(sapiA.bawa_sendiri, 1);
  // Biaya = hanya BELI & AKTIF → 1 × 22.75jt (BATAL dibuang, BAWA 0).
  assert.equal(sapiA.biaya_pengadaan, 22_750_000);
});

test('buildLaporanHewan: biaya BELI & AKTIF only; BAWA & BATAL tidak dihitung', () => {
  const hewan: QurbanDaftarHewan[] = [
    hwn({ jenis: 'SAPI', kelas: 'C', tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 29_750_000 }),
    hwn({ jenis: 'SAPI', kelas: 'C', tipe_pembelian: 'BELI', status: 'BATAL', harga_beli_aktual: 29_750_000 }),
    hwn({ jenis: 'KAMBING', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI', status: 'AKTIF', harga_beli_aktual: 5_000_000 }),
  ];
  const dto = buildLaporanHewan({ edisi: edisi(), isArsip: true, hewan });
  assert.equal(dto.ringkasan.biaya_pengadaan_total, 29_750_000);
  assert.equal(dto.ringkasan.biaya_pengadaan_sapi, 29_750_000);
  assert.equal(dto.ringkasan.biaya_pengadaan_kambing, 0);
});

test('buildLaporanHewan: hewan_beli_tanpa_harga (BELI aktif harga kosong/0)', () => {
  const hewan: QurbanDaftarHewan[] = [
    hwn({ tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 0 }), // kosong → tanpa harga
    // @ts-expect-error string kosong dari sheet di-handle Number()→0
    hwn({ tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: '' }),
    hwn({ tipe_pembelian: 'BELI', status: 'AKTIF', harga_beli_aktual: 22_750_000 }),
    hwn({ tipe_pembelian: 'BELI', status: 'BATAL', harga_beli_aktual: 0 }), // batal → tidak dihitung
  ];
  const dto = buildLaporanHewan({ edisi: edisi(), isArsip: true, hewan });
  assert.equal(dto.ringkasan.hewan_beli_tanpa_harga, 2);
  assert.equal(dto.ringkasan.biaya_pengadaan_total, 22_750_000);
});

test('buildLaporanHewan: ringkasan total/aktif/batal/beli/bawa', () => {
  const hewan: QurbanDaftarHewan[] = [
    hwn({ status: 'AKTIF', tipe_pembelian: 'BELI', harga_beli_aktual: 10 }),
    hwn({ status: 'AKTIF', tipe_pembelian: 'BAWA_SENDIRI' }),
    hwn({ status: 'BATAL', tipe_pembelian: 'BELI', harga_beli_aktual: 10 }),
  ];
  const dto = buildLaporanHewan({ edisi: edisi(), isArsip: true, hewan });
  assert.equal(dto.ringkasan.total, 3);
  assert.equal(dto.ringkasan.aktif, 2);
  assert.equal(dto.ringkasan.batal, 1);
  assert.equal(dto.ringkasan.beli, 2);
  assert.equal(dto.ringkasan.bawa_sendiri, 1);
});

test('buildLaporanHewan: pembagian-nol — tanpa hewan', () => {
  const dto = buildLaporanHewan({ edisi: edisi(), isArsip: false, hewan: [] });
  assert.equal(dto.inventaris.length, 0);
  assert.equal(dto.ringkasan.total, 0);
  assert.equal(dto.ringkasan.biaya_pengadaan_total, 0);
  assert.equal(dto.ringkasan.hewan_beli_tanpa_harga, 0);
});
