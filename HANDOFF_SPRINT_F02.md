# HANDOFF Sprint F02 — Qurban Edisi Management

**Branch:** `claude/qurban-edisi-setup-XghmL`
**Status (Milestone A):** Implementation complete. Awaiting Hopy's preview verification.
**Spec source:** prompt `Sprint F02 · Milestone A: Infrastructure` (delivered via session).

---

## Sprint Goal

Build Modul Qurban as an operational layer on top of the F01 multi-user auth
foundation. Each Qurban "edisi" (1447H, 1448H, …) acts as a container for
peserta, hewan, pembayaran, and distribusi state. Edisi is request state
(cookie-backed), not URL path — routes are `/qurban/peserta`, not
`/qurban/edisi/[id]/peserta`.

## Milestones

| ID | Title | Status | Commit |
|---|---|---|---|
| A  | Infrastructure (libs + middleware activation + skeleton dashboard) | ✅ done | _this commit_ |
| B  | Edisi CRUD endpoints (E1–E6) + edisi UI | ⏳ pending | — |
| C  | Konfigurasi edisi + panitia management | ⏳ pending | — |
| D  | Operational surfaces (peserta / hewan / pembayaran / distribusi entry points) | ⏳ pending | — |
| E  | Acceptance tests + handoff polish | ⏳ pending | — |

---

## Milestone A — What Shipped

### New sheets (run by Hopy via `migrate_F02` Apps Script)

Three sheets added to the main SKM spreadsheet (`GOOGLE_SHEETS_ID`, same
workbook as anggota / transaksi / audit_log — NOT the legacy
`GOOGLE_SHEETS_QURBAN_ID` used by the publik TV display path).

#### `qurban_edisi` (12 cols)
`id` (EDS-YYYYMMDD-NNNN) · `tahun_hijriah` · `tahun_masehi` ·
`tanggal_idul_adha` · `tanggal_pendaftaran_buka` ·
`tanggal_pendaftaran_tutup` · `status` (DRAFT|AKTIF|SELESAI) ·
`parent_edisi_id` · `cloned_at` · `created_at` · `updated_at` · `created_by`

#### `qurban_konfigurasi_edisi` (15 cols)
`id` (KFG-YYYYMMDD-NNNN) · `edisi_id` (FK unique) ·
`bop_per_ekor_sapi` · `bop_per_ekor_kambing` · `target_bungkus_total` ·
`berat_target_per_bungkus` · `tanggal_distribusi_mulai` ·
`tanggal_distribusi_selesai` · `payment_suffix` (default 3) ·
`wa_send_on_pendaftaran` (TRUE) · `wa_send_on_pembayaran_confirmed` (TRUE) ·
`notes` · `created_at` · `updated_at` · `created_by`

#### `qurban_panitia` (7 cols)
`id` (PNT-YYYYMMDD-NNNN) · `edisi_id` (FK) · `anggota_id` (FK → anggota.id) ·
`is_active` · `assigned_at` · `assigned_by` (FK → anggota.id) · `notes`

Conventions follow F01: snake_case columns, UPPERCASE enums, ID format
`PREFIX-YYYYMMDD-NNNN` (WIB date), booleans serialised as `TRUE`/`FALSE`.

### Files added

| Path | Purpose |
|---|---|
| `src/lib/qurban/sheets.ts` | `QURBAN_SHEETS` constants (sheet names). |
| `src/lib/qurban/id-generator.ts` | Convenience wrappers around `generateId()` for EDS/KFG/PNT prefixes. |
| `src/lib/qurban/edisi-state-machine.ts` | Pure status guards (`isValidTransition`, `getEditableFields`, `assertTransition`, `assertFieldEditable`, `EdisiStateError`). |
| `src/lib/qurban/edisi-repo.ts` | Minimal read-side repo (`listEdisi`, `findEdisiById`, `findActiveEdisi`, row mappers). Write side ships with Milestone B. |
| `src/lib/qurban/edisi-context.ts` | Edisi context resolver — query param → cookie → AKTIF default. Cookie `qurban_edisi` HTTP-only. |
| `src/components/qurban/EditionSwitcher.tsx` | Top-of-page strip widget. Dropdown for SA/BD/AQ, disabled label for PD/DS. Handles empty state for every role. |
| `src/app/(dashboard)/qurban/layout.tsx` | Server layout that resolves edisi context and mounts `<EditionSwitcher>`. |
| `src/app/(dashboard)/qurban/page.tsx` | Skeleton dashboard at `/qurban`. Placeholder quick-stats + dead link to `/qurban/edisi` (lands in Milestone B). |

### Files modified

| Path | Change |
|---|---|
| `src/lib/api/errors.ts` | Added `FORBIDDEN_EDISI`, `BUSINESS_EDISI_LOCKED`, `BUSINESS_EDISI_NOT_AKTIF`, `BUSINESS_INVALID_STATE_TRANSITION`. |
| `src/lib/api/permissions.ts` | `getLandingUrl()` now returns `/qurban` for ADMIN_QURBAN / PENDAFTARAN / DISTRIBUSI (previously fell back to `/` while Qurban routes did not exist). |
| `src/lib/api/path-rules.ts` | Added per-role allow-list patterns for all `/qurban/**` and `/api/qurban/**` paths. Order: distribusi → edisi/konfigurasi/panitia → operational pendaftaran surfaces → laporan → root. |
| `src/middleware.ts` | Removed the `QURBAN_MODULE_ENABLED` kill-switch (modul Qurban is now a live feature; gating is via per-role path-rules). Step numbers in the file comment renumbered accordingly. |

No changes to F01 endpoints, the anggota repo, or any other SKM surface.

### Key decisions

