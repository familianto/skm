# HANDOFF Sprint F02 — Qurban Edisi Management

**Branch:** `claude/qurban-edisi-setup-XghmL` (PR #83)
**Status:** All milestones (A–E) ✅ done. Two hotfixes ✅ done. F02
**code-complete** — pending pre-production checklist (see bottom of this
file) before PR #83 merges to `main`.
**Spec source:** session prompts `Sprint F02 · Milestone A/B/C/D/E` +
the two bugfix prompts.

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
| A  | Infrastructure (libs + middleware activation + skeleton dashboard) | ✅ done | `310dd0e` |
| B  | Edisi CRUD endpoints (E1–E6) + edisi UI + sidebar | ✅ done | `7e951ec` |
| C  | Konfigurasi edisi (K1–K2) + tab Konfigurasi UI | ✅ done | `c429bd4` + hotfix `1bb2f11` |
| D  | Panitia management (P1–P3) + tab Panitia UI | ✅ done | `3ffe953` + hotfix `c7f57af` |
| E  | Unit tests + CI + polish UI + final docs | ✅ done | _this commit_ |
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

## Milestone B — What Shipped

Edisi CRUD endpoints E1–E6, four UI pages, sidebar QURBAN section, plus a
fail-open restoration of the `QURBAN_MODULE_ENABLED` kill switch.

### New endpoints

All under `src/app/api/qurban/edisi/`. Auth via F01 `requireRole`; response
envelope `{ ok, data, meta? }`; audit via `writeAuditLog`. See
`docs/API_REFERENCE.md` → "Qurban Edisi Endpoints" for full request/response
contracts.

| # | Method | Path | Notes |
|---|---|---|---|
| E1 | GET | `/api/qurban/edisi` | List + `?status=` filter. PD/DS auto-filtered to AKTIF. Sorted by `tahun_masehi` desc. |
| E2 | POST | `/api/qurban/edisi` | Create + optional clone (`konfigurasi` default ON, `panitia` default OFF, master_hewan NOT offered — F3 scope). |
| E3 | GET | `/api/qurban/edisi/[id]` | Detail. PD/DS on non-AKTIF → `403 FORBIDDEN_EDISI`. |
| E4 | PATCH | `/api/qurban/edisi/[id]` | Field-level lock per status (DRAFT=all, AKTIF=3 tanggal, SELESAI=none). |
| E5 | POST | `/api/qurban/edisi/[id]/activate` | Pre-flight: status DRAFT + konfigurasi present + ≥1 active panitia + single-AKTIF (with `force_close_existing_aktif`). |
| E6 | POST | `/api/qurban/edisi/[id]/close` | Pre-flight: status AKTIF only. |

Pre-flight TODOs intentionally deferred and marked in code:
- E5: `master_hewan` aktif (F3), `hewan` AKTIF (F4).
- E6: blok bila peserta TERDAFTAR belum lunas (F4+).

### New repo helpers (used by Milestone B + C/D)

- `src/lib/qurban/edisi-repo.ts` — added `edisiToRow`, `findEdisiRecordById`,
  `isTahunHijriahTaken`, `createEdisi`, `updateEdisiAt`,
  `sortEdisiByTahunDesc`.
- `src/lib/qurban/konfigurasi-repo.ts` (NEW) — minimal repo
  (`findKonfigurasiByEdisiId`, `hasKonfigurasi`, `createKonfigurasi`). Used
  by E2 clone + E5 pre-flight. Full K1/K2 lands in Milestone C.
- `src/lib/qurban/panitia-repo.ts` (NEW) — minimal repo
  (`listPanitiaByEdisi`, `listActivePanitiaByEdisi`,
  `countActivePanitiaByEdisi`, `createPanitia`). Used by E2 clone + E5
  pre-flight. Full P1–P3 lands in Milestone D.

### New UI pages (`/qurban/edisi/**`)

- `page.tsx` — list with status-filter chips (Semua / Draft / Aktif /
  Selesai); "+ Edisi Baru" only for SA/AQ.
- `baru/page.tsx` — create form with optional "Salin dari edisi sebelumnya"
  (konfigurasi default ✓, panitia default ✗). Hides clone section when no
  edisi exists yet.
- `[id]/page.tsx` — detail with 3 tabs (Detail | Konfigurasi | Panitia),
  deep-linkable via `?tab=`. Konfigurasi & Panitia tabs are placeholders.
  Action buttons gated by status + peran (write actions hidden for
  BD/PD/DS):
  - DRAFT: `Edit` + `Aktifkan`
  - AKTIF: `Edit Tanggal` + `Tutup Edisi`
  - SELESAI: none
- `[id]/edit/page.tsx` — edit form. Disables locked fields per status
  (`AKTIF` → only the 3 tanggal fields enabled; `SELESAI` shows a blocking
  card and points back to detail).
- `src/components/qurban/EdisiForm.tsx` — shared form component (create +
  edit). Honors `editableFields` prop for field-level lock UX.

### Activation flow UX

The detail page's `Aktifkan` button confirms once with a primary dialog,
then calls `POST /activate`. If the server replies
`BUSINESS_PREFLIGHT_FAILED` with `details.check = "single_aktif"`, the
client swaps in a second confirmation modal (`danger` variant) that names
the existing AKTIF edisi and offers a single retry with
`force_close_existing_aktif: true`. Other pre-flight failures (missing
konfigurasi / no active panitia) surface as toast messages — the user
sees a clear reason why activation can't proceed.

### Sidebar — QURBAN section

`src/components/layout/sidebar.tsx` now consumes `useMe()` and supports
three peran-aware flags per item:
- `visibleRoles` — hide entirely when peran is not in the list.
- `readOnlyRoles` — show an eye glyph (👁 equivalent) hinting view-only.
- `disabledRoles` — render as non-clickable `<span>` with a lock glyph
  (🔒 equivalent).

Section QURBAN contains two items only (the only Qurban pages that exist
today):
- `Dashboard` → `/qurban` (visible to all 5 roles).
- `Edisi` → `/qurban/edisi`. Visible to all 5 roles. `BENDAHARA` +
  `PENDAFTARAN` get the read-only indicator. `DISTRIBUSI` sees it grayed
  with the lock glyph (their middleware path-rule denies the page anyway —
  the lock is just a UX honesty signal).

Additional Qurban nav items (Peserta, Hewan, Pembayaran, Muqorib,
Distribusi, Konfigurasi, Panitia, Laporan) are intentionally NOT added —
their pages don't exist yet and shipping dead links would worsen the
nav. They'll land alongside the corresponding Milestone C/D/F sprints.

### Restored `QURBAN_MODULE_ENABLED` — fail-open

Milestone A removed the F1 kill switch because the deny-by-default
behavior conflicted with the goal of activating the module. Milestone B
restores it as a **fail-open** guard per `PROMPT_F02 §9.2` Level 2:

- `process.env.QURBAN_MODULE_ENABLED === 'false'` → all `/qurban/**` and
  `/api/qurban/**` requests respond `404` (page route: empty 404, API
  route: `{ ok: false, error: { code: 'NOT_FOUND' } }`).
- Unset / `'true'` / any other value → module is on.

Pure env read, edge-safe, no I/O. Acts as a rollback lever without
breaking deploy verification (the preview deploy has the env unset and
therefore runs with the module active).

### Files added / modified

**New endpoints:**
- `src/app/api/qurban/edisi/route.ts` — E1, E2
- `src/app/api/qurban/edisi/[id]/route.ts` — E3, E4
- `src/app/api/qurban/edisi/[id]/activate/route.ts` — E5
- `src/app/api/qurban/edisi/[id]/close/route.ts` — E6

**New UI:**
- `src/app/(dashboard)/qurban/edisi/page.tsx`
- `src/app/(dashboard)/qurban/edisi/baru/page.tsx`
- `src/app/(dashboard)/qurban/edisi/[id]/page.tsx`
- `src/app/(dashboard)/qurban/edisi/[id]/edit/page.tsx`
- `src/components/qurban/EdisiForm.tsx`

**New repos:**
- `src/lib/qurban/konfigurasi-repo.ts`
- `src/lib/qurban/panitia-repo.ts`

**Modified:**
- `src/lib/qurban/edisi-repo.ts` — added write-side helpers.
- `src/lib/api/errors.ts` — `+DUPLICATE_TAHUN_HIJRIAH`, `+BUSINESS_PREFLIGHT_FAILED`.
- `src/components/layout/sidebar.tsx` — peran-aware items + QURBAN section.
- `src/middleware.ts` — restored `QURBAN_MODULE_ENABLED` as fail-open.
- `HANDOFF_SPRINT_F02.md` — this section + §D2 correction.
- `docs/API_REFERENCE.md` — "Qurban Edisi Endpoints" section.

### Correction to Milestone A §D2

In Milestone A I removed `QURBAN_MODULE_ENABLED` outright, reasoning that
a deny-by-default switch would obstruct verification. Milestone B
re-introduces the switch, but **fail-open**: only the literal string
`'false'` disables the module. Unset / `'true'` / anything else leaves
the module active. This preserves the rollback lever required by
`PROMPT_F02 §9.2` without the original footgun.

### Verification (build / CI)

Run after `npm ci`:
- `npm run type-check` → ✅ clean
- `npm run lint` → ✅ clean (no warnings)
- `npm run build` → ✅ `Compiled successfully`. New dynamic routes:
  `/qurban/edisi`, `/qurban/edisi/baru`, `/qurban/edisi/[id]`,
  `/qurban/edisi/[id]/edit`; API routes: `/api/qurban/edisi`,
  `/api/qurban/edisi/[id]`, `/api/qurban/edisi/[id]/activate`,
  `/api/qurban/edisi/[id]/close`.

### Verification (Hopy, preview deploy)

Sheet prerequisite: the staging Sheet must already contain the three
`qurban_*` sheets from `migrate_F02`.

Manual checks for Milestone B (from the prompt §8):
- [ ] Sidebar QURBAN section visible with Dashboard + Edisi; peran-aware
      indicators (read-only / disabled) render as specified.
- [ ] SA/AQ: `/qurban/edisi` → "+ Edisi Baru" → create `1448H` (2027 +
      3 tanggal, no clone) → redirect to detail, status badge `DRAFT`.
- [ ] List shows `1448H`; filter `?status=DRAFT` works.
- [ ] EditionSwitcher in `/qurban` layout now shows `1448H`.
- [ ] Detail tabs render; `?tab=konfigurasi` / `?tab=panitia` deep-link
      lands on placeholder card.
- [ ] Edit page in DRAFT → all fields editable.
- [ ] `Aktifkan` on `1448H` → confirm modal → preflight fails with toast
      "Konfigurasi edisi belum diisi" (or similar). This is EXPECTED at
      Milestone B; activation flows fully exercise after Milestone C+D.
- [ ] BD/PD/DS: no write buttons surface. PD/DS only see AKTIF edisi.

### Acceptance tests parked

Acceptance test script and end-to-end create→konfigurasi→panitia→activate
flow live in Milestone E once C and D ship.

---

## Milestone C — What Shipped

K1/K2 konfigurasi endpoints + the Konfigurasi tab (previously a placeholder)
inside the edisi detail page.

### New endpoint — `/api/qurban/konfigurasi`

Single route file with both methods, since K1 and K2 share the
`edisi_id` query-param contract and there is only one konfigurasi row per
edisi.

| # | Method | Path | Notes |
|---|---|---|---|
| K1 | GET | `?edisi_id=EDS-...` | All authenticated roles. Returns row or `null`. PD/DS on non-AKTIF → `403 FORBIDDEN_EDISI`. |
| K2 | PUT | `?edisi_id=EDS-...` | SA/AQ only. Upsert: existing row → UPDATE; missing → INSERT new `KFG-…`. Edisi `SELESAI` → `422 BUSINESS_EDISI_LOCKED`. |

Why `edisi_id` is an explicit query param (not cookie/AKTIF default):
Milestone C ships before any edisi is `AKTIF`, so AKTIF resolution would
fail. The Konfigurasi tab always knows the edisi it's editing (from the
detail page URL `[id]`) and passes it through. Cookie/AKTIF default
behavior would only be useful from a standalone `/qurban/konfigurasi`
page, which is intentionally out of scope.

