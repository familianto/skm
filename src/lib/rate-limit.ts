import { RATE_LIMIT } from './constants';

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

// In-memory store for rate limiting (resets on server restart)
const attempts = new Map<string, AttemptRecord>();

/**
 * Get client identifier from request headers (IP-based)
 */
export function getClientId(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Check if a client is currently locked out
 * Returns remaining lockout time in ms, or 0 if not locked
 */
export function checkLockout(clientId: string): number {
  const record = attempts.get(clientId);
  if (!record?.lockedUntil) return 0;

  const remaining = record.lockedUntil - Date.now();
  if (remaining <= 0) {
    // Lockout expired, reset
    attempts.delete(clientId);
    return 0;
  }
  return remaining;
}

/**
 * Record a failed login attempt
 * Returns { locked, remainingAttempts, lockoutUntil }
 */
export function recordFailedAttempt(clientId: string): {
  locked: boolean;
  remainingAttempts: number;
  lockoutUntil: number | null;
} {
  const record = attempts.get(clientId) || { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= RATE_LIMIT.MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + RATE_LIMIT.LOCKOUT_DURATION_MS;
    attempts.set(clientId, record);
    return {
      locked: true,
      remainingAttempts: 0,
      lockoutUntil: record.lockedUntil,
    };
  }

  attempts.set(clientId, record);
  return {
    locked: false,
    remainingAttempts: RATE_LIMIT.MAX_ATTEMPTS - record.count,
    lockoutUntil: null,
  };
}

/**
 * Reset attempts on successful login
 */
export function resetAttempts(clientId: string): void {
  attempts.delete(clientId);
}

/**
 * Get current attempt count for a client
 */
export function getAttemptCount(clientId: string): number {
  return attempts.get(clientId)?.count || 0;
}
