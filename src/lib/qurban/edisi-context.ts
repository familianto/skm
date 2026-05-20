import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { PERAN, isEdisiLockedToAktif } from '@/lib/api/permissions';
import {
  findActiveEdisi,
  findEdisiById,
  listEdisi,
  sortEdisiByCreatedDesc,
  type Edisi,
} from './edisi-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * Edisi context resolution per F02-A spec §A.1.
 *
 * Resolves which edisi the current request operates on. Runs in Node runtime
 * (reads `qurban_edisi` via `sheetsService`), NOT in middleware (Edge).
 *
 * Resolution order:
 *   1. Query param `?edisi=EDS-...`  → validate role+access → adopt
 *   2. Cookie `qurban_edisi`         → re-validate; drop if invalid
 *   3. AKTIF edisi (default)         → adopt
 *   4. Else → no edisi (empty state — Milestone A is allowed to land here for
 *      every role including panitia, because no edisi has been created yet)
 *
 * Role access rules:
 *   SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN — may view any edisi status.
 *   PENDAFTARAN, DISTRIBUSI            — may view ONLY the AKTIF edisi.
 *
 * Cookie write semantics: the cookie is updated whenever resolution lands on
 * an edisi different from the inbound cookie value, so deep-link navigation
 * sticks for the rest of the session. For the "no edisi yet" empty state we
 * clear any stale cookie (so a panitia that signed in during a prior edisi
 * lifecycle doesn't keep a dangling reference).
 */

const COOKIE_NAME = 'qurban_edisi';

export type EdisiAccessReason =
  | 'OK'
  | 'NO_EDISI_EXISTS'
  | 'NOT_FOUND'
  | 'NOT_AKTIF_FOR_PANITIA';

export interface EdisiContextResult {
  /** Resolved edisi (the request's "current edisi") or null when none. */
  edisi: Edisi | null;
  /** Full list of edisi the user may switch to (filtered per role). */
  available: Edisi[];
  /** Indicates whether the dropdown should allow switching. */
  canSwitch: boolean;
  /** Why we ended up at `edisi=null`, if applicable. */
  reason: EdisiAccessReason;
  /**
   * Cookie write directive — the caller (layout / page) should apply this on
   * the response so middleware can pick it up next request. `null` means
   * leave the cookie untouched.
   */
  cookieAction:
    | { type: 'set'; value: string }
    | { type: 'clear' }
    | null;
}

function canAccessAnyStatus(peran: string): boolean {
  return (
    peran === PERAN.SUPER_ADMIN ||
    peran === PERAN.BENDAHARA ||
    peran === PERAN.ADMIN_QURBAN
  );
}

function roleCanAccessEdisi(peran: string, edisi: Edisi): boolean {
  if (canAccessAnyStatus(peran)) return true;
  return edisi.status === EDISI_STATUS.AKTIF;
}

function filterAvailableForRole(peran: string, list: Edisi[]): Edisi[] {
  if (canAccessAnyStatus(peran)) return list;
  // Panitia roles only see the AKTIF edisi in the switcher.
  return list.filter((e) => e.status === EDISI_STATUS.AKTIF);
}

export interface ResolveOptions {
  peran: string;
  /** Query string value of `?edisi=`. Optional. */
  queryEdisiId?: string | null;
  /** Inbound cookie value. Optional. */
  cookieEdisiId?: string | null;
}

/**
 * Pure resolution — no cookie I/O. Returns the new context + a cookieAction
 * directive the caller can apply (Server Component reading cookies() can call
 * `applyCookieAction` below).
 */
export async function resolveEdisiContext(
  opts: ResolveOptions
): Promise<EdisiContextResult> {
  const { peran, queryEdisiId, cookieEdisiId } = opts;

  const all = sortEdisiByCreatedDesc(await listEdisi());
  const available = filterAvailableForRole(peran, all);
  const canSwitch = !isEdisiLockedToAktif(peran);

  // 1. Query param wins (explicit user intent).
  if (queryEdisiId) {
    const target = all.find((e) => e.id === queryEdisiId) ?? null;
    if (target && roleCanAccessEdisi(peran, target)) {
      return {
        edisi: target,
        available,
        canSwitch,
        reason: 'OK',
        cookieAction:
          cookieEdisiId === target.id ? null : { type: 'set', value: target.id },
      };
    }
    // Bad query param → fall through to other resolution paths but DO NOT
    // honor it. Panitia deep-linking a non-AKTIF edisi lands here.
  }

  // 2. Cookie re-validation.
  if (cookieEdisiId) {
    const target = all.find((e) => e.id === cookieEdisiId) ?? null;
    if (target && roleCanAccessEdisi(peran, target)) {
      return { edisi: target, available, canSwitch, reason: 'OK', cookieAction: null };
    }
    // Cookie stale (edisi deleted, role downgraded, status changed). Clear it.
  }

  // 3. Default to AKTIF.
  const aktif = await findActiveEdisi();
  if (aktif && roleCanAccessEdisi(peran, aktif)) {
    return {
      edisi: aktif,
      available,
      canSwitch,
      reason: 'OK',
      cookieAction:
        cookieEdisiId === aktif.id ? null : { type: 'set', value: aktif.id },
    };
  }

  // 4. No edisi available for this role.
  const reason: EdisiAccessReason = all.length === 0
    ? 'NO_EDISI_EXISTS'
    : isEdisiLockedToAktif(peran)
    ? 'NOT_AKTIF_FOR_PANITIA'
    : 'NOT_FOUND';

  return {
    edisi: null,
    available,
    canSwitch,
    reason,
    cookieAction: cookieEdisiId ? { type: 'clear' } : null,
  };
}

/**
 * Server Component / route handler convenience wrapper.
 *
 * Reads cookie + (optional) query param from the request scope, runs the
 * resolver, then applies the cookieAction directly to the cookie store.
 * Returns the resolved context.
 *
 * For Server Components, pass the URL search params via `queryEdisiId`. For
 * route handlers, prefer `resolveEdisiContextFromRequest(req)` which handles
 * NextRequest directly.
 */
export async function getEdisiContext(opts: {
  peran: string;
  queryEdisiId?: string | null;
}): Promise<EdisiContextResult> {
  const cookieStore = await cookies();
  const cookieEdisiId = cookieStore.get(COOKIE_NAME)?.value ?? null;

  const result = await resolveEdisiContext({
    peran: opts.peran,
    queryEdisiId: opts.queryEdisiId ?? null,
    cookieEdisiId,
  });

  if (result.cookieAction?.type === 'set') {
    cookieStore.set(COOKIE_NAME, result.cookieAction.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  } else if (result.cookieAction?.type === 'clear') {
    cookieStore.delete(COOKIE_NAME);
  }

  return result;
}

export async function resolveEdisiContextFromRequest(
  request: NextRequest,
  peran: string
): Promise<EdisiContextResult> {
  const queryEdisiId = request.nextUrl.searchParams.get('edisi');
  const cookieEdisiId = request.cookies.get(COOKIE_NAME)?.value ?? null;
  return resolveEdisiContext({ peran, queryEdisiId, cookieEdisiId });
}

export async function findEdisiByIdForRole(
  id: string,
  peran: string
): Promise<Edisi | null> {
  const e = await findEdisiById(id);
  if (!e) return null;
  if (!roleCanAccessEdisi(peran, e)) return null;
  return e;
}

export const EDISI_COOKIE_NAME = COOKIE_NAME;
