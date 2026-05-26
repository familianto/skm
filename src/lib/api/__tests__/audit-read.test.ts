import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAuditRow, selectAuditEntries } from '@/lib/api/audit-read';

/**
 * Pure read-side helpers for the `audit_log` sheet (F4c-A, A3). Locks the
 * column→field mapping, detail-JSON expansion, the (entitas, entitas_id)
 * filter, and the newest-first ordering.
 *
 * Column order: id | timestamp | aksi | entitas | entitas_id | detail |
 *               user_info | user_id | ip_address
 */

function rowOf(
  id: string,
  timestamp: string,
  entitas: string,
  entitasId: string,
  detail: object | string,
  userInfo = 'Admin',
  userId = 'AGT-1'
): string[] {
  const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
  return [id, timestamp, 'UPDATE', entitas, entitasId, detailStr, userInfo, userId, '127.0.0.1'];
}

test('parseAuditRow expands detail JSON into typed fields', () => {
  const row = rowOf(
    'LOG-1',
    '2026-05-01T10:00:00.000Z',
    'peserta',
    'PST-1',
    { event_type: 'peserta.updated', before: { notes: 'a' }, after: { notes: 'b' }, notes: 'edit' }
  );
  const e = parseAuditRow(row);
  assert.equal(e.id, 'LOG-1');
  assert.equal(e.entitas, 'peserta');
  assert.equal(e.entitas_id, 'PST-1');
  assert.equal(e.event_type, 'peserta.updated');
  assert.deepEqual(e.before, { notes: 'a' });
  assert.deepEqual(e.after, { notes: 'b' });
  assert.equal(e.notes, 'edit');
  assert.equal(e.user_info, 'Admin');
  assert.equal(e.user_id, 'AGT-1');
});

test('parseAuditRow tolerates corrupt / empty detail', () => {
  const e1 = parseAuditRow(rowOf('LOG-2', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-1', 'not json'));
  assert.equal(e1.event_type, '');
  assert.equal(e1.before, undefined);
  assert.equal(e1.notes, '');

  const e2 = parseAuditRow(rowOf('LOG-3', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-1', ''));
  assert.equal(e2.event_type, '');
});

test('selectAuditEntries filters by entitas + entitas_id', () => {
  const rows = [
    rowOf('LOG-1', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.created' }),
    rowOf('LOG-2', '2026-05-01T11:00:00.000Z', 'peserta', 'PST-2', { event_type: 'peserta.created' }),
    rowOf('LOG-3', '2026-05-01T12:00:00.000Z', 'muqorib', 'PST-1', { event_type: 'muqorib.updated' }),
  ];
  const out = selectAuditEntries(rows, { entitas: 'peserta', entitas_id: 'PST-1' });
  assert.deepEqual(out.map((e) => e.id), ['LOG-1']);
});

test('selectAuditEntries sorts newest-first (timestamp desc, tiebreak id desc)', () => {
  const rows = [
    rowOf('LOG-1', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.created' }),
    rowOf('LOG-3', '2026-05-03T10:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.updated' }),
    rowOf('LOG-2', '2026-05-02T10:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.updated' }),
  ];
  const out = selectAuditEntries(rows, { entitas: 'peserta', entitas_id: 'PST-1' });
  assert.deepEqual(out.map((e) => e.id), ['LOG-3', 'LOG-2', 'LOG-1']);
});

test('selectAuditEntries tiebreaks equal timestamps by id desc', () => {
  const rows = [
    rowOf('LOG-1', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.created' }),
    rowOf('LOG-2', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-1', { event_type: 'peserta.updated' }),
  ];
  const out = selectAuditEntries(rows, { entitas: 'peserta', entitas_id: 'PST-1' });
  assert.deepEqual(out.map((e) => e.id), ['LOG-2', 'LOG-1']);
});

test('selectAuditEntries returns empty for no match', () => {
  const rows = [
    rowOf('LOG-1', '2026-05-01T10:00:00.000Z', 'peserta', 'PST-9', { event_type: 'peserta.created' }),
  ];
  assert.equal(selectAuditEntries(rows, { entitas: 'peserta', entitas_id: 'PST-1' }).length, 0);
});
