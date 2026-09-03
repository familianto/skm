import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kelompokLabel, kelompokOptions, normalizeKelompok } from '../donatur-kelompok';

const rows = (...kelompok: string[]) => kelompok.map((k) => ({ kelompok: k as never }));

// ── kelompokOptions ──────────────────────────────────────────────────────────

test('options: nilai unik dari data, bukan daftar statis TETAP/INSIDENTAL', () => {
  assert.deepEqual(
    kelompokOptions(rows('5', '1', '5', '2')).map((o) => o.value),
    ['1', '2', '5']
  );
});

test('options: kode numerik diurut numerik, bukan leksikografis', () => {
  assert.deepEqual(
    kelompokOptions(rows('10', '2', '1')).map((o) => o.value),
    ['1', '2', '10']
  );
});

test('options: numerik lebih dulu, non-numerik alfabetis sesudahnya', () => {
  assert.deepEqual(
    kelompokOptions(rows('TETAP', '3', 'INSIDENTAL', '1')).map((o) => o.value),
    ['1', '3', 'INSIDENTAL', 'TETAP']
  );
});

test('options: nilai kosong/spasi dibuang, sisanya di-trim & dedupe', () => {
  assert.deepEqual(
    kelompokOptions(rows('', '  ', ' 4 ', '4')).map((o) => o.value),
    ['4']
  );
});

test('options: data kosong → tidak ada opsi', () => {
  assert.deepEqual(kelompokOptions([]), []);
});

test('options: label legacy dimanusiakan, kode masjid apa adanya', () => {
  assert.deepEqual(kelompokOptions(rows('TETAP', 'INSIDENTAL', '5')), [
    { value: '5', label: '5' },
    { value: 'INSIDENTAL', label: 'Insidental' },
    { value: 'TETAP', label: 'Tetap' },
  ]);
});

// ── kelompokLabel / normalizeKelompok ────────────────────────────────────────

test('label: TETAP/INSIDENTAL punya teks Indonesia, nilai lain diteruskan', () => {
  assert.equal(kelompokLabel('TETAP'), 'Tetap');
  assert.equal(kelompokLabel(' INSIDENTAL '), 'Insidental');
  assert.equal(kelompokLabel('Jamaah Subuh'), 'Jamaah Subuh');
  assert.equal(kelompokLabel(''), '');
});

test('normalize: trim, null/undefined → string kosong', () => {
  assert.equal(normalizeKelompok(' 5 '), '5');
  assert.equal(normalizeKelompok(null), '');
  assert.equal(normalizeKelompok(undefined), '');
  assert.equal(normalizeKelompok(5), '5');
});
