import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateMasterHewanCreate,
  validateMasterHewanPatch,
  kapasitasSlotForJenis,
  isKapasitasSlotValidForJenis,
  KAPASITAS_SLOT_BY_JENIS,
  maskNoHp,
  scoreLookupCandidate,
  type LookupCandidate,
} from '../validators';

// ---------------------------------------------------------------------------
// validateMasterHewanCreate
// ---------------------------------------------------------------------------

const validCreate = {
  jenis: 'SAPI',
  kelas: 'A',
  kapasitas_slot: 7,
  harga_beli: 20000000,
  harga_bawa_sendiri: 500000,
};

test('validateMasterHewanCreate accepts a well-formed payload', () => {
  const r = validateMasterHewanCreate(validCreate);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, validCreate);
});

test('validateMasterHewanCreate accepts harga 0 (free)', () => {
  const r = validateMasterHewanCreate({ ...validCreate, harga_beli: 0, harga_bawa_sendiri: 0 });
  assert.equal(r.ok, true);
});

test('validateMasterHewanCreate rejects unknown jenis', () => {
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'DOMBA' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'jenis'));
});

test('validateMasterHewanCreate rejects lowercase jenis', () => {
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'sapi' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'jenis'));
});

test('validateMasterHewanCreate rejects unknown kelas', () => {
  const r = validateMasterHewanCreate({ ...validCreate, kelas: 'E' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'kelas'));
});

test('validateMasterHewanCreate rejects kapasitas_slot 0', () => {
  const r = validateMasterHewanCreate({ ...validCreate, kapasitas_slot: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'kapasitas_slot'));
});

test('validateMasterHewanCreate rejects negative kapasitas_slot', () => {
  const r = validateMasterHewanCreate({ ...validCreate, kapasitas_slot: -1 });
  assert.equal(r.ok, false);
});

test('validateMasterHewanCreate rejects non-integer kapasitas_slot', () => {
  const r = validateMasterHewanCreate({ ...validCreate, kapasitas_slot: 3.5 });
  assert.equal(r.ok, false);
});

test('validateMasterHewanCreate rejects negative harga', () => {
  const r = validateMasterHewanCreate({ ...validCreate, harga_beli: -1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'harga_beli'));
});

test('validateMasterHewanCreate rejects string harga', () => {
  const r = validateMasterHewanCreate({ ...validCreate, harga_bawa_sendiri: '500000' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'harga_bawa_sendiri'));
});

test('validateMasterHewanCreate rejects non-object body', () => {
  assert.equal(validateMasterHewanCreate(null).ok, false);
  assert.equal(validateMasterHewanCreate('x').ok, false);
});

test('validateMasterHewanCreate rejects kapasitas_slot not matching jenis (KAMBING≠1)', () => {
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'KAMBING', kelas: 'A', kapasitas_slot: 7 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'kapasitas_slot'));
});

test('validateMasterHewanCreate rejects kapasitas_slot not matching jenis (SAPI≠7)', () => {
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'SAPI', kapasitas_slot: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'kapasitas_slot'));
});

test('validateMasterHewanCreate accepts KAMBING with kapasitas_slot 1', () => {
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'KAMBING', kelas: 'A', kapasitas_slot: 1 });
  assert.equal(r.ok, true);
});

test('validateMasterHewanCreate accepts SAPI with kapasitas_slot 7', () => {
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'SAPI', kapasitas_slot: 7 });
  assert.equal(r.ok, true);
});

test('validateMasterHewanCreate skips jenis cross-check when jenis invalid', () => {
  // Unknown jenis fails on its own; we should not also assert a kapasitas error.
  const r = validateMasterHewanCreate({ ...validCreate, jenis: 'DOMBA', kapasitas_slot: 99 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'jenis'));
});

// ---------------------------------------------------------------------------
// Kapasitas slot ↔ jenis mapping + cross-field guard
// ---------------------------------------------------------------------------

test('kapasitasSlotForJenis returns the fiqh constants', () => {
  assert.equal(kapasitasSlotForJenis('KAMBING'), 1);
  assert.equal(kapasitasSlotForJenis('SAPI'), 7);
});

test('kapasitasSlotForJenis returns undefined for unknown jenis', () => {
  assert.equal(kapasitasSlotForJenis('DOMBA'), undefined);
  assert.equal(kapasitasSlotForJenis(''), undefined);
});

test('KAPASITAS_SLOT_BY_JENIS covers every supported jenis', () => {
  assert.deepEqual(KAPASITAS_SLOT_BY_JENIS, { KAMBING: 1, SAPI: 7 });
});

test('isKapasitasSlotValidForJenis accepts matching pairs', () => {
  assert.equal(isKapasitasSlotValidForJenis('KAMBING', 1), true);
  assert.equal(isKapasitasSlotValidForJenis('SAPI', 7), true);
});

test('isKapasitasSlotValidForJenis rejects mismatched pairs', () => {
  assert.equal(isKapasitasSlotValidForJenis('KAMBING', 2), false);
  assert.equal(isKapasitasSlotValidForJenis('KAMBING', 9), false);
  assert.equal(isKapasitasSlotValidForJenis('SAPI', 1), false);
});

