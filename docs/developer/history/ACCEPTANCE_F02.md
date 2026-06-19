# Acceptance Checklist — Sprint F02 (Qurban Edisi Management)

Manual end-to-end acceptance procedure. Runnable against any deployment
(preview or production) where the F02 schema migration (`migrate_F02`)
has been applied. Each scenario lists the steps and the expected
outcomes; tick the boxes as you complete them.

The original plan for a curl-driven script was dropped because every
endpoint in this module is auth-gated behind NextAuth/Google SSO —
acquiring a session non-interactively isn't practical. This manual
walkthrough takes ~20 minutes once the prerequisites are in place.

## Prerequisites

- Target Google Sheet has the 3 Qurban sheets present (`qurban_edisi`,
  `qurban_konfigurasi_edisi`, `qurban_panitia`). On a fresh deployment,
  run the `migrate_F02` Apps Script against the target Sheet first.
- At least one `SUPER_ADMIN` anggota account (the operator running this
  checklist).
- At least one `ADMIN_QURBAN` and one `BENDAHARA` anggota account
  available — needed for the panitia validation step. (Create via
  `/pengaturan/anggota` if missing.)
- A second anggota with role `PENDAFTARAN` or `DISTRIBUSI` if you want
  to exercise the panitia-role gating (optional).

## Scenario 1 — Happy path: edisi lifecycle end-to-end

**Goal:** demonstrate the full F02 chain from edisi creation through
activation and closure.

- [ ] As `SUPER_ADMIN`, open `/qurban/edisi`. Click `+ Edisi Baru`.
- [ ] Fill: tahun hijriah (e.g. `1448H`), tahun masehi (e.g. `2027`),
      tanggal Idul Adha (e.g. `2027-05-17`), pendaftaran buka/tutup
      (e.g. `2027-02-01` / `2027-04-30`). Submit.
- [ ] **Expected:** redirected to detail page, status badge `DRAFT`.
      `qurban_edisi` sheet has a new row, `id` = `EDS-YYYYMMDD-NNNN`,
      `status` = `DRAFT`, `created_by` = your anggota id.
- [ ] On the detail page, open the **Konfigurasi** tab. Fill BOP sapi
      (e.g. `300000`), BOP kambing (`100000`), target bungkus (`500`),
      berat target (`500`), distribusi mulai/selesai (e.g. `2027-04-20`
      / `2027-04-22`). Leave payment suffix at `3`; leave both WA flags
      checked. Save.
- [ ] **Expected:** toast `Konfigurasi tersimpan`. Tab re-renders with
      saved values. `qurban_konfigurasi_edisi` sheet has one new row,
      `id` = `KFG-…`, `edisi_id` = your edisi id, `created_by` = you.
- [ ] Open the **Panitia** tab. From the candidate dropdown, pick an
      `ADMIN_QURBAN` anggota. Click Assign.
- [ ] **Expected:** toast `Panitia berhasil ditugaskan`. Table shows
      one row with the assigned anggota's nama, peran badge,
      assignment date, and your nama under "Oleh".
- [ ] Back to **Detail** tab. Click `Aktifkan`. Confirm in the modal.
- [ ] **Expected:** toast `Edisi berhasil diaktifkan`. Status badge
      flips to `AKTIF`. `qurban_edisi.status` = `AKTIF`,
      `updated_at` bumped. `audit_log` has a new `edisi.activated`
      entry.
- [ ] Open `/qurban` dashboard. **Expected:** the EditionSwitcher strip
      shows `<tahun_hijriah>` + `AKTIF`. The dashboard's main card lists
      the edisi info. No 500 error.
- [ ] Back on detail, click `Tutup Edisi`. Confirm.
- [ ] **Expected:** status badge flips to `SELESAI`.
      `qurban_edisi.status` = `SELESAI`. Edit / Aktifkan / Tutup
      buttons disappear from the Detail tab. `audit_log` has an
      `edisi.closed` entry.

## Scenario 2 — Pre-flight blocks activation when prerequisites are missing

**Goal:** prove activation gating works in both directions.

- [ ] Create a fresh DRAFT edisi (different `tahun_hijriah` from
      Scenario 1).
- [ ] Without filling Konfigurasi or Panitia, click `Aktifkan`.
- [ ] **Expected:** toast surfaces the message
      `Konfigurasi edisi belum diisi.` Sheet unchanged.
