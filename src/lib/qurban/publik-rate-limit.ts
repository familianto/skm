import { checkRateLimit } from '@/lib/api/rate-limit';

/**
 * Cascading rate-limiter for the qurban PUBLIC endpoints (F4b PB1–PB4).
 *
 * Builds ON TOP of the F1 generic sliding-window (`@/lib/api/rate-limit`,
 * `checkRateLimit`) instead of reimplementing it — one bucket per
 * `(endpoint, window, IP)`. An endpoint may declare several windows; a request
 * must clear ALL of them (e.g. PB3 daftar = 5/menit AND 20/jam AND 50/hari).
 *
 * Serverless caveat (inherited from F1): buckets live in a per-process `Map`,
 * so each cold Vercel lambda starts empty and effectively grants a fresh
 * window — i.e. limits are per-instance, not global. This is adequate as MVP
 * abuse-friction (it raises the cost of scripted abuse) but is NOT a hard
 * guarantee; for that, swap the F1 store for a shared store (Upstash Redis).
 *
 * Milestone A ships only this utility + the per-endpoint config constants.
 * Wiring `checkPublikRateLimit` into the PB1–PB4 handlers happens in Milestone B.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface RateLimitWindow {
  limit: number;
  windowMs: number;
  /** Human-readable label, surfaced in the `RATE_LIMITED` detail. */
  label: string;
}

export type PublikEndpoint = 'options' | 'lookup' | 'daftar' | 'cek-status';

/**
 * Per-endpoint limits. Windows are listed shortest-first so the tightest limit
 * trips before longer windows are touched.
 */
export const PUBLIK_RATE_LIMITS: Record<PublikEndpoint, RateLimitWindow[]> = {
  // PB1 GET /api/publik/qurban/options
  options: [{ limit: 30, windowMs: MINUTE_MS, label: '30/menit' }],
  // PB2 POST /api/publik/qurban/daftar/lookup
  lookup: [{ limit: 20, windowMs: MINUTE_MS, label: '20/menit' }],
  // PB3 POST /api/publik/qurban/daftar — must clear all three
  daftar: [
    { limit: 5, windowMs: MINUTE_MS, label: '5/menit' },
    { limit: 20, windowMs: HOUR_MS, label: '20/jam' },
    { limit: 50, windowMs: DAY_MS, label: '50/hari' },
  ],
  // PB4 GET /api/publik/qurban/cek-status
  'cek-status': [{ limit: 30, windowMs: MINUTE_MS, label: '30/menit' }],
};

export interface PublikRateLimitResult {
  allowed: boolean;
  /** The first window to reject the request, or `null` when allowed. */
  blockedBy: RateLimitWindow | null;
  retryAfterSec: number;
  resetAt: number;
}

/**
 * Evaluate every configured window for `endpoint` against IP `ip`, all at the
 * same instant `now`. Windows are checked in declared (shortest-first) order;
 * on the first block we stop and report which window rejected.
 *
 * NOTE: the underlying F1 counter increments on each *allowed* check, so a
 * request that clears an earlier (shorter) window but is then blocked by a
 * later one still consumes one tick from that earlier window. This only ever
 * makes limiting slightly STRICTER, never looser — acceptable for abuse
 * friction, and minimised by checking the tightest window first.
 */
export function checkPublikRateLimit(
  endpoint: PublikEndpoint,
  ip: string,
  now: number = Date.now()
): PublikRateLimitResult {
  for (const window of PUBLIK_RATE_LIMITS[endpoint]) {
    const key = `publik:${endpoint}:${window.windowMs}:${ip}`;
    const rl = checkRateLimit(key, window.limit, window.windowMs, now);
    if (!rl.allowed) {
      return {
        allowed: false,
        blockedBy: window,
        retryAfterSec: rl.retryAfterSec,
        resetAt: rl.resetAt,
      };
    }
  }
  return { allowed: true, blockedBy: null, retryAfterSec: 0, resetAt: 0 };
}
