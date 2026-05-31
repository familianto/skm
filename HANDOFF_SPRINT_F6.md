# HANDOFF — Sprint F6: Pembayaran & Rekonsiliasi Qurban

Status per milestone. Modul Qurban = **island pelengkap**; schema `transaksi`,
`kategori`, `rekening_bank` core SKM **tidak disentuh** F6.

| Milestone | Lingkup | Status |
|---|---|---|
| **A** | Fondasi `qurban_pembayaran` + auto-create saat registrasi | ✅ **Done** (PR Draft `claude/f6-pembayaran`) |
| B | Transisi status TUNAI (`TERIMA_PANITIA`/`LUNAS`) + endpoint + UI cash | ⏳ Belum |
| C | Pencocokan TRANSFER via `kode_bayar` di `transaksi.deskripsi` + rekonsiliasi | ⏳ Belum |
| D | UI pembayaran (form metode, dashboard status) + WA "pembayaran confirmed" | ⏳ Belum |

---

## Milestone A — Selesai

### Apa yang dibangun

1. **Sheet baru `qurban_pembayaran`** (workbook UTAMA, `GOOGLE_SHEETS_ID`).
   - Grain: **1 baris = 1 pendaftaran (`kode_bayar`)**, BUKAN per-slot.
   - 19 kolom (otoritatif di `migrate_F6A_pembayaran.gs` = `SHEET_HEADERS['qurban_pembayaran']`):
     `id, edisi_id, kode_bayar, muqorib_id, nominal_total, nominal_transfer,
     metode, status, tanggal_terima_panitia, panitia_terima_id, tanggal_lunas,
     bank_ref, skm_transaksi_id, bukti_url, match_metadata, notes, created_at,
     updated_at, created_by`.
   - `metode` ∈ `TRANSFER|TUNAI|VA|IMPORT_1447H`; `status` ∈
     `BELUM_BAYAR|TERIMA_PANITIA|LUNAS|BATAL`. Timestamp ISO-8601 Z.

2. **Repo** `src/lib/qurban/pembayaran-repo.ts` — pola `peserta-repo.ts`
   (COL map dari `SHEET_HEADERS`, mapper by header-index). Fungsi:
   `listPembayaranByEdisi`, `getPembayaranById`/`getPembayaranRecordById`,
   `findPembayaranByKodeBayar`/`findPembayaranRecordByKodeBayar`,
   `insertPembayaran`, `updatePembayaranAt`, + `isValidMetode`/`isValidStatus`,
   konstanta `BLOCKING_STATUSES`.

3. **Builder murni** `src/lib/qurban/pembayaran-create.ts`:
   - `resolveMetodePembayaranInput(raw)` — default `TRANSFER`, tolak VA
     ("segera hadir") / nilai tak dikenal.
   - `buildPembayaranFromPendaftaran(...)` — `nominal_total = Σ slot_harga`,
     `nominal_transfer = computeNominalTransfer(total, suffix)` (rumus suffix
     **tidak diduplikasi** — reuse `publik-nominal.ts`), `status='BELUM_BAYAR'`.

4. **ID generator** `generatePembayaranId()` (`BYR-{YYYYMMDD-WIB}-{NNNN}`) di
   `id-generator.ts` (tidak masuk `ID_PREFIXES` — itu khusus SKM-core).

5. **Audit** `src/lib/qurban/pembayaran-audit.ts` — `pembayaran.created`,
   `pembayaran.batal` (via `writeAuditLog`, `entitas='pembayaran'`).

6. **Integrasi registrasi (auto-create):**
   - **PS2** `POST /api/qurban/peserta` & **PB3** `POST /api/publik/qurban/daftar`.
   - Field body baru `metode_pembayaran` (opsional, default `TRANSFER`),
     divalidasi **sebelum** menulis (VA/invalid → `422`, tanpa peserta yatim).
   - Setelah insert peserta sukses → buat **satu** baris pembayaran
     `BELUM_BAYAR` per `kode_bayar`. Gagal insert pembayaran → request gagal
     `500` dengan pesan jelas (lihat Asumsi).

7. **PS5 cancel** (`peserta/[id]/cancel`) disesuaikan dengan invarian baru:
   - **Blokir** cancel bila pembayaran pendaftaran (resolved via `kode_bayar`)
     berstatus `TERIMA_PANITIA`/`LUNAS` → `409 BUSINESS_PEMBAYARAN_EXISTS`.
   - **Kaskade:** setelah `BATAL`, bila tak ada lagi slot `TERDAFTAR` untuk
     `kode_bayar` itu dan pembayaran masih `BELUM_BAYAR` → set pembayaran
     `BATAL` + audit + `meta.warning`. Tahan-banting bila sheet belum ada.

8. **Error code** baru `BUSINESS_PEMBAYARAN_EXISTS` (`errors.ts`).

### File dibuat / diubah

**Baru:**
- `src/lib/qurban/pembayaran-repo.ts`
- `src/lib/qurban/pembayaran-create.ts`
- `src/lib/qurban/pembayaran-audit.ts`
- `scripts/migrate_F6A_pembayaran.gs`
- `src/lib/qurban/__tests__/pembayaran-repo.test.ts`
- `src/lib/qurban/__tests__/pembayaran-create.test.ts`
- `src/lib/qurban/__tests__/pembayaran-autocreate.handler.test.ts`
- `HANDOFF_SPRINT_F6.md`

