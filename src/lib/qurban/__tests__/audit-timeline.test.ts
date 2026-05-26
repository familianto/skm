import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  auditEventLabel,
  auditEventTone,
} from '@/lib/qurban/audit-timeline';

/**
 * Pure tone/label classifier for the reusable "Riwayat Perubahan" timeline
 * (F4c-A, A3). Locks the colour semantics (positive/negative/modification/
 * neutral) and the human labels.
 */

test('auditEventTone classifies base peserta events', () => {
  assert.equal(auditEventTone('peserta.created'), 'positive');
  assert.equal(auditEventTone('peserta.updated'), 'modification');
  assert.equal(auditEventTone('peserta.harga_changed'), 'modification');
  assert.equal(auditEventTone('peserta.wa_sent_success'), 'positive');
  assert.equal(auditEventTone('peserta.wa_sent_failed'), 'negative');
});

test('auditEventTone for status_changed is direction-sensitive', () => {
  assert.equal(
    auditEventTone('peserta.status_changed', { status_pendaftaran: 'BATAL' }),
    'negative'
  );
  assert.equal(
    auditEventTone('peserta.status_changed', { status_pendaftaran: 'TERDAFTAR' }),
    'positive'
  );
  // Missing/garbage after → not a cancellation → positive.
  assert.equal(auditEventTone('peserta.status_changed', undefined), 'positive');
  assert.equal(auditEventTone('peserta.status_changed', 'nope'), 'positive');
});

test('auditEventTone defaults unknown events to neutral', () => {
  assert.equal(auditEventTone('something.else'), 'neutral');
  assert.equal(auditEventTone(''), 'neutral');
});

test('auditEventLabel maps known events and falls back gracefully', () => {
  assert.equal(auditEventLabel('peserta.created'), 'Peserta didaftarkan');
  assert.equal(auditEventLabel('peserta.status_changed'), 'Status pendaftaran diubah');
  assert.equal(auditEventLabel('unknown.event'), 'unknown.event');
  assert.equal(auditEventLabel(''), 'Perubahan');
});