**Validation (K2):**
- Numeric fields integer ≥ 0; `payment_suffix` integer 0–9.
- `tanggal_distribusi_mulai ≤ tanggal_distribusi_selesai` (cross-field;
  re-checked on the merged row so patch updates to one end of the range
  still validate).
- `notes` capped at 500 chars.

**Defaults on first INSERT** (when fields omitted):
- `payment_suffix = 3`
- `wa_send_on_pendaftaran = true`
- `wa_send_on_pembayaran_confirmed = true`

**Audit events:** `konfigurasi.created` (INSERT) and `konfigurasi.updated`
(UPDATE, with before/after diff that lists only the changed fields).
Idempotent PUTs (no field changed) skip both the sheet write and the audit
entry.

### New repo helpers (extends Milestone B file)

`src/lib/qurban/konfigurasi-repo.ts` now exports:
- `findKonfigurasiRecord(edisiId)` — returns `{ rowIndex, konfigurasi }`
  for upsert locality.
- `updateKonfigurasiAt(rowIndex, k)` — in-place row update.

Existing helpers (`findKonfigurasiByEdisiId`, `hasKonfigurasi`,
`createKonfigurasi`, `konfigurasiToRow`) keep their Milestone B
signatures — no breaking change.

### Konfigurasi tab UI

