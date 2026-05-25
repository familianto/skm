import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isValidHewanTransition,
  isTerminalHewanStatus,
  isValidHewanStatus,
} from '../hewan-state-machine';

test('transisi sah diterima', () => {
  assert.equal(isValidHewanTransition('DRAFT', 'AKTIF'), true);
  assert.equal(isValidHewanTransition('DRAFT', 'BATAL'), true);
  assert.equal(isValidHewanTransition('AKTIF', 'TERPOTONG'), true);
  assert.equal(isValidHewanTransition('AKTIF', 'BATAL'), true);
});

test('transisi keluar dari status terminal ditolak', () => {
  for (const to of ['DRAFT', 'AKTIF', 'TERPOTONG', 'BATAL']) {
    assert.equal(isValidHewanTransition('TERPOTONG', to), false);
    assert.equal(isValidHewanTransition('BATAL', to), false);
  }
});

test('transisi tidak sah lain ditolak', () => {
  assert.equal(isValidHewanTransition('DRAFT', 'TERPOTONG'), false); // harus AKTIF dulu
  assert.equal(isValidHewanTransition('AKTIF', 'AKTIF'), false); // tidak ada self-loop
  assert.equal(isValidHewanTransition('AKTIF', 'DRAFT'), false); // tidak mundur
});

test('isTerminalHewanStatus', () => {
  assert.equal(isTerminalHewanStatus('TERPOTONG'), true);
  assert.equal(isTerminalHewanStatus('BATAL'), true);
  assert.equal(isTerminalHewanStatus('DRAFT'), false);
  assert.equal(isTerminalHewanStatus('AKTIF'), false);
});

test('isValidHewanStatus', () => {
  assert.equal(isValidHewanStatus('DRAFT'), true);
  assert.equal(isValidHewanStatus('SELESAI'), false);
  assert.equal(isValidHewanStatus('foo'), false);
});