**Diubah:**
- `src/lib/constants.ts` (+`SHEET_HEADERS['qurban_pembayaran']`)
- `src/lib/qurban/sheets.ts` (+`QURBAN_SHEETS.PEMBAYARAN`)
- `src/lib/qurban/id-generator.ts` (+`generatePembayaranId`)
- `src/lib/api/errors.ts` (+`BUSINESS_PEMBAYARAN_EXISTS`)
- `src/app/api/qurban/peserta/route.ts` (PS2 auto-create)
- `src/app/api/publik/qurban/daftar/route.ts` (PB3 auto-create)
- `src/app/api/qurban/peserta/[id]/cancel/route.ts` (blokir + kaskade)
- `package.json` (3 test file baru di script `test`)
- `docs/API_REFERENCE.md`, `docs/PROJECT_BRIEF.md`

### Divergensi dari prompt

- **Kolom `peserta_id` tidak ada** (sesuai prompt — grain `kode_bayar`). Reader
  lama di `cancel/route.ts` (`countPembayaranForPeserta` yang membaca header
  `peserta_id`) **dihapus & diganti** resolusi via `kode_bayar` — bukan sekadar
  "disesuaikan". Tidak ada konsumen lain dari fungsi itu.
- **DATABASE_SCHEMA.md tidak ditambahi.** Konvensi in-repo menaruh schema sheet
  Qurban di `API_REFERENCE.md` + migrate `.gs` + `constants.ts` (sheet Qurban
  lain — `qurban_peserta` dst. — juga TIDAK ada di DATABASE_SCHEMA.md). Schema
  `qurban_pembayaran` didokumentasikan di `API_REFERENCE.md` (sesuai instruksi).
- **Validasi `metode_pembayaran` di route, bukan di validator peserta.** Dibaca
  dari raw body (bukan dari `validatePesertaCreate`/`validatePublikDaftar`) agar
  tidak mengubah kontrak validator yang sudah ada & teruji.

### Keputusan A-6 (kaskade) — DIKERJAKAN (parsial)

- ✅ **Blokir cancel** saat pembayaran `TERIMA_PANITIA`/`LUNAS` — dikerjakan.
- ✅ **Kaskade BATAL** pembayaran `BELUM_BAYAR` saat seluruh slot pendaftaran
  dibatalkan — dikerjakan (best-effort; kegagalan kaskade tidak membatalkan
  pembatalan peserta yang sudah sukses).
- ⚠️ **Recompute `nominal_total` pada cancel parsial DITUNDA** ke M-B. Alasan:
  recompute nominal saat sebagian slot dibatalkan adalah bagian dari mesin
  transisi-status pembayaran (domain M-B), butuh baca ulang suffix konfig + tulis
  ulang nominal, dan kasusnya jarang (F4c-C: 1 pendaftaran ≤ 1 ekor, satu
  `kode_bayar`). M-A menjaga ruang lingkup "fondasi + registrasi". Implikasi: jika
  3-dari-7 slot dibatalkan, `nominal_total` pembayaran (masih `BELUM_BAYAR`) tetap
  nilai awal sampai M-B; tidak ada uang yang salah dicatat karena belum dibayar.

### Asumsi penting

- **Auto-create non-transaksional.** Peserta ditulis dulu, lalu pembayaran. Bila
  insert pembayaran gagal, request mengembalikan `500` dengan pesan eksplisit,
  TAPI baris peserta **sudah** tertulis (orphan). Single-writer per masjid +
  Google Sheets tanpa transaksi → ini diterima untuk M-A. **Backfill aman**
  (buat pembayaran `BELUM_BAYAR` untuk peserta tanpa pembayaran) disiapkan di
  **M-C** bersama importer 1447H.
- `nominal_transfer` **tidak** dipakai untuk matching (suffix se-edisi,
  non-pembeda). Matching TRANSFER (M-C) bersandar pada `kode_bayar` di
  `transaksi.deskripsi`.

### Verifikasi

| Langkah | Hasil |
|---|---|
| `npm ci` | ✅ |
| `npm run type-check` (`tsc --noEmit`) | ✅ 0 error |
| `npm run lint` (`eslint`) | ✅ 0 error |
| `npm test` | ✅ **482 pass / 0 fail** (13 tes F6 baru) |
| `npm run build` | ✅ |

> Catatan baseline: prompt menyebut baseline pra-F6 = 453; pada `main` saat ini
> suite berjumlah 469, +13 tes F6 = **482**. Selisih 453→469 berasal dari sprint
> setelah angka 453 dicatat.

---

## Untuk Helper/Hopy — diputuskan sebelum Milestone B

1. **Jalankan migrasi STAGING.** `scripts/migrate_F6A_pembayaran.gs`:
   `dryRun_F6A()` → `migrate_F6A()` (F6_TARGET='STAGING') → `verify_F6A()`.
   Migrasi PRODUCTION dijalankan **segera setelah merge** (bukan post-soak).
2. **Apakah PB3 (publik) boleh memilih `TUNAI`?** Saat ini M-A menerima
   `TRANSFER`/`TUNAI` di kedua endpoint. Mungkin publik **selalu** `TRANSFER`
   (jamaah tidak di lokasi). Tentukan untuk M-D (form/validasi).
3. **Peran endpoint M-B** (`TERIMA_PANITIA`/`LUNAS`): usul
   `[SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN]` karena menyentuh keuangan (Model A:
   Bendahara catat pemasukan Kas Tunai). Konfirmasi.
4. **`skm_transaksi_id` saat `LUNAS`:** apakah transisi `LUNAS` membuat transaksi
   SKM (Model A: pemasukan Kas Tunai) langsung dari modul qurban, atau hanya
   menautkan ke transaksi yang sudah dibuat manual/import? (Menentukan apakah
   modul qurban menulis ke sheet `transaksi` — saat ini TIDAK.)
5. **WA "pembayaran confirmed":** flag `wa_send_on_pembayaran_confirmed` sudah ada
   di konfigurasi, tapi template pesannya belum. Siapkan di M-D.
