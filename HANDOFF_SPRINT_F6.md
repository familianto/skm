# HANDOFF — Sprint F6: Pembayaran & Rekonsiliasi Qurban

Status per milestone. Modul Qurban = **island pelengkap**; schema `transaksi`,
`kategori`, `rekening_bank` core SKM **tidak disentuh** F6.

| Milestone | Lingkup | Status |
|---|---|---|
| **A** | Fondasi `qurban_pembayaran` + auto-create saat registrasi | ✅ **Done** (PR Draft `claude/f6-pembayaran`) |
| **B** | Transisi status TUNAI (`TERIMA_PANITIA`/`LUNAS`) + Cash Model A (PY2–PY4) | ✅ **Done** (akumulasi PR #100) |
| **C** | Rekonsiliasi TRANSFER Layer 1 (auto) + link manual + koreksi kategori (PY5/PY6) | ✅ **Done** (akumulasi PR #100) |
| C2 | Smart-scoring Layer 2 + antrian Layer 3 | ⏳ Belum |
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

## Milestone B — Selesai

### Apa yang dibangun

1. **Jembatan island→ledger** `src/lib/qurban/skm-bridge.ts`:
   - `kategoriNamaForTipe` / `decideKategoriNama` (pure): map (jenisHewan,
     tipePembelian) → nama kategori; deteksi campur-kategori.
   - `resolveKategoriIdByNama` / `resolveKategoriQurbanByTipe` /
     `resolveRekeningByNama`: resolve id by-NAMA persis (kategori `MASUK`,
     rekening `Kas Tunai`); **throw** bila tak ketemu.
   - `createTransaksiPemasukanQurban(...)`: tulis transaksi `MASUK`/`AKTIF` via
     jalur kanonik SKM (`getNextId('TRX')` → append berlayout
     `SHEET_HEADERS.transaksi` → `logAudit`). Tanggal divalidasi `YYYY-MM-DD`.

2. **PY2** `POST /api/qurban/pembayaran/[id]/terima-panitia` — TUNAI
   `BELUM_BAYAR → TERIMA_PANITIA`. Roles `[SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN,
   PENDAFTARAN]`.

3. **PY3** `POST /api/qurban/pembayaran/[id]/lunaskan` — TUNAI Model A
   `TERIMA_PANITIA → LUNAS`. Roles `[SUPER_ADMIN, BENDAHARA]`. Transaksi-first
   (Kas Tunai, `jumlah = nominal_total`), lalu link `skm_transaksi_id`.
   Idempotensi: tolak bila bukan `TERIMA_PANITIA` atau `skm_transaksi_id` terisi.

4. **PY4** `GET /api/qurban/pembayaran` — list + filter (`status`/`metode`/
   `panitia_terima_id`) + enrichment (`muqorib_nama`, `jumlah_slot`). Roles semua
   peran qurban.

5. **Audit** `pembayaran.terima_panitia`, `pembayaran.lunas`
   (`pembayaran-audit.ts`).

6. **B-6** kaskade cancel parsial di `cancel/route.ts`: pembayaran `BELUM_BAYAR`
   di-**recompute** (`nominal_total` = Σ harga slot tersisa, `nominal_transfer`
   = total + suffix) bila masih ada slot; di-`BATAL` bila habis (lanjutan A-6).

7. Error code baru `BUSINESS_PEMBAYARAN_MIXED_KATEGORI`.

### File dibuat / diubah (M-B)

**Baru:** `src/lib/qurban/skm-bridge.ts`,
`src/app/api/qurban/pembayaran/route.ts`,
`src/app/api/qurban/pembayaran/[id]/terima-panitia/route.ts`,
`src/app/api/qurban/pembayaran/[id]/lunaskan/route.ts`,
`src/lib/qurban/__tests__/skm-bridge.test.ts`,
`src/lib/qurban/__tests__/pembayaran-status.handler.test.ts`.

**Diubah:** `pembayaran-audit.ts` (+2 emitter), `errors.ts` (+1 code),
`cancel/route.ts` (B-6 recompute), `package.json` (2 test), docs.

### Divergensi dari prompt (M-B)

- **Method = POST, bukan PATCH.** Prompt menulis `PATCH` untuk PY2/PY3; konvensi
  in-repo untuk endpoint aksi Qurban (`/cancel`, `/activate`, `/close`,
  `/refresh-harga`, `/deactivate`) **semua POST**. Saya ikut in-repo (POST) demi
  konsistensi. Bila Anda mau PATCH, mudah diubah.
- **B-2 jalur transaksi: BUILD helper minimal di island (bukan reuse).** Di repo
  TIDAK ada service pembuat-transaksi yang reusable — logika create di-INLINE di
  handler `POST /api/transaksi`. `createTransaksiPemasukanQurban` **mereplikasi
  urutan kanonik itu persis** (`getNextId('TRX')` + append layout
  `SHEET_HEADERS.transaksi` + `logAudit`), menghasilkan baris tak terbedakan dari
  transaksi manual. Saya TIDAK refactor route inti (hindari risiko SKM-core);
  konsekuensinya ada sedikit duplikasi sequence — kandidat refactor SKM-core
  terpisah bila diinginkan.
- **PY4 izinkan DISTRIBUSI (read), tapi `getCanAccess` TIDAK** memberi DISTRIBUSI
  path `/qurban/pembayaran/**` (hanya `/qurban/distribusi/**` + `/laporan/**`).
  API guard (requireRole) independen dari allowlist path; saya ikuti spesifikasi
  PY4 (DISTRIBUSI boleh baca). **Perlu diputuskan:** selaraskan `permissions.ts`
  (tambah path utk DISTRIBUSI) atau cabut DISTRIBUSI dari PY4. Peran lain
  (PY2/PY3) konsisten dengan allowlist.
- **Campur-tipe (B-4): kasus NYATA tapi jarang.** Satu pendaftaran dibuat dengan
  satu `master_hewan_id`+`tipe` (PS2/PB3), jadi awalnya selalu seragam. **Namun
  Pemetaan F5b (drag-drop) bisa memindah satu slot ke hewan jenis lain** →
  `kode_bayar` bisa lintas-kategori. PY3 menanganinya defensif:
  `409 BUSINESS_PEMBAYARAN_MIXED_KATEGORI` + tandai `notes`, TANPA auto-create.
  Penanganan manual/UI menyusul (M-D).

### Asumsi (M-B)

- **PY3 non-atomik (transaksi-first).** Bila update pembayaran gagal setelah
  transaksi terbuat → `500` LOUD dengan `skm_transaksi_id`; operator JANGAN
  ulangi. Pass rekonsiliasi M-C = jaring (deteksi transaksi ber-`kode_bayar` yang
  pembayarannya belum `LUNAS`).
- **Cash bayar nominal BULAT** = `nominal_total` (tanpa suffix); suffix hanya
  disambiguasi TRANSFER (sebab itu 2 kolom disimpan).

### Verifikasi (M-B)

`npm ci` ✅ · `type-check` ✅ · `lint` ✅ · `test` ✅ **497 pass / 0 fail**
(+15 tes B: 482→497) · `build` ✅ (3 route `/api/qurban/pembayaran*` terdaftar).

---

## Milestone C — Selesai

### Apa yang dibangun

1. **C-0 koreksi peran:** PY2 → `[SA, AQ, PD]` (hapus BD); PY4 → `[SA, BD, AQ, PD]`
   (hapus DISTRIBUSI); PY3 tetap `[SA, BD]`.
2. **Engine murni** `src/lib/qurban/rekonsiliasi-engine.ts`: `extractKodeBayar`
   (regex `QRB-\d{4}-\d{3}`), `classifyTransaksi` (auto / anomali / unmatched),
   `indexPembayaranByKode`.
3. **Bridge read+update** (`skm-bridge.ts`): `listTransaksiMasukByRekening`,
   `getTransaksiLiteById`, **`correctTransaksiKategori`** (UPDATE kanonik SKM +
   audit), const `REKENING_BANK_MUAMALAT`.
4. **Apply bersama** `src/lib/qurban/rekonsiliasi-apply.ts`:
   `resolveKodeBayarKategori` (slot→kategori, null bila campur tak-resolusi) +
   **`applyMatch`** (gate dobel → koreksi kategori → LUNAS + link + `bank_ref` +
   `match_metadata` → audit).
5. **PY5** `POST /api/qurban/pembayaran/rekonsiliasi` (Layer 1 auto, idempoten,
   baca Bank Muamalat MASUK/AKTIF belum ter-link).
6. **PY6** `POST /api/qurban/pembayaran/[id]/link-transaksi` (link manual; nominal
   beda diizinkan + selisih di `match_metadata`).
7. **Audit** `pembayaran.lunas_via_rekonsiliasi`.

### File dibuat / diubah (M-C)

**Baru:** `rekonsiliasi-engine.ts`, `rekonsiliasi-apply.ts`,
`pembayaran/rekonsiliasi/route.ts`, `pembayaran/[id]/link-transaksi/route.ts`,
`__tests__/rekonsiliasi-engine.test.ts`, `__tests__/rekonsiliasi.handler.test.ts`.

**Diubah:** `skm-bridge.ts` (+read/update transaksi), `pembayaran-audit.ts`
(+1 emitter), `terima-panitia/route.ts` + `pembayaran/route.ts` (C-0 peran),
`pembayaran-status.handler.test.ts` (sesuaikan 2 tes ke peran C-0), `package.json`,
docs.

### Divergensi & keputusan (M-C)

- **Jalur update-transaksi: MIRROR, bukan reuse** — sama seperti bridge create di
  M-B. Route `PUT /api/transaksi/[id]` meng-inline logika update; tak ada service
  reusable. `correctTransaksiKategori` mereplikasi pola itu setia (getRowById →
  updateRow full-layout → `logAudit(UPDATE)`), hanya mengubah kolom `kategori_id`
  + `updated_at`. Schema tak disentuh. **Drift dicatat** (kandidat refactor
  SKM-core terpisah).
- **Campur-tipe pada rekonsiliasi:** TIDAK koreksi kategori (mungkin >1 kategori
  benar), set flag `mixed` di `match_metadata`, **tetap** set `LUNAS` (uang sudah
  masuk). Review kategori manual di UI (M-D).
- **Engine memakai SELURUH pembayaran edisi** (bukan hanya BELUM_BAYAR) agar bisa
  membedakan anomali (sudah LUNAS / metode TUNAI) dari unmatched.
- **Idempotensi** lewat exclude transaksi yang `id`-nya sudah ada di
  `skm_transaksi_id` pembayaran mana pun + gate re-baca di `applyMatch`.

### Peran final vs `permissions.ts`

`getCanAccess` memberi `/qurban/pembayaran/**` ke BENDAHARA & PENDAFTARAN
(+ AQ via `/qurban/**`, SA via `**`). API guard per-endpoint kini:

| Endpoint | Roles API | Catatan vs allowlist |
|---|---|---|
| PY2 terima-panitia | SA, AQ, PD | ✅ subset allowlist |
| PY3 lunaskan | SA, BD | ✅ |
| PY4 list | SA, BD, AQ, PD | ✅ (DISTRIBUSI sudah dicabut — kini konsisten) |
| PY5 rekonsiliasi | SA, BD | ✅ |
| PY6 link-transaksi | SA, BD | ✅ |

Tidak perlu ubah `permissions.ts` (allowlist path = superset; pembatasan ketat di API).

### Verifikasi (M-C)

`npm ci` ✅ · `type-check` ✅ · `lint` ✅ · `test` ✅ **509 pass / 0 fail**
(+12 tes C; 2 tes M-B disesuaikan ke peran C-0) · `build` ✅ (5 route
`/api/qurban/pembayaran*` termasuk `rekonsiliasi` + `link-transaksi`).

---

## Untuk Helper/Hopy — diputuskan sebelum C2 / M-D

1. **Migrasi:** kolom lengkap sejak M-A; B & C tanpa migrasi baru. PRODUCTION
   jalankan `migrate_F6A_pembayaran.gs` **segera setelah merge** PR #100.
2. **Method PY2/PY3/PY5/PY6: POST** (ikut konvensi in-repo) vs PATCH (prompt).
   Konfirmasi sebelum UI M-D (memengaruhi pemanggilan fetch).
3. **Anomali rekonsiliasi → Layer 3 (C2):** PY5 saat ini hanya *melaporkan*
   `anomali`/`unmatched` (tanpa antrian persist). C2 perlu antrian + smart-scoring
   (Jaro-Winkler nama, toleransi nominal) + UI triase. Konfirmasi scope C2.
4. **Campur-kategori pasca-pemetaan:** PY3 menolak (`MIXED_KATEGORI`); PY5/PY6
   tetap `LUNAS` + flag `mixed`. UX M-D: tombol "set kategori manual" pada
   transaksi ber-flag, atau larang Pemetaan lintas-jenis bila sudah ada pembayaran.
5. **Toleransi nominal-beda TRANSFER:** PY5 menandai anomali (tak auto); BD pakai
   PY6 (link manual, selisih dicatat). Konfirmasi perlu/tidaknya ambang auto
   (mis. selisih ≤ suffix) di C2.
6. **WA "pembayaran confirmed":** flag `wa_send_on_pembayaran_confirmed` ada;
   template belum. Kirim saat `LUNAS` (TUNAI & TRANSFER) di M-D.
7. **Drift bridge SKM-core:** create (M-B) & update-kategori (M-C) transaksi
   mereplikasi route inti (tak ada service reusable). Putuskan apakah refactor
   route `transaksi` → service bersama (di luar F6) sebelum island makin banyak
   menulis ke ledger.
