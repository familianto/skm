# HANDOFF Sprint F4a — Pendaftaran Peserta (Backend)

**Branch:** `claude/qurban-f4a-peserta-foundation-X7T7v`
(PR: `[F4a] Modul Pendaftaran Peserta — Backend`, Draft)
**Status:** Milestone A–C ✅ done. **Code-complete** — pending the closeout
checklist (bottom of this file) before the PR merges to `main`.
**Spec source:** session prompts `Sprint F4a · Milestone A/B/C`.

---

## Sprint Goal

Membangun modul **Pendaftaran** peserta qurban — lapisan di atas inventaris
F5a. Tabel `qurban_peserta` dengan pendekatan **"1 baris = 1 slot"** (1 muqorib
ambil 3 slot Sapi → 3 baris peserta). **Backend-only**: UI di Sprint F4c,
pendaftaran publik di Sprint F4b.

## Milestones

| ID | Title | Status | Commit |
|---|---|---|---|
| A | Fondasi — migrasi `qurban_peserta` (17 kolom) + tipe + konstanta + `generatePesertaId()` (`PST-`) + `formatKodeBayar` | ✅ done | `fc13f2c` |
| B | Repo `peserta-repo.ts` + perbaikan `peserta-occupancy.ts` + helper (slot/pricing/kode_bayar/validators/context/audit) + endpoint PS1–PS5 + tests | ✅ done | `fb38234` |
| C | B-polish + endpoint PS6–PS8 + dokumentasi + PR Draft | ✅ done | _this commit_ |

---

## New sheet (run by operator via `migrate_F4a` Apps Script)

Satu sheet ditambahkan ke spreadsheet SKM utama (`GOOGLE_SHEETS_ID`, sama
dengan anggota/transaksi/qurban_edisi/qurban_daftar_hewan). Row 1 = header,
data dari row 2.

### `qurban_peserta` (17 kolom, per-edisi)

`id` (`PST-YYYYMMDD-NNNN`) · `edisi_id` (FK `qurban_edisi.id`) · `muqorib_id`
(FK `qurban_muqorib.id`, lintas-edisi) · `hewan_id` (FK
`qurban_daftar_hewan.id` — **mutable**, drag-drop F5b) · `slot_number`
(1..`kapasitas_slot` — **mutable**) · `tipe_qurban` (`BELI`|`BAWA_SENDIRI`,
snapshot dari hewan) · `nama_atas_nama` (opsional; kosong → pakai nama muqorib)
· `keterangan_bagian` · `harga_disepakati` (**frozen** saat daftar) ·
`kode_bayar` (`QRB-{tahun}-{NNN}`, unik per edisi, **immutable**) ·
`sumber_pendaftaran` (`PUBLIK`|`PANITIA`|`IMPORT_1447H`) · `status_pendaftaran`
(`TERDAFTAR`|`BATAL`) · `tanggal_daftar` · `notes` · `created_at` ·
`updated_at` · `created_by`.

- **Tidak ada kolom `is_active`** — soft-delete via `status_pendaftaran = BATAL`.
- **Tidak ada kolom `nama`** — label diturunkan: `nama_atas_nama` kalau terisi,
  selain itu `muqorib.nama_lengkap` (lewat `muqorib_id`).

Migrasi: `scripts/migrate_F4a.gs` — toggle `F4a_TARGET` (`STAGING`|`PRODUCTION`),
**idempoten** (sheet sudah ada → header dipastikan, data tak ditimpa),
`verify_F4a()` dengan **guard jumlah kolom** (17) + pencocokan header
(`SEMUA OK`). Migrasi STAGING sudah dijalankan operator.

---

## Endpoints PS1–PS8 (kontrak lengkap di `docs/API_REFERENCE.md`)

PER-EDISI: `?edisi_id=EDS-...` di query (kecuali **PS6** yang menerima `edisi_id`
di body sesuai kontrak request-nya).

| # | Method | Path | Peran |
|---|---|---|---|
| PS1 | GET | `/api/qurban/peserta` | SA, BD, AQ, PD |
| PS2 | POST | `/api/qurban/peserta` | SA, AQ, PD |
| PS3 | GET | `/api/qurban/peserta/[id]` | SA, BD, AQ, PD |
| PS4 | PATCH | `/api/qurban/peserta/[id]` | SA, AQ, PD |
| PS5 | POST | `/api/qurban/peserta/[id]/cancel` | SA, AQ |
| PS6 | POST | `/api/qurban/peserta/check-duplicate` | SA, AQ, PD |
| PS7 | POST | `/api/qurban/peserta/[id]/refresh-harga` | SA, AQ |
| PS8 | GET | `/api/qurban/peserta/available-slots` | SA, AQ, PD |

