import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isQurbanModulePath } from '../qurban-kill-switch';

test('matches qurban pages, qurban API, and public qurban API', () => {
  assert.equal(isQurbanModulePath('/qurban'), true);
  assert.equal(isQurbanModulePath('/qurban/edisi'), true);
  assert.equal(isQurbanModulePath('/api/qurban'), true);
  assert.equal(isQurbanModulePath('/api/qurban/peserta'), true);
  assert.equal(isQurbanModulePath('/api/publik/qurban/options'), true);
  assert.equal(isQurbanModulePath('/api/publik/qurban/daftar'), true);
});

test('does not match unrelated or sibling paths', () => {
  assert.equal(isQurbanModulePath('/api/publik/ringkasan'), false);
  // bare `/api/publik/qurban` (legacy 1447H endpoint) decommissioned — no longer a module path
  assert.equal(isQurbanModulePath('/api/publik/qurban'), false);
  assert.equal(isQurbanModulePath('/publik/qurban'), false); // public PAGE not killed by F4b-C scope
  assert.equal(isQurbanModulePath('/api/auth/login'), false);
  assert.equal(isQurbanModulePath('/transaksi'), false);
  assert.equal(isQurbanModulePath('/qurbanX'), false);
});
