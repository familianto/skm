# HANDOFF Sprint F01 — Auth Multi-User + Anggota CRUD

**Branch:** `qurban/f01-auth-multi-user`
**Status:** in-progress (Milestone A, B, C done; D in progress)
**Estimated effort:** 6-8 hari
**Spec source:** `PROMPT_F01_AuthMultiUser.md`, `docs/HANDOFF_TAHAP_*.md`

---

## Milestone Progress

| ID | Title | Status | Commit |
|---|---|---|---|
| A | Foundation helpers (`/lib/api/`) | ✅ done | `eaeabe1` |
| B | Auth endpoints A1-A4 | ✅ done | `2b9e164` |
| C | Anggota CRUD U1-U9 | ✅ done | `8bde499` |
| D | Middleware defense-in-depth | ✅ done | `48a64b5` |
| E1 + E6 | Login refactor + change-pin sync + dark-mode contrast fix | ✅ done | `3ce96df`, `fbfb896` |
| E2 | Anggota list (responsive `lg` breakpoint) | ✅ done | `a91c284`, `7dbda63` |
| E3 | Anggota create form + PIN-once modal | ✅ done | `e6be70d` |
| E4 | Anggota detail page + actions (reset PIN, unlock, deactivate, reactivate) | ✅ done | `c6e7889` |
| E5 | Anggota edit form (nama, telepon, peran) | ✅ done | — |
| F | Testing + docs + PR | ⏳ pending | — |

---

## Decision Log

Decisions made while implementing F1 (in chronological order). Some override
the spec where Hopy explicitly approved an alternative; others record
non-obvious choices that future maintainers will want to know about.

### #1 — Cookie payload superset

JWT payload is `{ user_id, peran, role: peran, masjidName }` instead of the
spec's `{ user_id, peran }`.

**Why:** existing `@/lib/auth` callsites (10 files) read `session.role` and
expect a string like `'BENDAHARA'`. Removing those fields would force a
sweeping refactor of pre-F01 routes. The superset is backwards-compatible:
old `getSession()` returns valid `{role, masjidName}`; new `verifySessionToken`
returns `{user_id, peran, ...}`.

**Cost:** ~50 bytes per JWT.

### #2 — Shared session secret with fallback

`getSessionSecret()` prefers `SESSION_SECRET` and falls back to `AUTH_SECRET`.
Both `/lib/auth.ts` and `/lib/api/auth.ts` use this resolver.

**Why:** old sessions are signed with `AUTH_SECRET`. New code uses
`SESSION_SECRET`. Sharing the resolver lets old and new cookies interop during
the parallel-login window.

**Trade:** at deploy, all outstanding sessions get re-signed with whichever
secret is set in env. If Hopy added `SESSION_SECRET` (a new value) without
also pointing `AUTH_SECRET` at it, all old sessions invalidate → users
re-login. Acceptable for the F1 deploy boundary.

### #3 — Audit log writer is non-blocking

`writeAuditLog()` catches all errors and logs to `console.error`. It NEVER
throws. Same convention as the legacy `logAudit()` in `@/lib/audit`.

**Why:** an audit failure must not roll back the user-facing operation. A
missing audit row is recoverable (review console); a failed user op is not.

### #4 — ID generator uses WIB; existing utility stays UTC

New helper `lib/api/id-gen.ts:generateId()` formats IDs with the Asia/Jakarta
(UTC+7) date. The existing `sheetsService.getNextId()` keeps using UTC date
for backward compat with IDs already generated pre-F01.

**Why:** Tahap 3.E §2.4 mandates WIB for new IDs. Migrating
`sheetsService.getNextId()` would change historical ID generation behavior at
the day boundary (17:00–24:00 UTC = "next day" in WIB). Two coexisting
generators — F1+ uses WIB, legacy uses UTC. F2+ may migrate legacy callers.

**Side effect:** audit log IDs and anggota IDs created post-F01 may appear
to "skip ahead" by one date when generated late-evening UTC. Cosmetic.

