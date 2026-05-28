import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePublikLookup,
  validatePublikDaftar,
  MAX_PUBLIK_SLOT,
} from '../publik-validators';

// --- PB2 lookup (F4d phone-primary) -----------------------------------------

test('lookup (F4d): no_hp required (nama TIDAK lagi dipakai)', () => {
  assert.equal(validatePublikLookup({}).ok, false);
  assert.equal(validatePublikLookup({ nama_lengkap: 'Hopy' }).ok, false);
});

test('lookup (F4d): nama_lengkap diabaikan; cukup no_hp', () => {
  const r = validatePublikLookup({ no_hp: '08226083451' });
  assert.equal(r.ok, true);
  assert.equal(r.value?.no_hp, '628226083451');
  assert.equal((r.value as { nama_lengkap?: string }).nama_lengkap, undefined);
});

test('lookup (F4d): normalizes no_hp to 628…', () => {
  const r = validatePublikLookup({ no_hp: '  08226083451  ' });
  assert.equal(r.ok, true);
  assert.equal(r.value?.no_hp, '628226083451');
});

test('lookup (F4d): rejects malformed no_hp', () => {
  assert.equal(validatePublikLookup({ no_hp: '123' }).ok, false);
  assert.equal(validatePublikLookup({ no_hp: '' }).ok, false);
});

// --- PB3 daftar -------------------------------------------------------------

const validData = { nama_lengkap: 'Hopy', alamat: 'Jl. Mawar', rt: '001', no_hp: '08226083451' };

test('daftar: requires exactly one of muqorib_id / muqorib_data', () => {
  const base = { master_hewan_id: 'MHW-1', tipe_qurban: 'BELI', jumlah_slot: 1 };
  assert.equal(validatePublikDaftar({ ...base }).ok, false); // neither
  assert.equal(validatePublikDaftar({ ...base, muqorib_id: 'MQR-1', muqorib_data: validData }).ok, false); // both
});

test('daftar: muqorib_id path', () => {
  const r = validatePublikDaftar({ muqorib_id: 'MQR-1', master_hewan_id: 'MHW-1', tipe_qurban: 'BELI', jumlah_slot: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.value?.muqorib_id, 'MQR-1');
  assert.equal(r.value?.muqorib_data, null);
});

test('daftar: muqorib_data path normalizes phone, sets muqorib_id null', () => {
  const r = validatePublikDaftar({ muqorib_data: validData, master_hewan_id: 'MHW-1', tipe_qurban: 'BAWA_SENDIRI', jumlah_slot: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.value?.muqorib_id, null);
  assert.equal(r.value?.muqorib_data?.no_hp, '628226083451');
});

test('daftar: invalid muqorib_data surfaces prefixed field errors', () => {
  const r = validatePublikDaftar({ muqorib_data: { nama_lengkap: '', alamat: '', rt: 'X', no_hp: 'bad' }, master_hewan_id: 'MHW-1', tipe_qurban: 'BELI', jumlah_slot: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field.startsWith('muqorib_data.')));
});

test('daftar: jumlah_slot must be a positive int within the cap', () => {
  const base = { muqorib_id: 'MQR-1', master_hewan_id: 'MHW-1', tipe_qurban: 'BELI' };
  assert.equal(validatePublikDaftar({ ...base, jumlah_slot: 0 }).ok, false);
  assert.equal(validatePublikDaftar({ ...base, jumlah_slot: -1 }).ok, false);
  assert.equal(validatePublikDaftar({ ...base, jumlah_slot: 1.5 }).ok, false);
  assert.equal(validatePublikDaftar({ ...base, jumlah_slot: MAX_PUBLIK_SLOT + 1 }).ok, false);
  assert.equal(validatePublikDaftar({ ...base, jumlah_slot: MAX_PUBLIK_SLOT }).ok, true);
});

test('daftar: invalid tipe_qurban', () => {
  const r = validatePublikDaftar({ muqorib_id: 'MQR-1', master_hewan_id: 'MHW-1', tipe_qurban: 'SAPI', jumlah_slot: 1 });
  assert.equal(r.ok, false);
});

test('daftar: nama_atas_nama trimmed; defaults to empty', () => {
  const r = validatePublikDaftar({ muqorib_id: 'MQR-1', master_hewan_id: 'MHW-1', tipe_qurban: 'BELI', jumlah_slot: 1, nama_atas_nama: '  Alm. Ibu  ' });
  assert.equal(r.value?.nama_atas_nama, 'Alm. Ibu');
  const r2 = validatePublikDaftar({ muqorib_id: 'MQR-1', master_hewan_id: 'MHW-1', tipe_qurban: 'BELI', jumlah_slot: 1 });
  assert.equal(r2.value?.nama_atas_nama, '');
});
