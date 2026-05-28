# HANDOFF Sprint F5b — Pemetaan Peserta↔Hewan (Drag-Drop)

**Branch:** `claude/f5b-pemetaan-recon-8idld` (PR: `F5b — Pemetaan Peserta↔Hewan`, Draft)
**Status milestone:**

| ID | Title | Status |
|---|---|---|
| **A1** | Infra `qurban_edisi.pemetaan_version` + endpoint PM2 (`/api/qurban/pemetaan/state`) | ✅ done — kontrak ini |
| A2 | Endpoint PM1 (`/api/qurban/pemetaan/batch-save`) — validate-first, atomic batch write, harga_decision, version bump | ⏳ next |
| B  | UI papan pemetaan (drag-drop, harga modal, sticky save) | ⏳ next |

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

## Watch-out untuk A2 (PM1 batch-save)

- **Atomic batch write**: tambah helper `spreadsheets.values.batchUpdate`
  ke `google-sheets.ts` (mis. `batchUpdateRanges([{range, values}, ...])`)
  agar PM1 commit multiple ranges dalam 1 HTTP call. Per-row `updateRow`
  sequential = tidak atomik.
- **Cross-op consistency**: simulasikan operasi berurutan terhadap state
  in-memory yang ter-mutasi (bukan terhadap snapshot original); validate
  final state, baru tulis.
- **Bump `pemetaan_version`**: setelah batch write peserta+hewan sukses,
  tulis ulang baris edisi dengan `pemetaan_version = new Date().toISOString()`.
  Termasuk di batchUpdateRanges agar atomik dengan write data.
- **Validator `harga_decision`**: `use_existing_target` hanya valid untuk
  `swap_peserta`; move tidak boleh pakainya. `use_custom` butuh `harga_override`
  non-negatif.
- **Kapasitas guard**: `target_slot_number ∈ [1..target_hewan.kapasitas_slot]`,
  baca `kapasitas_slot` dari `qurban_daftar_hewan` (bukan refetch master).
- **PS2/PS5 race**: PM1 cek `expected_version == current` setelah re-read.
  PS2/PS5 sendiri tidak bump `pemetaan_version` (sengaja); race window di
  antaranya akan terdeteksi sebagai `409 CONFLICT_VERSION` saat PM1 re-read
  occupancy dan kondisi target sudah berubah. Pertimbangkan menambah error
  code baru `BUSINESS_PEMETAAN_INVALID` / `CONFLICT_VERSION` di `errors.ts`.
