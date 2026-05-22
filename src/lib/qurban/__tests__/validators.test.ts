import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_PANITIA_PERAN,
  isAllowedPanitiaPeran,
  isValidDistribusiDateRange,
  isValidPaymentSuffix,
} from '../validators';

test('ALLOWED_PANITIA_PERAN lists the four operational roles, never BENDAHARA', () => {
  for (const p of ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI']) {
    assert.ok(ALLOWED_PANITIA_PERAN.includes(p), `${p} should be allowed`);
  }
  assert.equal(ALLOWED_PANITIA_PERAN.includes('BENDAHARA'), false);
});

test('isAllowedPanitiaPeran accepts the four operational roles', () => {
  for (const p of ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI']) {
    assert.equal(isAllowedPanitiaPeran(p), true, `${p} should be allowed`);
  }
});

test('isAllowedPanitiaPeran rejects BENDAHARA and unknown values', () => {
  assert.equal(isAllowedPanitiaPeran('BENDAHARA'), false);
  for (const p of ['', 'PENGURUS', 'VIEWER', 'admin_qurban', 'super_admin', 'OWNER']) {
    assert.equal(isAllowedPanitiaPeran(p), false, `${JSON.stringify(p)} should be rejected`);
  }
});

test('isValidDistribusiDateRange — both empty is OK (partial save)', () => {
  assert.equal(isValidDistribusiDateRange('', ''), true);
});

test('isValidDistribusiDateRange — one side empty is OK', () => {
  assert.equal(isValidDistribusiDateRange('2027-04-20', ''), true);
  assert.equal(isValidDistribusiDateRange('', '2027-04-22'), true);
});

test('isValidDistribusiDateRange — equal dates are OK (same-day distribusi)', () => {
  assert.equal(isValidDistribusiDateRange('2027-04-20', '2027-04-20'), true);
});

test('isValidDistribusiDateRange — mulai before selesai is OK', () => {
  assert.equal(isValidDistribusiDateRange('2027-04-20', '2027-04-22'), true);
});

test('isValidDistribusiDateRange — mulai after selesai is rejected', () => {
  assert.equal(isValidDistribusiDateRange('2027-04-22', '2027-04-20'), false);
});

test('isValidDistribusiDateRange uses lexicographic compare on ISO dates', () => {
  // ISO-8601 sorts lexicographically; verify a year-cross case.
  assert.equal(isValidDistribusiDateRange('2026-12-31', '2027-01-01'), true);
  assert.equal(isValidDistribusiDateRange('2027-01-01', '2026-12-31'), false);
});

test('isValidPaymentSuffix accepts 0–9 integers', () => {
  for (let n = 0; n <= 9; n++) {
    assert.equal(isValidPaymentSuffix(n), true, `${n} should be valid`);
  }
});

test('isValidPaymentSuffix rejects out-of-range, non-integer, NaN, Infinity', () => {
  for (const n of [-1, 10, 100, 0.5, 3.7, NaN, Infinity, -Infinity]) {
    assert.equal(isValidPaymentSuffix(n), false, `${n} should be invalid`);
  }
});