`src/components/qurban/KonfigurasiTab.tsx` — client component mounted from
the edisi detail page when `?tab=konfigurasi` is active.

Sections (matches §4 of the milestone prompt):
1. **Biaya Operasional Per Hewan** — `CurrencyInput` for sapi + kambing
   (reuses the existing Rupiah input with id-ID thousand separators).
2. **Target Distribusi** — bungkus total + berat target + mulai/selesai dates.
3. **Pembayaran** — `payment_suffix` numeric (0–9) with the helper text
   verbatim from the prompt.
4. **Notifikasi WhatsApp** — two checkboxes, both default ON.
5. **Catatan** — optional textarea (500-char cap).

UX details:
- On mount, fetches K1 with the edisi id from the parent page; renders
  defaults when `data: null`.
- Server response after save (PUT K2) is fed back into the form so the
  user sees the persisted values immediately without a separate refetch.
- Save button hidden entirely when `canEdit` is false; whole form goes
  read-only via disabled inputs plus an amber lock-hint banner.
- Local validation mirrors server rules so the user gets immediate
  feedback for obviously invalid inputs (negative numbers,
  `payment_suffix` out of 0–9, distribusi date order). Server still
  re-validates as the source of truth.

### Files added / modified

**New:**
- `src/app/api/qurban/konfigurasi/route.ts` — K1 + K2
- `src/components/qurban/KonfigurasiTab.tsx`

**Modified:**
- `src/lib/qurban/konfigurasi-repo.ts` — added record finder + updater
- `src/app/(dashboard)/qurban/edisi/[id]/page.tsx` — replaced placeholder
  with `<KonfigurasiTab />`
- `docs/API_REFERENCE.md` — added "Qurban Konfigurasi Endpoints" section
- `HANDOFF_SPRINT_F02.md` — this section

### Verification (build / CI)

After `npm ci`:
- `npm run type-check` → ✅ clean
- `npm run lint` → ✅ clean
- `npm run build` → ✅ `Compiled successfully in 26.6s`. Route
  `/api/qurban/konfigurasi` listed as `ƒ` (dynamic).

### Post-deploy hotfix — K2 UPDATE path