test('isKapasitasSlotValidForJenis rejects unknown jenis regardless of value', () => {
  assert.equal(isKapasitasSlotValidForJenis('DOMBA', 1), false);
  assert.equal(isKapasitasSlotValidForJenis('', 7), false);
});

// ---------------------------------------------------------------------------
// validateMasterHewanPatch
// ---------------------------------------------------------------------------

test('validateMasterHewanPatch accepts a single price field', () => {
  const r = validateMasterHewanPatch({ harga_beli: 21000000 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { harga_beli: 21000000 });
});

test('validateMasterHewanPatch accepts kapasitas update', () => {
  const r = validateMasterHewanPatch({ kapasitas_slot: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { kapasitas_slot: 1 });
});

test('validateMasterHewanPatch rejects immutable jenis', () => {
  const r = validateMasterHewanPatch({ jenis: 'KAMBING', harga_beli: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'jenis'));
});

test('validateMasterHewanPatch rejects immutable kelas', () => {
  const r = validateMasterHewanPatch({ kelas: 'B' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'kelas'));
});

test('validateMasterHewanPatch rejects empty body', () => {
  const r = validateMasterHewanPatch({});
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].field, '_');
});

test('validateMasterHewanPatch rejects invalid value on present field', () => {
  const r = validateMasterHewanPatch({ kapasitas_slot: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'kapasitas_slot'));
});

test('validateMasterHewanPatch accepts all three fields together', () => {
  const r = validateMasterHewanPatch({
    kapasitas_slot: 7,
    harga_beli: 1,
    harga_bawa_sendiri: 2,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { kapasitas_slot: 7, harga_beli: 1, harga_bawa_sendiri: 2 });
});

// ---------------------------------------------------------------------------
// maskNoHp
// ---------------------------------------------------------------------------

test('maskNoHp masks a standard 13-digit number', () => {
  assert.equal(maskNoHp('6281234567890'), '628****7890');
});

test('maskNoHp masks a 7-char value (boundary)', () => {
  assert.equal(maskNoHp('6281234'), '628****1234');
});

test('maskNoHp fully masks short values (<7)', () => {
  assert.equal(maskNoHp('628123'), '******');
  assert.equal(maskNoHp(''), '');
});

// ---------------------------------------------------------------------------
// scoreLookupCandidate
// ---------------------------------------------------------------------------

function cand(over: Partial<LookupCandidate> = {}): LookupCandidate {
  return {
    nama_lengkap: 'Ahmad Subarjo',
    no_hp: '6281234567890',
    alamat: 'Jl. Mawar No. 5',
    rt: '001',
    ...over,
  };
}

test('scoreLookupCandidate exact name match = 1.0', () => {
  const s = scoreLookupCandidate('ahmad subarjo', 'ahmad subarjo', cand());
  assert.equal(s, 1.0);
});

test('scoreLookupCandidate substring match base 0.85', () => {
  const s = scoreLookupCandidate('subarjo', 'subarjo', cand({ no_hp: '', alamat: '', rt: '' }));
  approxEqual(s, 0.85);
});

test('scoreLookupCandidate fuzzy match uses Jaro-Winkler (between 0 and 1)', () => {
  const s = scoreLookupCandidate('ahmad subarja', 'ahmad subarja', cand({ no_hp: '', alamat: '', rt: '' }));
  assert.ok(s > 0.85 && s < 1.0, `expected fuzzy score in (0.85,1.0), got ${s}`);
});

test('scoreLookupCandidate phone last-4 boost adds 0.2', () => {
  // Query is digits only → no name match (base ~0 for a digit string vs name),
  // but last-4 (7890) matches → +0.2.
  const base = scoreLookupCandidate('7890', '7890', cand({ no_hp: '' }));
  const boosted = scoreLookupCandidate('7890', '7890', cand());
  approxEqual(boosted - base, 0.2);
});

test('scoreLookupCandidate phone boost ignored when fewer than 4 digits', () => {
  const withShort = scoreLookupCandidate('890', '890', cand());
  const noPhone = scoreLookupCandidate('890', '890', cand({ no_hp: '' }));
  approxEqual(withShort, noPhone);
});

test('scoreLookupCandidate address boost adds 0.05', () => {
  const withAddr = scoreLookupCandidate('mawar', 'mawar', cand({ no_hp: '' }));
  const noAddr = scoreLookupCandidate('mawar', 'mawar', cand({ no_hp: '', alamat: '' }));
  approxEqual(withAddr - noAddr, 0.05);
});

test('scoreLookupCandidate RT exact match triggers address boost', () => {
  const s = scoreLookupCandidate('001', '001', cand({ nama_lengkap: 'Zzz', no_hp: '', alamat: '' }));
  // base (jaro of '001' vs 'zzz') is ~0; +0.05 RT boost.
  assert.ok(s >= 0.05, `expected at least the RT boost, got ${s}`);
});

test('scoreLookupCandidate caps at 1.0 with stacked boosts', () => {
  // Exact name (1.0) + phone boost + address boost would exceed 1.0 → capped.
  const s = scoreLookupCandidate('ahmad subarjo', 'ahmad subarjo', cand());
  assert.equal(s, 1.0);
});

function approxEqual(actual: number, expected: number, tol = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${actual} ≈ ${expected}`
  );
}
