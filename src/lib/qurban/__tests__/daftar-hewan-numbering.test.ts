import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAutoNumber,
  isValidPermutation,
  type NumberingRow,
} from '../daftar-hewan-numbering';

// ---------------------------------------------------------------------------
// computeAutoNumber
// ---------------------------------------------------------------------------

test('BELI ke grup kosong → nomor 1, tanpa geseran', () => {
  const r = computeAutoNumber([], 'BELI');
  assert.equal(r.nomor_urut_baru, 1);
  assert.deepEqual(r.shifted, []);
});

test('BELI ke grup terisi → max + 1, tanpa geseran', () => {
  const group: NumberingRow[] = [
    { id: 'a', tipe_pembelian: 'BAWA_SENDIRI', nomor_urut: 1 },
    { id: 'b', tipe_pembelian: 'BELI', nomor_urut: 2 },
    { id: 'c', tipe_pembelian: 'BELI', nomor_urut: 3 },
  ];
  const r = computeAutoNumber(group, 'BELI');
  assert.equal(r.nomor_urut_baru, 4);
  assert.deepEqual(r.shifted, []);
});

test('BAWA_SENDIRI ke grup kosong → nomor 1, tanpa geseran', () => {
  const r = computeAutoNumber([], 'BAWA_SENDIRI');
  assert.equal(r.nomor_urut_baru, 1);
  assert.deepEqual(r.shifted, []);
});

test('BAWA_SENDIRI ke grup berisi hanya BELI → BAWA dapat 1, semua BELI tergeser +1', () => {
  const group: NumberingRow[] = [
    { id: 'b1', tipe_pembelian: 'BELI', nomor_urut: 1 },
    { id: 'b2', tipe_pembelian: 'BELI', nomor_urut: 2 },
    { id: 'b3', tipe_pembelian: 'BELI', nomor_urut: 3 },
  ];
  const r = computeAutoNumber(group, 'BAWA_SENDIRI');
  assert.equal(r.nomor_urut_baru, 1);
  assert.deepEqual(r.shifted, [
    { id: 'b1', nomor_urut: 2 },
    { id: 'b2', nomor_urut: 3 },
    { id: 'b3', nomor_urut: 4 },
  ]);
});

test('BAWA_SENDIRI ke grup campuran → BAWA berikutnya & hanya BELI ≥ slot baru yang tergeser', () => {
  // BAWA di 1,2 ; BELI di 3,4,5 → BAWA baru = 3, BELI ≥ 3 semua tergeser.
  const group: NumberingRow[] = [
    { id: 'w1', tipe_pembelian: 'BAWA_SENDIRI', nomor_urut: 1 },
    { id: 'w2', tipe_pembelian: 'BAWA_SENDIRI', nomor_urut: 2 },
    { id: 'b3', tipe_pembelian: 'BELI', nomor_urut: 3 },
    { id: 'b4', tipe_pembelian: 'BELI', nomor_urut: 4 },
  ];
  const r = computeAutoNumber(group, 'BAWA_SENDIRI');
  assert.equal(r.nomor_urut_baru, 3);
  assert.deepEqual(r.shifted, [
    { id: 'b3', nomor_urut: 4 },
    { id: 'b4', nomor_urut: 5 },
  ]);
});

// ---------------------------------------------------------------------------
// isValidPermutation
// ---------------------------------------------------------------------------

test('permutasi valid: set sama, urutan beda', () => {
  assert.equal(isValidPermutation(['a', 'b', 'c'], ['c', 'a', 'b']), true);
});

test('permutasi tidak valid: kurang satu', () => {
  assert.equal(isValidPermutation(['a', 'b', 'c'], ['a', 'b']), false);
});

test('permutasi tidak valid: ada id nyasar (lebih)', () => {
  assert.equal(isValidPermutation(['a', 'b'], ['a', 'b', 'x']), false);
});

test('permutasi tidak valid: duplikat', () => {
  assert.equal(isValidPermutation(['a', 'b'], ['a', 'a']), false);
});

test('permutasi grup kosong vs kosong → valid', () => {
  assert.equal(isValidPermutation([], []), true);
});
