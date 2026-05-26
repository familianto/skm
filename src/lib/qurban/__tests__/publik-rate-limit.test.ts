import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPublikRateLimit,
  PUBLIK_RATE_LIMITS,
} from '@/lib/qurban/publik-rate-limit';

/**
 * Cascading public rate-limiter (F4b-A). Time is injected via the `now` arg so
 * the hour/day windows can be exercised deterministically — they are otherwise
 * unreachable in real time because the tighter minute window trips first.
 * Each test uses a distinct IP so the process-global buckets never collide.
 */

test('config: daftar declares the three cascading windows shortest-first', () => {
  const labels = PUBLIK_RATE_LIMITS.daftar.map((w) => w.label);
  assert.deepEqual(labels, ['5/menit', '20/jam', '50/hari']);
  const ms = PUBLIK_RATE_LIMITS.daftar.map((w) => w.windowMs);
  assert.deepEqual([...ms].sort((a, b) => a - b), ms);
});

test('options: 30 allowed within a minute, 31st blocked', () => {
  const ip = 'rl-options';
  const now = 1_000_000;
  for (let i = 0; i < 30; i++) {
    assert.equal(checkPublikRateLimit('options', ip, now).allowed, true, `req ${i + 1}`);
  }
  const blocked = checkPublikRateLimit('options', ip, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy?.label, '30/menit');
  assert.ok(blocked.retryAfterSec > 0);
});

test('lookup: 20 allowed within a minute, 21st blocked', () => {
  const ip = 'rl-lookup';
  const now = 2_000_000;
  for (let i = 0; i < 20; i++) {
    assert.equal(checkPublikRateLimit('lookup', ip, now).allowed, true);
  }
  assert.equal(checkPublikRateLimit('lookup', ip, now).blockedBy?.label, '20/menit');
});

test('daftar: minute window trips first (5/menit)', () => {
  const ip = 'rl-daftar-min';
  const now = 3_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(checkPublikRateLimit('daftar', ip, now).allowed, true);
  }
  const blocked = checkPublikRateLimit('daftar', ip, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy?.label, '5/menit');
});

test('daftar: hour window trips after 20 within the hour (20/jam)', () => {
  const ip = 'rl-daftar-hour';
  const t0 = 10_000_000;
  // 4 minute-blocks x 5 reqs = 20, spaced 70s apart so 5/menit keeps resetting
  let allowed = 0;
  for (let block = 0; block < 4; block++) {
    const t = t0 + block * 70_000;
    for (let i = 0; i < 5; i++) {
      assert.equal(checkPublikRateLimit('daftar', ip, t).allowed, true, `block ${block} req ${i}`);
      allowed++;
    }
  }
  assert.equal(allowed, 20);
  // 21st in a fresh minute but still inside the hour window → hour blocks
  const blocked = checkPublikRateLimit('daftar', ip, t0 + 4 * 70_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy?.label, '20/jam');
});

test('daftar: day window trips after 50 within the day (50/hari)', () => {
  const ip = 'rl-daftar-day';
  const t0 = 100_000_000;
  // 200s spacing → 5/menit always resets and at most 19 land per fixed hour
  // window (< 20/jam), so only the 50/hari cap can trip.
  for (let k = 0; k < 50; k++) {
    assert.equal(checkPublikRateLimit('daftar', ip, t0 + k * 200_000).allowed, true, `req ${k + 1}`);
  }
  const blocked = checkPublikRateLimit('daftar', ip, t0 + 50 * 200_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy?.label, '50/hari');
});

test('allowed result reports null blockedBy', () => {
  const r = checkPublikRateLimit('cek-status', 'rl-fresh', 5_000_000);
  assert.equal(r.allowed, true);
  assert.equal(r.blockedBy, null);
});

test('buckets are isolated per IP', () => {
  const now = 6_000_000;
  for (let i = 0; i < 5; i++) checkPublikRateLimit('daftar', 'ip-A', now);
  assert.equal(checkPublikRateLimit('daftar', 'ip-A', now).allowed, false);
  assert.equal(checkPublikRateLimit('daftar', 'ip-B', now).allowed, true);
});