**Gate edisi:** PENDAFTARAN (panitia) hanya boleh edisi `AKTIF`. **PS2 wajib
edisi `AKTIF` untuk SEMUA peran** (`422 BUSINESS_EDISI_NOT_AKTIF`). PS4/PS5/PS7
menolak edisi `SELESAI` (`422 BUSINESS_EDISI_LOCKED`).

**PS2 (create multi-slot):** validasi → muqorib ada & **aktif** → deteksi
duplikat Layer 1 (`409 DUPLICATE_PESERTA` bila `allow_additional_qurban=false`)
→ freeze harga → auto-assign slot (`409 BUSINESS_INSUFFICIENT_SLOTS` bila kurang)
→ generate `kode_bayar` berurutan → insert N baris batch → audit per baris.

---

## Keputusan yang dikunci

- **Harga per slot (FINAL):** `harga_disepakati = master ÷ kapasitas_slot`.
  `BELI` pakai `qurban_master_hewan.harga_beli`; `BAWA_SENDIRI` pakai
  `harga_bawa_sendiri`. Operator mengonfirmasi `harga_bawa_sendiri` adalah nilai
  **per-ekor** (total), sehingga pendaftaran 1 ekor penuh (semua slot) berjumlah
  tepat nilai master. Dibulatkan ke Rupiah integer (`Math.round`). Sumber kontrak:
  `docs/HANDOFF_TAHAP_2_ARCHITECTURE.md` §4.4.
- **`kode_bayar` = `QRB-{tahun_hijriah}-{NNN}`**, unik per edisi. Urutan
  berikutnya = (suffix tertinggi yang ada di edisi) + 1, **menghitung semua
  status termasuk `BATAL`** → peserta batal tak pernah membebaskan kembali
  kode-nya. `tahun` diambil dari `edisi.tahun_hijriah` (digit-run pertama,
  mis. `"1448 H"` → `"1448"`). NNN di-pad 3 digit.
- **Auto-assign slot:** hewan `AKTIF` cocok `master_hewan_id` + `tipe_pembelian`,
  urut `nomor_urut` ASC, slot kosong bernomor terkecil dulu, auto-split antar
  hewan. "Kosong" = `slot_number` belum ditempati peserta `TERDAFTAR`. Match by
  `master_hewan_id` ekuivalen `(jenis, kelas, tipe)` (F03 jamin (jenis×kelas)
  unik per edisi).
- **Peserta `BATAL` immutable:** PS4 menolak edit peserta `BATAL`
  (`422 BUSINESS_PESERTA_NOT_TERDAFTAR`) — catatan historis.
- **Muqorib nonaktif ditolak di PS2** — `qurban_muqorib` punya `is_active`
  (soft-delete F03); pendaftaran hanya untuk muqorib aktif.
- **Perbaikan `peserta-occupancy.ts`** (dari stub defensif F5a): kini membaca
  `status_pendaftaran === 'TERDAFTAR'` (bukan kolom `status` yang tak ada) dan
  meresolusi nama via `nama_atas_nama` / `muqorib.nama_lengkap` (tak ada kolom
  `nama`). Membaca `qurban_peserta` nyata lewat `peserta-repo`. **Okupansi slot
  F5a (H1/H3/H7) kini nyata**, bukan lagi `0`.
- **ID batch:** PS2 multi-slot pakai `generatePesertaIds(count)` / generic
  `generateIds(prefix, sheet, count)` — satu read, blok id berurutan (loop
  `generateId` akan menghasilkan id sama N kali karena belum di-append).
- **Mapping repo by header name** (bukan index hardcoded) — index diturunkan
  dari `SHEET_HEADERS['qurban_peserta']`, mirror `daftar-hewan-repo`.
- **Test:** logika keputusan diekstrak ke fungsi murni teruji (repo mapper,
  occupancy, slot-assignment, pricing, kode_bayar, validators, edisi-gate);
  route handler PS1–PS8 mengikuti preseden F5a (tanpa test HTTP langsung,
  diverifikasi via smoke). Suite: **220 test hijau**.

---

## Watch-out untuk sprint berikutnya

- **F4b (pendaftaran publik) & F4c (UI)** akan mengonsumsi PS1–PS8. Helper sudah
  disiapkan reuse: `lookupHargaDisepakati` (PS7), `findDuplikatTerdaftar` (PS6),
  `autoAssignSlots`/`listAvailableSlots` (PS8). PB3 (submit publik) akan menulis
  peserta dengan `sumber_pendaftaran=PUBLIK`.
