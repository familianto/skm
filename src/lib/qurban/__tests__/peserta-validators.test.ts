import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePesertaCreate,
  validatePesertaPatch,
  validatePesertaCancel,
  isValidStatusPendaftaran,
  isValidSumberPendaftaran,
} from '../peserta-validators';

const base = {
  muqorib_id: 'MQR-1',
  master_hewan_id: 'MHW-1',
  tipe_qurban: 'BELI',
  jumlah_slot: 3,
};

test('validatePesertaCreate: payload valid, default nama array & flag', () => {
  const r = validatePesertaCreate({ ...base });
  assert.equal(r.ok, true);
  if (r.ok && r.value) {
    assert.equal(r.value.jumlah_slot, 3);
    assert.deepEqual(r.value.nama_atas_nama_per_slot, ['', '', '']);
    assert.equal(r.value.allow_additional_qurban, false);
    assert.equal(r.value.tipe_qurban, 'BELI');
  }
});

test('validatePesertaCreate: nama_atas_nama_per_slot trim + null → ""', () => {
  const r = validatePesertaCreate({ ...base, nama_atas_nama_per_slot: [null, ' Ibu ', 'Bapak'] });
  assert.equal(r.ok, true);
  if (r.ok && r.value) assert.deepEqual(r.value.nama_atas_nama_per_slot, ['', 'Ibu', 'Bapak']);
});

test('validatePesertaCreate: panjang nama array != jumlah_slot → error', () => {
  const r = validatePesertaCreate({ ...base, nama_atas_nama_per_slot: ['a', 'b'] });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].field, 'nama_atas_nama_per_slot');
});

test('validatePesertaCreate: jumlah_slot harus int > 0', () => {
  for (const bad of [0, -1, 2.5, '3']) {
    const r = validatePesertaCreate({ ...base, jumlah_slot: bad });
    assert.equal(r.ok, false, `jumlah_slot=${bad}`);
  }
});

test('validatePesertaCreate: field wajib hilang & tipe invalid', () => {
  assert.equal(validatePesertaCreate({}).ok, false);
  assert.equal(validatePesertaCreate({ ...base, muqorib_id: '' }).ok, false);
  assert.equal(validatePesertaCreate({ ...base, tipe_qurban: 'XXX' }).ok, false);
});

test('validatePesertaCreate: allow_additional_qurban harus boolean', () => {
  assert.equal(validatePesertaCreate({ ...base, allow_additional_qurban: 'yes' }).ok, false);
  const r = validatePesertaCreate({ ...base, allow_additional_qurban: true });
  assert.equal(r.ok, true);
  if (r.ok && r.value) assert.equal(r.value.allow_additional_qurban, true);
});

test('validatePesertaPatch: hanya field non-slot, immutable ditolak', () => {
  const ok = validatePesertaPatch({ nama_atas_nama: ' X ', notes: 'n' });
  assert.equal(ok.ok, true);
  if (ok.ok && ok.value) {
    assert.equal(ok.value.nama_atas_nama, 'X');
    assert.equal(ok.value.notes, 'n');
  }
  for (const f of ['hewan_id', 'slot_number', 'status_pendaftaran', 'harga_disepakati', 'kode_bayar']) {
    const r = validatePesertaPatch({ [f]: 'v' });
    assert.equal(r.ok, false, `immutable ${f}`);
    assert.equal(r.errors[0].field, f);
  }
});

test('validatePesertaPatch: tanpa field → error', () => {
  assert.equal(validatePesertaPatch({}).ok, false);
});

test('validatePesertaCancel: alasan/refund opsional, trim', () => {
  const r = validatePesertaCancel({ alasan: ' batal ', refund_handling: 'transfer' });
  assert.equal(r.ok, true);
  if (r.ok && r.value) {
    assert.equal(r.value.alasan, 'batal');
    assert.equal(r.value.refund_handling, 'transfer');
  }
  const empty = validatePesertaCancel({});
  assert.equal(empty.ok, true);
  if (empty.ok && empty.value) assert.equal(empty.value.alasan, '');
});

test('isValidStatusPendaftaran / isValidSumberPendaftaran', () => {
  assert.ok(isValidStatusPendaftaran('TERDAFTAR'));
  assert.ok(isValidStatusPendaftaran('BATAL'));
  assert.ok(!isValidStatusPendaftaran('AKTIF'));
  assert.ok(isValidSumberPendaftaran('PUBLIK'));
  assert.ok(isValidSumberPendaftaran('PANITIA'));
  assert.ok(isValidSumberPendaftaran('IMPORT_1447H'));
  assert.ok(!isValidSumberPendaftaran('LAINNYA'));
});
