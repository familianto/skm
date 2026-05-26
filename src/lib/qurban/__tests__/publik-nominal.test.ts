import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeNominalTransfer } from '@/lib/qurban/publik-nominal';

test('adds a numeric suffix directly', () => {
  assert.equal(computeNominalTransfer(1_500_000, 4), 1_500_004);
});

test('coerces a string suffix (config stores it as a string)', () => {
  assert.equal(computeNominalTransfer(1_500_000, '4'), 1_500_004);
  assert.equal(computeNominalTransfer(2_000_000, '3'), 2_000_003);
});

test('round price → last digit equals the suffix', () => {
  assert.equal(computeNominalTransfer(750_000, 7) % 10, 7);
});

test('non-numeric suffix falls back to 0', () => {
  assert.equal(computeNominalTransfer(1_000_000, 'abc'), 1_000_000);
  assert.equal(computeNominalTransfer(1_000_000, ''), 1_000_000);
});

test('zero suffix is a no-op', () => {
  assert.equal(computeNominalTransfer(1_234_567, 0), 1_234_567);
});