- [ ] Fill Konfigurasi (any valid values). Click `Aktifkan` again.
- [ ] **Expected:** toast surfaces `Minimal 1 panitia aktif diperlukan
      sebelum aktivasi.` Sheet unchanged.
- [ ] Assign at least one valid panitia, then activate.
- [ ] **Expected:** activation succeeds.

## Scenario 3 — Validation rules

**Konfigurasi date order:**
- [ ] On the Konfigurasi tab, set distribusi mulai later than selesai
      (e.g. `2027-04-22` and `2027-04-20`). Save.
- [ ] **Expected:** save is rejected with a message about the date
      order; sheet unchanged.

**Panitia role whitelist:**
- [ ] Open the Panitia tab. Verify the candidate dropdown does NOT
      include `BENDAHARA` anggota. If it does, the rule has regressed.
- [ ] (Optional, requires API access) `POST /api/qurban/panitia?edisi_id=…`
      with the body `{ "anggota_id": "<BENDAHARA id>" }`.
- [ ] **Expected:** `422 BUSINESS_INVALID_PERAN_FOR_PANITIA`.

**Panitia dedupe:**
- [ ] Assign anggota X as panitia. Try to assign anggota X again.
- [ ] **Expected:** the dropdown no longer offers anggota X. If you
      bypass the UI and POST directly, the API returns
      `409 DUPLICATE_PANITIA` with `details.existing_panitia_id`.

## Scenario 4 — Force-close existing AKTIF on activation

**Goal:** prove the single-AKTIF rule + the override path both work.

- [ ] With one edisi already in `AKTIF` from Scenario 1 (re-create one
      if you closed it), create a second DRAFT edisi (`1449H`, 2028
      dates). Fill its Konfigurasi and assign one Panitia.
- [ ] Click `Aktifkan` on the new edisi (first try, no force).
- [ ] **Expected:** the dialog escalates — instead of a generic error,
      a `danger`-variant confirm asks whether to close the existing
      `AKTIF` edisi automatically.
- [ ] Cancel. The first edisi remains AKTIF; the second remains DRAFT.
- [ ] Click `Aktifkan` again, this time confirm the force-close prompt.
- [ ] **Expected:** the new edisi is AKTIF; the previous AKTIF edisi
      flipped to `SELESAI`. `audit_log` has both an `edisi.closed`
      entry (notes: "auto-closed by activation of …") and a fresh
      `edisi.activated` entry.

## Scenario 5 — Lock when edisi status is SELESAI

- [ ] Open a `SELESAI` edisi (from Scenario 1's closure step).
- [ ] **Expected:** Detail tab has no Edit/Aktifkan/Tutup buttons.
      Konfigurasi tab is read-only (amber banner, Save button hidden).
      Panitia tab hides the "Tambah Panitia" section and removes the
      Hapus buttons.

## Scenario 6 — Role access matrix

- [ ] Log in as a `BENDAHARA` anggota.
- [ ] **Expected:** sidebar still shows the QURBAN section. The Edisi
      item is marked read-only (eye icon). Opening the detail or the
      konfigurasi/panitia tabs renders content but hides every write
      control (no "+ Edisi Baru", no Edit/Aktifkan/Tutup, no Hapus, no
      Tambah Panitia form).

- [ ] Log in as a `PENDAFTARAN` anggota.
- [ ] **Expected:** lands on `/qurban`. The Edisi sidebar item shows
      the same read-only indicator. The Edisi list only shows the
      AKTIF edisi (not DRAFT/SELESAI).
- [ ] Try to deep-link a non-AKTIF edisi by URL
      (e.g. `/qurban/edisi/<SELESAI-id>`).
- [ ] **Expected:** server returns 403 / page redirects (per F02
      `FORBIDDEN_EDISI` rule).

- [ ] Log in as a `DISTRIBUSI` anggota.
- [ ] **Expected:** lands on `/qurban`. The Edisi sidebar item is
      grayed out with a lock icon — clicking has no effect.

## Final sanity

- [ ] `/qurban` dashboard renders without error in all five roles.
- [ ] `EditionSwitcher` strip stays consistent across reloads (no
      "Edisi tidak tersedia" while an AKTIF edisi exists).
- [ ] `audit_log` sheet contains the expected `edisi.*`,
      `konfigurasi.*`, and `panitia.*` events from the scenarios above.
