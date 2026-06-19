# HANDOFF Sprint F5a — Inventaris Hewan Fisik

**Branch:** `qurban/f5a-inventory` (PR: `[F5a] Inventaris Hewan Fisik`, Draft)
**Status:** Milestone A–D ✅ done. **Code-complete** — pending the
pre-production checklist (bottom of this file) before the PR merges to `main`.
**Spec source:** session prompts `Sprint F5a · Milestone A/B/C/D`.

---

## Sprint Goal

Membangun lapisan **inventaris fisik per-ekor** di atas katalog tipe F03.
Tabel `qurban_daftar_hewan` = **1 baris = 1 ekor hewan nyata**, melengkapi
`qurban_master_hewan` (katalog `jenis`×`kelas`, F03). `jenis`, `kelas`, dan
`kapasitas_slot` didenormalisasi dari master tipe rujukan.

## Milestones

| ID | Title | Status | Commit |
|---|---|---|---|
| A | Fondasi — migrasi `qurban_daftar_hewan` (17 kolom) + tipe + konstanta + `generateDaftarHewanId()` (`HWN-`) | ✅ done | `6ccab74` |
| B | Repo `daftar-hewan-repo.ts` + endpoint H1–H7 + tests | ✅ done | `becd6e2` |
| C | UI CRUD — tab Daftar Inventory (list), `/baru`, `/[id]`, `/[id]/edit` | ✅ done | `4278d5b` |
| D | UI reorder/batch-status/cancel + dokumentasi + PR Draft | ✅ done | _this commit_ |

---

## New sheet (run by operator via `migrate_F5a` Apps Script)

Satu sheet ditambahkan ke spreadsheet SKM utama (`GOOGLE_SHEETS_ID`, sama
dengan anggota/transaksi/qurban_edisi). Row 1 = header, data dari row 2.

### `qurban_daftar_hewan` (17 kolom, per-edisi)

`id` (`HWN-YYYYMMDD-NNNN`) · `edisi_id` (FK `qurban_edisi.id`) ·
`master_hewan_id` (FK `qurban_master_hewan.id`) · `jenis` (`SAPI`|`KAMBING`) ·
`kelas` (`A`–`D`) · `nomor_urut` (int) · `kapasitas_slot` (int) ·
`tipe_pembelian` (`BELI`|`BAWA_SENDIRI`) · `vendor_nama` · `harga_beli_aktual`
(≥ 0) · `tanggal_pembelian` (`YYYY-MM-DD`) · `status`
(`DRAFT`|`AKTIF`|`TERPOTONG`|`BATAL`) · `notes` · `nomor_urut_pemotongan`
(**milik F7 — selalu kosong di F5a**) · `created_at` · `updated_at` ·
`created_by`.

Migrasi: `scripts/migrate_F5a.gs` — toggle `F5a_TARGET` (`STAGING`|`PRODUCTION`),
**idempoten** (sheet sudah ada → header dipastikan, data tak ditimpa),
`verify_F5a()` dengan **guard jumlah kolom** + pencocokan header (`SEMUA OK`).

---

## Endpoints H1–H7 (kontrak lengkap di `docs/API_REFERENCE.md`)

PER-EDISI: `?edisi_id=EDS-...` **wajib** di semua endpoint (mirror Master Hewan
F03). Edisi `SELESAI` → semua tulis ditolak (`422 BUSINESS_EDISI_LOCKED`).
PENDAFTARAN hanya boleh edisi `AKTIF`.

| # | Method | Path | Peran |
|---|---|---|---|
| H1 | GET | `/api/qurban/hewan` | SA, BD, AQ, PD |
| H2 | POST | `/api/qurban/hewan` | SA, AQ, PD |
| H3 | GET | `/api/qurban/hewan/[id]` | SA, BD, AQ, PD |
| H4 | PATCH | `/api/qurban/hewan/[id]` | SA, AQ, PD |
| H5 | POST | `/api/qurban/hewan/reorder` | SA, AQ, PD |
| H6 | POST | `/api/qurban/hewan/batch-status` | SA, AQ |
| H7 | POST | `/api/qurban/hewan/[id]/cancel` | SA, AQ |

**State machine:** `DRAFT→AKTIF`, `DRAFT→BATAL`, `AKTIF→TERPOTONG` (butuh
`tanggal_pemotongan`), `AKTIF→BATAL`. `TERPOTONG` & `BATAL` terminal.

**Auto-numbering (H2):** grup `(edisi, jenis, kelas)`, semua status dihitung.
`BELI` → `max+1`. `BAWA_SENDIRI` → slot BAWA berikutnya, lalu geser tiap `BELI`
≥ slot itu +1 → invariant: BAWA_SENDIRI selalu mendahului BELI.

---

## UI

**Tab "Daftar Inventory"** (`/qurban/hewan`, tab kedua):
- List (filter jenis/kelas/status), kolom `nama_display`, tipe, badge status,
  slot, vendor, harga, tanggal. Klik baris → detail.
- **Reorder (D1):** tombol "Atur Urutan" aktif hanya bila Jenis & Kelas
  terpilih → mode naik/turun seluruh hewan grup → "Simpan Urutan" (H5).
- **Batch-status (D2):** checkbox per baris + pilih-semua (SA/AQ) → action bar
  "Ubah Status" → modal (`AKTIF`/`TERPOTONG`/`BATAL`; TERPOTONG → date picker
  default hari ini; notes) → H6.

**Halaman:** `/qurban/hewan/baru` (H2), `/[id]` (H3, + tombol "Batalkan Hewan"
H7 untuk SA/AQ pada hewan DRAFT/AKTIF), `/[id]/edit` (H4).

