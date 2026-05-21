import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDISI_STATUS,
  EdisiStateError,
  assertFieldEditable,
  assertTransition,
  getEditableFields,
  isFieldEditable,
  isValidEdisiStatus,
  isValidTransition,
  transitionTarget,
} from '../edisi-state-machine';
import { ErrorCodes } from '@/lib/api/errors';

test('isValidEdisiStatus accepts the three known statuses', () => {
  assert.equal(isValidEdisiStatus('DRAFT'), true);
  assert.equal(isValidEdisiStatus('AKTIF'), true);
  assert.equal(isValidEdisiStatus('SELESAI'), true);
});

test('isValidEdisiStatus rejects unknown values', () => {
  for (const s of ['', 'draft', 'PENDING', 'aktif', 'CLOSED']) {
    assert.equal(isValidEdisiStatus(s), false, `${JSON.stringify(s)} should be rejected`);
  }
});

test('isValidTransition allows DRAFT→AKTIF and AKTIF→SELESAI', () => {
  assert.equal(isValidTransition(EDISI_STATUS.DRAFT, EDISI_STATUS.AKTIF), true);
  assert.equal(isValidTransition(EDISI_STATUS.AKTIF, EDISI_STATUS.SELESAI), true);
});

test('isValidTransition rejects every other pair', () => {
  const illegal: [typeof EDISI_STATUS[keyof typeof EDISI_STATUS], typeof EDISI_STATUS[keyof typeof EDISI_STATUS]][] = [
    [EDISI_STATUS.DRAFT, EDISI_STATUS.SELESAI],
    [EDISI_STATUS.DRAFT, EDISI_STATUS.DRAFT],
    [EDISI_STATUS.AKTIF, EDISI_STATUS.DRAFT],
    [EDISI_STATUS.AKTIF, EDISI_STATUS.AKTIF],
    [EDISI_STATUS.SELESAI, EDISI_STATUS.DRAFT],
    [EDISI_STATUS.SELESAI, EDISI_STATUS.AKTIF],
    [EDISI_STATUS.SELESAI, EDISI_STATUS.SELESAI],
  ];
  for (const [from, to] of illegal) {
    assert.equal(isValidTransition(from, to), false, `${from}→${to} should be rejected`);
  }
});

test('transitionTarget resolves activate / close from their valid source', () => {
  assert.equal(transitionTarget(EDISI_STATUS.DRAFT, 'activate'), EDISI_STATUS.AKTIF);
  assert.equal(transitionTarget(EDISI_STATUS.AKTIF, 'close'), EDISI_STATUS.SELESAI);
});

test('transitionTarget returns null for actions that do not apply', () => {
  assert.equal(transitionTarget(EDISI_STATUS.AKTIF, 'activate'), null);
  assert.equal(transitionTarget(EDISI_STATUS.SELESAI, 'activate'), null);
  assert.equal(transitionTarget(EDISI_STATUS.DRAFT, 'close'), null);
  assert.equal(transitionTarget(EDISI_STATUS.SELESAI, 'close'), null);
});

test('assertTransition throws BUSINESS_INVALID_STATE_TRANSITION for illegal pairs', () => {
  assert.doesNotThrow(() => assertTransition(EDISI_STATUS.DRAFT, EDISI_STATUS.AKTIF));
  assert.doesNotThrow(() => assertTransition(EDISI_STATUS.AKTIF, EDISI_STATUS.SELESAI));

  for (const [from, to] of [
    [EDISI_STATUS.DRAFT, EDISI_STATUS.SELESAI],
    [EDISI_STATUS.AKTIF, EDISI_STATUS.DRAFT],
    [EDISI_STATUS.SELESAI, EDISI_STATUS.DRAFT],
  ] as const) {
    assert.throws(
      () => assertTransition(from, to),
      (err: unknown) => {
        assert.ok(err instanceof EdisiStateError, 'expected EdisiStateError');
        assert.equal(err.code, ErrorCodes.BUSINESS_INVALID_STATE_TRANSITION);
        assert.equal(err.httpStatus, 422);
        return true;
      }
    );
  }
});

test('getEditableFields per status — DRAFT exposes all writable fields', () => {
  const f = getEditableFields(EDISI_STATUS.DRAFT);
  assert.ok(f.includes('tahun_hijriah'));
  assert.ok(f.includes('tahun_masehi'));
  assert.ok(f.includes('tanggal_idul_adha'));
  assert.ok(f.includes('tanggal_pendaftaran_buka'));
  assert.ok(f.includes('tanggal_pendaftaran_tutup'));
});

test('getEditableFields per status — AKTIF locks everything except date triplet', () => {
  const f = getEditableFields(EDISI_STATUS.AKTIF);
  assert.equal(f.includes('tahun_hijriah'), false);
  assert.equal(f.includes('tahun_masehi'), false);
  assert.equal(f.includes('tanggal_idul_adha'), true);
  assert.equal(f.includes('tanggal_pendaftaran_buka'), true);
  assert.equal(f.includes('tanggal_pendaftaran_tutup'), true);
});

test('getEditableFields per status — SELESAI is read-only', () => {
  assert.deepEqual(getEditableFields(EDISI_STATUS.SELESAI), []);
});

test('isFieldEditable mirrors getEditableFields', () => {
  assert.equal(isFieldEditable(EDISI_STATUS.DRAFT, 'tahun_hijriah'), true);
  assert.equal(isFieldEditable(EDISI_STATUS.AKTIF, 'tahun_hijriah'), false);
  assert.equal(isFieldEditable(EDISI_STATUS.AKTIF, 'tanggal_idul_adha'), true);
  assert.equal(isFieldEditable(EDISI_STATUS.SELESAI, 'tanggal_idul_adha'), false);
});

test('assertFieldEditable throws BUSINESS_EDISI_LOCKED with field+status details', () => {
  assert.doesNotThrow(() => assertFieldEditable(EDISI_STATUS.DRAFT, 'tahun_hijriah'));
  assert.doesNotThrow(() => assertFieldEditable(EDISI_STATUS.AKTIF, 'tanggal_idul_adha'));

  assert.throws(
    () => assertFieldEditable(EDISI_STATUS.AKTIF, 'tahun_hijriah'),
    (err: unknown) => {
      assert.ok(err instanceof EdisiStateError);
      assert.equal(err.code, ErrorCodes.BUSINESS_EDISI_LOCKED);
      assert.equal(err.httpStatus, 422);
      return true;
    }
  );

  assert.throws(
    () => assertFieldEditable(EDISI_STATUS.SELESAI, 'tanggal_idul_adha'),
    (err: unknown) => err instanceof EdisiStateError && err.code === ErrorCodes.BUSINESS_EDISI_LOCKED
  );
});
