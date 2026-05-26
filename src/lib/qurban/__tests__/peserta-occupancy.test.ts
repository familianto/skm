import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeOccupancy,
  slotTerisi,
  occupantsOf,
  occupiedSlotNumbers,
  hasPesertaTerdaftar,
} from '../peserta-occupancy';
import type { QurbanPeserta } from '../peserta-types';

// F4a Milestone B: skema benar — status_pendaftaran (bukan `status`), nama via
// nama_atas_nama || muqorib.nama_lengkap (tidak ada kolom `nama`).

function mk(p: Partial<QurbanPeserta>): QurbanPeserta {
  return {
    id: 'PST-1',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 0,
    kode_bayar: '',
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

const NAMES = new Map([['MQR-1', 'Budi'], ['MQR-2', 'Siti']]);

test('list kosong → map kosong', () => {
  const occ = computeOccupancy([], NAMES, 'EDS-1');
  assert.equal(occ.size, 0);
  assert.equal(slotTerisi(occ, 'HWN-1'), 0);
  assert.deepEqual(occupantsOf(occ, 'HWN-1'), []);
  assert.equal(hasPesertaTerdaftar(occ, 'HWN-1'), false);
});

test('edisiId kosong → map kosong', () => {
  const occ = computeOccupancy([mk({})], NAMES, '');
  assert.equal(occ.size, 0);
});

test('hanya TERDAFTAR yang dihitung; BATAL & beda edisi diabaikan', () => {
  const rows = [
    mk({ id: 'PST-1', muqorib_id: 'MQR-1', hewan_id: 'HWN-1', slot_number: 1, status_pendaftaran: 'TERDAFTAR' }),
    mk({ id: 'PST-2', muqorib_id: 'MQR-2', hewan_id: 'HWN-1', slot_number: 2, status_pendaftaran: 'TERDAFTAR' }),
    mk({ id: 'PST-3', hewan_id: 'HWN-1', slot_number: 3, status_pendaftaran: 'BATAL' }),
    mk({ id: 'PST-4', edisi_id: 'EDS-2', hewan_id: 'HWN-1', slot_number: 4, status_pendaftaran: 'TERDAFTAR' }),
    mk({ id: 'PST-5', hewan_id: 'HWN-2', slot_number: 1, status_pendaftaran: 'TERDAFTAR' }),
  ];
  const occ = computeOccupancy(rows, NAMES, 'EDS-1');
  assert.equal(slotTerisi(occ, 'HWN-1'), 2);
  assert.equal(hasPesertaTerdaftar(occ, 'HWN-1'), true);
  assert.equal(occupantsOf(occ, 'HWN-1').length, 2);
  assert.deepEqual(occupiedSlotNumbers(occ, 'HWN-1').sort(), [1, 2]);
  assert.equal(slotTerisi(occ, 'HWN-2'), 1);
  assert.equal(slotTerisi(occ, 'HWN-3'), 0);
});

test('nama: nama_atas_nama menang; kalau kosong pakai nama muqorib', () => {
  const rows = [
    mk({ id: 'PST-1', muqorib_id: 'MQR-1', nama_atas_nama: '' }),
    mk({ id: 'PST-2', muqorib_id: 'MQR-2', nama_atas_nama: 'Almarhum Bapak', slot_number: 2 }),
  ];
  const occ = computeOccupancy(rows, NAMES, 'EDS-1');
  const occupants = occupantsOf(occ, 'HWN-1');
  assert.equal(occupants.find((o) => o.peserta_id === 'PST-1')?.nama, 'Budi');
  assert.equal(occupants.find((o) => o.peserta_id === 'PST-2')?.nama, 'Almarhum Bapak');
});

test('muqorib tak dikenal & tanpa nama_atas_nama → nama kosong (tidak crash)', () => {
  const occ = computeOccupancy([mk({ muqorib_id: 'MQR-X', nama_atas_nama: '' })], NAMES, 'EDS-1');
  assert.equal(occupantsOf(occ, 'HWN-1')[0].nama, '');
});

test('hewan_id kosong → tidak dihitung', () => {
  const occ = computeOccupancy([mk({ hewan_id: '' })], NAMES, 'EDS-1');
  assert.equal(occ.size, 0);
});
