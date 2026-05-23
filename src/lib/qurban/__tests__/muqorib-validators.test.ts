import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateMuqoribCreate,
  validateMuqoribPatch,
} from '../validators';

// ---------------------------------------------------------------------------
// validateMuqoribCreate
// ---------------------------------------------------------------------------

test('validateMuqoribCreate accepts a well-formed payload, normalizes no_hp', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: '  Pak Hopy  ',
    alamat: '  Jl. Damai No. 1 ',
    rt: '001',
    no_hp: '081234567890',
    notes: 'jamaah lama',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value, {
    nama_lengkap: 'Pak Hopy',
    alamat: 'Jl. Damai No. 1',
    rt: '001',
    no_hp: '6281234567890',
    notes: 'jamaah lama',
  });
});

test('validateMuqoribCreate defaults notes to "" when omitted', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: 'Pak Hopy',
    alamat: 'Jl. Damai No. 1',
    rt: '002',
    no_hp: '6281234567890',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value?.notes, '');
});

test('validateMuqoribCreate rejects missing nama_lengkap', () => {
  const result = validateMuqoribCreate({
    alamat: 'Jl. Damai',
    rt: '001',
    no_hp: '6281234567890',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'nama_lengkap'));
});

test('validateMuqoribCreate rejects blank-after-trim nama_lengkap', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: '   ',
    alamat: 'Jl. Damai',
    rt: '001',
    no_hp: '6281234567890',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'nama_lengkap'));
});

test('validateMuqoribCreate rejects missing alamat', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: 'Pak Hopy',
    rt: '001',
    no_hp: '6281234567890',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'alamat'));
});

test('validateMuqoribCreate rejects rt outside enum', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: 'Pak Hopy',
    alamat: 'Jl. Damai',
    rt: '999',
    no_hp: '6281234567890',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'rt'));
});

test('validateMuqoribCreate rejects no_hp that fails after normalization', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: 'Pak Hopy',
    alamat: 'Jl. Damai',
    rt: '001',
    no_hp: '12345',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'no_hp'));
});

test('validateMuqoribCreate rejects non-object body', () => {
  assert.equal(validateMuqoribCreate(null).ok, false);
  assert.equal(validateMuqoribCreate('hi').ok, false);
  assert.equal(validateMuqoribCreate(42).ok, false);
});

test('validateMuqoribCreate rejects non-string notes', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: 'Pak Hopy',
    alamat: 'Jl. Damai',
    rt: '001',
    no_hp: '6281234567890',
    notes: 123,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'notes'));
});

test('validateMuqoribCreate aggregates multiple field errors', () => {
  const result = validateMuqoribCreate({
    nama_lengkap: '',
    alamat: '',
    rt: 'XYZ',
    no_hp: 'abc',
  });
  assert.equal(result.ok, false);
  const fields = result.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['alamat', 'nama_lengkap', 'no_hp', 'rt']);
});

// ---------------------------------------------------------------------------
// validateMuqoribPatch
// ---------------------------------------------------------------------------

test('validateMuqoribPatch accepts a single-field update', () => {
  const result = validateMuqoribPatch({ nama_lengkap: 'Pak Baru' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { nama_lengkap: 'Pak Baru' });
});

test('validateMuqoribPatch normalizes no_hp when present', () => {
  const result = validateMuqoribPatch({ no_hp: '081299990000' });
  assert.equal(result.ok, true);
  assert.equal(result.value?.no_hp, '6281299990000');
});

test('validateMuqoribPatch rejects empty body (no patchable field)', () => {
  const result = validateMuqoribPatch({});
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, '_');
});

test('validateMuqoribPatch rejects body with only undefined fields', () => {
  const result = validateMuqoribPatch({ nama_lengkap: undefined, rt: undefined });
  assert.equal(result.ok, false);
});

test('validateMuqoribPatch validates only the fields present', () => {
  const result = validateMuqoribPatch({ rt: 'XYZ' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, 'rt');
});

test('validateMuqoribPatch rejects invalid no_hp on patch', () => {
  const result = validateMuqoribPatch({ no_hp: '12345' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'no_hp'));
});

test('validateMuqoribPatch rejects blank string fields', () => {
  const result = validateMuqoribPatch({ alamat: '   ' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'alamat'));
});

test('validateMuqoribPatch allows notes to be set to empty string', () => {
  const result = validateMuqoribPatch({ notes: '' });
  assert.equal(result.ok, true);
  assert.equal(result.value?.notes, '');
});

test('validateMuqoribPatch trims string fields', () => {
  const result = validateMuqoribPatch({ nama_lengkap: '  Pak Baru  ' });
  assert.equal(result.ok, true);
  assert.equal(result.value?.nama_lengkap, 'Pak Baru');
});

test('validateMuqoribPatch rejects non-object body', () => {
  assert.equal(validateMuqoribPatch(null).ok, false);
  assert.equal(validateMuqoribPatch('hi').ok, false);
});