- **"Pendaftaran dibuka/ditutup":** kolom `tanggal_pendaftaran_buka`/`_tutup`
  di `qurban_edisi` **ada tapi belum dipakai** untuk gating — F4a hanya guard
  status `AKTIF`. Kandidat fitur ke depan (mis. tolak daftar di luar rentang
  tanggal meski edisi AKTIF).
- **`qurban_pembayaran` (F6) belum ada.** PS5 cancel menangani ketidakhadirannya
  secara **defensif** (sheet hilang → lewati cek pembayaran). Saat F6 mendarat,
  pembayaran existing TIDAK dinonaktifkan otomatis; PS5 hanya menambahkan
  `meta.warning` bila peserta punya pembayaran (refund out-of-band).
- **`harga_disepakati` frozen.** Perubahan harga master tidak otomatis merembet
  ke peserta — operator memakai PS7 (refresh-harga) manual per peserta.

---

## Files

**Milestone A (`fc13f2c`):** `scripts/migrate_F4a.gs`,
`src/lib/qurban/peserta-types.ts`, `src/lib/qurban/sheets.ts` (+`PESERTA`),
`src/lib/qurban/id-generator.ts` (+`generatePesertaId`, `formatKodeBayar`),
`src/lib/constants.ts` (+header 17 kolom), test `peserta-format`.

**Milestone B (`fb38234`):** `src/lib/qurban/peserta-repo.ts`,
`peserta-occupancy.ts` (rewrite), `peserta-pricing.ts`,
`peserta-slot-assignment.ts`, `peserta-kode-bayar.ts`, `peserta-validators.ts`,
`peserta-context.ts`, `peserta-audit.ts`, `src/lib/api/id-gen.ts`
(+`generateIds`), `src/lib/api/errors.ts` (+`DUPLICATE_PESERTA`,
`BUSINESS_INSUFFICIENT_SLOTS`, `BUSINESS_PESERTA_NOT_TERDAFTAR`),
`src/lib/api/response.ts` (+`meta.warning`), routes
`src/app/api/qurban/peserta/{route,[id]/route,[id]/cancel/route}.ts` (PS1–PS5),
6 file test, `package.json`.

**Milestone C (_this commit_):** B-polish (PS4 tolak `BATAL`, PS2 tolak muqorib
nonaktif), `peserta-audit.ts` (+`auditPesertaHargaChanged`),
`peserta-slot-assignment.ts` (+`enumerateEmptySlots`, `listAvailableSlots`),
routes `src/app/api/qurban/peserta/{check-duplicate/route,[id]/refresh-harga/route,available-slots/route}.ts`
(PS6–PS8), test slot-assignment (+enumerate), `docs/API_REFERENCE.md`,
`docs/PROJECT_BRIEF.md`, `HANDOFF_SPRINT_F4a.md`.

---

## Verification (build / CI)

`npm run type-check`, `npm run lint`, `npm test` (220 hijau), `npm run build`
semua hijau lokal. Tidak ada migrasi dijalankan dari sesi dev.

---

## Closeout checklist (operator-executed, manual)

> Jalankan dalam urutan ini. Langkah ini milik operator, **bukan** sesi dev.

1. **Migrasi PRODUCTION DULU, sebelum merge.** Di Apps Script "Setup SKM", set
   `F4a_TARGET = 'PRODUCTION'` → jalankan `migrate_F4a()` → cek Log → jalankan
   `verify_F4a()` → harus `SEMUA OK`. Membuat sheet `qurban_peserta` (17 kolom)
   di Sheet produksi `1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`.
2. **Kembalikan toggle** `F4a_TARGET = 'STAGING'` (keamanan).
3. **Baru** squash-merge PR Draft `[F4a] …` ke `main` via GitHub UI.
   > Alasan urutan: kalau merge lebih dulu, kode produksi (mis. okupansi F5a
   > yang kini membaca `qurban_peserta`) mengakses sheet yang belum ada.
   > (Occupancy reader defensif → empty map, tapi tetap rapikan urutan.)
4. Smoke test produksi: `GET /api/qurban/peserta?edisi_id=<edisi AKTIF>` →
   list kosong; `GET /api/qurban/peserta/available-slots?edisi_id=<edisi>` →
   slot tersedia.
5. Branch `claude/qurban-f4a-peserta-foundation-X7T7v` **dipertahankan**
   pasca-merge — jangan dihapus.
