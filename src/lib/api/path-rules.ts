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

  // F02-A — /qurban page gates. Order matters: more specific patterns first.
  //
  // Note on full-access vs read-only: middleware only gates PAGE access. The
  // full-write vs read-only distinction (e.g. BENDAHARA may read edisi but
  // not mutate) is enforced inside API route handlers via guards. Here we
  // include any role that may see the page in any mode.
  //
  // Distribusi: SUPER_ADMIN + ADMIN_QURBAN + DISTRIBUSI only (no BENDAHARA,
  // no PENDAFTARAN per spec).
  {
    pattern: /^\/qurban\/distribusi(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'ADMIN_QURBAN', 'DISTRIBUSI'],
  },
  {
    pattern: /^\/api\/qurban\/distribusi(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'ADMIN_QURBAN', 'DISTRIBUSI'],
  },

  // Edisi / konfigurasi / panitia: admin surfaces. DISTRIBUSI excluded.
  {
    pattern: /^\/qurban\/(edisi|konfigurasi|panitia)(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
  },
  {
    pattern: /^\/api\/qurban\/(edisi|konfigurasi|panitia)(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
  },

  // Operational pendaftaran/peserta surfaces: same role set as edisi above.
  {
    pattern: /^\/qurban\/(peserta|muqorib|hewan|pemetaan|pembayaran)(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
  },
  {
    pattern: /^\/api\/qurban\/(peserta|muqorib|hewan|pemetaan|pembayaran)(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
  },

  // Laporan: everyone with Qurban access can read.
  {
    pattern: /^\/qurban\/laporan(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
  },
  {
    pattern: /^\/api\/qurban\/laporan(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
  },

  // /qurban root (dashboard): all five roles can see it.
  {
    pattern: /^\/qurban(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
  },
  {
    pattern: /^\/api\/qurban(\/|$)/,
    allowedRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
  },
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
