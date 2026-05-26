/**
 * In-memory rate limiter per Tahap 3.E §2.8.
 *
 * Cold-start tolerant (Vercel serverless) — buckets are per-process so a fresh
 * lambda starts with an empty Map, effectively granting a fresh window. This is
 * acceptable for MVP; if abuse is observed, swap for Upstash Redis.
 *
 * Distinct from `@/lib/rate-limit` (existing): that module is account-level
 * brute-force protection for the legacy single-PIN login (per-IP failed-attempt
 * counter with sticky lockout). This module is generic per-key sliding window.
 *
 * Used by F1:
 *  - POST /api/auth/login → key=`login:{ip}`, limit=10/menit
 *
 * Used by later fases for publik endpoints (PB1 daftar, PB4 cek-status, etc.).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;     // epoch ms when current window resets
  retryAfterSec: number; // hint for `Retry-After` header when blocked
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
    retryAfterSec: 0,
  };
}

/** Resolve client IP from standard proxy headers. Falls back to 'unknown'. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
