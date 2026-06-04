import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  availableTipeQurban,
  dedupeKodeBayar,
  findOption,
  friendlyPublikError,
  hasAvailableOptions,
  jenisForTipe,
  kelasForTipeJenis,
  tipeQurbanLabel,
} from '@/lib/qurban/publik-daftar-form';
import type { TipeOption } from '@/lib/qurban/publik-options';

/**
 * Pure transforms for the F4c-E public wizard. The wizard component/route is not
 * unit-tested (no React-testing harness in this repo — node:test on pure libs).
 */

function opt(p: Partial<TipeOption>): TipeOption {
  return {
    master_hewan_id: 'MH-1',
    jenis: 'SAPI',
    kelas: 'A',
    kapasitas_slot: 7,
    tipe_qurban: 'BELI',
    harga_per_slot: 3_000_000,
    slot_tersedia: 7,
    ...p,
  };
}

const OPTIONS: TipeOption[] = [
  opt({ master_hewan_id: 'MH-1', jenis: 'SAPI', kelas: 'A', tipe_qurban: 'BELI' }),
  opt({ master_hewan_id: 'MH-1', jenis: 'SAPI', kelas: 'A', tipe_qurban: 'BAWA_SENDIRI', harga_per_slot: 1_000_000 }),
  opt({ master_hewan_id: 'MH-2', jenis: 'SAPI', kelas: 'B', tipe_qurban: 'BELI', harga_per_slot: 2_500_000 }),
  opt({ master_hewan_id: 'MH-3', jenis: 'KAMBING', kelas: 'A', tipe_qurban: 'BELI', kapasitas_slot: 1, harga_per_slot: 2_000_000 }),
];

// ── hasAvailableOptions — drives the public "pendaftaran penuh" banner ───────

test('hasAvailableOptions: true when at least one option has slots (form shown)', () => {
  assert.equal(hasAvailableOptions(OPTIONS), true);
  assert.equal(hasAvailableOptions([opt({ slot_tersedia: 0 }), opt({ slot_tersedia: 3 })]), true);
});

test('hasAvailableOptions: false when empty or every option reports zero slots (banner)', () => {
  assert.equal(hasAvailableOptions([]), false);
  assert.equal(hasAvailableOptions([opt({ slot_tersedia: 0 }), opt({ slot_tersedia: 0 })]), false);
});

test('tipeQurbanLabel maps known tipe', () => {
  assert.equal(tipeQurbanLabel('BELI'), 'Beli (disediakan panitia)');
  assert.equal(tipeQurbanLabel('BAWA_SENDIRI'), 'Bawa Sendiri');
  assert.equal(tipeQurbanLabel('X'), 'X');
});

test('availableTipeQurban returns distinct tipe, BELI first', () => {
  assert.deepEqual(availableTipeQurban(OPTIONS), ['BELI', 'BAWA_SENDIRI']);
  assert.deepEqual(availableTipeQurban([opt({ tipe_qurban: 'BAWA_SENDIRI' })]), ['BAWA_SENDIRI']);
  assert.deepEqual(availableTipeQurban([]), []);
});

test('jenisForTipe filters by tipe and dedupes', () => {
  assert.deepEqual(jenisForTipe(OPTIONS, 'BELI'), ['KAMBING', 'SAPI']);
  assert.deepEqual(jenisForTipe(OPTIONS, 'BAWA_SENDIRI'), ['SAPI']);
  assert.deepEqual(jenisForTipe(OPTIONS, ''), []);
});

test('kelasForTipeJenis returns matching options sorted by kelas', () => {
  const out = kelasForTipeJenis(OPTIONS, 'BELI', 'SAPI');
  assert.deepEqual(out.map((o) => o.kelas), ['A', 'B']);
  assert.equal(kelasForTipeJenis(OPTIONS, 'BAWA_SENDIRI', 'KAMBING').length, 0);
});

test('findOption resolves a (tipe, jenis, kelas) triple', () => {
  assert.equal(findOption(OPTIONS, 'BELI', 'SAPI', 'B')?.master_hewan_id, 'MH-2');
  assert.equal(findOption(OPTIONS, 'BAWA_SENDIRI', 'SAPI', 'A')?.harga_per_slot, 1_000_000);
  assert.equal(findOption(OPTIONS, 'BELI', 'SAPI', 'Z'), undefined);
  assert.equal(findOption(OPTIONS, '', 'SAPI', 'A'), undefined);
});

test('dedupeKodeBayar returns the single shared code', () => {
  assert.equal(
    dedupeKodeBayar([{ kode_bayar: 'QRB-1448-003' }, { kode_bayar: 'QRB-1448-003' }]),
    'QRB-1448-003'
  );
  assert.equal(dedupeKodeBayar([{ kode_bayar: '' }, { kode_bayar: 'QRB-1448-009' }]), 'QRB-1448-009');
  assert.equal(dedupeKodeBayar([]), '');
});

test('friendlyPublikError prefers server message, else maps code/status', () => {
  assert.equal(friendlyPublikError('DUPLICATE_PESERTA', 409, 'Anda sudah terdaftar.'), 'Anda sudah terdaftar.');
  assert.equal(friendlyPublikError('DUPLICATE_PESERTA', 409), 'Anda sudah terdaftar pada edisi ini.');
  assert.equal(friendlyPublikError('BUSINESS_EDISI_NOT_AKTIF', 422), 'Pendaftaran qurban sedang ditutup.');
  assert.equal(friendlyPublikError('RATE_LIMITED', 429), 'Terlalu banyak permintaan. Mohon coba lagi beberapa saat.');
  assert.match(friendlyPublikError('INTERNAL_ERROR', 500), /Terjadi kesalahan/);
  assert.match(friendlyPublikError('UNKNOWN', 429), /Terlalu banyak/);
});
