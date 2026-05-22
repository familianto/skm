import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RT_VALUES,
  JENIS_HEWAN,
  KELAS_HEWAN,
  normalizeNoHp,
  isValidNoHp,
  isValidRt,
  isValidJenisHewan,
  isValidKelasHewan,
} from '../validators';

// ---------------------------------------------------------------------------
// Enum constants
// ---------------------------------------------------------------------------

test('RT_VALUES lists 001..006 plus Lainnya', () => {
  assert.deepEqual(
    [...RT_VALUES],
    ['001', '002', '003', '004', '005', '006', 'Lainnya']
  );
});

test('JENIS_HEWAN lists SAPI and KAMBING (uppercase)', () => {
  assert.deepEqual([...JENIS_HEWAN], ['SAPI', 'KAMBING']);
});

test('KELAS_HEWAN lists A..D (uppercase)', () => {
  assert.deepEqual([...KELAS_HEWAN], ['A', 'B', 'C', 'D']);
});

// ---------------------------------------------------------------------------
// normalizeNoHp
// ---------------------------------------------------------------------------

test('normalizeNoHp converts 0-prefixed local number to 62-prefixed', () => {
  assert.equal(normalizeNoHp('081234567890'), '6281234567890');
});

test('normalizeNoHp adds 62 to bare 8-prefixed number', () => {
  assert.equal(normalizeNoHp('81234567890'), '6281234567890');
});

test('normalizeNoHp leaves already-normalized 62-prefixed number untouched', () => {
  assert.equal(normalizeNoHp('6281234567890'), '6281234567890');
});

test('normalizeNoHp strips +, spaces, and dashes', () => {
  assert.equal(normalizeNoHp('+62 812-3456-7890'), '6281234567890');
});

test('normalizeNoHp returns "" for empty string', () => {
  assert.equal(normalizeNoHp(''), '');
});

test('normalizeNoHp returns "" when input has no digits', () => {
  assert.equal(normalizeNoHp('   '), '');
  assert.equal(normalizeNoHp('---'), '');
});

// ---------------------------------------------------------------------------
// isValidNoHp
// ---------------------------------------------------------------------------

test('isValidNoHp accepts normalized 62-prefixed mobile number', () => {
  assert.equal(isValidNoHp('6281234567890'), true);
});

test('isValidNoHp rejects un-normalized 0-prefixed number', () => {
  assert.equal(isValidNoHp('081234567890'), false);
});

test('isValidNoHp rejects too-short value', () => {
  assert.equal(isValidNoHp('628'), false);
});

test('isValidNoHp rejects non-Indonesian-mobile value', () => {
  assert.equal(isValidNoHp('12345'), false);
});

test('isValidNoHp rejects empty string', () => {
  assert.equal(isValidNoHp(''), false);
});

// ---------------------------------------------------------------------------
// isValidRt / isValidJenisHewan / isValidKelasHewan
// ---------------------------------------------------------------------------

test('isValidRt accepts known RT codes', () => {
  assert.equal(isValidRt('001'), true);
  assert.equal(isValidRt('Lainnya'), true);
});

test('isValidRt rejects unknown RT codes', () => {
  assert.equal(isValidRt('007'), false);
  assert.equal(isValidRt('lainnya'), false); // case-sensitive
  assert.equal(isValidRt(''), false);
});

test('isValidJenisHewan accepts SAPI and KAMBING', () => {
  assert.equal(isValidJenisHewan('SAPI'), true);
  assert.equal(isValidJenisHewan('KAMBING'), true);
});

test('isValidJenisHewan rejects unknown / lowercase / empty', () => {
  assert.equal(isValidJenisHewan('sapi'), false);
  assert.equal(isValidJenisHewan('DOMBA'), false);
  assert.equal(isValidJenisHewan(''), false);
});

test('isValidKelasHewan accepts A..D', () => {
  for (const k of ['A', 'B', 'C', 'D']) {
    assert.equal(isValidKelasHewan(k), true, `${k} should be valid`);
  }
});

test('isValidKelasHewan rejects unknown / lowercase / empty', () => {
  assert.equal(isValidKelasHewan('E'), false);
  assert.equal(isValidKelasHewan('a'), false);
  assert.equal(isValidKelasHewan(''), false);
});