The first preview verification exposed a regression in K2 UPDATE: every
attempt to PATCH an existing konfigurasi returned `500 INTERNAL_ERROR`
with the generic message "Gagal menyimpan konfigurasi". K2 INSERT was
fine; K1 read was fine; only UPDATE failed.

**Root cause:** `sheetsService.updateRow(sheetName, …)` in
`src/lib/google-sheets.ts` looks up `SHEET_HEADERS[sheetName]` to compute
the A1 range. The three Qurban sheets (`qurban_edisi`,
`qurban_konfigurasi_edisi`, `qurban_panitia`) had never been registered
in `SHEET_HEADERS`, so the call throws `Unknown sheet:
qurban_konfigurasi_edisi` (visible in the Vercel function logs).
`appendRow` doesn't share this guard because it writes to a literal
`!A:A` range, so INSERT-only flows (E2 create, K2 first-time INSERT)
worked and masked the gap.

Same bug latent in Milestone B endpoints (E4 PATCH edisi, E5 activate,
E6 close) — they invoke `updateRow` on `qurban_edisi`. None had been
exercised end-to-end yet (E5 always tripped the panitia preflight), so
the failure surfaced first via K2.

**Fix:**
- `src/lib/constants.ts` — added `SHEET_HEADERS` entries for
  `qurban_edisi` (12 cols), `qurban_konfigurasi_edisi` (15 cols), and
  `qurban_panitia` (7 cols). Comment points to `lib/qurban/sheets.ts`
  and the per-repo row mappers as the authoritative sources. The
  literals only need to match the column **count** for `updateRow`'s
  range computation, but I kept the names in sync for documentation.
- `src/app/api/qurban/konfigurasi/route.ts` — K2 PUT catch handler now
  surfaces `err.message` in the response (`"Gagal menyimpan
  konfigurasi: <reason>"`) instead of swallowing it behind a generic
  string. The endpoint is auth-gated; leaking the message string is
  acceptable and dramatically shortens debugging.

`KonfigurasiTab.tsx` already prefers `json.error.message` over the
generic fallback, so no client change was needed — the UI immediately
benefits from the richer backend message.

### Verification (Hopy, preview deploy)

Manual checks for Milestone C (from prompt §5):
- [ ] Edisi `1448H` detail → tab Konfigurasi shows the form (not placeholder).
- [ ] Fill BOP Sapi 300000, Kambing 100000, target bungkus 500, berat 500,
      distribusi 2027-04-20 → 2027-04-22, payment_suffix 3, both WA flags
      checked → Simpan → toast success.
- [ ] Reload tab → values persist.
- [ ] Staging `qurban_konfigurasi_edisi` sheet: one row with the matching
      `edisi_id` and a `KFG-…` id.
- [ ] Change a value → Simpan again → still one row in the sheet (UPDATE).
- [ ] Detail tab → `Aktifkan` → preflight message now flips from
      "Konfigurasi belum diisi" to "Belum ada panitia aktif" (proves the
      konfigurasi check is satisfied). Full activation lands in Milestone D.
- [ ] `tanggal_distribusi_mulai > selesai` → blocked with a clear message
      (client check, plus server returns `422 VALIDATION_FAILED`).

---

## Milestone D — What Shipped

P1/P2/P3 panitia endpoints + a candidates helper + the Panitia tab
(previously a placeholder) inside the edisi detail page. Completes the
F02 capstone chain: edisi → konfigurasi → panitia → activation.

### New endpoints

| # | Method | Path | Notes |
|---|---|---|---|
| P1 | GET | `/api/qurban/panitia?edisi_id=...&include_inactive=false` | All authenticated roles. Active-only by default. Rows enriched with `anggota_nama`, `anggota_peran`, `assigned_by_nama`. PD/DS on non-AKTIF → `403 FORBIDDEN_EDISI`. |
| P2 | POST | `/api/qurban/panitia?edisi_id=...` | SA/AQ only. Validates anggota existence + active + allowed `peran`; dedupes against existing active (edisi, anggota). |
| P3 | DELETE | `/api/qurban/panitia/[id]` | SA/AQ only. Soft-remove (`is_active=false`); idempotent no-op when already inactive. |
| —  | GET | `/api/qurban/panitia/candidates?edisi_id=...` | SA/AQ helper for the dropdown — anggota active + peran allowed + not already on the edisi. |

The candidates endpoint is a small scoped helper, not part of the P1–P3
contract. It exists because `/api/pengaturan/anggota` is SA-only via
`STRICT_PATH_RULES` (F01 design), so ADMIN_QURBAN cannot use it to
populate the panitia dropdown. The helper returns only the three fields
the dropdown actually renders.

### Validation rules (P2)

