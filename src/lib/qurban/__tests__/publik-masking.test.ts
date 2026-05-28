import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maskAlamat, maskNama, maskNoHp } from '@/lib/qurban/publik-masking';

test('maskNama — provided F4b examples', () => {
  assert.equal(maskNama('Hopy Familianto'), 'Ho** Fa********');
  assert.equal(maskNama('Ahmad Fauzi'), 'Ah*** Fa***');
  assert.equal(maskNama('Pak Budi'), 'Pa* Bu**');
});

test('maskNama — words of length > 2 are masked, ≤ 2 stay intact', () => {
  assert.equal(maskNama('Ali'), 'Al*');
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

// --- maskAlamat (F4d) -------------------------------------------------------

test('maskAlamat — strips street prefix & house number, keeps first 2 letters of first real token', () => {
  assert.equal(maskAlamat('Jl. Gn. Sahari No. 5'), 'GN. ****');
  assert.equal(maskAlamat('Jl. Mawar 12A'), 'MA. ****');
});

test('maskAlamat — uppercase + dot-asterisks format', () => {
  assert.equal(maskAlamat('Taman Mini Indonesia'), 'TA. ****');
  assert.equal(maskAlamat('cibubur indah'), 'CI. ****');
});

test('maskAlamat — drops common stopwords (Jl/Jln/Jalan, Komp, Perum, No, RT, RW, Blok)', () => {
  assert.equal(maskAlamat('Jalan Melati Indah'), 'ME. ****');
  assert.equal(maskAlamat('Komp. Bumi Asri'), 'BU. ****');
  assert.equal(maskAlamat('Perum Cendana Blok B'), 'CE. ****');
  assert.equal(maskAlamat('RT 005 Anggrek'), 'AN. ****');
});

test('maskAlamat — empty / whitespace input → empty string', () => {
  assert.equal(maskAlamat(''), '');
  assert.equal(maskAlamat('   '), '');
});

test('maskAlamat — purely numeric or only stopwords → fallback "****"', () => {
  assert.equal(maskAlamat('123 456'), '****');
  assert.equal(maskAlamat('Jl. Jln.'), '****');
});

test('maskAlamat — never leaks the trailing alphabetic content', () => {
  const masked = maskAlamat('Jl. Gn. Sahari Raya No. 5 RT 005');
  assert.ok(masked.endsWith('****'));
  assert.ok(!masked.toLowerCase().includes('sahari'));
  assert.ok(!masked.toLowerCase().includes('raya'));
  assert.ok(!masked.includes('5'));
});
