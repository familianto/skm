# HANDOFF Sprint F03 — Master Muqorib + Master Hewan

**Branch:** `qurban/f03-master-qurban` (PR #85)
**Status:** All milestones (A–E) ✅ done. F03 **code-complete** — pending the
pre-production checklist (bottom of this file) before PR #85 merges to `main`.
**Spec source:** session prompts `Sprint F03 · Milestone A/B/C/D/E`.

---

## Sprint Goal

Build the master-data layer of Modul Qurban on top of F02 (edisi management):

- **Muqorib** — master jamaah qurban, **lintas-edisi** (one record reused
  across editions; no `edisi_id`).
- **Master Hewan** — katalog tipe hewan qurban (`jenis` × `kelas`),
  **per-edisi**.

**Scope = Opsi B:** master tipe hewan (catalog) only. Physical per-animal
inventory (`qurban_daftar_hewan`) and the Pemetaan page are deliberately
deferred to **F05**.

## Milestones

| ID | Title | Status | Commit |
|---|---|---|---|
| A | Infrastructure — schema migration, repos, validators, id-generator (`MQR-`/`MHW-`) | ✅ done | `f194140` |
| B | Muqorib CRUD endpoints (M1–M6) + repo | ✅ done | `866eff4` |
| C | Muqorib smart-lookup (M7) + Master Hewan endpoints (MH1–MH5) + repo | ✅ done | `435c576` |
| D | UI Muqorib (list, baru, detail, edit) + sidebar | ✅ done | `161b9ee` |
| E | UI Master Hewan + dokumentasi + finalisasi PR | ✅ done | _this commit_ |

---

## New sheets (run by operator via `migrate_F03` Apps Script)

Two sheets added to the main SKM spreadsheet (`GOOGLE_SHEETS_ID`, same workbook
as anggota / transaksi / audit_log — NOT the legacy `GOOGLE_SHEETS_QURBAN_ID`
used by the publik TV display path). Row 1 = header, data from row 2.

### `qurban_muqorib` (11 cols, lintas-edisi)

`id` (`MQR-YYYYMMDD-NNNN`) · `nama_lengkap` · `alamat` · `rt` (`001`–`006` |
`Lainnya`) · `no_hp` (ternormalisasi `628…`) · `is_active` (`TRUE`/`FALSE`) ·
`data_induk_ref_1447h` · `notes` · `created_at` · `created_by` · `updated_at`.

### `qurban_master_hewan` (11 cols, per-edisi)

`id` (`MHW-YYYYMMDD-NNNN`) · `edisi_id` (FK `qurban_edisi.id`) · `jenis`
(`SAPI`|`KAMBING`) · `kelas` (`A`–`D`) · `kapasitas_slot` (int > 0) ·
`harga_beli` (≥ 0) · `harga_bawa_sendiri` (≥ 0) · `is_active` (`TRUE`/`FALSE`) ·
`created_at` · `updated_at` · `created_by`.

Natural key `(edisi_id, jenis, kelas)` is unique.

---

## Endpoints (full contract in `docs/API_REFERENCE.md`)

**Muqorib (lintas-edisi):**

| # | Method | Path | Peran |
|---|---|---|---|
| M1 | GET | `/api/qurban/muqorib` | SA, BD, AQ, PD |
| M2 | POST | `/api/qurban/muqorib` | SA, AQ, PD |
| M3 | GET | `/api/qurban/muqorib/[id]` | SA, BD, AQ, PD |
| M4 | PATCH | `/api/qurban/muqorib/[id]` | SA, AQ, PD |
| M5 | POST | `/api/qurban/muqorib/[id]/deactivate` | SA, AQ |
| M6 | POST | `/api/qurban/muqorib/[id]/reactivate` | SA, AQ |
| M7 | GET | `/api/qurban/muqorib/lookup` | SA, AQ, PD |

**Master Hewan (per-edisi, `?edisi_id=` wajib):**

| # | Method | Path | Peran |
|---|---|---|---|
| MH1 | GET | `/api/qurban/master-hewan` | semua role† |
| MH2 | POST | `/api/qurban/master-hewan` | SA, AQ |
| MH3 | PATCH | `/api/qurban/master-hewan/[id]` | SA, AQ |
| MH4 | POST | `/api/qurban/master-hewan/[id]/deactivate` | SA, AQ |
| MH5 | POST | `/api/qurban/master-hewan/bulk-upsert` | SA, AQ |

`†` PD/DS hanya MH1 untuk edisi `AKTIF` (non-AKTIF → `403 FORBIDDEN_EDISI`).

---

## UI (Milestone D + E)

**Muqorib (Milestone D)** — mirror pola CRUD Anggota F01:
- `/qurban/muqorib` (list: search + filter status + sort + paginasi → M1)
- `/qurban/muqorib/baru` (M2), `/qurban/muqorib/[id]` (M3 + riwayat
  empty-state + deactivate/reactivate), `/qurban/muqorib/[id]/edit` (M4).

**Master Hewan (Milestone E)** — `/qurban/hewan`, per-edisi:
- Tab **Master Tipe** (fungsional): tabel/kartu responsif, **inline edit**
  kapasitas/harga (MH3), modal **Tambah Tipe** (MH2), **Nonaktifkan** (MH4),
  empty-state. `jenis`/`kelas` immutable.
- Tab **Daftar Inventory** (placeholder): empty-state menjelaskan inventory
  fisik hadir di F05 — struktur tab sudah benar agar tak perlu refactor.

**Sidebar:** entri "Muqorib" + "Hewan" di section QURBAN (SA/BD/AQ/PD).

---

## Key decisions

### D1 — Edisi-context as a Server-Component helper

Master Hewan page is **per-edisi**. The page `/qurban/hewan/page.tsx` is a
Server Component that resolves the selected edisi via
`getEdisiContext({ peran, queryEdisiId })` (resolution order `?edisi=` →
cookie `qurban_edisi` → AKTIF default), then passes `edisiId/edisiStatus/
edisiTahun` to the client `HewanTabs`. This reuses the exact F02 mechanism;
the EditionSwitcher strip in the shared `/qurban` layout is relevant here.
Muqorib pages, by contrast, ignore edisi entirely (lintas-edisi).

### D2 — Role-gating: Muqorib vs Master Hewan differ

| Action | Muqorib | Master Hewan |
|---|---|---|
| Read / page access | SA, BD, AQ, PD | SA, BD, AQ, PD |
| Create / Edit | SA, AQ, **PD** | SA, AQ |
| Deactivate (+ Muqorib reactivate) | SA, AQ | SA, AQ |

Page access is governed by `path-rules.ts`
(`/qurban/(peserta|muqorib|hewan|pemetaan|pembayaran)` → SA/BD/AQ/PD;
DISTRIBUSI has its own `/qurban/distribusi/*` group). The MH1 **API** stays
open to all authenticated roles (it doubles as a lookup), but page access ≠
API access — there is no conflict. The UI gates write elements via
`me.user.peran`, consistent with the server guards.

### D3 — `QURBAN_MODULE_ENABLED` kill-switch

The F02 fail-open module kill-switch remains in force; F03 pages live under
the same `/qurban` umbrella and inherit it. F03 did not change it.

### D4 — Master Hewan has no reactivate (by design)

MH4 deactivate is one-way; there is no MH reactivate counterpart (unlike
Muqorib M6). The UI shows write actions (Edit/Nonaktifkan) only on active
rows; inactive rows render with a "Nonaktif" badge and no actions.

### D5 — Reused, not reinvented

Reused F01/F02 primitives: `Modal`, `ConfirmDialog`, `CurrencyInput`
(thousand-separator), `Button`, `Card`, `useToast`, `useMe`, `formatRupiah`,
`TableSkeleton`, and the edisi-detail tab pattern (`useSearchParams` + tab
bar). No new UI library introduced. Validators/repos/id-generator from
Milestone A/C consumed as-is.

---

## Files (Milestone E)

**Added:**
- `src/app/(dashboard)/qurban/hewan/page.tsx` — server page, resolves edisi.
- `src/components/qurban/HewanTabs.tsx` — client tab container (`?tab=`).
- `src/components/qurban/MasterTipeTab.tsx` — Master Tipe tab (MH1/MH3/MH4).
- `src/components/qurban/MasterHewanCreateModal.tsx` — Tambah Tipe (MH2).
- `src/lib/qurban/master-hewan-display.ts` — role sets + status/jenis/kelas helpers.

**Modified:**
- `src/components/layout/sidebar.tsx` — entri "Hewan" di section QURBAN.
- `docs/API_REFERENCE.md` — section Muqorib (M1–M7) + Master Hewan (MH1–MH5).
- `docs/PROJECT_BRIEF.md` — kapabilitas F03 + 2 sheet baru + sprint status.
- `HANDOFF_SPRINT_F03.md` — dokumen ini.

(Milestone D files: `src/app/(dashboard)/qurban/muqorib/**`,
`src/components/qurban/MuqoribDeactivateModal.tsx`,
`MuqoribReactivateModal.tsx`, `src/lib/qurban/muqorib-display.ts`.)

---

## Verification (build / CI)

`npm run type-check`, `npm run lint`, `npm test` (tsx suite), and
`npm run build` all green locally. No backend endpoint, repo, or Google Sheet
was touched in Milestone D or E; no migration was run from the dev session.

---

## Pre-production checklist (operator-executed, manual)

> Execute in this exact order. These steps are the operator's, **not** the
> dev session's.

1. **Migrasi produksi DULUAN, sebelum merge.** Jalankan `migrate_F03.gs` di
   Apps Script dengan toggle `F03_TARGET = 'PRODUCTION'`. Skrip idempoten —
   membuat sheet `qurban_muqorib` & `qurban_master_hewan` di Sheet produksi
   `1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`.
2. Verifikasi di Sheet produksi: kedua tab ada, masing-masing 11 kolom dengan
   header benar (lihat layout kolom di atas).
3. **Baru** squash-merge PR #85 ke `main` via GitHub UI.
   > Alasan urutan: kalau merge dilakukan lebih dulu, kode produksi akan
   > mengakses sheet yang belum ada → halaman `/qurban/muqorib` &
   > `/qurban/hewan` error.
4. Smoke test produksi: buka `/qurban/muqorib` & `/qurban/hewan`, pastikan
   list tampil (empty-state OK).
5. Branch `qurban/f03-master-qurban` dipertahankan pasca-merge (untuk
   referensi).
