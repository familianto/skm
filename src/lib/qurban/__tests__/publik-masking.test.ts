import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maskNama, maskNoHp } from '@/lib/qurban/publik-masking';

test('maskNama — provided F4b examples', () => {
  assert.equal(maskNama('Hopy Familianto'), 'Ho** Fa********');
  assert.equal(maskNama('Ahmad Fauzi'), 'Ah*** Fa***');
  assert.equal(maskNama('Pak Budi'), 'Pak Bu**');
});

test('maskNama — words of length ≤ 3 stay intact', () => {
  assert.equal(maskNama('Ali'), 'Ali');
  assert.equal(maskNama('Bu'), 'Bu');
  assert.equal(maskNama('A'), 'A');
});

test('maskNama — empty input', () => {
  assert.equal(maskNama(''), '');
});

test('maskNoHp — keeps first 3 + last 4, masks the middle', () => {
  assert.equal(maskNoHp('628226083451'), '628*****3451');
  assert.equal(maskNoHp('62812346789'), '628****6789');
});

test('maskNoHp — no middle digit leaks', () => {
  const masked = maskNoHp('628226083451');
  assert.ok(masked.startsWith('628'));
  assert.ok(masked.endsWith('3451'));
  assert.equal(masked.slice(3, -4), '*****');
});

test('maskNoHp — short numbers keep only the last 2', () => {
  assert.equal(maskNoHp('1234567'), '*****67');
  assert.equal(maskNoHp('12'), '12');
});
