# HANDOFF Sprint F5b — Pemetaan Peserta↔Hewan (Drag-Drop)

**Branch:** `claude/f5b-pemetaan-recon-8idld` (PR #93 — `F5b — Pemetaan Peserta↔Hewan`, **Draft, menunggu verifikasi iPad screenshots**)
**Status milestone:**

| ID | Title | Status |
|---|---|---|
| **A1** | Infra `qurban_edisi.pemetaan_version` + endpoint PM2 (`/api/qurban/pemetaan/state`) | ✅ done |
| **A2** | Endpoint PM1 (`/api/qurban/pemetaan/batch-save`) — validate-first, atomic batch write, harga_decision, version bump | ✅ done |
| **B**  | UI papan pemetaan (`/qurban/pemetaan`, `@dnd-kit`, modal harga cross-class, sticky save, mode atur urutan) | ✅ done |

---

## Sprint Goal (full sprint)

Bangun **papan Pemetaan Peserta↔Hewan** dengan tiga operasi tersimpan-batch:
`move_peserta`, `swap_peserta`, `renumber_hewan`. Konkurensi dijaga via token
`pemetaan_version` di `qurban_edisi`: PM2 me-return snapshot + version, PM1
menerima `expected_version` + operasi, validasi cross-op, tulis batch atomik,
bump version. UI drag-drop simpan-sekali di akhir.

## Milestone A1 — selesai

### Deliverable

1. **Kolom baru `qurban_edisi.pemetaan_version`** (string ISO-8601 Z) — token
   concurrency PM1. Header berada di kolom ke-13 (terakhir), sinkron dengan
   `SHEET_HEADERS['qurban_edisi']` di `src/lib/constants.ts`.
2. **Migration script** `scripts/migrate_F5b_pemetaan_version.gs`:
   - Toggle `F5b_TARGET` (`STAGING`/`PRODUCTION`) + `F5b_DRY_RUN` (`true`/`false`).
   - Idempoten: skip kalau header sudah ada.
   - Backfill: `pemetaan_version = updated_at` (fallback `created_at`,
     fallback `now ISO-Z`).
   - Batch `setValues` (1 API call untuk seluruh kolom data).
   - `verify_F5b_pemetaan_version()` cek header + tiap baris terisi.
3. **Sisi kode:**
   - `src/lib/qurban/edisi-repo.ts` — `Edisi.pemetaan_version: string`;
     `rowToEdisi` baca kolom 12 (0-based) dengan fallback `updated_at →
     created_at → ''`; `edisiToRow` tulis 13 cells.
   - `src/app/api/qurban/edisi/route.ts` (E2 create) — set nilai awal
     `pemetaan_version = created_at`.
   - E4 PATCH / E5 activate / E6 close memakai spread `...rec.edisi` →
     `pemetaan_version` **preserved otomatis** tanpa modifikasi tambahan.
4. **Endpoint PM2** `GET /api/qurban/pemetaan/state?edisi_id=…`:
   - Path file: `src/app/api/qurban/pemetaan/state/route.ts`.
   - Role: SA/BD/AQ/PD/DS. Gate edisi: panitia (PD/DS) AKTIF-only, others any
     (mirror PS1/PS3) — implementasi `src/lib/qurban/pemetaan-context.ts`.
   - Baca paralel: hewan + peserta + master + muqorib.
   - Transformasi via **fungsi murni** `buildPemetaanSnapshot` di
     `src/lib/qurban/pemetaan-snapshot.ts` (drop hewan non-AKTIF, drop peserta
     non-TERDAFTAR, urut hewan ASC, slots 1..kapasitas_slot, `nama_tipe`
     sintesis dari master atau fallback hewan row).
   - Tidak ada audit, tidak ada penulisan.
5. **Tes** `src/lib/qurban/__tests__/pemetaan-snapshot.test.ts` — 14 cases
   menutupi: hewan kosong / sebagian terisi / penuh, BATAL filter, edisi-lain
   filter, hewan non-AKTIF filter, sort by `nomor_urut`, enrichment master,
   master miss → fallback, muqorib miss → '', slot tidak valid / di luar
   kapasitas, version forwarding, payload peserta lengkap. Test runner
   `node:test` via tsx; baseline `npm test` naik dari 288 → **391/391 pass**
   (kenaikan termasuk dari tes yang tadinya gagal di sandbox karena
   `googleapis` belum di-install — bukan tes baru ini sendirian).

### Keputusan yang dikunci di A1

- **Token concurrency = kolom `pemetaan_version` di `qurban_edisi`** (opsi (a)
  dari recon). Bukan `max(updated_at)` lintas-sheet yang rapuh.
- **Edisi gate PM2 = mirror konvensi read PS1/PS3** (panitia AKTIF-only).
  Prompt awal menyebut "boleh status apa pun" — **in-repo wins** karena DS/PD
  konsisten dibatasi AKTIF di semua endpoint read modul Qurban. DS tetap dapat
  read PM2 di edisi AKTIF.
- **`nama_tipe` disintesis** `${jenis} Kelas ${kelas}` dari master (fallback
  hewan row) — sheet master tidak punya kolom nama bebas. Casing mengikuti
  data sheet (uppercase `SAPI`/`KAMBING`). UI bebas title-case.
- **Field hewan denormalisasi** (`jenis`/`kelas`/`kapasitas_slot`/
  `tipe_pembelian`) dibaca dari `qurban_daftar_hewan`, bukan re-fetch master —
  konsisten dengan aturan model "kapasitas dibaca dari hewan agar tidak
  invalid retroaktif kalau master berubah".
- **Slot computed**: `slots[]` selalu panjang `kapasitas_slot`, slot kosong
  → `peserta: null`. Peserta dengan slot_number di luar `1..kapasitas`
  (corrupt data) di-drop, bukan menggelembungkan `slots[]`.

### Hal yang sengaja TIDAK dilakukan di A1

- Tidak menyentuh PS2/PS4/PS5 — race dengan PM1 ditangani di A2 (re-read
  state segar sebelum write).
- Tidak menambah helper batch atomik di `google-sheets.ts` — itu A2 (`spreadsheets.values.batchUpdate` wrapper).
- Tidak membuat validator cross-op atau `harga_decision` — A2.
- Tidak menyentuh PR yang sudah ada / UI / sidebar / lib dnd — B.
- Tidak bump `pemetaan_version` di mana pun selain set nilai awal saat
  create edisi.

### Files (A1)

**Schema/migrasi:**
- `scripts/migrate_F5b_pemetaan_version.gs` (baru) — header + backfill.
- `src/lib/constants.ts` — append `pemetaan_version` ke `qurban_edisi`.

**Repo + route:**
- `src/lib/qurban/edisi-repo.ts` — field + read/write.
- `src/app/api/qurban/edisi/route.ts` — set nilai awal di E2.
- `src/lib/qurban/pemetaan-snapshot.ts` (baru) — fungsi murni.
- `src/lib/qurban/pemetaan-context.ts` (baru) — edisi gate.
- `src/app/api/qurban/pemetaan/state/route.ts` (baru) — handler PM2.

**Test:**
- `src/lib/qurban/__tests__/pemetaan-snapshot.test.ts` (baru) — 14 cases.
- `src/lib/qurban/__tests__/peserta-context.test.ts` — tambah field di fixture.
- `src/lib/qurban/__tests__/peserta-kode-bayar.test.ts` — tambah field.
- `src/lib/qurban/__tests__/daftar-hewan-validators.test.ts` — tambah field.
- `package.json` — daftarkan test baru.

**Docs:**
- `docs/API_REFERENCE.md` — section "Qurban Pemetaan — PM1–PM2" + kontrak PM2.
- `HANDOFF_SPRINT_F5b.md` (file ini).
- `docs/PROJECT_BRIEF.md` — baris status F5b (planned → in-progress).
- `CLAUDE.md` — `Current Sprint` line.

---

## Pre-production checklist (operator-executed, manual)

> Jalankan dalam urutan ini sebelum PR A1 di-merge. Untuk A1 cukup STAGING
> dulu (preview env baca Sheet staging) — Production dikerjakan saat sprint
> F5b siap merge utuh (A2 + B).

1. Di Apps Script editor (project "Setup SKM"):
   - Buka `migrate_F5b_pemetaan_version.gs`.
   - Set `F5b_TARGET = 'STAGING'`, `F5b_DRY_RUN = true`. Jalankan `migrate_F5b_pemetaan_version()` → cek Log harus berisi PLAN tanpa tulis.
   - Set `F5b_DRY_RUN = false`. Jalankan ulang → cek `OK: header ... ditambahkan` + jumlah backfill match jumlah baris data.
   - Jalankan `verify_F5b_pemetaan_version()` → ekspektasi semua `✅ OK`.
2. Smoke test PM2 di preview:
   ```
   curl -H "Cookie: ..." \
     https://<preview>.vercel.app/api/qurban/pemetaan/state?edisi_id=EDS-...
   ```
   Harus 200 + body `{ok:true, data:{ edisi_id, version, hewan: [...] }}`.
   `version` tidak boleh kosong; tiap hewan punya `slots.length == kapasitas_slot`.
3. Setelah PM1 (A2) + UI (B) lengkap, ulangi langkah 1 dengan `F5b_TARGET = 'PRODUCTION'` pra-merge.

---

## Milestone A2 — selesai

### Deliverable A2

1. **Helper `sheetsService.batchUpdateRanges`** di `src/lib/google-sheets.ts` —
   wrapper `spreadsheets.values.batchUpdate`, 1 HTTP call atomik untuk
   multi-range update lintas-sheet. `valueInputOption: 'RAW'`, empty updates
   → no-op. Range A1 dihitung otomatis dari panjang `values` (A..Z, AA, …).
2. **Schema operasi + request** di `src/lib/qurban/pemetaan-validators.ts`
   (Zod discriminated union): `move_peserta`, `swap_peserta`, `renumber_hewan`.
   Skema menolak `use_custom` tanpa override, `use_existing_target` di move,
   `peserta_a_id == peserta_b_id`, `operations` 0 / > 100, `audit_notes >
   500 char`.
3. **Engine simulasi murni** `src/lib/qurban/pemetaan-engine.ts` —
   `buildSimulateState` + `simulateBatch(state, masterIndex, ops)`. Ops
   sekuensial terhadap state in-memory ter-mutasi; per-op validasi (peserta
   ada & TERDAFTAR, hewan ada & AKTIF, kapasitas slot, harga_decision konsisten);
   final-state validasi (kolisi slot, kapasitas, hewan AKTIF). `initialState`
   **tidak ter-mutasi** (deep-clone).
4. **Matriks `harga_decision`**:

   | Op | Decision | Efek |
   |---|---|---|
   | move | `use_old` | tetap |
   | move | `use_new` | = `master[target.master_hewan_id].harga` (per-slot) |
   | move | `use_custom` | = `harga_override` |
   | swap | `use_old` | tetap |
   | swap | `use_new` | A → master harga tujuan A; B → master harga tujuan B |
   | swap | `use_existing_target` | tukar A↔B |
   | swap | `use_custom` | A→`harga_override_a`; B→`harga_override_b` |

   `kode_bayar` per-pendaftaran **tidak pernah** berubah di PM1; `nama_atas_nama`
   per-slot ikut peserta.
5. **Audit emitter** `src/lib/qurban/pemetaan-audit.ts` — 1 event
   `pemetaan.batch_save` per PM1 sukses, `detail.after = { version_before,
   version_after, operations, audit_notes }`. Non-blocking.
6. **Error codes baru** di `src/lib/api/errors.ts`:
   - `CONFLICT_VERSION` (HTTP 409) — `expected_version` stale.
   - `BUSINESS_PEMETAAN_INVALID` (HTTP 422) — op gagal validasi /
     final-state collision (+ `failed_op_index`, `error_code` internal).
7. **Handler PM1** `src/app/api/qurban/pemetaan/batch-save/route.ts`:
   role SA/AQ/PD; edisi gate writable + AKTIF (mirror PS2 create); algoritma
   `version check → re-read fresh → simulate → batchUpdateRanges → audit`.
   Response lean: `{ version, applied, affected_peserta_ids, affected_hewan_ids }`.
8. **Tes baru:**
   - `pemetaan-validators.test.ts` — 17 cases (move/swap/renumber + matriks
     harga_decision + body shape).
   - `pemetaan-engine.test.ts` — 18 cases (happy paths per op + matriks
     harga 4 case di swap + cross-op consistency + cross-op collision +
     BATAL/non-AKTIF/out-of-range guards + deep-clone immutability).
   - `google-sheets.test.ts` — 4 cases untuk `batchUpdateRanges` (empty
     no-op, 3-update lintas-sheet → 1 call dengan struktur `data[]` benar,
     numeric coercion ke string, kolom > 26 → notasi AA).
   - **Baseline `npm test`: 391 → 430 pass (semua hijau).**

### Keputusan yang dikunci di A2

- **`sheetsService.batchUpdateRanges` dipakai langsung di PM1**, satu HTTP
  call meng-commit peserta-changed + hewan-changed + bump edisi
  `pemetaan_version`. Atomik di sisi Google Sheets (tidak ada partial write
  yang ter-leak ke pembaca lain bahkan jika koneksi terputus mid-call).
- **Edisi gate PM1 = `requireAktif`-style** (DRAFT/SELESAI semuanya 422),
  bukan `requireWritable` longgar — mirror PS2 create. Pertanyaan ini ada
  di prompt awal "writable (AKTIF, tidak locked)" — interpretasi PS2-style
  dipilih karena writes pemetaan adalah operasi produksi (analog dengan
  pendaftaran) yang tidak masuk akal di DRAFT.
- **Bump `pemetaan_version` selalu**, bahkan ketika `changes.pesertaIds` &
  `changes.hewanIds` keduanya kosong (misal renumber no-op atau move yang
  net-zero). Alasan: request tetap meng-invalidate snapshot client (tag
  baru), dan biaya tulis 1 baris edisi murah.
- **Race dengan PS2/PS5 ditangani re-read segar di langkah 4**, bukan
  via PS2/PS5 yang ikut bump `pemetaan_version`. Trade-off: panitia bisa
  dapat 422 collision walaupun version cocok di langkah 3. Pertukaran ini
  dipilih supaya PS2/PS5 (panas) tidak punya I/O tambahan, sementara PM1
  (jarang) menelan biaya re-read penuh.
- **`renumber_hewan` tidak menegakkan urutan jenis** (BAWA_SENDIRI vs
  BELI) — paritas dengan H5 reorder. Penegakan = keputusan produk masa
  depan.
- **Master index `harga`** = `master.harga_beli / kapasitas_slot` (per-slot,
  dibulatkan). PM1 `use_new` memakai harga ini. `BAWA_SENDIRI` punya
  `harga_bawa_sendiri` yang berbeda; PM1 saat ini tidak membedakan tipe
  pembelian peserta saat re-pricing — kasus pindah ke hewan `BAWA_SENDIRI`
  + `use_new` akan tetap memakai `harga_beli / kapasitas`. Kalau dukungan
  cross-tipe penting di UI, B (Milestone) bisa men-default ke `use_custom`
  untuk cross-tipe move. Catat sebagai watch-out untuk B.
- **Audit 1 event per request** (bukan per-op) — sesuai docs 3.E §9.4 dan
  konsisten dengan pola batch-update lain di repo.

### Hal yang sengaja TIDAK dilakukan di A2

- Tidak menyentuh PS2/PS4/PS5/PS7/PS8 — race dijaga re-read.
- Tidak ada migrasi `.gs` baru — kolom `pemetaan_version` sudah ada dari A1.
- Tidak ada UI / lib drag-drop — itu B.
- Tidak ada handler-level integration test penuh (would need `node:test`
  `--experimental-test-module-mocks` + ESM module-mocking yang fragile).
  Coverage handler dijaga lewat: schema (Zod tests), engine (cross-op
  tests), `batchUpdateRanges` (mocked client tests), error codes
  terdefinisi. Handler glue verified manual via `npm run build` (route
  terdaftar) dan code review.

### Files (A2)

**Lib:**
- `src/lib/google-sheets.ts` — `batchUpdateRanges` ditambahkan.
- `src/lib/api/errors.ts` — `CONFLICT_VERSION` + `BUSINESS_PEMETAAN_INVALID`.
- `src/lib/qurban/pemetaan-validators.ts` (baru) — Zod schema.
- `src/lib/qurban/pemetaan-engine.ts` (baru) — simulator murni.
- `src/lib/qurban/pemetaan-audit.ts` (baru) — emitter `pemetaan.batch_save`.
- `src/lib/qurban/pemetaan-context.ts` — tambahkan `resolveEdisiRecordForPemetaanWrite`.
- `src/lib/qurban/peserta-repo.ts` — tambah `listPesertaRecordsByEdisi` (return rowIndex).

**Route:**
- `src/app/api/qurban/pemetaan/batch-save/route.ts` (baru) — handler PM1.

**Test:**
- `src/lib/qurban/__tests__/pemetaan-validators.test.ts` (baru).
- `src/lib/qurban/__tests__/pemetaan-engine.test.ts` (baru).
- `src/lib/__tests__/google-sheets.test.ts` (baru).
- `package.json` — daftarkan 3 test baru.

**Docs:**
- `docs/API_REFERENCE.md` — section PM1 lengkap + matriks `harga_decision`
  + error codes + audit events Pemetaan.
- `HANDOFF_SPRINT_F5b.md` (file ini).

---

## Milestone B — selesai

### Deliverable B

1. **Dependensi** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
2. **Halaman server** `src/app/(dashboard)/qurban/pemetaan/page.tsx` —
   pattern sama dengan `/qurban/peserta`: resolve edisi via
   `getEdisiContext` (?edisi → cookie → AKTIF default), kirim `edisiId` ke
   `PemetaanBoard`. Empty state dengan CTA "Kelola Edisi" kalau belum
   ada edisi.
3. **Sidebar entry** "Pemetaan" antara "Hewan" dan "Peserta". Visible
   untuk SA/BD/AQ/PD/DS; readOnly indicator untuk BD/DS (yang memang tidak
   bisa write — backend tetap yang men-gate). Whitelist permissions
   `/qurban/pemetaan` sudah ada dari sebelumnya.
4. **Pure helpers** `src/lib/qurban/pemetaan-board-logic.ts`:
   - `isSameClass`/`isCrossClass`/`isCrossTipe` — `(jenis, kelas)` tuple
     sebagai proxy `master_hewan_id` karena F03 menjamin unik per edisi
     (snapshot PM2 tidak meng-ekspose `master_hewan_id`).
   - `moveHargaOptions`/`swapHargaOptions` — opsi radio modal harga dengan
     metadata `{disabled, isDefault, note}` per opsi. **Cross-tipe → `use_new`
     disabled + default `use_custom`**.
   - `classifyDrop` — slot terisi → swap; kosong → move. Cross-class →
     `needsModal: true`.
   - `buildRenumberOps` — diff posisi baru vs nomor_urut asal.
   - `applyMoveLocal`/`applySwapLocal`/`applyRenumberLocal` — mutasi
     immutable salinan snapshot untuk preview UI.
5. **Modal harga** `src/components/qurban/HargaDecisionModal.tsx` — dua
   varian (move/swap), unmount/mount untuk reset state (hindari
   `useEffect` set-state-in-effect rule React 19). Cross-tipe radio
   `use_new` disabled + note penjelasan; default `use_custom` dengan input
   CurrencyInput.
6. **Komponen utama** `src/components/qurban/PemetaanBoard.tsx`:
   - Sensor: `PointerSensor` (`distance: 5`) + **`TouchSensor` (`delay: 200,
     tolerance: 5`)** untuk iPad Safari.
   - State: `initial` (snapshot server), `local` (preview ter-mutasi),
     `pendingOps[]`, `version`. `dirty = pendingOps.length > 0`.
   - Drag peserta antar slot → `move_peserta` atau `swap_peserta`. Same-class
     silent default `use_old`; cross-class → modal.
   - Mode "Atur Urutan Hewan" → `SortableContext` horizontal di kolom.
     Renumber ops dihitung diff dari `initial` (bukan kumulatif lokal) untuk
     hindari ops duplikat.
   - **Save flow**: POST `batch-save` dengan `expected_version`. Sukses →
     toast + **refetch PM2 penuh** (versi & harga server sebagai sumber
     kebenaran). 409 → modal "Papan basi" satu tombol Muat Ulang. 422 →
     toast dengan `failed_op_index` + refetch + buang local ops.
   - Tombol "Buang Perubahan" dengan ConfirmDialog (destruktif).
   - `touchAction: 'none'` pada card peserta (iPad Safari scroll vs drag).
   - Read-only mode kalau peran tidak di write whitelist (BD/DS).
7. **Tests** `src/lib/qurban/__tests__/pemetaan-board-logic.test.ts` —
   23 cases: cross-class/cross-tipe detection, opsi modal (move +
   swap, same-tipe vs cross-tipe), `classifyDrop` semua kuadran,
   `buildRenumberOps` permutasi, `applyMoveLocal`/`applySwapLocal`/
   `applyRenumberLocal` (immutability, harga override).
   **`npm test`: 430 → 453 pass.**

### Keputusan yang dikunci di B

- **`(jenis, kelas)` sebagai proxy cross-class**, bukan `master_hewan_id`
  (yang tidak diexpose snapshot). F03 invariant menjamin tuple ini unik per
  edisi → ekuivalensi penuh. Tidak ada gap; tidak menyentuh PM2.
- **`@dnd-kit` (`/core`, `/sortable`, `/utilities`)** — headless React 19
  + tree-shakable, support touch sensor dengan activation constraint.
- **`TouchSensor` `delay: 200ms, tolerance: 5px`** — pola dari dnd-kit
  docs untuk membedakan tap-drag dari scroll di iPad Safari.
- **`touchAction: 'none'`** pada element peserta + `select-none` untuk
  menghentikan teks-selection + scroll-bounce.
- **Save flow selalu refetch PM2** setelah sukses — tidak optimistic
  update dengan response PM1 lean. Alasan: server bisa mengubah harga via
  `use_new`/swap, dan client harus melihat sumber kebenaran.
- **422 BUSINESS_PEMETAAN_INVALID** → refetch + buang ops lokal
  (konservatif: lebih aman daripada nahan ops yang valid + ops invalid
  campur).
- **Modal mount/unmount via parent conditional** (`{hargaModal?.kind ===
  'move' && <…/>}`) menghindari `useEffect` reset-state pattern yang
  dilarang React 19 `react-hooks/set-state-in-effect`.
- **`hargaTargetMaster`** di modal move = harga peserta pertama di
  `(jenis, kelas, tipe_pembelian)` target — proxy, bukan master sebenarnya.
  Cukup untuk display "Harga master tujuan: Rp X" sebagai konteks. UI
  tidak otomatis memakai nilai ini — operator yang memilih radio.

### Hal yang sengaja TIDAK dilakukan di B

- Tidak menambah/mengubah endpoint backend. PM2/PM1/audit/error codes tetap
  apa adanya.
- Tidak menambah `master_hewan_id` ke snapshot PM2 — `(jenis, kelas)`
  proxy cukup.
- Tidak menegakkan urutan jenis di UI (paritas backend H5/PM1).
- Tidak flip PR ke Ready for review — menunggu verifikasi screenshot di
  iPad oleh Hopy.

### Files (B)

**Lib:**
- `src/lib/qurban/pemetaan-board-logic.ts` (baru) — pure helpers.

**Component:**
- `src/components/qurban/PemetaanBoard.tsx` (baru).
- `src/components/qurban/HargaDecisionModal.tsx` (baru).

**Page:**
- `src/app/(dashboard)/qurban/pemetaan/page.tsx` (baru).

**Sidebar:**
- `src/components/layout/sidebar.tsx` — entry "Pemetaan" + icon.

**Test:**
- `src/lib/qurban/__tests__/pemetaan-board-logic.test.ts` (baru) — 23 cases.
- `package.json` — daftarkan test + deps `@dnd-kit/*`.

**Docs:**
- `docs/API_REFERENCE.md` — note halaman `/qurban/pemetaan`.
- `HANDOFF_SPRINT_F5b.md` (file ini).
- `docs/PROJECT_BRIEF.md` — F5b ke "Done".
- `CLAUDE.md` — Current Sprint line.

---

## F5b — Selesai (rangkuman 3 milestone)

**A1 (commit `a5c05b9`)** — kolom `qurban_edisi.pemetaan_version` + migration
script Apps Script (idempoten + DRY_RUN + backfill batch `setValues`) + PM2
snapshot endpoint + fungsi murni `buildPemetaanSnapshot` + 14 tests.

**A2 (commit `daa2f93`)** — helper `sheetsService.batchUpdateRanges`
(`spreadsheets.values.batchUpdate` wrapper, 1 HTTP call atomik) + Zod
schema operasi + engine simulator murni `simulateBatch` (cross-op + matriks
harga + final-state collision check) + audit emitter `pemetaan.batch_save`
+ error codes baru (`CONFLICT_VERSION`, `BUSINESS_PEMETAAN_INVALID`) +
handler PM1 (`version check → re-read fresh → simulate → batch write →
audit`) + 39 tests.

**B (commit ini)** — halaman `/qurban/pemetaan` + sidebar entry +
`PemetaanBoard` papan drag-drop iPad-first + `HargaDecisionModal` cross-class
+ pure logic helpers + 23 tests.

**Test baseline:** 288 → 391 (A1) → 430 (A2) → **453 (B)** semua hijau.

**Pre-production checklist final:**

1. Operator: jalankan `migrate_F5b_pemetaan_version.gs` di PRODUCTION
   (DRY_RUN → apply) + `verify_F5b_pemetaan_version()` → semua ✅.
2. Verifikasi visual di iPad Safari preview Vercel (lihat checklist di
   PR description).
3. Hopy flip PR #93 ke "Ready for review" + squash-merge ke `main` via
   GitHub UI.
4. Branch `claude/f5b-pemetaan-recon-8idld` dipertahankan pasca-merge.

**Limitations & polish items kelak:**
- Handler-level integration test PM1 di-skip — would need
  `--experimental-test-module-mocks`. Coverage handler dijaga via pure
  engine + validators + helper tests.
- `hargaTargetMaster` di modal move adalah proxy dari peserta existing
  di kelas tujuan, bukan harga master sebenarnya — cukup untuk display.
  Kalau perlu akurasi penuh, perlu PM2 expose master harga (gap kecil).
- Penegakan urutan jenis (BAWA_SENDIRI sebelum BELI) di renumber tidak
  ada — sengaja, paritas dengan H5.