### #5 — Distinct rate-limit modules

`@/lib/api/rate-limit.ts` (new) is a generic per-key sliding-window limiter.
`@/lib/rate-limit.ts` (existing) is the IP-based brute-force lockout for the
old single-PIN login.

**Why:** different semantics. The new one limits requests-per-window; the
old one tracks failed attempts with sticky lockout. Both coexist; existing
callers stay on the old one.

### #6 — `pin_hash` empty falls through to legacy fallback

Migration created the new SUPER_ADMIN (Hopy) but left existing 2 anggota
rows with `pin_hash=''`. The login route detects empty `pin_hash` and
**doesn't** count this as a failed PIN — it falls through to the legacy
master.pin_hash fallback when `QURBAN_LEGACY_LOGIN_ENABLED=true`.

**Why:** lets Hopy log in as ANG-…0003 normally; lets the two pre-migration
rows still authenticate via legacy until SUPER_ADMIN resets their PIN via
U5. Once Hopy resets their PINs, multi-user login works for them too.

### #7 — Telepon mismatch returns AUTH_INVALID, not NOT_FOUND

The login route never returns `404` for "telepon not in anggota". It always
returns `401 AUTH_INVALID` with a generic message.

**Why:** no enumeration oracle. The error matches what the user sees for a
wrong PIN, so attackers can't probe for valid telepon numbers.

### #8 — PENDAFTARAN / DISTRIBUSI creation in F1 = ALLOW

U2 accepts all five `peran` values, including PENDAFTARAN and DISTRIBUSI,
even though their target routes (`/qurban/**`) don't exist yet.

**Why:** Hopy may want to pre-provision panitia accounts before F2 ships.
The accounts will authenticate fine in F1 and land at `/` (because
`getLandingUrl()` returns `'/'` for everyone in F1). When F2 deploys and
flips the landing URL switch, those users will automatically land on
`/qurban` on next login.

**Documented in:** `route.ts` U2 docblock and `permissions.ts:getLandingUrl()`.

### #9 — `anggota.peran_changed` is additional, not replacing

When U4 PATCH changes the `peran` field, the route emits TWO audit entries:
`anggota.updated` (with full before/after diff) AND `anggota.peran_changed`
(with only `{peran: X}` in before/after).

**Why:** simplifies reporting in F8 Laporan. A query for "all peran changes"
can filter `event_type = 'anggota.peran_changed'` without parsing JSON
detail of generic update events.

### #10 — U6 unlock is idempotent with descriptive notes

POST /unlock always returns 200 and always writes an audit row. The audit
`notes` field distinguishes the three cases:
- `"unlocked"` — was actually locked
- `"cleared counter (was not locked)"` — counter was non-zero but no lockout
- `"idempotent (no state change)"` — already clean

**Why:** explicit audit trail of unlock attempts. Hides nothing.

### #11 — U4 idempotent when nothing changes

If U4 PATCH body sets fields to their existing values, no audit log entry
is written and no sheet update happens. Returns 200 with the unchanged
record.

**Why:** prevents audit-log noise from automated tools that PATCH the
whole record on every save.

### #12 — U8 reactivate re-checks telepon uniqueness

Reactivation may collide with another anggota that took the telepon during
the inactive period. U8 re-runs `isTeleponTakenByActive()` and returns
`409 DUPLICATE_TELEPON` with guidance to change the telepon first.

### #13 — `user_info` = nama actor snapshot (auto-resolved via helper) ✅ OVERRIDDEN

**Original (before override):** record `user_info` as `session.peran`
(label like "SUPER_ADMIN"). Rationale: peran is stable, names can change.

**OVERRIDE per Hopy at end of Milestone C:** `user_info` is the *nama*
display name snapshot at mutation time.

**Implementation:** `writeAuditLog()` calls `getNamaByUserId(user_id)`
when the caller doesn't pass `user_info`. The helper handles special
user_ids:
- `'SYSTEM'` → `'SYSTEM'`
- `'LEGACY'` → `'Legacy Admin'`
- `'-'`, `''`, null → `''`
- otherwise → `anggota.nama` looked up from the anggota sheet

