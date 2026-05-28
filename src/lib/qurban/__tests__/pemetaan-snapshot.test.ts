import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPemetaanSnapshot,
  type SnapshotMasterInfo,
} from '../pemetaan-snapshot';
import type { QurbanDaftarHewan } from '../daftar-hewan-types';
import type { QurbanPeserta } from '../peserta-types';

/**
 * F5b A1 — tes fungsi murni snapshot pemetaan (PM2).
 */

const EDISI = 'EDS-1';
const VERSION = '2026-05-28T10:00:00.000Z';

function mkHewan(p: Partial<QurbanDaftarHewan>): QurbanDaftarHewan {
  return {
    id: 'HWN-1',
    edisi_id: EDISI,
    master_hewan_id: 'MHW-SAPI-A',
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
    created_at: '',
    updated_at: '',
    created_by: '',
    ...p,
  };
}

function mkPeserta(p: Partial<QurbanPeserta>): QurbanPeserta {
  return {
    id: 'PST-1',
    edisi_id: EDISI,
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 3500000,
    kode_bayar: 'QRB-1448-001',
    sumber_pendaftaran: 'PANITIA',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: '',
    notes: '',
    created_at: '',
    updated_at: '',
    created_by: '',
    ...p,
  };
}

const MASTER_MAP = new Map<string, SnapshotMasterInfo>([
  ['MHW-SAPI-A', { jenis: 'SAPI', kelas: 'A' }],
  ['MHW-KAMBING-B', { jenis: 'KAMBING', kelas: 'B' }],
]);
const MUQORIB_MAP = new Map<string, string>([
  ['MQR-1', 'Hopy Familianto'],
  ['MQR-2', 'Siti'],
]);

test('hewan tanpa peserta → slots semua kosong, urut 1..kapasitas', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', kapasitas_slot: 7 })],
    [],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.equal(snap.edisi_id, EDISI);
  assert.equal(snap.version, VERSION);
  assert.equal(snap.hewan.length, 1);
  const h = snap.hewan[0];
  assert.equal(h.id, 'HWN-1');
  assert.equal(h.kapasitas_slot, 7);
  assert.equal(h.slots.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(h.slots[i].slot_number, i + 1);
    assert.equal(h.slots[i].peserta, null);
  }
});

test('hewan sebagian terisi: slot kosong & terisi berdampingan, slot lain null', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', kapasitas_slot: 7 })],
    [
      mkPeserta({ id: 'PST-A', slot_number: 1, muqorib_id: 'MQR-1' }),
      mkPeserta({ id: 'PST-B', slot_number: 3, muqorib_id: 'MQR-2', nama_atas_nama: 'Almarhum Bapak' }),
    ],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const slots = snap.hewan[0].slots;
  assert.equal(slots[0].peserta?.id, 'PST-A');
  assert.equal(slots[0].peserta?.muqorib_nama, 'Hopy Familianto');
  assert.equal(slots[1].peserta, null);
  assert.equal(slots[2].peserta?.id, 'PST-B');
  assert.equal(slots[2].peserta?.nama_atas_nama, 'Almarhum Bapak');
  // muqorib_nama tetap di-resolve dari map; nama_atas_nama itu label peserta,
  // tidak menggantikan muqorib_nama (UI yang memilih mana ditampilkan).
  assert.equal(slots[2].peserta?.muqorib_nama, 'Siti');
  for (let i = 3; i < 7; i++) assert.equal(slots[i].peserta, null);
});

test('hewan penuh (kapasitas 7, semua terisi)', () => {
  const peserta: QurbanPeserta[] = [];
  for (let n = 1; n <= 7; n++) {
    peserta.push(mkPeserta({ id: `PST-${n}`, slot_number: n }));
  }
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', kapasitas_slot: 7 })],
    peserta,
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const slots = snap.hewan[0].slots;
  assert.equal(slots.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(slots[i].slot_number, i + 1);
    assert.equal(slots[i].peserta?.id, `PST-${i + 1}`);
  }
});

