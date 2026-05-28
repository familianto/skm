import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isPhoneQuery, selectActiveMuqoribByPhone } from '../muqorib-lookup';
import type { QurbanMuqorib } from '../muqorib-repo';

function mk(p: Partial<QurbanMuqorib> = {}): QurbanMuqorib {
  return {
    id: 'MQR-1',
    nama_lengkap: 'Hopy Familianto',
    alamat: 'Jl. Mawar 1',
    rt: '001',
    no_hp: '628226083451',
    is_active: true,
    data_induk_ref_1447h: '',
    notes: '',
    created_at: '',
    created_by: '',
    updated_at: '',
    ...p,
  };
}

// --- isPhoneQuery -----------------------------------------------------------

test('isPhoneQuery — pure-digit HP shapes → true (≥7 digits)', () => {
  assert.equal(isPhoneQuery('628226083451'), true);
  assert.equal(isPhoneQuery('08226083451'), true);
  assert.equal(isPhoneQuery('8226083451'), true);
  assert.equal(isPhoneQuery('1234567'), true); // 7-digit boundary
});

test('isPhoneQuery — tolerates `+`, spaces, dashes (real-world WhatsApp paste)', () => {
  assert.equal(isPhoneQuery('+62 822 6083 451'), true);
  assert.equal(isPhoneQuery('0822-6083-451'), true);
});

test('isPhoneQuery — name-like input → false', () => {
  assert.equal(isPhoneQuery('Hopy Familianto'), false);
  assert.equal(isPhoneQuery('Ahmad'), false);
  assert.equal(isPhoneQuery(''), false);
  assert.equal(isPhoneQuery('   '), false);
});

test('isPhoneQuery — too-few digits → false (let fuzzy name search handle it)', () => {
  assert.equal(isPhoneQuery('123456'), false); // 6 < 7
  assert.equal(isPhoneQuery('Budi 0822'), false); // 4 digits, also lots of letters
});

test('isPhoneQuery — digit-ratio below 70% → false', () => {
  // "abc12345678" → 8 digits, but 3 letters dilute the ratio (8/11 ≈ 0.73 → still true)
  // tighter case:
  assert.equal(isPhoneQuery('namaXYZ1234567'), false); // 7/14 = 0.5 → false
});

// --- selectActiveMuqoribByPhone --------------------------------------------

test('selectActiveMuqoribByPhone — empty/malformed input → null', () => {
  const list = [mk({})];
  assert.equal(selectActiveMuqoribByPhone(list, ''), null);
  assert.equal(selectActiveMuqoribByPhone(list, '   '), null);
  assert.equal(selectActiveMuqoribByPhone(list, 'abc'), null);
  assert.equal(selectActiveMuqoribByPhone(list, '628'), null); // shape invalid
});

test('selectActiveMuqoribByPhone — returns the active match (normalizes 08… → 628…)', () => {
  const list = [
    mk({ id: 'A', no_hp: '628226083451', is_active: true }),
    mk({ id: 'B', no_hp: '628111111111', is_active: true }),
  ];
  assert.equal(selectActiveMuqoribByPhone(list, '08226083451')?.id, 'A');
});

test('selectActiveMuqoribByPhone — inactive-only match treated as NOT found (PB2 & M7-by-HP must not surface inactive)', () => {
  const list = [mk({ id: 'OLD', no_hp: '628226083451', is_active: false })];
  assert.equal(selectActiveMuqoribByPhone(list, '628226083451'), null);
});

test('selectActiveMuqoribByPhone — active preferred over inactive with same HP', () => {
  const list = [
    mk({ id: 'OLD', no_hp: '628226083451', is_active: false }),
    mk({ id: 'NEW', no_hp: '628226083451', is_active: true }),
  ];
  assert.equal(selectActiveMuqoribByPhone(list, '628226083451')?.id, 'NEW');
});

test('selectActiveMuqoribByPhone — no match → null', () => {
  const list = [mk({ id: 'X', no_hp: '628111111111', is_active: true })];
  assert.equal(selectActiveMuqoribByPhone(list, '628999999999'), null);
});
