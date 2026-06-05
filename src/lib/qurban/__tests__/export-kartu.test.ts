import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKartuPemotongan,
  buildLabelBagikan,
  labelHewanKartu,
} from '@/lib/qurban/export-kartu';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';
import type { QurbanMuqorib } from '@/lib/qurban/muqorib-repo';

/**
 * Kartu Pemotongan & Label (F8 Milestone G). Mengunci: grouping per hewan
 * aktif ber-urut potong, slot fill (kosong → ''), urut nomor_urut_pemotongan,
 * filter jenis, dan label item per peserta.
 */

const NOW = '2026-05-01T00:00:00.000Z';

let pSeq = 0;
function pst(over: Partial<QurbanPeserta>): QurbanPeserta {
  pSeq += 1;
  return {
    id: `PST-${pSeq}`,
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 0,
    kode_bayar: 'QRB-1',
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
    id: 'HWN-1',
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
    nomor_urut_pemotongan: 1,
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

function mqr(id: string, over: Partial<QurbanMuqorib> = {}): QurbanMuqorib {
  return {
    id,
    nama_lengkap: `Muqorib ${id}`,
    alamat: 'Jl. Masjid',
    rt: '01',
    no_hp: '628',
    is_active: true,
    data_induk_ref_1447h: '',
    notes: '',
    created_at: NOW,
    created_by: 'IMPORT',
    updated_at: NOW,
    ...over,
  };
}

const mmap = (ms: QurbanMuqorib[]) => new Map(ms.map((m) => [m.id, m]));

test('labelHewanKartu: "SAPI A-03"', () => {
  assert.equal(labelHewanKartu(hwn({ jenis: 'SAPI', kelas: 'A', nomor_urut: 3 })), 'SAPI A-03');
  assert.equal(labelHewanKartu(hwn({ jenis: 'KAMBING', kelas: 'B', nomor_urut: 12 })), 'KAMBING B-12');
});

test('buildKartuPemotongan: kartu Sapi 7 slot, slot kosong terisi ""', () => {
  const hewan = [hwn({ id: 'H1', jenis: 'SAPI', kapasitas_slot: 7, nomor_urut_pemotongan: 1 })];
  const peserta = [
    pst({ hewan_id: 'H1', slot_number: 1, nama_atas_nama: 'Andi' }),
    pst({ hewan_id: 'H1', slot_number: 3, nama_atas_nama: 'Budi' }),
  ];
  const kartu = buildKartuPemotongan({ jenis: 'SAPI', peserta, hewan, muqoribById: mmap([mqr('MQR-1')]) });
  assert.equal(kartu.length, 1);
  assert.equal(kartu[0].slots.length, 7);
  assert.equal(kartu[0].slots[0].nama, 'Andi');
  assert.equal(kartu[0].slots[1].nama, ''); // slot 2 kosong
  assert.equal(kartu[0].slots[2].nama, 'Budi');
  assert.equal(kartu[0].no_urut, 1);
  assert.equal(kartu[0].label_hewan, 'SAPI A-01');
});

test('buildKartuPemotongan: hanya AKTIF & ber-urut; batal/tanpa-urut dibuang', () => {
  const hewan = [
    hwn({ id: 'H-OK', jenis: 'SAPI', nomor_urut_pemotongan: 2 }),
    hwn({ id: 'H-BATAL', jenis: 'SAPI', status: 'BATAL', nomor_urut_pemotongan: 1 }),
    hwn({ id: 'H-NOURUT', jenis: 'SAPI', nomor_urut_pemotongan: null }),
  ];
  const peserta = [
    pst({ hewan_id: 'H-OK', slot_number: 1 }),
    pst({ hewan_id: 'H-BATAL', slot_number: 1 }),
    pst({ hewan_id: 'H-NOURUT', slot_number: 1 }),
  ];
  const kartu = buildKartuPemotongan({ jenis: 'SAPI', peserta, hewan, muqoribById: mmap([mqr('MQR-1')]) });
  assert.deepEqual(kartu.map((k) => k.hewan_id), ['H-OK']);
});

test('buildKartuPemotongan: urut nomor_urut_pemotongan ASC + filter jenis', () => {
  const hewan = [
    hwn({ id: 'S2', jenis: 'SAPI', nomor_urut_pemotongan: 2 }),
    hwn({ id: 'S1', jenis: 'SAPI', nomor_urut_pemotongan: 1 }),
    hwn({ id: 'K1', jenis: 'KAMBING', kapasitas_slot: 1, nomor_urut_pemotongan: 5 }),
  ];
  const peserta = [
    pst({ hewan_id: 'S2', slot_number: 1 }),
    pst({ hewan_id: 'S1', slot_number: 1 }),
    pst({ hewan_id: 'K1', slot_number: 1 }),
  ];
  const sapi = buildKartuPemotongan({ jenis: 'SAPI', peserta, hewan, muqoribById: mmap([mqr('MQR-1')]) });
  assert.deepEqual(sapi.map((k) => k.hewan_id), ['S1', 'S2']);
  const kambing = buildKartuPemotongan({ jenis: 'KAMBING', peserta, hewan, muqoribById: mmap([mqr('MQR-1')]) });
  assert.deepEqual(kambing.map((k) => k.hewan_id), ['K1']);
  assert.equal(kambing[0].slots.length, 1);
});

test('buildKartuPemotongan: nama fallback ke muqorib bila nama_atas_nama kosong', () => {
  const hewan = [hwn({ id: 'H1', jenis: 'SAPI', kapasitas_slot: 1, nomor_urut_pemotongan: 1 })];
  const peserta = [pst({ hewan_id: 'H1', slot_number: 1, muqorib_id: 'M9', nama_atas_nama: '' })];
  const kartu = buildKartuPemotongan({
    jenis: 'SAPI',
    peserta,
    hewan,
    muqoribById: mmap([mqr('M9', { nama_lengkap: 'Pak Fulan' })]),
  });
  assert.equal(kartu[0].slots[0].nama, 'Pak Fulan');
});

test('buildLabelBagikan: 1 per peserta TERDAFTAR, urut by urut potong (kosong akhir)', () => {
  const hewan = [
    hwn({ id: 'S1', jenis: 'SAPI', nomor_urut_pemotongan: 2 }),
    hwn({ id: 'K1', jenis: 'KAMBING', kapasitas_slot: 1, nomor_urut_pemotongan: 1 }),
    hwn({ id: 'X', jenis: 'SAPI', nomor_urut_pemotongan: null }),
  ];
  const peserta = [
    pst({ hewan_id: 'S1', nama_atas_nama: 'Andi' }),
    pst({ hewan_id: 'K1', nama_atas_nama: 'Budi' }),
    pst({ hewan_id: 'X', nama_atas_nama: 'Cici' }),
    pst({ hewan_id: 'S1', nama_atas_nama: 'Dedi', status_pendaftaran: 'BATAL' }), // dibuang
  ];
  const labels = buildLabelBagikan({ jenis: 'SEMUA', peserta, hewan, muqoribById: mmap([mqr('MQR-1')]) });
  assert.deepEqual(labels.map((l) => l.atas_nama), ['Budi', 'Andi', 'Cici']); // urut 1,2,null
  assert.equal(labels[0].label_hewan, 'KAMBING A-01'); // K1 kelas A, nomor_urut 1
});

test('buildLabelBagikan: filter jenis', () => {
  const hewan = [
    hwn({ id: 'S1', jenis: 'SAPI', nomor_urut_pemotongan: 1 }),
    hwn({ id: 'K1', jenis: 'KAMBING', kapasitas_slot: 1, nomor_urut_pemotongan: 2 }),
  ];
  const peserta = [pst({ hewan_id: 'S1', nama_atas_nama: 'Andi' }), pst({ hewan_id: 'K1', nama_atas_nama: 'Budi' })];
  const sapi = buildLabelBagikan({ jenis: 'SAPI', peserta, hewan, muqoribById: mmap([mqr('MQR-1')]) });
  assert.deepEqual(sapi.map((l) => l.atas_nama), ['Andi']);
});