- Edisi must exist; `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.
- Anggota must exist AND be `is_active=true` → otherwise `422
  VALIDATION_FAILED`.
- `anggota.peran` whitelist: `SUPER_ADMIN`, `ADMIN_QURBAN`, `PENDAFTARAN`,
  `DISTRIBUSI`. `BENDAHARA` is rejected with the new
  `BUSINESS_INVALID_PERAN_FOR_PANITIA` error code (422). Rationale: SKM
  treasury role doesn't operate Qurban; it can still read the module via
  the navigation eye icon but should not appear in panitia composition.
- Dedupe via `findActivePanitiaByEdisiAndAnggota`: existing active row →
  `409 DUPLICATE_PANITIA` (`details.existing_panitia_id`). Inactive rows
  do NOT block — re-assigning a previously removed anggota creates a new
  `PNT-…` row with `is_active=true`, leaving the old removed row intact
  (audit trail preserved).

### Soft-remove flow (P3)

Confirmed to follow the same `sheetsService.updateRow` pattern as
`updateKonfigurasiAt` / `updateEdisiAt` (the path fixed in the
post-Milestone-C hotfix). `findPanitiaRecordById` returns
`{ rowIndex: i + 2, panitia }`; `updatePanitiaAt(rowIndex, { ...,
is_active: false })` writes the full 7-cell row back to the same sheet
range. Idempotent no-op skips both the sheet write and the audit log.

### New repo helpers (extends Milestone B file)

`src/lib/qurban/panitia-repo.ts` now exports:
- `findPanitiaRecordById(id)` — single-row lookup with sheet rowIndex.
- `findActivePanitiaByEdisiAndAnggota(edisiId, anggotaId)` — dedupe.
- `updatePanitiaAt(rowIndex, p)` — in-place row update (for soft-remove).

Existing Milestone B helpers (`listPanitia*By*`, `countActive…`,
`createPanitia`, `panitiaToRow`) are unchanged.

### Panitia tab UI

`src/components/qurban/PanitiaTab.tsx`:
- Loads `/api/qurban/panitia?edisi_id=...` (active panitia) + (when
  `canEdit`) `/api/qurban/panitia/candidates?edisi_id=...` in parallel.
- Table columns: Nama · Peran (badge via `peranBadgeClass`/`peranLabel`) ·
  Ditugaskan (locale date) · Oleh (assigned_by nama) · Aksi (Hapus).
- "Tambah Panitia" section: dropdown (filtered candidates) + textarea
  notes + Assign button. Hidden entirely when `canEdit=false`.
- Hapus uses the existing `ConfirmDialog` (danger variant) with copy that
  reminds the user the row is soft-removed (not deleted).
- Empty state: "Belum ada panitia. Tambahkan minimal 1 untuk bisa
  Aktifkan edisi." — calls out the link to the activation pre-flight.
- Per-role lock: BD/PD/DS never see Hapus/Add controls; the table still
  renders. SELESAI status shows an amber lock banner.

### Files added / modified

**New:**
- `src/app/api/qurban/panitia/route.ts` — P1 + P2
- `src/app/api/qurban/panitia/[id]/route.ts` — P3
- `src/app/api/qurban/panitia/candidates/route.ts` — dropdown helper
- `src/components/qurban/PanitiaTab.tsx`

**Modified:**
- `src/lib/qurban/panitia-repo.ts` — added record finder, dedup helper,
  in-place updater
- `src/lib/api/errors.ts` — `+BUSINESS_INVALID_PERAN_FOR_PANITIA`,
  `+DUPLICATE_PANITIA`
- `src/app/(dashboard)/qurban/edisi/[id]/page.tsx` — replaced placeholder
  with `<PanitiaTab />`
- `docs/API_REFERENCE.md` — added "Qurban Panitia Endpoints" section
- `HANDOFF_SPRINT_F02.md` — this section

### Verification (build / CI)

After `npm ci`:
- `npm run type-check` → ✅ clean
- `npm run lint` → ✅ clean
- `npm run build` → ✅ `Compiled successfully in 39.7s`. New routes:
  `/api/qurban/panitia`, `/api/qurban/panitia/[id]`,
  `/api/qurban/panitia/candidates`.

### Verification (Hopy, preview deploy)

Manual checks for Milestone D (from prompt §6):
- [ ] Edisi `1448H` detail → tab Panitia shows table + add section (not placeholder); empty state visible.
- [ ] Dropdown excludes BENDAHARA (Rivendra); only SA/AQ/PD/DS visible.
- [ ] Assign Ketua DKM (ADMIN_QURBAN) → row appears with nama/peran/tanggal/oleh.
- [ ] Sheet `qurban_panitia`: one `PNT-…` row, `is_active=TRUE`, `assigned_by` = Hopy's id.
- [ ] Hapus → table empties; sheet row remains with `is_active=FALSE`.
- [ ] Re-assign Ketua DKM → new `PNT-…` row; old row still `is_active=FALSE`.
- [ ] **Capstone — activate edisi:** with ≥1 active panitia + konfigurasi
      present + no other AKTIF edisi → Detail tab → Aktifkan → confirm
      → preflight **passes**; status flips `DRAFT → AKTIF`. Verify:
      badge becomes AKTIF, `qurban_edisi.status` = AKTIF, `audit_log`
      has `edisi.activated`.
- [ ] EditionSwitcher strip now shows `1448H` + AKTIF (no longer "Edisi
      tidak tersedia").
- [ ] Audit log entries present: `panitia.assigned`, `panitia.removed`,
      `edisi.activated`.

### Post-deploy hotfix — `/qurban` dashboard 500 + stuck EditionSwitcher

Capstone activation exposed a Next 16 constraint that had been dormant
since Milestone A. `getEdisiContext` was calling `cookies().set()` from
a Server Component (the `/qurban` layout + page), which Next 16 forbids
("Cookies can only be modified in a Server Action or Route Handler").

Before the capstone, the resolver always returned `cookieAction: null`
(no edisi to default to, no cookie to clear) so the write block never
fired. Once `1448H` became AKTIF, the resolver started returning
`cookieAction: { type: 'set', value: '<aktif-id>' }`, and every
`/qurban*` Server Component render started throwing. The dashboard page
crashed with HTTP 500; on adjacent routes the exception surfaced as
`ctx.edisi === null`, so the EditionSwitcher fell back to the "Edisi
tidak tersedia" empty-state copy.

**Fix:**
- `src/lib/qurban/edisi-context.ts` — `getEdisiContext` is now strictly
  read-only. The pure resolver still computes a `cookieAction` field on
  its return value, but the Server Component caller no longer acts on
  it. Comment in the file explains the Next 16 constraint.
- `src/middleware.ts` — sticky-cookie behavior moved to the Edge
  middleware. When a `/qurban*` page request carries `?edisi=EDS-…`
  (regex-validated), the middleware writes `Set-Cookie:
  qurban_edisi=…` on the outbound response. No Sheet I/O, no role
  validation here — the Server Component resolver still re-validates the
  cookie against role + status rules on every render. This preserves
  the original Milestone A intent ("EditionSwitcher click → URL push →
  cookie persists") without violating the Server Component contract.

Other `/qurban*` Server Components scanned for similar latent
`cookies().set()` calls — none found. The only call site was the one
fixed.

### Open items for Milestone E

- Acceptance test script for the end-to-end F02 flow.
- Polish across the module surfaces.
- Final docs sweep (`PROJECT_BRIEF.md`, `DATABASE_SCHEMA.md`).

---

## Milestone E — What Shipped (closing)

Finishing pass. No new features — unit-test coverage for the F02
invariants, UI polish, acceptance checklist, and final documentation.

### Unit tests + CI wiring

Test runner: the existing **`node:test` via `tsx`** (same as F01 — no
new dependency). Three new test files under `src/lib/qurban/__tests__/`,
59 tests total alongside F01's existing suite.

| Test file | Covers |
|---|---|
| `edisi-state-machine.test.ts` | Transisi sah (`DRAFT→AKTIF`, `AKTIF→SELESAI`); transisi ilegal ditolak dengan `BUSINESS_INVALID_STATE_TRANSITION`; `getEditableFields` per status; `assertFieldEditable` throws `BUSINESS_EDISI_LOCKED` dengan kode + status HTTP yang benar. |
| `validators.test.ts` | Whitelist peran panitia (`BENDAHARA` ditolak; 4 peran lain lolos); range tanggal distribusi (lexicographic ISO compare, partial-save tolerance); `payment_suffix` 0–9 integer. |
| `id-generator.test.ts` | `getTodayWIB()` format `YYYYMMDD`; perilaku batas (UTC midnight, 16:59 UTC, 17:00 UTC roll-over ke hari WIB berikutnya, year boundary). Helper murni — generator wrapper-nya butuh I/O dan di-cover oleh acceptance manual. |

Pure-validator helpers diekstrak ke `src/lib/qurban/validators.ts` lalu
diimport oleh route handler `panitia/route.ts`, `panitia/candidates/route.ts`,
dan `konfigurasi/route.ts`. Perilaku route tidak berubah — hanya
dideduplikasi & dibuat testable.

**Scripts:**
- `npm run test` — umbrella, jalankan semua test (`lib/api` + `lib/qurban`).
- `npm run test:lib-api`, `npm run test:lib-qurban` — terpisah, dipertahankan untuk debugging fokus.

Test file dilist eksplisit di script (bukan glob). Awalnya pakai pola
`"<dir>/*.test.ts"`, tapi pola di dalam kuotasi diserahkan literal ke
`node --test` dan gagal di runner CI (lihat post-E hotfix). Listing
eksplisit deterministic + lintas-environment; saat menambah file test
baru, tambahkan path-nya ke script `test` (dan ke `test:lib-*` yang
sesuai).

**CI:** step `Unit test` ditambahkan ke `.github/workflows/ci.yml`
antara `Type check` dan `Build`. Setiap PR ke `main` sekarang menjalankan
`npm test` otomatis. Action bumped ke `checkout@v5` + `setup-node@v5`
dengan Node 22 (aligned dengan Node 24 mandatory upcoming).

### UI polish (no behavior change)

- **Dashboard copy** — kartu placeholder Peserta/Hewan/Distribusi
  diubah dari "Tersedia setelah edisi dibuat" ke "Tersedia di sprint
  berikutnya" (lebih akurat — itu fitur F03/F04, bukan menunggu edisi).
- **Loading skeleton** — komponen baru
  `src/components/qurban/TabSkeleton.tsx` mengekspor `FormSkeleton` dan
  `TableSkeleton`. Tab Konfigurasi sekarang render `FormSkeleton` saat
  fetch awal; tab Panitia render `TableSkeleton`. Mengganti `<Loading />`
  generic agar layout tidak meloncat saat data tiba.
- **Tabel Panitia responsive** — mengikuti pola F01 anggota
  (`F-polish-9` / Decision #19): `lg+` → tabel 5 kolom, `<lg` → card
  stack dengan badge peran + grid dl untuk meta. iPad portrait + HP
  mendapat layout card yang lebih ergonomis.
- **Surface real errors** — pola hotfix C (`err.message` ditampilkan di
  catch generic) diterapkan ke 7 catch tambahan: E1 GET list, E2 POST
  create, E3 GET detail, E4 PATCH, E5 POST activate, E6 POST close,
  K1 GET. Client `toast(json?.error?.message || ...)` di
  `EdisiForm/EdisiDetail/KonfigurasiTab/PanitiaTab` sudah memprioritaskan
  message backend, jadi UI otomatis ikut menampilkan pesan yang lebih
  informatif.

### Acceptance checklist (manual)

`docs/ACCEPTANCE_F02.md` — 6 skenario step-by-step yang bisa dijalankan
siapa pun terhadap deployment dengan akses session SUPER_ADMIN. Scenario
1 (happy path lifecycle), 2 (pre-flight negatif), 3 (validasi),
4 (force-close), 5 (lock SELESAI), 6 (role access matrix). Menggantikan
rencana awal skrip `curl` (tidak feasible — endpoint auth-gated Google
SSO).

### Final docs

- `docs/PROJECT_BRIEF.md` — section "Sprint F02 — Qurban Edisi
  Management" ditambahkan; tabel Rencana Sprint diperbarui (F02 = Done,
  F03/F04 planned).
- `docs/API_REFERENCE.md` — sudah lengkap dari milestone B/C/D. Pass
  final tidak menambah perubahan.
- `CLAUDE.md` — Current Sprint diupdate ke F02 Done.
- `HANDOFF_SPRINT_F02.md` — ini.

### Verification (build / CI)

After `npm ci`:
- `npm run type-check` → ✅ clean
- `npm run lint` → ✅ clean (0 warnings)
- `npm test` → ✅ **59/59 pass**
- `npm run build` → ✅ `Compiled successfully`

---

## Summary deliverables per milestone

| Milestone | Output | Highlight commit |
|---|---|---|
| A | 3 sheet baru (migrate_F02), middleware activation, EditionSwitcher, skeleton `/qurban` | `310dd0e` |
| B | Endpoint E1–E6 (edisi CRUD + state machine), 4 halaman UI edisi, sidebar QURBAN, restore `QURBAN_MODULE_ENABLED` fail-open | `7e951ec` |
| C | Endpoint K1–K2 (konfigurasi upsert), tab Konfigurasi UI | `c429bd4` + hotfix `1bb2f11` |
| D | Endpoint P1–P3 (panitia assign/remove), helper `/api/qurban/panitia/candidates`, tab Panitia UI, **capstone aktivasi end-to-end** | `3ffe953` + hotfix `c7f57af` |
| E | Unit tests + CI, polish UI, `docs/ACCEPTANCE_F02.md`, dokumentasi final | _this commit_ |

## Hotfix log — lessons learned

Dua hotfix mid-sprint, keduanya pola yang sama: **jalur kode yang belum
pernah dieksekusi sebelumnya menyimpan bug**.

### Hotfix C1 — `SHEET_HEADERS` missing for Qurban sheets

**Symptom:** K2 PUT (update existing konfigurasi) gagal dengan
`500 Internal Error`; K2 INSERT bekerja.

**Akar masalah:** `sheetsService.updateRow(sheetName, …)` di
`src/lib/google-sheets.ts` melakukan `SHEET_HEADERS[sheetName]` lookup
untuk menghitung A1 range. Tiga sheet Qurban tidak terdaftar di
`SHEET_HEADERS` (`src/lib/constants.ts`), jadi setiap UPDATE Qurban
throw `Unknown sheet: …`. `appendRow` lolos karena pakai literal range
`!A:A` yang tidak konsultasi `SHEET_HEADERS`. Jalur INSERT-only
(`createEdisi`, `createKonfigurasi`, `createPanitia`) lolos sampai PUT
pertama.

**Fix:** register 3 sheet Qurban di `SHEET_HEADERS` dengan jumlah kolom
yang benar (12/15/7). Surface `err.message` di response K2 catch
(generic "Gagal menyimpan" sebelumnya menyembunyikan akar masalah).

### Hotfix C2 — `cookies().set()` di Server Component

**Symptom:** `/qurban` dashboard HTTP 500 setelah edisi pertama
diaktifkan; EditionSwitcher stuck di "Edisi tidak tersedia".

**Akar masalah:** `getEdisiContext` di `lib/qurban/edisi-context.ts`
memanggil `cookieStore.set()` saat resolver mengembalikan
`cookieAction: { type: 'set' }`. Next.js 15/16 melarang mutasi cookie
dari Server Component (`Cookies can only be modified in a Server Action
or Route Handler`). Cabang `set` hanya fire saat resolver mencapai path
3 "Default to AKTIF" — kondisi yang baru pertama kali terjadi setelah
capstone Milestone D mengaktifkan edisi pertama.

**Fix:** `getEdisiContext` jadi strictly read-only. Sticky-cookie
behavior dipindah ke middleware (edge-safe, regex-validated) — saat
URL `/qurban*` membawa `?edisi=EDS-…` query yang valid format, middleware
set cookie pada response.

**Pelajaran umum:** kapan saja kita menulis cabang yang bergantung pada
state baru (mis. "AKTIF exists", "row exists"), pastikan cabang itu
diuji ASAP — tidak harus dengan end-to-end test, tapi paling tidak
walkthrough manual atau unit-test pure logic. Bug dorman seperti ini
muncul bersamaan dengan first-time-state-change.

### Hotfix E1 — Glob test files tidak ter-resolve di CI

**Symptom:** GitHub Actions step "Unit test" gagal di commit pertama
Milestone E (`b13aa3b`) dengan
`Could not find '/home/runner/work/skm/skm/src/lib/api/__tests__/*.test.ts'`.
`npm test` lulus 59/59 di lokal. Vercel build OK.

**Akar masalah:** script `test` memakai `npx tsx --test "<dir>/*.test.ts"`.
Karena glob di dalam kuotasi, shell tidak mengekspansinya — pola sampai
ke `node --test` secara literal. Lokal kebetulan punya ekspansi yang
berbeda (atau cached resolve) sehingga test jalan; runner CI tidak
punya, dan node test runner tidak menerima glob pattern langsung di
`--test` arg. Hasilnya: tidak ada file yang ter-resolve, step gagal.
Pola "first-time-execution-exposes-bug" lagi — step ini baru pertama
kali dijalankan di CI saat Milestone E menambahkannya.

**Fix:**
- `package.json` — script `test` / `test:lib-api` / `test:lib-qurban`
  diubah dari glob menjadi **list path eksplisit per file test**.
  Deterministic, lintas-environment, tidak bergantung pada ekspansi
  shell atau perilaku node version. Maintenance: saat menambah file
  test baru, tambahkan path ke script terkait.
- `.github/workflows/ci.yml` — bump `actions/checkout@v5` +
  `actions/setup-node@v5`, Node 22 (mengatasi deprecation warning
  Node 20 + alignment dengan Node 24 mandatory).

Alternatif yang dipertimbangkan: argumen direktori (`tsx --test <dir>/`)
— tapi `tsx --test` mencoba resolve direktori sebagai single module
entry (`index.*`), bukan auto-discover seperti `node --test <dir>`.
Tidak ter-discover → exit 0 dengan 0 test (false green). Listing
eksplisit lebih aman.

**Pelajaran umum:** kalau script lokal pakai shell glob, jangan
mengandalkannya bekerja di CI. Pilih cara invokasi yang deterministic
(list eksplisit, atau wrapper script yang glob via fs/Node API).

## Keterbatasan & yang ditunda ke F03+

- **Master hewan + master muqorib** — belum ada. Pre-flight E5 punya
  TODO `master_hewan ≥ 1` (F3) yang sekarang di-skip.
- **Peserta pendaftaran + pembayaran + distribusi mapping** — ditunda ke
  F04+. Pre-flight E6 close punya TODO untuk blok peserta TERDAFTAR
  belum lunas (`BUSINESS_EDISI_TUTUP_BLOCKED`).
- **Sidebar `/qurban`** — hanya 2 item (Dashboard, Edisi). Item lain
  (Peserta, Hewan, Pembayaran, Muqorib, Distribusi, Konfigurasi
  standalone, Panitia standalone, Laporan) menyusul saat halamannya ada
  di sprint berikutnya. Tidak menambahkan link dead.
- **Endpoint K/P standalone** — `Konfigurasi` dan `Panitia` tidak
  punya halaman level-atas (`/qurban/konfigurasi`, `/qurban/panitia`);
  hanya tab di dalam halaman detail edisi. Cukup untuk F02.
- **Laporan Qurban** — F04+ scope.
- **Auto-cleanup soft-removed panitia** — `is_active=false` rows tetap
  bertumpuk untuk jejak audit. Tidak ada GC; jumlah baris akan tumbuh
  per pergantian panitia, tapi volumenya kecil per edisi.

## Checklist pra-produksi (untuk Hopy, sebelum PR #83 di-merge)

Ini langkah operasional Hopy — **bukan tugas coding**. Setelah semua
centang, PR #83 aman di-merge ke `main`.

1. **Migrasi Sheet produksi.** Jalankan Apps Script `migrate_F02`
   dengan `F02_TARGET=PRODUCTION` agar 3 sheet Qurban (`qurban_edisi`,
   `qurban_konfigurasi_edisi`, `qurban_panitia`) dibuat di Sheet
   produksi (`GOOGLE_SHEETS_ID`). Verify: 3 tab baru muncul, headers
   terisi sesuai schema.
2. **Set environment variables di Vercel Production:**
   - `QURBAN_LEGACY_LOGIN_ENABLED=false` (F01 post-deploy gate, finally
     flipped per HANDOFF F01 §F-polish-6).
   - `QURBAN_BOOTSTRAP_ENABLED=false` (bootstrap path inert; sama).
   - `QURBAN_MODULE_ENABLED` — biarkan **unset** (fail-open default
     dari F02-B). Set ke `'false'` HANYA untuk rollback darurat.
3. **Smoke test di production** setelah deploy:
   - Login sebagai SUPER_ADMIN.
   - Buka `/qurban` — empty state ("Belum ada edisi") tampil tanpa
     error.
   - Buka `/qurban/edisi` — daftar kosong, tombol `+ Edisi Baru`
     tampil.
   - (Opsional) Buat edisi DRAFT untuk tahun mendatang sebagai test;
     jangan aktifkan kalau masjid tidak sedang menyelenggarakan
     Qurban.

Setelah ketiga langkah selesai dan smoke test lulus, F02 LIVE di
production. Lanjut: persiapan Sprint F03 (Master Muqorib + Master Hewan).

---

_This file evolves through F02. Each milestone appends to the change log and
TODO list._
