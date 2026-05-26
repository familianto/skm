import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatKodeBayar } from '@/lib/qurban/id-generator';

/**
 * `formatKodeBayar` is the only pure, I/O-free piece of the F4a Milestone A
 * code generation surface (`generatePesertaId` fans out to the Sheets layer).
 * Lock the `QRB-{tahun}-{NNN}` format + 3-digit padding here.
 */

test('formatKodeBayar pads urutan to 3 digits', () => {
  assert.equal(formatKodeBayar(1448, 7), 'QRB-1448-007');
});

test('formatKodeBayar keeps urutan >= 100 unpadded', () => {
  assert.equal(formatKodeBayar(1448, 123), 'QRB-1448-123');
});

test('formatKodeBayar does not truncate urutan >= 1000', () => {
  assert.equal(formatKodeBayar(1448, 1000), 'QRB-1448-1000');
});

test('formatKodeBayar accepts tahun as string', () => {
  assert.equal(formatKodeBayar('1448', 1), 'QRB-1448-001');
});
