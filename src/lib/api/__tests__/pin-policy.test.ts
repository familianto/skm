import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePin } from '../pin-policy';

test('rejects empty / non-string', () => {
  assert.equal(validatePin('').valid, false);
  // @ts-expect-error intentional bad input
  assert.equal(validatePin(undefined).valid, false);
  // @ts-expect-error intentional bad input
  assert.equal(validatePin(1234).valid, false);
});

test('rejects too short (3 digits)', () => {
  const r = validatePin('123');
  assert.equal(r.valid, false);
  assert.equal(r.violation, 'format');
});

test('rejects too long (7 digits)', () => {
  const r = validatePin('1234567');
  assert.equal(r.valid, false);
  assert.equal(r.violation, 'format');
});

test('rejects non-numeric', () => {
  assert.equal(validatePin('12a4').violation, 'format');
  assert.equal(validatePin('abcd').violation, 'format');
  assert.equal(validatePin('1 23').violation, 'format');
});

test('rejects all-same digits', () => {
  for (const pin of ['0000', '1111', '2222', '9999', '00000', '111111']) {
    const r = validatePin(pin);
    assert.equal(r.valid, false, `${pin} should be invalid`);
    // 0000 and 1111 also in WEAK_BLOCKLIST but all_same is checked first
    assert.ok(['all_same', 'weak'].includes(r.violation!), `${pin}: got ${r.violation}`);
  }
});

test('rejects strictly ascending sequential', () => {
  for (const pin of ['1234', '2345', '5678', '01234', '012345']) {
    const r = validatePin(pin);
    assert.equal(r.valid, false, `${pin} should be invalid`);
    // 1234, 12345, 123456 are also in WEAK_BLOCKLIST; sequential check fires first
    assert.ok(['sequential', 'weak'].includes(r.violation!), `${pin}: got ${r.violation}`);
  }
});

test('rejects strictly descending sequential', () => {
  for (const pin of ['4321', '5432', '9876', '54321', '987654']) {
    const r = validatePin(pin);
    assert.equal(r.valid, false, `${pin} should be invalid`);
    assert.equal(r.violation, 'sequential');
  }
});

test('rejects WEAK_BLOCKLIST common PINs', () => {
  // 2580 (keypad column) and 8686 (per-spec blocklist) are NOT sequential or all-same
  for (const pin of ['2580', '8686']) {
    const r = validatePin(pin);
    assert.equal(r.valid, false, `${pin} should be weak`);
    assert.equal(r.violation, 'weak');
  }
});

test('accepts strong 4-digit PINs', () => {
  for (const pin of ['1357', '2468', '7531', '8421', '9182', '4729']) {
    const r = validatePin(pin);
    assert.equal(r.valid, true, `${pin} should be valid: got ${JSON.stringify(r)}`);
  }
});

test('accepts strong 5-digit PINs', () => {
  for (const pin of ['13579', '24680', '91824', '74691']) {
    assert.equal(validatePin(pin).valid, true, `${pin} should be valid`);
  }
});

test('accepts strong 6-digit PINs', () => {
  for (const pin of ['135790', '246813', '918240', '746920']) {
    assert.equal(validatePin(pin).valid, true, `${pin} should be valid`);
  }
});

test('result includes constraint message in Bahasa', () => {
  const r = validatePin('1234');
  assert.ok(r.constraint && r.constraint.length > 0);
});
