import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BAGIAN_OPTIONS, composeBagian, parseBagian } from '../bagian-options';

// ── composeBagian ────────────────────────────────────────────────────────────

test('compose: orders checked options by the canonical list, not pick order', () => {
  assert.equal(composeBagian(['Hati', 'Daging'], ''), 'Daging, Hati');
  assert.equal(composeBagian(['Daging', 'Kepala', 'Buntut'], ''), 'Daging, Kepala, Buntut');
});

test('compose: appends Lainnya after standard options', () => {
  assert.equal(composeBagian(['Paha'], 'Kulit'), 'Paha, Kulit');
  assert.equal(composeBagian(['Daging'], 'Kulit, Lemak'), 'Daging, Kulit, Lemak');
});

test('compose: empty selection + empty lainnya → empty string', () => {
  assert.equal(composeBagian([], ''), '');
  assert.equal(composeBagian([], '   '), '');
});

test('compose: dedupes case-insensitively and drops non-standard from selected', () => {
  assert.equal(composeBagian(['daging', 'Daging', 'DAGING'], ''), 'Daging');
  // "Paha Kambing" is not a standard option → dropped from `selected` (belongs in Lainnya).
  assert.equal(composeBagian(['Paha Kambing', 'Hati'], ''), 'Hati');
});

test('compose: trims and skips blank Lainnya entries', () => {
  assert.equal(composeBagian(['Daging'], ' , Kulit ,  '), 'Daging, Kulit');
});

// ── parseBagian ──────────────────────────────────────────────────────────────

test('parse: splits standard options and leaves the rest in Lainnya', () => {
  assert.deepEqual(parseBagian('Daging, Jeroan'), { selected: ['Daging', 'Jeroan'], lainnya: '' });
});

test('parse: case-insensitive + trim match against the standard list', () => {
  assert.deepEqual(parseBagian('  daging , HATI '), { selected: ['Daging', 'Hati'], lainnya: '' });
});

test('parse: non-matching tokens fall to Lainnya, matches are canonicalized', () => {
  assert.deepEqual(parseBagian('Paha Kambing, Hati'), {
    selected: ['Hati'],
    lainnya: 'Paha Kambing',
  });
});

test('parse: selected is always returned in canonical order', () => {
  assert.deepEqual(parseBagian('Jeroan, Daging, Kepala').selected, ['Daging', 'Kepala', 'Jeroan']);
});

test('parse: empty / blank string → empty parts', () => {
  assert.deepEqual(parseBagian(''), { selected: [], lainnya: '' });
  assert.deepEqual(parseBagian('  ,  , '), { selected: [], lainnya: '' });
});

// ── round-trip ───────────────────────────────────────────────────────────────

test('round-trip: compose(parse(x)) preserves every part (content-stable)', () => {
  const samples = [
    'Daging, Hati',
    'Daging, Kepala, Buntut',
    'Paha, Kulit',
    'Paha Kambing, Hati',
    'Jeroan, Daging',
    '',
  ];
  for (const x of samples) {
    const parts = parseBagian(x);
    const composed = composeBagian(parts.selected, parts.lainnya);
    // Same multiset of parts (order may be normalized to canonical-first).
    const norm = (s: string) =>
      s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).sort();
    assert.deepEqual(norm(composed), norm(x), `content preserved for "${x}"`);
    // Idempotent: re-parsing the composed string is a fixed point.
    const again = composeBagian(parseBagian(composed).selected, parseBagian(composed).lainnya);
    assert.equal(again, composed, `idempotent for "${x}"`);
  }
});

test('round-trip: a clean canonical string is unchanged', () => {
  const parts = parseBagian('Daging, Hati');
  assert.equal(composeBagian(parts.selected, parts.lainnya), 'Daging, Hati');
});

test('BAGIAN_OPTIONS exposes the agreed standard parts', () => {
  assert.deepEqual([...BAGIAN_OPTIONS], [
    'Daging',
    'Paha',
    'Tulang Iga',
    'Kaki',
    'Hati',
    'Kepala',
    'Buntut',
    'Jeroan',
  ]);
});
