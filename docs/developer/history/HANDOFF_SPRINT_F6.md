# HANDOFF — Sprint F6: Pembayaran & Rekonsiliasi Qurban

Status per milestone. Modul Qurban = **island pelengkap**; schema `transaksi`,
`kategori`, `rekening_bank` core SKM **tidak disentuh** F6.

| Milestone | Lingkup | Status |
|---|---|---|
| **A** | Fondasi `qurban_pembayaran` + auto-create saat registrasi | ✅ **Done** (PR Draft `claude/f6-pembayaran`) |
| **B** | Transisi status TUNAI (`TERIMA_PANITIA`/`LUNAS`) + Cash Model A (PY2–PY4) | ✅ **Done** (akumulasi PR #100) |
| **C** | Rekonsiliasi TRANSFER Layer 1 (auto) + link manual + koreksi kategori (PY5/PY6) | ✅ **Done** (akumulasi PR #100) |
| **C2** | Smart-scoring Layer 2 + antrian Layer 3 (PY5 diperluas, PY7) | ✅ **Done** (akumulasi PR #100) |
| **D1** | UX registrasi: dropdown metode + layar sukses per-metode + WA pendaftaran per-metode | ✅ **Done** (akumulasi PR #100) |
| **D2** | Halaman manajemen pembayaran admin + WA "pembayaran confirmed" | ✅ **Done** (akumulasi PR #100) |
| **D3** | Triase rekonsiliasi TRANSFER (tab Rekonsiliasi + band + PY8/PY9) | ✅ **Done** — **Sprint F6 LENGKAP** |

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

## Milestone C2 — Selesai

### Apa yang dibangun

1. **Engine diperluas** (`rekonsiliasi-engine.ts`): `classifyTransaksi` kini
   mengembalikan `auto` (jumlah ∈ {`nominal_total`, `nominal_transfer`} — Q3
   "lupa suffix", `via_nominal: 'total'|'transfer'`), `suggestion_high` (kode
   cocok tapi nominal janggal + `selisih`), `anomali`, `unmatched`.
2. **Skorer Layer 2 murni** (`rekonsiliasi-scoring.ts`): `scoreTransaksi` +
   `rankKandidat` + `extractNameTokens`/`bestNameSimilarity`. Bobot suffix(+30,
   `payment_suffix` per-edisi)/keyword(+30)/nominal±1%(+25)/tanggal≤14h(+15)/
   fuzzy-nama JW≥0.8(+20)/phone(+10); ambang **≥ 50**; rank descending.
3. **Pengumpul bersama** (`rekonsiliasi-report.ts`): `buildRekonContext` (baca +
   klasifikasi, tanpa apply) + `buildSuggestionBuckets` (suggestions/anomali/
   unmatched). Dipakai PY5 & PY7.
4. **PY5 diperluas**: tetap auto-apply Layer 1 (kini termasuk lupa-suffix) +
   kembalikan `suggestions[]` berperingkat. Idempoten.
5. **PY7** `GET /rekonsiliasi/queue`: antrian READ-ONLY (`pending_auto`,
   `suggestions`, `anomali`, `unmatched`) untuk tab triase M-D — tidak menulis.

### File dibuat / diubah (C2)

**Baru:** `rekonsiliasi-scoring.ts`, `rekonsiliasi-report.ts`,
`pembayaran/rekonsiliasi/queue/route.ts`,
`__tests__/rekonsiliasi-scoring.test.ts`, `__tests__/rekonsiliasi-queue.handler.test.ts`.

**Diubah:** `rekonsiliasi-engine.ts` (reshape hasil + Q3), `rekonsiliasi/route.ts`
(PY5 pakai report + suggestions), `__tests__/rekonsiliasi-engine.test.ts` +
`__tests__/rekonsiliasi.handler.test.ts` (sesuaikan ke Q3/suggestions),
`package.json`, docs.

### Ekstraksi nama untuk fuzzy match (C2-2)

`extractNameTokens(deskripsi)`: buang token kode (`QRB-\d{4}-\d{3}`), non-alfabet
(angka/phone), dan stop-word qurban/bank (`qrb|qurban|kurban|trf|transfer|biaya|
an|bin|binti`); sisakan token ≥3 huruf. `bestNameSimilarity` ambil **JW terbaik
antar token berita × token `muqorib.nama`** (token-level, tahan urutan/atribut
bank seperti "TRF an"). Sinyal nama menyala bila JW ≥ 0.8.

### Tuning bobot

Bobot dipakai **persis** dari arsitektur (tidak ditune). Catatan: `suggestion_high`
(kode cocok) diberi `score: 100` sintetis di output agar selalu di atas kandidat
scored — kode tetap otoritatif, hanya nominal yang perlu mata manusia.

### Divergensi (C2)

- **`suggestion_high` dimasukkan ke `suggestions[]`** (bukan bucket terpisah) agar
  UI triase M-D punya satu daftar seragam; dibedakan via `reason` + `score:100`.
- **PY7 menambah `pending_auto[]`** (tak diminta eksplisit) — informasional, agar
  tab queue menunjukkan transaksi yang akan auto-lunas saat PY5 dijalankan;
  konsisten dengan sifat read-only.
- Engine sekarang **butuh nominal benar di fixture** — 2 tes lama (M-B/M-C) yang
  memakai `nominal_total` default 1.5jt ikut berubah klasifikasinya; tes
  disesuaikan ke perilaku Q3.

### Verifikasi (C2)

`npm ci` ✅ · `type-check` ✅ · `lint` ✅ · `test` ✅ **521 pass / 0 fail**
(+12 tes C2) · `build` ✅ (6 route `/api/qurban/pembayaran*` termasuk
`rekonsiliasi/queue`).

---

## Milestone D1 — Selesai (UI pertama)

### Apa yang dibangun

1. **Dropdown Metode Pembayaran** di **kedua** form daftar — publik
   (`PublikDaftarWizard.tsx`, Step 1) & admin (`PesertaForm.tsx`, Bagian 3).
   Opsi: `Transfer`, `Cash · Datang Langsung`, `Virtual Account` (disabled,
   "segera hadir"). **Wajib dipilih** (validasi klien; backend tetap default
   TRANSFER untuk back-compat). `metode_pembayaran` dikirim di body submit.
2. **Layar sukses per-metode** (publik "Pendaftaran Tercatat"):
   - TRANSFER → Kode Bayar (Salin) + Total + **Nominal transfer** (di-highlight)
     + rekening **Bank Muamalat** (Kas Tunai disaring) + peringatan berita.
   - TUNAI → Kode Bayar (Salin) + **Total** (`nominal_total`, tanpa suffix) +
     instruksi "datang ke masjid, serahkan ke panitia". Tanpa rekening/suffix.
   - Admin success card: tampilkan metode + hint singkat per-metode.
3. **WA pendaftaran per-metode** (`publik-wa-template.ts`): cabang TRANSFER
   (nominal_transfer + rekening + berita) vs TUNAI (nominal_total + datang ke
   masjid, tanpa transfer). Field `metode?` (default TRANSFER). `rekeningBlock`
   menyaring "Kas Tunai". Tetap gated `wa_send_on_pendaftaran`.
4. Backend disentuh minimal: PB3/PS2 meneruskan `metode` ke WA builder; PB3
   success payload menambah `pembayaran.metode`.

### File diubah (D1)

`src/components/qurban/PublikDaftarWizard.tsx`,
`src/components/qurban/PesertaForm.tsx`, `src/lib/qurban/publik-wa-template.ts`,
`src/app/api/publik/qurban/daftar/route.ts`,
`src/app/api/qurban/peserta/route.ts`,
`src/lib/qurban/__tests__/publik-wa-template.test.ts`, docs.

### Deskripsi layar (untuk verifikasi iPad Hopy)

- **Daftar via Transfer →** layar sukses menampilkan: kartu Kode Bayar (tombol
  Salin), kotak Total harga + **Nominal transfer** hijau-bold + catatan "3 digit
  terakhir adalah kode unik", daftar rekening Bank Muamalat (Salin per nomor),
  banner kuning "Tulis kode bayar pada berita transfer", tombol "Cek Status".
- **Daftar via Cash · Datang Langsung →** layar sukses menampilkan: kartu Kode
  Bayar (Salin), kotak **Total** (bulat, tanpa 3-digit suffix), kotak hijau
  instruksi "🕌 datang ke masjid, serahkan ke panitia, sebutkan kode bayar",
  catatan WA. **Tidak ada** rekening/nominal-transfer.

### Divergensi (D1)

- **Tidak ada unit-test render UI** (sesuai instruksi — UI diverifikasi via
  screenshot). Tes hanya untuk builder WA + logika nominal per-metode.
- **`Select` helper publik tak mendukung opsi disabled** → metode dipakai
  `<select>` native inline agar opsi VA bisa `disabled`. Konsisten visual dengan
  Select lain (kelas Tailwind sama).
- **Type narrowing**: `metodeRes.metode` (broad `MetodePembayaran` termasuk
  VA/IMPORT) dipersempit ke `'TUNAI'|'TRANSFER'` saat masuk WA builder (registrasi
  hanya menerima dua nilai itu).
- Admin success card publik-facing minim (panitia-facing), jadi hanya menambah
  label metode + hint — bukan layar instruksi pembayaran penuh (muqorib-facing
  ada di alur publik).

### Verifikasi (D1)

`npm ci` ✅ · `type-check` ✅ · `lint` ✅ · `test` ✅ **525 pass / 0 fail**
(+4 tes WA per-metode) · `build` ✅.

---

## Milestone D2 — Selesai (manajemen pembayaran admin + WA confirmed)

### Apa yang dibangun

1. **Halaman `/qurban/pembayaran`** (`page.tsx` per-edisi + client
   `PembayaranList.tsx`) + **entri sidebar "Pembayaran"** di grup QURBAN
   (`[SA,BD,AQ,PD]`). Konsumsi PY4; kolom kode_bayar/muqorib/metode/nominal/
   badge/aksi; filter status+metode+cari. **Struktur tab** disiapkan (tab
   "Daftar Pembayaran" aktif; "Rekonsiliasi" placeholder abu untuk M-D3).
2. **`PembayaranStatusBadge`** (+ helper murni `pembayaran-display.ts`):
   BELUM_BAYAR netral / TERIMA_PANITIA amber / LUNAS hijau / BATAL merah-redup.
   Dipakai di halaman Pembayaran **dan** disuntik ke **daftar Peserta**
   (`PesertaList`) per `kode_bayar` (fetch PY4 best-effort).
3. **Aksi alur TUNAI** (kondisional metode+status+peran via util murni
   `canTerimaPanitia`/`canLunaskan`):
   - **Terima Panitia** (`TerimaPanitiaModal`, PY2) — pilih panitia (GET
     `/api/qurban/panitia`), tanggal (default hari ini), bukti_url opsional.
   - **Setor ke Kas** (`ConfirmDialog`, PY3) — "Mencatat pemasukan Rp X ke Kas
     Tunai — lanjutkan?".
   - TRANSFER → tanpa tombol; badge + hint "Menunggu transfer / rekonsiliasi".
4. **WA "pembayaran confirmed"**: `buildPembayaranConfirmedMessage` +
   `notifyPembayaranLunas` (gated `wa_send_on_pembayaran_confirmed`, best-effort
   swallow+log), dipanggil dari **PY3 lunaskan** & **`applyMatch`** (TRANSFER M-C).

### File dibuat / diubah (D2)

**Baru:** `src/app/(dashboard)/qurban/pembayaran/page.tsx`,
`src/components/qurban/PembayaranList.tsx`,
`src/components/qurban/PembayaranStatusBadge.tsx`,
`src/components/qurban/TerimaPanitiaModal.tsx`,
`src/lib/qurban/pembayaran-display.ts`, `src/lib/qurban/pembayaran-notify.ts`,
`__tests__/pembayaran-display.test.ts`, `__tests__/pembayaran-notify.test.ts`.

**Diubah:** `src/components/layout/sidebar.tsx` (+entri Pembayaran),
`src/components/qurban/PesertaList.tsx` (+badge status pembayaran),
`src/lib/qurban/publik-wa-template.ts` (+confirmed builder),
`src/app/api/qurban/pembayaran/[id]/lunaskan/route.ts` +
`src/lib/qurban/rekonsiliasi-apply.ts` (wiring notify),
`__tests__/publik-wa-template.test.ts`, `package.json`, docs.

### Deskripsi layar/aksi (untuk verifikasi iPad Hopy)

- **Halaman Pembayaran** — tabel: Kode Bayar · Muqorib (+jumlah slot) · Metode ·
  Nominal (+sub "transfer Rp…" utk TRANSFER) · **badge status** (+hint TRANSFER) ·
  kolom Aksi. Filter: dropdown status, dropdown metode, kotak cari.
- **Modal Terima Panitia** (TUNAI BELUM_BAYAR) — ringkasan kode/muqorib/jumlah +
  dropdown panitia + tanggal + bukti opsional + tombol "Tandai Diterima".
  Sukses → badge jadi **Diterima Panitia** (amber).
- **Dialog Setor ke Kas** (TUNAI TERIMA_PANITIA) — konfirmasi "Mencatat pemasukan
  Rp X ke Kas Tunai". Sukses → badge **Lunas** (hijau) + transaksi PEMASUKAN
  muncul di Transaksi (Kas Tunai, kategori per-tipe) + WA confirmed (bila flag on).
- **Daftar Peserta** — badge status pembayaran muncul di bawah kode_bayar.

### Divergensi (D2)

- **Badge dasar repo (`ui/badge.tsx`) tidak diperluas** — varian status
  pembayaran ditaruh di helper qurban (`pembayaran-display.ts`) + komponen tipis
  `PembayaranStatusBadge`, agar tak mengubah enum badge global SKM-core.
- **Status pembayaran di Peserta = fetch terpisah PY4** (peserta row tak memuat
  status pembayaran). Best-effort: bila PY4 gagal, kolom badge sekadar kosong —
  list peserta tetap jalan.
- **`panitia_terima_id`** diisi dari daftar panitia edisi (anggota_id). Bila
  daftar gagal dimuat, dropdown kosong (BD bisa retry) — tak ada free-text agar
  id valid.
- Tidak ada unit-test render UI (verifikasi via screenshot); tes = builder WA +
  notify gating + util visibility/filters.

### Verifikasi (D2)

`npm ci` ✅ · `type-check` ✅ · `lint` ✅ · `test` ✅ **537 pass / 0 fail**
(+12 tes D2) · `build` ✅ (halaman `/qurban/pembayaran` terdaftar).

---

## Milestone D3 — Selesai (triase rekonsiliasi — PENUTUP F6)

### Apa yang dibangun

1. **Band-filter code-less** (`rekonsiliasi-band.ts`): `QURBAN_RECON_BAND_MIN
   3.000.000` / `QURBAN_RECON_BAND_MAX 40.000.000` + `isWithinReconBand`.
   Diterapkan di `buildSuggestionBuckets` (`rekonsiliasi-report.ts`) **hanya pada
   jalur code-less** (engine `unmatched` tanpa kode) — di luar band di-skip dari
   antrian. **Layer 1 (kode_bayar) & suggestion_high (ber-kode) tidak dibatasi
   band.** Dipakai PY5 & PY7 sekaligus.
2. **Tab "Rekonsiliasi"** (`RekonsiliasiTab.tsx`) di `/qurban/pembayaran` —
   diaktifkan untuk `[SA,BD]` (peran lain lihat label abu). Isi: Jalankan
   Auto-match (PY5); antrian (PY7) berkelompok **Kecocokan Kuat** (pending_auto →
   Terapkan/PY6), **Saran** (skor Layer 2 + rincian sinyal → Konfirmasi/PY6),
   **Tak Cocok** (unmatched → Taut Manual/PY6), **Anomali** (info); **Resolusi
   Kategori** (mixed → PY9); **Cari Transaksi…** (PY8) untuk taut di luar band.
3. **PY8** `GET /rekonsiliasi/cari-transaksi` — cari transaksi MASUK belum
   ter-link **tanpa band** (untuk taut manual transfer kecil/Bawa Sendiri).
4. **PY9** `POST /[id]/resolve-kategori` — panitia pilih kategori untuk transaksi
   TRANSFER ber-flag `mixed`; koreksi via `correctTransaksiKategori` + turunkan
   flag (`kategori_resolved:true`); audit `pembayaran.kategori_resolved`.
5. Helper `isMixedKategoriUnresolved` (`pembayaran-display.ts`) + badge reuse.

### File dibuat / diubah (D3)

**Baru:** `src/lib/qurban/rekonsiliasi-band.ts`,
`src/components/qurban/RekonsiliasiTab.tsx`,
`src/app/api/qurban/pembayaran/rekonsiliasi/cari-transaksi/route.ts` (PY8),
`src/app/api/qurban/pembayaran/[id]/resolve-kategori/route.ts` (PY9),
`__tests__/rekonsiliasi-band.test.ts`.

**Diubah:** `rekonsiliasi-report.ts` (band di code-less),
`pembayaran-display.ts` (+`isMixedKategoriUnresolved`),
`PembayaranList.tsx` (tab Rekonsiliasi aktif), `__tests__/pembayaran-display.test.ts`,
`__tests__/rekonsiliasi-queue.handler.test.ts` + `__tests__/rekonsiliasi.handler.test.ts`
(fixture dinaikkan ke dalam band), `package.json`, docs.

### Deskripsi layar/aksi (untuk verifikasi iPad Hopy)

- **Tab Rekonsiliasi** (buka di `/qurban/pembayaran` sebagai BD/SA): tombol
  **Jalankan Auto-match** kanan-atas → toast "N pembayaran TRANSFER otomatis
  LUNAS". Di bawahnya kartu berkelompok:
  - **Kecocokan Kuat** — baris `TRX → kode`, tombol **Terapkan**.
  - **Saran** — berita transaksi + kandidat (kode/muqorib + **skor** + rincian
    sinyal), tombol **Konfirmasi**.
  - **Tak Cocok** — berita + nominal, tombol **Taut Manual** (modal pilih
    pembayaran TRANSFER belum bayar).
  - **Anomali** — info kode + alasan.
  - **Perlu Resolusi Kategori** (bila ada mixed) — kartu amber, tombol **Pilih
    Kategori** (modal dropdown kategori qurban).
  - **Cari Transaksi…** — modal cari transaksi di luar band (PY8) → pilih → taut.
- **Verifikasi:** (a) transfer dummy ber-kode di transaksi → Auto-match →
  pembayaran LUNAS + transaksi kategori terkoreksi; (b) transfer dalam-band tanpa
  kode → muncul Saran → Konfirmasi → LUNAS; (c) transfer di luar band (250rb)
  via Cari Transaksi → Taut Manual; (d) transaksi mixed → Pilih Kategori.

### Divergensi (D3)

- **Band hanya men-skip jalur code-less** di `buildSuggestionBuckets` (sesuai
  spec) — bukan di seleksi awal `listTransaksiMasukByRekening`, agar Layer 1
  (kode) & suggestion_high tetap lolos tanpa band. Dilaporkan: titik penyisipan =
  cabang `unmatched`-no-kode di report builder.
- **PY8 endpoint baru** (tak eksplisit diminta) dibutuhkan untuk "pencarian
  manual di luar band" — antrian dibatasi band, pencarian tidak.
- **PY9 endpoint baru** untuk resolusi mixed (kategori dipilih panitia; tak
  auto-tebak), koreksi via jalur kanonik existing.
- Kontrak PY5/PY6/PY7 **tidak diubah** (hanya perilaku internal report builder
  yang kini band-aware — berlaku ke PY5 & PY7).
- 2 fixture tes lama (queue + rekon handler) nominalnya dinaikkan ke dalam band
  agar tetap relevan; tak ada perubahan perilaku yang di-loosen.

### Verifikasi (D3)

`npm ci` ✅ · `type-check` ✅ · `lint` ✅ · `test` ✅ **543 pass / 0 fail**
(+6 tes D3) · `build` ✅ (8 route `/api/qurban/pembayaran*` + halaman).

---

## Hotfix D3 — Rekening bank rekonsiliasi DINAMIS (no-hardcode)

**Bug (verifikasi iPad staging):** tab Rekonsiliasi error merah & seluruh UI tak
tampil — `Rekening "Bank Muamalat Indonesia" tidak ditemukan` (staging pakai
"Bank Dummy Syariah"). Nama bank produksi **di-hardcode** di jalur rekonsiliasi
→ kelas bug yang sama dengan Sheet-ID hardcode `migrate_F01`.

**Hardcode yang dihapus:**
- `rekonsiliasi-report.ts` `buildRekonContext` → `resolveRekeningByNama(REKENING_BANK_MUAMALAT)`.
- `cari-transaksi/route.ts` (PY8) → `resolveRekeningByNama(REKENING_BANK_MUAMALAT)`.
- Konstanta `REKENING_BANK_MUAMALAT` di `skm-bridge.ts` **dihapus** (tak ada lagi
  nama bank produksi di kode). UI copy "Bank Muamalat" → "transfer bank masuk".

**Resolusi dinamis baru** (`skm-bridge.ts`):
- `listBankRekeningIds()` — id SEMUA `rekening_bank` aktif **minus Kas Tunai**
  (sumber sama dengan blok transfer WA publik). Kas Tunai dikecualikan via SATU
  konstanta `REKENING_KAS_TUNAI` (cocok `nama_bank` ATAU `atas_nama`); rekening
  `is_active=FALSE` di-skip. **>1 rekening bank → dipindai semua.**
- `listTransaksiMasukByRekeningIds(ids[])` — scan MASUK/AKTIF lintas rekening;
  `[]` bila tak ada → caller degradasi anggun.
- `RekonContext.rekeningId` → `rekeningIds: string[]`; PY5/PY7 `meta.filters_applied`
  kini `rekening_ids`.

**Degradasi anggun:** backend tak lagi throw (return `[]`). UI tab tetap render
penuh (Auto-match + grup antrian + Cari Transaksi); bila tak ada rekening bank →
notice "Belum ada rekening bank untuk dipindai" (baca `meta.rekening_ids.length`).

**Prinsip ditegakkan:** TIDAK ada identifier produksi (nama rekening/bank, Sheet
ID) di-hardcode. Rekening tujuan transfer selalu di-resolve dinamis dari sheet.

**Tes:** fixture recon di-rename ke "Bank Dummy Syariah" (buktikan tak bergantung
nama) + `listBankRekeningIds`/`listTransaksiMasukByRekeningIds` (dinamis, Kas
Tunai via nama/atas_nama, inactive skip, empty → `[]`). **547 pass / 0 fail**
(+4) · type-check/lint/build ✅.

---

## Sprint F6 — LENGKAP

End-to-end: registrasi (metode) → auto-create BELUM_BAYAR → TUNAI
(terima-panitia → setor Kas Model A) / TRANSFER (rekonsiliasi auto Layer 1 +
smart-scoring Layer 2 + triase manual) → LUNAS + WA confirmed + koreksi kategori
ledger. Total **547 tes** hijau. Menunggu verifikasi iPad Hopy → flip PR #100
ke Ready → merge → migrasi PRODUCTION `migrate_F6A_pembayaran.gs`.

---

## Untuk Helper/Hopy — sebelum merge F6

0. **Verifikasi D1/D2 (Hopy, iPad Safari, preview Vercel):**
   - D1: daftar via Transfer → layar sukses transfer; daftar via Cash → layar
     sukses cash. (Smart Punctuation OFF bila menempel kode bayar.)
   - D2: buka **Pembayaran**; pendaftaran TUNAI → **Terima Panitia** → badge
     Diterima Panitia → **Setor ke Kas** → badge Lunas + transaksi PEMASUKAN
     muncul di Transaksi (Kas Tunai, kategori per-tipe) + WA confirmed (flag on).
     Cek badge status di halaman Peserta.
   - D3: tab **Rekonsiliasi** (BD/SA) → Jalankan Auto-match; (a) transfer dummy
     ber-kode → LUNAS; (b) transfer dalam-band tanpa kode → Saran → Konfirmasi;
     (c) transfer di luar band (250rb) → Cari Transaksi → Taut Manual; (d) bila
     ada transaksi mixed → Pilih Kategori. *Catatan: uji code-less penuh butuh
     edisi staging berharga-produksi; edisi 150rb sekarang hanya Layer 1 relevan.*
1. **Migrasi:** kolom lengkap sejak M-A; seluruh B–D3 tanpa migrasi baru.
   PRODUCTION jalankan `migrate_F6A_pembayaran.gs` **segera setelah merge** PR #100.
2. **Method PY2/PY3/PY5/PY6/PY7: POST/GET** (ikut konvensi in-repo) vs PATCH
   (prompt). Konfirmasi sebelum UI M-D (memengaruhi pemanggilan fetch).
3. **Antrian Layer 3 = in-memory, BUKAN persist.** PY7 menghitung ulang saat
   dibuka (tak ada sheet antrian). Konfirmasi ini cukup untuk M-D, atau perlu
   persist status triase (mis. "ditunda"/"diabaikan") di sheet?
4. **Ambang & bobot scoring:** ambang ≥50 + bobot dari arsitektur (belum ditune
   dgn data nyata). Setelah M-D dipakai, tuning mungkin perlu. Konfirmasi apakah
   bobot/ambang harus configurable (mis. di konfigurasi edisi).
5. **`suggestion_high` (kode cocok, nominal janggal):** apakah perlu ambang auto
   toleransi (mis. selisih ≤ suffix → auto) atau biarkan selalu manual (sekarang
   manual via PY6).
6. **Campur-kategori pasca-pemetaan:** PY3 menolak; PY5/PY6 `LUNAS` + flag
   `mixed`. UX M-D: tombol "set kategori manual" pada transaksi ber-flag, atau
   larang Pemetaan lintas-jenis bila sudah ada pembayaran.
7. **WA "pembayaran confirmed":** flag `wa_send_on_pembayaran_confirmed` ada;
   template belum. Kirim saat `LUNAS` (TUNAI & TRANSFER) di M-D.
8. **Drift bridge SKM-core:** create (M-B) & update-kategori (M-C) transaksi
   mereplikasi route inti (tak ada service reusable). Putuskan apakah refactor
   route `transaksi` → service bersama (di luar F6) sebelum island makin banyak
   menulis ke ledger.
9. **Scope M-D (UI):** halaman/tab Pembayaran, badge status, dropdown metode di
   form daftar, layar sukses per metode, template WA confirmed, UI triase
   rekonsiliasi (konsumsi PY7 + konfirmasi via PY6) + resolusi kategori manual
   untuk transaksi ber-flag `mixed`.