test('peserta BATAL tidak muncul di papan', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', kapasitas_slot: 3 })],
    [
      mkPeserta({ id: 'PST-A', slot_number: 1, status_pendaftaran: 'TERDAFTAR' }),
      mkPeserta({ id: 'PST-B', slot_number: 2, status_pendaftaran: 'BATAL' }),
    ],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const slots = snap.hewan[0].slots;
  assert.equal(slots[0].peserta?.id, 'PST-A');
  assert.equal(slots[1].peserta, null);
  assert.equal(slots[2].peserta, null);
});

test('peserta dari edisi lain tidak masuk', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1' })],
    [
      mkPeserta({ id: 'PST-A', slot_number: 1, edisi_id: 'EDS-OTHER' }),
      mkPeserta({ id: 'PST-B', slot_number: 2 }),
    ],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const slots = snap.hewan[0].slots;
  assert.equal(slots[0].peserta, null);
  assert.equal(slots[1].peserta?.id, 'PST-B');
});

test('hewan non-AKTIF (DRAFT/TERPOTONG/BATAL) di-drop', () => {
  const snap = buildPemetaanSnapshot(
    [
      mkHewan({ id: 'HWN-AKTIF', status: 'AKTIF', nomor_urut: 1 }),
      mkHewan({ id: 'HWN-DRAFT', status: 'DRAFT', nomor_urut: 2 }),
      mkHewan({ id: 'HWN-TERPOTONG', status: 'TERPOTONG', nomor_urut: 3 }),
      mkHewan({ id: 'HWN-BATAL', status: 'BATAL', nomor_urut: 4 }),
    ],
    [],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.equal(snap.hewan.length, 1);
  assert.equal(snap.hewan[0].id, 'HWN-AKTIF');
});

test('hewan dari edisi lain di-drop (defensive)', () => {
  const snap = buildPemetaanSnapshot(
    [
      mkHewan({ id: 'HWN-MINE', edisi_id: EDISI, nomor_urut: 1 }),
      mkHewan({ id: 'HWN-OTHER', edisi_id: 'EDS-OTHER', nomor_urut: 2 }),
    ],
    [],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.equal(snap.hewan.length, 1);
  assert.equal(snap.hewan[0].id, 'HWN-MINE');
});

test('hewan diurut ascending by nomor_urut', () => {
  const snap = buildPemetaanSnapshot(
    [
      mkHewan({ id: 'HWN-3', nomor_urut: 3 }),
      mkHewan({ id: 'HWN-1', nomor_urut: 1 }),
      mkHewan({ id: 'HWN-2', nomor_urut: 2 }),
    ],
    [],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.deepEqual(snap.hewan.map((h) => h.id), ['HWN-1', 'HWN-2', 'HWN-3']);
});

test('enrichment: nama_tipe dari master_hewan_id; jenis/kelas konsisten', () => {
  const snap = buildPemetaanSnapshot(
    [
      mkHewan({ id: 'HWN-1', master_hewan_id: 'MHW-SAPI-A', jenis: 'SAPI', kelas: 'A', nomor_urut: 1 }),
      mkHewan({
        id: 'HWN-2',
        master_hewan_id: 'MHW-KAMBING-B',
        jenis: 'KAMBING',
        kelas: 'B',
        kapasitas_slot: 1,
        nomor_urut: 2,
      }),
    ],
    [],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.equal(snap.hewan[0].nama_tipe, 'SAPI Kelas A');
  assert.equal(snap.hewan[0].jenis, 'SAPI');
  assert.equal(snap.hewan[0].kelas, 'A');
  assert.equal(snap.hewan[1].nama_tipe, 'KAMBING Kelas B');
  assert.equal(snap.hewan[1].kapasitas_slot, 1);
  assert.equal(snap.hewan[1].slots.length, 1);
});

test('master tidak ditemukan → fallback ke jenis/kelas hewan row', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', master_hewan_id: 'MHW-MISSING', jenis: 'SAPI', kelas: 'C' })],
    [],
    new Map(),
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.equal(snap.hewan[0].jenis, 'SAPI');
  assert.equal(snap.hewan[0].kelas, 'C');
  assert.equal(snap.hewan[0].nama_tipe, 'SAPI Kelas C');
});

test('muqorib_nama: lookup miss → string kosong (tidak crash)', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1' })],
    [mkPeserta({ id: 'PST-A', muqorib_id: 'MQR-UNKNOWN', slot_number: 1 })],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  assert.equal(snap.hewan[0].slots[0].peserta?.muqorib_nama, '');
});

test('peserta dengan hewan_id kosong atau slot_number tidak valid → diabaikan', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', kapasitas_slot: 3 })],
    [
      mkPeserta({ id: 'PST-A', hewan_id: '', slot_number: 1 }),
      mkPeserta({ id: 'PST-B', slot_number: 0 }),
      mkPeserta({ id: 'PST-C', slot_number: -1 }),
      mkPeserta({ id: 'PST-D', slot_number: NaN }),
      mkPeserta({ id: 'PST-E', slot_number: 2 }),
    ],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const slots = snap.hewan[0].slots;
  assert.equal(slots[0].peserta, null);
  assert.equal(slots[1].peserta?.id, 'PST-E');
  assert.equal(slots[2].peserta, null);
});

test('peserta menunjuk slot_number melebihi kapasitas → tidak muncul di slots[]', () => {
  // Slot keluar batas (corrupt data) tidak boleh memunculkan slot tambahan.
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', kapasitas_slot: 3 })],
    [
      mkPeserta({ id: 'PST-A', slot_number: 5 }), // > kapasitas
      mkPeserta({ id: 'PST-B', slot_number: 2 }),
    ],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const slots = snap.hewan[0].slots;
  assert.equal(slots.length, 3);
  assert.equal(slots[0].peserta, null);
  assert.equal(slots[1].peserta?.id, 'PST-B');
  assert.equal(slots[2].peserta, null);
});

test('version diteruskan apa adanya', () => {
  const snap = buildPemetaanSnapshot([], [], MASTER_MAP, MUQORIB_MAP, EDISI, 'tok-123');
  assert.equal(snap.version, 'tok-123');
  assert.equal(snap.edisi_id, EDISI);
  assert.deepEqual(snap.hewan, []);
});

test('payload peserta lengkap: id, kode_bayar, harga, tipe_qurban', () => {
  const snap = buildPemetaanSnapshot(
    [mkHewan({ id: 'HWN-1', tipe_pembelian: 'BAWA_SENDIRI', kapasitas_slot: 1, jenis: 'KAMBING', kelas: 'A' })],
    [
      mkPeserta({
        id: 'PST-X',
        slot_number: 1,
        kode_bayar: 'QRB-1448-099',
        harga_disepakati: 2500000,
        tipe_qurban: 'BAWA_SENDIRI',
        muqorib_id: 'MQR-2',
      }),
    ],
    MASTER_MAP,
    MUQORIB_MAP,
    EDISI,
    VERSION
  );
  const p = snap.hewan[0].slots[0].peserta;
  assert.ok(p);
  assert.equal(p.id, 'PST-X');
  assert.equal(p.kode_bayar, 'QRB-1448-099');
  assert.equal(p.harga_disepakati, 2500000);
  assert.equal(p.tipe_qurban, 'BAWA_SENDIRI');
  assert.equal(p.muqorib_id, 'MQR-2');
  assert.equal(p.muqorib_nama, 'Siti');
  // Hewan-level: tipe_pembelian = BAWA_SENDIRI.
  assert.equal(snap.hewan[0].tipe_pembelian, 'BAWA_SENDIRI');
});