Server page tiap sub-route me-resolve edisi via `getEdisiContext` lalu mengoper
`edisiId` ke komponen client (mirror `/qurban/hewan` F03). Edisi diteruskan via
`?edisi=` di navigasi.

---

## Keputusan yang dikunci

- **`tanggal_pemotongan` di audit log, BUKAN kolom (Opsi A).** H6 `→ TERPOTONG`
  merekam tanggal di metadata audit `hewan.batch_terpotong`; sheet tidak punya
  kolom tanggal pemotongan.
- **`DRAFT → BATAL` ditambahkan ke state machine** — perluasan sengaja dari
  diagram terkunci, agar hewan DRAFT salah-input bisa dibatalkan tanpa
  diaktifkan dulu. Low-risk.
- **Reorder sederhana/manual (naik-turun), bukan drag-drop.** Drag-drop = F5b
  (Pemetaan).
- **Penanganan defensif `qurban_peserta`.** Sheet belum ada hingga F4a; helper
  occupancy menangkap sheet-not-found → `slot_terisi = 0`, `occupants = []`,
  guard BATAL lolos. UI menampilkan "Belum ada peserta terdaftar".
- **Role-gating berbeda dari Master Hewan F03:** PENDAFTARAN punya akses tulis
  inventaris fisik (H2/H4/H5) — sesuai flow F1.5 input inventaris. Status ops
  (H6/H7) tetap SA/AQ. (Master Hewan tulis = SA/AQ saja.)
- **Mapping repo by header name** (bukan index hardcoded) — index diturunkan
  dari `SHEET_HEADERS['qurban_daftar_hewan']`.

---

## Watch-out untuk sprint berikutnya

- **F7 (urutan pemotongan):** `updateRow` di `daftar-hewan-repo` menulis ulang
  **17 kolom** termasuk `nomor_urut_pemotongan`, yang **selalu kosong dari
  F5a**. Saat F7 mulai mengisi kolom itu, F7 **harus rekonsiliasi** agar update
  F5a (mis. H4 edit, H6 status) tidak menimpanya kembali ke kosong. Sudah ada
  komentar penanda di `mapDaftarHewanToRow`.
- **F4a (peserta):** helper occupancy (`peserta-occupancy.ts`) mengasumsikan
  `qurban_peserta` punya kolom `hewan_id`, `status` (TERDAFTAR), `edisi_id`,
  `id`, `nama` (resolve **by header name**). Saat F4a membuat sheet itu,
  **konfirmasi nama kolom** agar occupancy & slot "auto-hidup" benar tanpa
  ubah kode F5a.

---

## Files

**Milestone A:** `scripts/migrate_F5a.gs`, `src/lib/qurban/daftar-hewan-types.ts`,
`src/lib/qurban/sheets.ts` (+`DAFTAR_HEWAN`), `src/lib/qurban/id-generator.ts`
(+`generateDaftarHewanId`), `src/lib/constants.ts` (+header 17 kolom).

**Milestone B:** `src/lib/qurban/daftar-hewan-repo.ts`,
`hewan-state-machine.ts`, `daftar-hewan-numbering.ts`, `peserta-occupancy.ts`,
`daftar-hewan-context.ts`, `daftar-hewan-audit.ts`, `validators.ts` (+section
Daftar Hewan), `src/lib/api/errors.ts` (+`BUSINESS_HEWAN_*`), routes
`src/app/api/qurban/hewan/**` (H1–H7), 4 file test, `package.json`.

**Milestone C:** `src/lib/qurban/daftar-hewan-display.ts`,
`src/components/qurban/{HewanInventoryTab,HewanCreateForm,HewanDetail,HewanEditForm}.tsx`,
`HewanTabs.tsx`, pages `src/app/(dashboard)/qurban/hewan/{baru,[id],[id]/edit}/page.tsx`.

**Milestone D:** `src/components/qurban/{HewanBatchStatusModal,HewanCancelModal}.tsx`,
`HewanInventoryTab.tsx` (reorder + multi-select), `HewanDetail.tsx` (cancel),
`HewanTabs.tsx` (canBatchStatus), `daftar-hewan-display.ts`
(+`canManageHewanStatus`), `src/app/(dashboard)/qurban/hewan/page.tsx` (judul),
`docs/API_REFERENCE.md`, `docs/PROJECT_BRIEF.md`, `HANDOFF_SPRINT_F5a.md`.

---

## Verification (build / CI)

`npm run type-check`, `npm run lint`, `npm test`, `npm run build` semua hijau
lokal. Tidak ada migrasi dijalankan dari sesi dev.

---

## Pre-production checklist (operator-executed, manual)

> Jalankan dalam urutan ini. Langkah ini milik operator, **bukan** sesi dev.

1. **Migrasi PRODUCTION DULU, sebelum merge.** Di Apps Script "Setup SKM", set
   `F5a_TARGET = 'PRODUCTION'` → jalankan `migrate_F5a()` → cek Log → jalankan
   `verify_F5a()` → harus `SEMUA OK`. Membuat sheet `qurban_daftar_hewan` (17
   kolom) di Sheet produksi `1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`
   (SKM-AL-JABAR).
2. **Kembalikan toggle** `F5a_TARGET = 'STAGING'` (keamanan).
3. **Baru** squash-merge PR Draft `[F5a] …` ke `main` via GitHub UI.
   > Alasan urutan: kalau merge lebih dulu, kode produksi mengakses sheet yang
   > belum ada → tab "Daftar Inventory" error.
4. Smoke test produksi: buka `/qurban/hewan` tab "Daftar Inventory", pastikan
   tampil (empty-state OK).
5. Branch `qurban/f5a-inventory` **dipertahankan** pasca-merge — jangan dihapus.
