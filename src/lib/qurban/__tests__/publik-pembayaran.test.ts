import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computePembayaran } from '../publik-pembayaran';

test('one transfer for the whole submission; suffix added once to the total', () => {
  const p = computePembayaran(3_000_000, 2, 4);
  assert.equal(p.total_harga, 6_000_000);
  assert.equal(p.payment_suffix, 4);
  assert.equal(p.nominal_transfer, 6_000_004);
  assert.equal(p.jumlah_slot, 2);
  assert.equal(p.harga_per_slot, 3_000_000);
});

test('coerces a string payment_suffix (config stores it as string)', () => {
  const p = computePembayaran(1_500_000, 1, '3');
  assert.equal(p.nominal_transfer, 1_500_003);
  assert.equal(p.payment_suffix, 3);
});

test('round price → last digit of nominal equals the suffix', () => {
  assert.equal(computePembayaran(2_500_000, 3, 7).nominal_transfer % 10, 7);
});

test('zero / non-numeric suffix → nominal equals total', () => {
  assert.equal(computePembayaran(1_000_000, 2, 0).nominal_transfer, 2_000_000);
  assert.equal(computePembayaran(1_000_000, 2, 'abc').nominal_transfer, 2_000_000);
});
