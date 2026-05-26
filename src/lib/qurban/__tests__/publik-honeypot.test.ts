import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HONEYPOT_FIELD, isHoneypotTriggered } from '@/lib/qurban/publik-honeypot';

test('HONEYPOT_FIELD is a field the real pendaftaran form never collects', () => {
  assert.equal(HONEYPOT_FIELD, 'email');
});

test('empty / missing / whitespace honeypot → not a bot', () => {
  assert.equal(isHoneypotTriggered({}), false);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: '' }), false);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: '   ' }), false);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: null }), false);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: undefined }), false);
  assert.equal(isHoneypotTriggered({ nama: 'Hopy', no_hp: '628...' }), false);
});

test('filled honeypot → bot', () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: 'bot@spam.com' }), true);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: '  x  ' }), true);
});

test('non-object body → not a bot', () => {
  assert.equal(isHoneypotTriggered(null), false);
  assert.equal(isHoneypotTriggered(undefined), false);
  assert.equal(isHoneypotTriggered('string'), false);
});

test('present non-string value is treated as filled', () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD]: 1 }), true);
});
