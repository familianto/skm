import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, validatePhone } from '../phone';

test('normalize: already 628xxx returns unchanged', () => {
  assert.equal(normalizePhone('628123456789'), '628123456789');
  assert.equal(normalizePhone('6281234567890'), '6281234567890');
});

test('normalize: 08xxx becomes 628xxx', () => {
  assert.equal(normalizePhone('08123456789'), '628123456789');
  assert.equal(normalizePhone('081234567890'), '6281234567890');
});

test('normalize: 8xxx becomes 628xxx', () => {
  assert.equal(normalizePhone('8123456789'), '628123456789');
});

test('normalize: +628xxx becomes 628xxx', () => {
  assert.equal(normalizePhone('+628123456789'), '628123456789');
});

test('normalize: handles spaces, hyphens, parentheses', () => {
  assert.equal(normalizePhone('0812-3456-789'), '628123456789');
  assert.equal(normalizePhone('+62 812 3456 789'), '628123456789');
  assert.equal(normalizePhone('(0812) 3456-789'), '628123456789');
  assert.equal(normalizePhone(' 628123456789 '), '628123456789');
});

test('normalize: empty / non-string input returns empty', () => {
  assert.equal(normalizePhone(''), '');
  // @ts-expect-error intentional bad input
  assert.equal(normalizePhone(null), '');
  // @ts-expect-error intentional bad input
  assert.equal(normalizePhone(undefined), '');
  assert.equal(normalizePhone('abc'), '');
});

test('normalize: leading 0 (not 08) becomes 62 + rest', () => {
  // e.g., 021xxx (Jakarta landline) → 6221xxx (degenerate but consistent)
  assert.equal(normalizePhone('021234567'), '6221234567');
});

test('validate: rejects too short (under 11 total digits)', () => {
  assert.equal(validatePhone('6281234567'), false); // 10 digits, need ≥11
});

test('validate: rejects too long (over 15 total)', () => {
  assert.equal(validatePhone('628123456789012345'), false); // 18 digits
});

test('validate: rejects wrong prefix', () => {
  assert.equal(validatePhone('081234567890'), false); // not normalized
  assert.equal(validatePhone('629123456789'), false); // 629 not 628
  assert.equal(validatePhone('1234567890'), false);
  assert.equal(validatePhone(''), false);
});

test('validate: accepts 628 + 8 to 12 trailing digits', () => {
  assert.equal(validatePhone('62812345678'), true);   // 11 total
  assert.equal(validatePhone('628123456789'), true);  // 12
  assert.equal(validatePhone('6281234567890'), true); // 13
  assert.equal(validatePhone('62812345678901'), true);// 14
  assert.equal(validatePhone('628123456789012'), true);// 15
});

test('round-trip normalize + validate for common Indonesian formats', () => {
  const variants = [
    '081234567890',
    '+62812-3456-7890',
    '628123456789',
    ' 0812 3456 7890 ',
  ];
  for (const v of variants) {
    const n = normalizePhone(v);
    assert.equal(validatePhone(n), true, `${v} → ${n} should validate`);
  }
});
