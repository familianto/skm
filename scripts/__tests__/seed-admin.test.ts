import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareAdminSeed,
  nextAnggotaId,
  type SeedAdminInput,
} from '../seed-admin';
import { verifyPin } from '../../src/lib/auth';
import { SHEET_HEADERS, SHEET_NAMES } from '../../src/lib/constants';
import { UserPeran } from '../../src/types';

const OPTS = { now: '2026-06-19T00:00:00.000Z', today: '20260619' };
const VALID: SeedAdminInput = { telepon: '08123456789', nama: 'Admin Satu', pin: '5731' };

const ANGGOTA_HEADERS = SHEET_HEADERS[SHEET_NAMES.ANGGOTA];

test('valid input → created with normalized phone and SUPER_ADMIN role', async () => {
  const r = await prepareAdminSeed(VALID, [], OPTS);
  assert.equal(r.status, 'created');
  if (r.status !== 'created') return;
  assert.equal(r.telepon, '628123456789'); // 08xxx → 628xxx
  assert.equal(r.row[2], '628123456789');
  assert.equal(r.row[4], UserPeran.SUPER_ADMIN);
  assert.equal(r.row[5], 'TRUE'); // is_active
});

test('PIN policy enforced: weak PIN rejected', async () => {
  for (const pin of ['1234', '0000', '123', 'abcd', '4321']) {
    const r = await prepareAdminSeed({ ...VALID, pin }, [], OPTS);
    assert.equal(r.status, 'error', `pin ${pin} should be rejected`);
  }
});

test('PIN policy: a strong PIN passes', async () => {
  const r = await prepareAdminSeed({ ...VALID, pin: '5731' }, [], OPTS);
  assert.equal(r.status, 'created');
});

test('invalid phone rejected', async () => {
  const r = await prepareAdminSeed({ ...VALID, telepon: '123' }, [], OPTS);
  assert.equal(r.status, 'error');
});

test('empty nama rejected', async () => {
  const r = await prepareAdminSeed({ ...VALID, nama: '   ' }, [], OPTS);
  assert.equal(r.status, 'error');
});

test('idempotent: existing phone → skipped, no duplicate row', async () => {
  // Existing row with the SAME normalized phone (628...) as VALID after normalize.
  const existing = [
    ['ANG-20260101-0001', 'Lama', '628123456789', '', 'SUPER_ADMIN', 'TRUE', '2026-01-01'],
  ];
  const r = await prepareAdminSeed(VALID, existing, OPTS);
  assert.equal(r.status, 'skipped');
});

test('row shape matches F01 anggota header (length, order, key fields)', async () => {
  const r = await prepareAdminSeed(VALID, [], OPTS);
  assert.equal(r.status, 'created');
  if (r.status !== 'created') return;

  // Same column count as the canonical header.
  assert.equal(r.row.length, ANGGOTA_HEADERS.length);

  // Spot-check positions against the header names.
  const idx = (name: string) => ANGGOTA_HEADERS.indexOf(name);
  assert.equal(r.row[idx('nama')], 'Admin Satu');
  assert.equal(r.row[idx('telepon')], '628123456789');
  assert.equal(r.row[idx('peran')], 'SUPER_ADMIN');
  assert.equal(r.row[idx('is_active')], 'TRUE');
  assert.equal(r.row[idx('failed_attempts')], '0');
  assert.equal(r.row[idx('locked_until')], '');
  assert.equal(r.row[idx('created_by')], 'SYSTEM_BOOTSTRAP');
  assert.equal(r.row[idx('created_at')], OPTS.now);
});

test('pin_hash is a real bcrypt hash (not plaintext) and verifies', async () => {
  const r = await prepareAdminSeed(VALID, [], OPTS);
  assert.equal(r.status, 'created');
  if (r.status !== 'created') return;

  const pinHash = r.row[ANGGOTA_HEADERS.indexOf('pin_hash')];
  assert.notEqual(pinHash, VALID.pin);
  assert.match(pinHash, /^\$2[aby]\$/); // bcrypt prefix
  assert.equal(await verifyPin(VALID.pin, pinHash), true);
});

test('warns when an active SUPER_ADMIN already exists (still creates)', async () => {
  const existing = [
    ['ANG-20260101-0001', 'Boss', '6289999999999', '', 'SUPER_ADMIN', 'TRUE', '2026-01-01'],
  ];
  const r = await prepareAdminSeed(VALID, existing, OPTS);
  assert.equal(r.status, 'created');
  if (r.status !== 'created') return;
  assert.ok(r.warnings.length >= 1);
});

test('nextAnggotaId increments from max counter for the day', () => {
  const rows = [
    ['ANG-20260619-0001'],
    ['ANG-20260619-0007'],
    ['ANG-20260618-0099'], // different day, ignored
  ];
  assert.equal(nextAnggotaId(rows, '20260619'), 'ANG-20260619-0008');
  assert.equal(nextAnggotaId([], '20260619'), 'ANG-20260619-0001');
});