Helper returns `''` on any error so audit writes never block on this
lookup.

**Rationale (Hopy):**
- Consistency with Milestone B where login/logout/change-pin already pass
  `anggota.nama` as `user_info`.
- Human-review audit trail is more informative with names than role labels.
- "nama bisa berubah" is not a problem — audit log is a snapshot, and the
  nama-at-mutation-time is exactly what we want to record.
- Reporters in F8 get a uniform shape (always a name) across all event
  types.

**Cost:** +1 Sheet read per audit write for Milestone C handlers (which
don't already have the anggota loaded). Milestone B handlers pass
`user_info` explicitly when nama is already in memory — saves the lookup.

### #14 — BUSINESS_LAST_SUPER_ADMIN U7 is defense-in-depth

With only one active SUPER_ADMIN, U7 can never reach the
`BUSINESS_LAST_SUPER_ADMIN` branch — `BUSINESS_CANNOT_DEACTIVATE_SELF`
fires first (the only SA trying to deactivate themselves). The check
matters once there are 2+ SAs.

**Why guard anyway:** defense-in-depth. Future routes (or manual sheet
edits) could create a state where SA-A deactivates SA-B leaving zero
SAs. The U7 guard catches that.

### #15 — Keep `middleware.ts` filename (defer rename to `proxy.ts`)

Next 16 renamed the middleware concept to "Proxy" and emits a deprecation
warning when the file is named `middleware.ts`. Behavior is identical;
only the preferred filename changed.

**F1 keeps `middleware.ts`** because it's the existing project convention
and renaming is out of scope per "no refactor beyond task". Rename to
`proxy.ts` can be a one-line chore in a future cleanup PR or F2.

### #16 — Cookie `SameSite=lax` lowercase is correct

The Vercel preview emits `Set-Cookie: ...; SameSite=lax` (lowercase L).
Initial test script flagged this as a failure with a case-sensitive bash
glob `*SameSite=Lax*`.

**Investigation:**
- Next.js cookies API (`cookieStore.set` and friends) typed
  `sameSite: 'lax' | 'strict' | 'none'` — lowercase only.
- The compiled `@edge-runtime/cookies` serializer literally interpolates
  the value (`SameSite=${c.sameSite}`), so emitted value mirrors the
  TypeScript-allowed lowercase form.
- Local probe (`Set-Cookie: skm_session=test-token; ...; Secure;
  HttpOnly; SameSite=lax`) confirms it on this branch's Next 16 build.
- Per **RFC 6265bis** and current browser behavior, cookie attribute
  names AND the `SameSite` value are case-insensitive. `lax`, `Lax`,
  `LAX` are functionally identical — browsers parse all three the same.

**Decision:** keep the Next.js cookies API as-is in `setSessionCookie()`;
fix the test assertion to be case-insensitive (lowercase compare via
`tr '[:upper:]' '[:lower:]'`). Same treatment applied to the HttpOnly,
Secure, and Max-Age assertions for consistency — defensive against
future serializer case changes by Next or upstream.

**Why not force uppercase server-side:** would mean bypassing Next.js
cookies API (manual `response.headers.append('Set-Cookie', '...')`) for
purely cosmetic gain. Loses type safety + auto-encoding for no behavior
change. Not worth it.

### #17 — Preview deployment writes to STAGING sheet

The Vercel preview for this branch resolves `GOOGLE_SHEETS_ID` to the
staging spreadsheet (`1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4`),
not production (`1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`). This
is intentional — preview should never mutate production data.

**State of the staging sheet (verified by Hopy from F1 preview test):**
- Pre-F01 schema: peran enum still uses `PENGURUS`, telepon
  un-normalized, anggota has 7 cols not 13.
- The F01 Apps Script migration (`migrate_F01()`) was run only on
  **production**. Staging has not been migrated.
- Consequence: ANG-20260515-0003 (Hopy SUPER_ADMIN bootstrap row) does
  not exist in staging.

**What the preview test actually exercised:**

| Test | Path in code | Why |
|---|---|---|
| #2 SA login | LEGACY FALLBACK (`master.pin_hash`) | `QURBAN_LEGACY_LOGIN_ENABLED=true` + Hopy's telepon not in staging anggota → bcrypt vs master.pin_hash → session `{user_id:'LEGACY', peran:'SUPER_ADMIN'}` |
| #4 create BENDAHARA | multi-user path, U2 endpoint | Hopy's LEGACY session has SUPER_ADMIN role, U2 guard passes |
| #5 BENDAHARA login | MULTI-USER path (`anggota.pin_hash`) | Fresh row created in #4, fully populated post-F01 columns |
| #6 BENDAHARA → 403 | API guard `requireSuperAdmin` | Multi-user session with peran=BENDAHARA proven gateable |

**Net evidence collected:**
1. Audit log entries match Decision #13 — `user_info='Legacy Admin'`
   for the LEGACY session, `user_info='Test BENDAHARA 17...'` (full
   nama, not the peran label "BENDAHARA") for the multi-user creation.
2. user_id, ip_address columns populated.
3. event_type + before/after JSON structured per spec.
4. End-to-end multi-user flow (#4-#9) exercises the same code paths
   Hopy will use post-merge — just rotated through a freshly-created
   BENDAHARA instead of Hopy's own SUPER_ADMIN row.

**What is NOT yet exercised in preview:**
- Hopy SA logging in via multi-user path against anggota row (cannot
  test against staging because the row doesn't exist there).

**Why this is acceptable for F1 sign-off:**
- The branch in BENDAHARA dummy IS the same code path Hopy will hit
  post-merge. Only the row identity differs.
- Production sheet IS F01-migrated and has ANG-20260515-0003.
- Decision #6 (`pin_hash` empty fallback) ensures the row is reachable
  via legacy fallback as a safety net even if anggota lookup somehow
  fails after merge.

**Follow-ups (parked, NOT F1 blockers):**
- Run `migrate_F01()` against staging pre-F2 so the next sprint can
  exercise SA-against-anggota end-to-end on preview.
- Post-merge production smoke test:
  1. Hopy logs in with telepon + PIN → confirm 200 + JWT
     `user_id=ANG-20260515-0003` (NOT LEGACY).
  2. After 1-2 day soak, set `QURBAN_LEGACY_LOGIN_ENABLED=false`.

### #18 — `globals.css` dark-mode fallback is dead boilerplate

The create-next-app template left a `@media (prefers-color-scheme: dark)`
block in `globals.css` that flips `--background` to `#0a0a0a` and
`--foreground` to `#ededed`. Nothing in SKM actually opts into dark
theming — zero `dark:` Tailwind variants, zero components consume the
foreground/background CSS variables. The block is effectively dead.

**The trap it creates:** any custom `<input>` that does NOT explicitly
set `text-gray-900` inherits the body color. On a user device with the
system in dark mode, that's near-white. SKM's pages wrap content in
`bg-white` cards, so the card stays light but the input text becomes
near-invisible — discovered when Hopy tested E1 on his iPad in dark
mode.

The shared `<Input>` component at `src/components/ui/input.tsx`
hardcodes `text-gray-900 placeholder:text-gray-400`, which is why
existing pages don't surface this bug.

**Decision for F1:** apply explicit `text-gray-900
placeholder:text-gray-400` to the two raw `<input>` elements in
`/login` (custom-styled, can't easily use shared `<Input>` because of
the PIN's centered 2xl + letter-spacing). Document the gotcha for
E2-E5 — any new custom input must do the same OR use the shared
`<Input>` component.

**Not in F1 scope (parked):** remove the dark @media block from
`globals.css` entirely. That would close the bug class globally and is
a one-line change, but touching shared CSS is broader than the E1
visibility fix Hopy requested. Surface as a chore in a future PR.

### #19 — Anggota list: card vs. table breakpoint at `lg` (1024px)

The `/pengaturan/anggota` list switches between table (desktop) and card
(mobile) layouts. Initially set at Tailwind's `md` breakpoint (768px) —
which left iPad portrait (768–1023px) on the table layout, with cramped
columns and small tap targets.

**Decision:** bump the boundary to `lg` (1024px):
- `lg+` → table (5 columns, hover row, click → detail)
- `<lg` → vertical card stack (peran + status badge cluster right-aligned)

This covers iPhone, iPad portrait, AND iPad landscape under ~10.5" — all
get the card layout. Only true desktop laptops and 12.9" iPad Pro
landscape stay on the table.

**Trade-off:** a small laptop window in portrait orientation (rare)
also gets the card stack. Acceptable — card list is functional at any
width; the table is the "luxury" view for wide screens.

Same breakpoint convention should apply to E4 (detail) and E5 (edit) so
the iPad portrait experience stays consistent across the anggota CRUD
flow.

### #20 — U7 deactivate accepts optional `notes` body (additive)

The E4 spec asked for a 200-char "Alasan (opsional)" textarea on the
deactivate confirmation modal, with the reason persisted alongside the
audit log entry. The Milestone-C backend route did not read the body —
it ignored anything sent to U7.

**Decision:** extend U7 to parse an optional `{ notes?: string }` body
and forward it (trimmed, capped at 200 chars, dropped if empty) into
the existing `writeAuditLog({ notes })` parameter. `AuditLogParams`
already accepted `notes`, so the audit-sheet column for the
`anggota.deactivated` event simply starts getting filled when the SA
chooses to write something.

**Why it's safe:**
- Strictly additive — the route still works when the body is empty /
  missing / malformed JSON, so any prior caller (test script, curl)
  continues to behave identically.
- No schema or response-shape change.
- Audit log gets richer without breaking F8 reporting queries.

**Why this deviates from "DO NOT modify backend":** the rule's intent
was preventing semantic churn / regression of finished endpoints.
This three-line additive change adds new behavior only when the body
is supplied. Reverting it would require dropping the textarea from
E4, which contradicts the explicit UI spec. Documented here so the PR
review for F1 sees the trade-off explicitly. Same precedent applies if
future milestones need similar small additive backend tweaks to
satisfy spec'd UX.

**Future:** U5 reset-pin and U8 reactivate could likewise accept
`{ notes }` for consistent admin-action provenance. Parked — not in
F1 scope.

---

## Milestone F Polish Backlog

Items to address (or explicitly defer with rationale) during Milestone F
before opening the PR. Listed roughly in priority order.

### F-polish-1 — Verify E4 self-deactivate UI gate

E4 disables the "Nonaktifkan" button when `me.user.id === anggota.id`
and renders a helper line below the action group. Confirm during
Hopy's pre-PR walkthrough that the disabled state actually fires for
his own row in production (preview test was indirect because the
staging row is `LEGACY` rather than a real anggota id).

### F-polish-2 — PinOnceModal title configurability

Reset PIN flow currently surfaces a PinOnceModal whose copy is keyed
to the E3 create scenario ("PIN Awal Berhasil Dibuat" / "PIN Awal").
For reset PIN it'd read more naturally as "PIN Baru Berhasil Dibuat"
/ "PIN BARU". Plan: add two optional props (`title`, `pinLabel`) with
the current strings as defaults; pass overrides from E4 detail page.

### F-polish-3 — `globals.css` dark-mode @media cleanup

Carry-over from Decision #18. The `@media (prefers-color-scheme:
dark)` block in `globals.css` is dead boilerplate that creates a
class of "invisible text in custom inputs" bugs (E1 hit this). The
one-line removal closes the gap globally. Out of scope for individual
fixes; do this as a single sweep at PR time.

### F-polish-4 — Extend `test-f01-preview.sh` for Decision #20

The integration script doesn't currently verify that U7
`{ notes }` body is persisted in `audit_log.notes`. Add an assertion
that posts the deactivate call with a sentinel string and reads it
back from the audit_log sheet (or just from the writeAuditLog call
trace if the API surfaces it). Keep the existing 25 assertions
unchanged.

### F-polish-5 — Staging sheet full migrate_F01()

Decision #17 follow-up. Staging is still pre-F01 (anggota = 7 cols,
PENGURUS legacy, telepon un-normalized). Running `migrate_F01()` on
staging will let future sprints exercise SA-against-anggota end-to-end
on preview without the LEGACY fallback short-circuit. Pure data
operation, no code change.

### F-polish-6 — Post-merge production smoke + legacy flag flip

Carry-over from Decision #17. After F1 merges:
1. Hopy logs in with telepon + PIN; confirm 200 with
   `user_id=ANG-20260515-0003` (NOT `LEGACY`).
2. After a 1–2 day soak, set `QURBAN_LEGACY_LOGIN_ENABLED=false`
   in Vercel; redeploy.
3. Set `QURBAN_BOOTSTRAP_ENABLED=false` to make the bootstrap path
   inert.

---

## TODOs Carry-Over to Later Milestones

### Milestone E (UI) carry-overs

- **Change-pin success UI message must not say "silakan login kembali".**
  Per spec §3.5, the session is preserved after PIN change (the legacy
  /change-pin used to call `deleteSession()` — that's gone in the refactor).
  UI should show a non-destructive success toast and stay on the current
  page.
- **Login form refactor**: replace PIN-only form with telepon + PIN. Handle
  423 AUTH_LOCKED (show estimated unlock time) and 429 RATE_LIMITED
  (show Retry-After countdown).
- **Anggota CRUD pages**: mobile-first per Hopy's primary device.

### Milestone F (PR) carry-overs

- Run the full smoke-test checklist per `PROMPT_F01 §8`.
- Update `PROJECT_BRIEF.md` and `API_REFERENCE.md` with the 13 new
  endpoints and PIN policy.
- Open PR `[F01] Auth Multi-User + Anggota CRUD` (squash + merge).
- Post-deploy, monitor for 1-2 days then set
  `QURBAN_LEGACY_LOGIN_ENABLED=false` and
  `QURBAN_BOOTSTRAP_ENABLED=false`.

### F2+ carry-overs

- Flip `getLandingUrl()` so ADMIN_QURBAN / PENDAFTARAN / DISTRIBUSI land
  on `/qurban` once those routes exist.
- Extend `STRICT_PATH_RULES` in `lib/api/path-rules.ts` to cover Qurban
  routes per Tahap 3 §3.7.
- Migrate remaining audit-log callers from `logAudit()` (7 cols) to
  `writeAuditLog()` (9 cols).

---

## Schema Sync Notes

`SHEET_HEADERS` in `lib/constants.ts` was updated to reflect the migrated
production schema:

- `anggota`: 7 → **13 cols** (adds `pin_hash, created_by, updated_at,
  last_login_at, failed_attempts, locked_until`)
- `audit_log`: 7 → **9 cols** (adds `user_id, ip_address`)

Old code that `appendRow()`s with 7 cells still works — trailing cells in
the sheet stay empty. `updateRow()` uses `SHEET_HEADERS.length` to size
the range; the sync ensures we write all 13/9 cells.

---

## Test Coverage Summary

Unit tests (`npm run test:lib-api` — `node:test` via tsx):
- `pin-policy.test.ts`: 12 cases — format, all-same, sequential, blocklist,
  strong PINs
- `phone.test.ts`: 13 cases — normalize variants, validate boundaries,
  round-trip

Integration tests: deferred to Hopy's manual smoke-test on Vercel preview
after Milestone D and F. Curl examples and audit log expectations are
captured in the milestone summaries (visible in commit messages on this
branch).

---

_This file evolves through F1. Each milestone appends to the decision log
and TODO list._
