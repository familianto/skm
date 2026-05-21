# HANDOFF Sprint F02 — Qurban Edisi Management

**Branch:** `claude/qurban-edisi-setup-XghmL` (PR #83)
**Status:** Milestones A, B ✅ done. Milestone C ✅ done — awaiting preview verification.
**Spec source:** session prompts `Sprint F02 · Milestone A/B/C`.

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
| C  | Konfigurasi edisi (K1–K2) + tab Konfigurasi UI | ✅ done | `c429bd4` + hotfix |
| D  | Panitia management (P1–P3) + tab Panitia UI | ⏳ pending | — |
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

## Documentation updates parked for later milestones

- `docs/PROJECT_BRIEF.md` — updated at Milestone E once the module shape stabilises.
- `docs/DATABASE_SCHEMA.md` — needs the 3 new sheets documented; can land
  at any milestone B-E (sheets are stable since A).

---

_This file evolves through F02. Each milestone appends to the change log and
TODO list._
