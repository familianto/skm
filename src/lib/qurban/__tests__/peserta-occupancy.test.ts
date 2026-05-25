import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeOccupancy,
  slotTerisi,
  occupantsOf,
  hasPesertaTerdaftar,
} from '../peserta-occupancy';

// Defensif: qurban_peserta belum ada (F4a). Header kosong / tak dikenal →
// occupancy kosong, accessor mengembalikan 0 / [] / false.

test('header kosong (sheet belum ada) → map kosong', () => {
  const occ = computeOccupancy([], [], 'EDS-1');
  assert.equal(occ.size, 0);
  assert.equal(slotTerisi(occ, 'HWN-1'), 0);
  assert.deepEqual(occupantsOf(occ, 'HWN-1'), []);
  assert.equal(hasPesertaTerdaftar(occ, 'HWN-1'), false);
});

test('schema tidak dikenal (tanpa kolom hewan_id) → map kosong', () => {
  const occ = computeOccupancy(['id', 'nama'], [['P-1', 'Budi']], 'EDS-1');
  assert.equal(occ.size, 0);
});

test('edisiId kosong → map kosong', () => {
  const header = ['id', 'edisi_id', 'hewan_id', 'status'];
  const occ = computeOccupancy(header, [['P-1', 'EDS-1', 'HWN-1', 'TERDAFTAR']], '');
  assert.equal(occ.size, 0);
});

test('parse TERDAFTAR per hewan, filter edisi, hanya TERDAFTAR yang dihitung', () => {
  const header = ['id', 'edisi_id', 'hewan_id', 'status', 'nama'];
  const rows = [
    ['P-1', 'EDS-1', 'HWN-1', 'TERDAFTAR', 'Budi'],
    ['P-2', 'EDS-1', 'HWN-1', 'TERDAFTAR', 'Siti'],
    ['P-3', 'EDS-1', 'HWN-1', 'BATAL', 'Andi'], // bukan TERDAFTAR → diabaikan
    ['P-4', 'EDS-2', 'HWN-1', 'TERDAFTAR', 'Lain'], // beda edisi → diabaikan
    ['P-5', 'EDS-1', 'HWN-2', 'TERDAFTAR', 'Rina'],
  ];
  const occ = computeOccupancy(header, rows, 'EDS-1');
  assert.equal(slotTerisi(occ, 'HWN-1'), 2);
  assert.equal(hasPesertaTerdaftar(occ, 'HWN-1'), true);
  assert.equal(occupantsOf(occ, 'HWN-1').length, 2);
  assert.equal(slotTerisi(occ, 'HWN-2'), 1);
  assert.equal(slotTerisi(occ, 'HWN-3'), 0);
});
