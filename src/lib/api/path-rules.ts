/**
 * Strict path-level role rules per Tahap 3 §3.7 + Tahap 3.E §2.1 step 5.
 *
 * F1 SCOPE: only the SUPER_ADMIN-gated anggota routes are strictly
 * enforced. All other authenticated routes pass through with session-only
 * (any logged-in user can reach them). F2+ extends this list as `/qurban/**`
 * routes ship.
 *
 * Single source of truth for two consumers:
 *  - `src/middleware.ts` — Edge runtime gate at request entry
 *  - Route handlers — second layer via `lib/api/guards` (defense-in-depth)
 *
 * This module is dependency-free (pure regex + arrays) so the Edge bundle
 * stays small.
 */

export interface PathRule {
  /** Regex tested against `nextUrl.pathname`. */
  pattern: RegExp;
  /** Peran values allowed through. Non-matching peran → 403 FORBIDDEN_ROLE. */
  allowedRoles: readonly string[];
}

export const STRICT_PATH_RULES: readonly PathRule[] = [
  // F1 strict gates
  { pattern: /^\/pengaturan\/anggota(\/|$)/, allowedRoles: ['SUPER_ADMIN'] },
  { pattern: /^\/api\/pengaturan\/anggota(\/|$)/, allowedRoles: ['SUPER_ADMIN'] },

  // F2+ extension point — uncomment / extend as `/qurban/**` ships.
  // Example:
  // { pattern: /^\/qurban\/distribusi(\/|$)/,
  //   allowedRoles: ['SUPER_ADMIN', 'ADMIN_QURBAN', 'DISTRIBUSI'] },
];

/**
 * Returns `true` if `pathname` is allowed for `peran`.
 *
 * Behavior:
 *  - Path matches a rule → check role membership
 *  - Path matches NO rule → allowed (session-only enforcement upstream)
 *
 * Designed so existing SKM routes (no rule) "fall through" to session-only
 * auth without explicit allow-list per Hopy's Milestone D decision.
 */
export function isPathAllowedForRole(pathname: string, peran: string): boolean {
  for (const rule of STRICT_PATH_RULES) {
    if (rule.pattern.test(pathname)) {
      return rule.allowedRoles.includes(peran);
    }
  }
  return true;
}