#### D1 — Edisi context resolution runs in Node, not in middleware

`src/middleware.ts` runs in Edge Runtime. `lib/qurban/edisi-repo.ts` reads
the Google Sheet via `sheetsService` (Node SDK `googleapis` — not edge-safe).
Resolving edisi context inside the middleware would force a duplicate
Edge-safe Sheets path or break the runtime.

**Pattern adopted:** middleware does only what it can do cheaply at the edge
(JWT verify + path-rule check). Resolving edisi context happens in
`getEdisiContext()` (Node), invoked from `src/app/(dashboard)/qurban/layout.tsx`.
Cookie writes are emitted from there via `next/headers` `cookies()`.

This matches the F01 split (`lib/api/auth.ts` server-only via `next/headers`,
inline jose verifier in middleware).

#### D2 — `QURBAN_MODULE_ENABLED` kill-switch removed

The F1 middleware short-circuited every `/qurban/**` request with HTTP 503
unless `QURBAN_MODULE_ENABLED === 'true'`. With Milestone A activating the
module, the switch becomes either a no-op (always set true) or a footgun
(unset in a preview env → blank Qurban pages on the very deploy meant to
verify them).

Removed in favour of letting `STRICT_PATH_RULES` enforce per-role visibility.
The module is now permanently on; per-role gating is what controls who sees
what.

If future operational concerns ever need a per-environment off switch, layer
it back as a check inside the layout (returning the empty-state UI) rather
than a 503 from the middleware.

#### D3 — Reuse F01 generic ID generator

`lib/api/id-gen.ts:generateId(prefix, sheetName)` is already prefix-agnostic
and uses WIB date. No refactor needed — `lib/qurban/id-generator.ts` exposes
three convenience helpers (`generateEdisiId`, `generateKonfigurasiId`,
`generatePanitiaId`) that close over `(prefix, sheet)` per resource.

#### D4 — Sidebar nav not updated

Milestone A's scope explicitly excludes nav changes. SUPER_ADMIN and
BENDAHARA reach `/qurban` via URL during preview testing; ADMIN_QURBAN /
PENDAFTARAN / DISTRIBUSI land there automatically via the updated
`getLandingUrl()`. Sidebar entries for Qurban surfaces (Edisi, Peserta,
Distribusi, etc.) will be added in Milestone D once those pages exist.

#### D5 — Skeleton dashboard handles "no edisi" gracefully for every role

Per spec §A.1 note: at Milestone A no edisi exists yet. Panitia roles
(PENDAFTARAN, DISTRIBUSI) must not hit a hard error when opening `/qurban`.
Implementation: `resolveEdisiContext` returns `edisi: null` with
`reason: 'NO_EDISI_EXISTS'` instead of throwing; the EditionSwitcher renders
a dashed "Belum ada edisi" strip; the dashboard body renders an empty-state
card prompting edisi creation. No 422/403 escapes to the user.

### Helpers reused vs introduced

| Concern | F01 helper reused | F02 added |
|---|---|---|
| Response envelope | `lib/api/response.ts` `success` / `error` | — |
| Error codes | `lib/api/errors.ts` `ErrorCodes` | + 4 new codes (see above) |
| ID generation | `lib/api/id-gen.ts` `generateId(prefix, sheet)` | thin per-resource wrappers in `lib/qurban/id-generator.ts` |
| Auth session | `lib/api/auth.ts` `getSessionFromCookieStore` / `getSessionFromRequest` | — |
| Role landing | `lib/api/permissions.ts` `getLandingUrl` | extended (`/qurban` for AQ/PD/DS) |
| Path gate | `lib/api/path-rules.ts` `STRICT_PATH_RULES` | extended with `/qurban/**` patterns |
| Edge JWT verify | inline `jose.jwtVerify` in `src/middleware.ts` | — |

### Verification (build / CI)

Run locally on `claude/qurban-edisi-setup-XghmL` after `npm ci`:

- `npm run type-check` → ✅ clean
- `npm run lint` → ✅ clean
- `npm run build` → ✅ `Compiled successfully`; `/qurban` listed as `ƒ` dynamic route.

### Verification (Hopy, on preview deploy)

The branch's preview deployment writes to the staging Google Sheet (per
Decision #17 of HANDOFF F01). The three `qurban_*` sheets must already be
present in staging (Hopy's `migrate_F02` Apps Script run) before functional
verification.

Six manual checks to run after `migrate_F02` lands in staging:

- [ ] Login as `SUPER_ADMIN` → `/qurban` loads, switcher renders empty state.
- [ ] Login as `BENDAHARA` → `/qurban` loads, switcher renders empty state.
- [ ] Login as `ADMIN_QURBAN` → lands on `/qurban` (not `/`).
- [ ] Login as `PENDAFTARAN` → lands on `/qurban`, switcher is a disabled label.
- [ ] Login as `DISTRIBUSI` → lands on `/qurban`, switcher is a disabled label.
- [ ] Existing SKM surfaces (`/`, `/transaksi`, `/pengaturan/anggota`, etc.)
      still behave identically for SA / BD.

Functional flows (create edisi, switch edisi, panitia-deep-link rejection)
become testable in Milestone B once the E1–E6 endpoints + the
`/qurban/edisi` UI exist.

---

## Documentation updates parked for later milestones

- `docs/API_REFERENCE.md` — first updated at Milestone B (E1–E6 endpoints).
- `docs/PROJECT_BRIEF.md` — updated at Milestone E once the module shape stabilises.
- `docs/DATABASE_SCHEMA.md` — needs the 3 new sheets documented; doing this
  alongside the API_REFERENCE update at Milestone B keeps the doc story
  consistent.

---

_This file evolves through F02. Each milestone appends to the change log and
TODO list._
