import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveActiveHref } from '@/lib/nav-active';

/**
 * Sidebar active-item resolution (F4c-F fix). Longest matching href wins; root
 * `/` matches only exactly.
 */

const HREFS = [
  '/',
  '/transaksi',
  '/qurban',
  '/qurban/edisi',
  '/qurban/muqorib',
  '/qurban/hewan',
  '/qurban/peserta',
  '/laporan',
];

test('root highlights only on exact /', () => {
  assert.equal(resolveActiveHref('/', HREFS), '/');
  assert.equal(resolveActiveHref('/transaksi', HREFS), '/transaksi');
  assert.equal(resolveActiveHref('/qurban', HREFS), '/qurban');
});

test('parent /qurban does NOT win over a more specific child', () => {
  assert.equal(resolveActiveHref('/qurban/peserta', HREFS), '/qurban/peserta');
  assert.equal(resolveActiveHref('/qurban/peserta/baru', HREFS), '/qurban/peserta');
  assert.equal(resolveActiveHref('/qurban/peserta/PST-1/edit', HREFS), '/qurban/peserta');
  assert.equal(resolveActiveHref('/qurban/hewan/HWN-1', HREFS), '/qurban/hewan');
});

test('/qurban exact still highlights the Qurban dashboard item', () => {
  assert.equal(resolveActiveHref('/qurban', HREFS), '/qurban');
});

test('no match returns empty string', () => {
  assert.equal(resolveActiveHref('/unknown', HREFS), '');
  assert.equal(resolveActiveHref('/transaksinota', HREFS), ''); // not a path-segment prefix
});
