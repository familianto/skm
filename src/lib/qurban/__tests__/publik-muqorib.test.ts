import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findMuqoribByNoHp, muqoribDataDiffers } from '../publik-muqorib';
import type { QurbanMuqorib } from '../muqorib-repo';
import type { MuqoribCreateInput } from '../validators';

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

test('findMuqoribByNoHp matches on normalized phone', () => {
  const list = [mk({ id: 'A', no_hp: '628226083451' })];
  // input in 08… form normalizes to the same 628…
  assert.equal(findMuqoribByNoHp(list, '08226083451')?.id, 'A');
});

test('findMuqoribByNoHp prefers an active match over inactive', () => {
  const list = [
    mk({ id: 'OLD', no_hp: '628226083451', is_active: false }),
    mk({ id: 'NEW', no_hp: '628226083451', is_active: true }),
  ];
  assert.equal(findMuqoribByNoHp(list, '628226083451')?.id, 'NEW');
});

test('findMuqoribByNoHp returns null for no match / empty input', () => {
  assert.equal(findMuqoribByNoHp([mk({})], '628000000000'), null);
  assert.equal(findMuqoribByNoHp([mk({})], ''), null);
});

test('findMuqoribByNoHp returns the inactive record when it is the only match (PB3 C4 rejects it)', () => {
  const list = [mk({ id: 'OLD', no_hp: '628226083451', is_active: false })];
  const found = findMuqoribByNoHp(list, '628226083451');
  assert.equal(found?.id, 'OLD');
  assert.equal(found?.is_active, false);
});

const submitted: MuqoribCreateInput = {
  nama_lengkap: 'Hopy Familianto',
  alamat: 'Jl. Mawar 1',
  rt: '001',
  no_hp: '628226083451',
};

test('muqoribDataDiffers — identical (case-insensitive) → false', () => {
  assert.equal(muqoribDataDiffers(mk({ nama_lengkap: 'HOPY FAMILIANTO' }), submitted), false);
});

test('muqoribDataDiffers — divergent name/alamat/rt → true', () => {
  assert.equal(muqoribDataDiffers(mk({ nama_lengkap: 'Beda' }), submitted), true);
  assert.equal(muqoribDataDiffers(mk({ alamat: 'Jl. Lain' }), submitted), true);
  assert.equal(muqoribDataDiffers(mk({ rt: '002' }), submitted), true);
});
