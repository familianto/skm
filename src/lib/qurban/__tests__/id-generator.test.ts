import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getTodayWIB } from '@/lib/api/id-gen';

/**
 * `generateEdisiId` / `generateKonfigurasiId` / `generatePanitiaId` are thin
 * wrappers over `generateId(prefix, sheetName)` (lib/api/id-gen) that fan out
 * to `sheetsService.getRows` — pure I/O. Only the date helper is testable
 * without mocking the Sheets layer, which is enough to lock the WIB
 * convention that the F02 ID format depends on.
 */

const realNow = Date.now;

test.afterEach(() => {
  Date.now = realNow;
});

test('getTodayWIB returns 8 digits YYYYMMDD', () => {
  const out = getTodayWIB();
  assert.match(out, /^\d{8}$/);
});

test('getTodayWIB at UTC midnight returns the same WIB day (offset +7h)', () => {
  // 2027-04-20T00:00:00Z → WIB (UTC+7) is still 2027-04-20 (07:00 WIB).
  Date.now = () => new Date('2027-04-20T00:00:00.000Z').getTime();
  assert.equal(getTodayWIB(), '20270420');
});

test('getTodayWIB just before WIB midnight (16:59 UTC) returns today WIB', () => {
  // 2027-04-20T16:59:00Z → WIB is 23:59 of the same day.
  Date.now = () => new Date('2027-04-20T16:59:00.000Z').getTime();
  assert.equal(getTodayWIB(), '20270420');
});

test('getTodayWIB after WIB midnight (17:00 UTC) rolls to next WIB day', () => {
  // 2027-04-20T17:00:00Z → WIB is 2027-04-21T00:00:00.
  Date.now = () => new Date('2027-04-20T17:00:00.000Z').getTime();
  assert.equal(getTodayWIB(), '20270421');
});

test('getTodayWIB rolls year boundary correctly at WIB midnight', () => {
  // 2026-12-31T17:00:00Z = 2027-01-01T00:00:00 WIB.
  Date.now = () => new Date('2026-12-31T17:00:00.000Z').getTime();
  assert.equal(getTodayWIB(), '20270101');
});
