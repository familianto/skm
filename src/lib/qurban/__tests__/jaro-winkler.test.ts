import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jaroWinkler } from '../jaro-winkler';

function approx(actual: number, expected: number, tol = 0.001): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${actual} to be within ${tol} of ${expected}`
  );
}

test('jaroWinkler identical strings = 1.0', () => {
  assert.equal(jaroWinkler('ahmad', 'ahmad'), 1.0);
  assert.equal(jaroWinkler('', ''), 1.0);
});

test('jaroWinkler martha/marhta ≈ 0.961', () => {
  approx(jaroWinkler('martha', 'marhta'), 0.961);
});

test('jaroWinkler dixon/dicksonx ≈ 0.813', () => {
  approx(jaroWinkler('dixon', 'dicksonx'), 0.813);
});

test('jaroWinkler handles empty against non-empty = 0', () => {
  assert.equal(jaroWinkler('', 'ahmad'), 0);
  assert.equal(jaroWinkler('ahmad', ''), 0);
});

test('jaroWinkler no common chars = 0', () => {
  assert.equal(jaroWinkler('abc', 'xyz'), 0);
});

test('jaroWinkler is symmetric', () => {
  approx(jaroWinkler('martha', 'marhta'), jaroWinkler('marhta', 'martha'));
  approx(jaroWinkler('dixon', 'dicksonx'), jaroWinkler('dicksonx', 'dixon'));
});

test('jaroWinkler stays within [0,1]', () => {
  for (const [a, b] of [
    ['budi', 'budiman'],
    ['siti', 'sutiana'],
    ['x', 'xxxxxxxx'],
  ] as const) {
    const s = jaroWinkler(a, b);
    assert.ok(s >= 0 && s <= 1, `${a}/${b} → ${s} out of range`);
  }
});

test('jaroWinkler rewards common prefix', () => {
  // Same edit distance, but the second pair shares a longer prefix → higher.
  const shared = jaroWinkler('ahmadi', 'ahmadx');
  const noShared = jaroWinkler('ahmadi', 'xhmadi');
  assert.ok(shared > noShared);
});
