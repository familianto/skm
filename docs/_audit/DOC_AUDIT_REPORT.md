# SKM — Docs Audit Report (Tahap A: Discovery & Gap Report)

> **Status:** Read-only discovery. Tidak ada dokumentasi yang diubah, dipindah,
> atau dihapus pada tahap ini. Output Tahap A hanya berkas laporan ini.
> **Tanggal audit:** 2026-06-14 · **Branch:** `claude/docs-audit-tahap-a-mi4sc5`
> **Sumber kebenaran:** isi repo (kode menang atas ringkasan/dok).

---

## 1. Ringkasan Eksekutif

Repo SKM punya **dokumentasi yang banyak dan rajin ditulis**, tetapi tercampur
antara tiga audiens (adopter, developer, internal-history) tanpa pemisahan, dan
beberapa berkas inti sudah **tertinggal dari kode**. Tiga divergensi besar:
(1) **autentikasi** sebenarnya **PIN-based** (bcryptjs + JWT cookie `skm_session`
via `jose`) — **bukan** NextAuth/Gmail SSO seperti yang tersirat di `.env.example`,
`CLAUDE.md`, dan `SETUP_GUIDE.md`; (2) **testing** memakai Node test runner
(`tsx --test`), **bukan Jest**; (3) **modul Qurban** (9 sheet, ~70 endpoint,
spreadsheet kedua `GOOGLE_SHEETS_QURBAN_ID`) **tidak terdokumentasi** di
`DATABASE_SCHEMA.md`. Berkas paling kritis untuk adopter — `.env.example` dan
`SETUP_GUIDE.md` — **menyesatkan**: mendaftarkan env var yang tidak dipakai
(`GOOGLE_CLIENT_ID`, `NEXTAUTH_*`, `PIN_SALT`) dan **menghilangkan** belasan env
var yang wajib (`GOOGLE_SHEETS_QURBAN_ID`, `SESSION_SECRET`, `QURBAN_*`, dll).
`DATABASE_SCHEMA.md` hanya memuat 7 dari 19 sheet. Sebaliknya, `README.md`,
`ARCHITECTURE.md`, `CONVENTIONS.md`, `BANK_TEMPLATES.md`, dan `API_REFERENCE.md`
tergolong **akurat/terkini**. Selain itu ada **duplikasi sprint logs** (root
`HANDOFF_SPRINT0X.md` ↔ `docs/sprints/SPRINT_N.md`) dan **overlap desain↔referensi**
(`HANDOFF_TAHAP_3E_API_ENDPOINTS.md` ↔ `API_REFERENCE.md`). Kesimpulan: bukan
"tulis dari nol", melainkan **rekonsiliasi + restrukturisasi** — perbaiki berkas
setup/skema yang stale, lalu pisahkan adopter/developer/history.

---

## 2. Fakta Kode (Ground Truth — pembanding)

Dikumpulkan langsung dari repo, dipakai sebagai patokan menilai dok.

| Area | Kondisi nyata di kode |
|---|---|
| Framework | **Next.js 16.2.1**, React 19.2.4, TypeScript 5, Tailwind 4 (App Router) |
| Testing | **Node test runner** via `tsx --test` (`npm test`); **tidak ada Jest** di deps/CI |
| DB | Google Sheets (`googleapis` 171). Akses inti via `src/lib/google-sheets.ts` |
| **2 spreadsheet** | `GOOGLE_SHEETS_ID` (keuangan inti) **+** `GOOGLE_SHEETS_QURBAN_ID` (Qurban, service read-only di `src/lib/qurban-sheets.ts`) |
| **Auth** | **PIN-based**: `bcryptjs` (hash PIN) + `jose` (JWT di cookie httpOnly `skm_session`). **Tidak ada `next-auth`**, tidak ada Google OAuth/Gmail SSO. Secret: `SESSION_SECRET` (utama) / `AUTH_SECRET` (fallback). Role-guard di `src/middleware.ts` |
| Roles (`UserPeran`) | 7 nilai: `BENDAHARA`, `PENGURUS`, `VIEWER` (legacy) + `SUPER_ADMIN`, `ADMIN_QURBAN`, `PENDAFTARAN`, `DISTRIBUSI` (F01) |
| Charts/PDF/Excel/CSV | recharts · jspdf(+autotable) · exceljs · papaparse · @dnd-kit · zod |
| Sheet inti (10) | `master`, `transaksi`, `kategori`, `rekening_bank`, `audit_log`, `anggota`, `rekonsiliasi`, `donatur`, `reminder_log`, `kelompok` |
| Sheet Qurban (9) | `qurban_edisi`, `qurban_konfigurasi_edisi`, `qurban_panitia`, `qurban_muqorib`, `qurban_master_hewan`, `qurban_daftar_hewan`, `qurban_peserta`, `qurban_pembayaran`, `qurban_bagian_kanonik` |
| API route handlers | **~95** `route.ts` di `src/app/api/` (inti keuangan + tree `qurban/*` + `publik/*`) |
| Halaman | dashboard (`(dashboard)/*`), `login`, dan publik (`publik/qurban/*` termasuk `tv`, `cek-status`, `daftar`) |
| Scripts | `scripts/seed.ts` (`npm run seed`), migrasi Apps Script `scripts/*.gs` (F03, F4a, F5a, F5b, F6A), `migrasi-mutasi*`, `migrate-mutasi-petty-cash.ts` |
| CI | `.github/workflows/ci.yml` → lint, type-check, `npm test`, build · `preview-test.yml` |

### Env var: dipakai vs didokumentasikan

**Dipakai di kode** (`process.env.*`):
`GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
`GOOGLE_SHEETS_QURBAN_ID`, `SESSION_SECRET`, `AUTH_SECRET`, `FONNTE_API_TOKEN`,
`FONNTE_MOCK`, `DARI_REKENING_ID`, `KE_REKENING_ID`, `NEXT_PUBLIC_MASJID_NAME`,
`QURBAN_MODULE_ENABLED`, `QURBAN_LEGACY_LOGIN_ENABLED`, `QURBAN_PANITIA_HP`,
`QURBAN_PAYMENT_ACCOUNT_HOLDER`, `QURBAN_PAYMENT_ACCOUNT_NUMBER`,
`QURBAN_PAYMENT_BANK_NAME`, `NODE_ENV`.

**Ada di `.env.example` tapi TIDAK dipakai kode (hapus/usang):**
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
`PIN_SALT`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`.

**Dipakai kode tapi HILANG dari `.env.example` (paling berisiko bagi adopter):**
`GOOGLE_SHEETS_QURBAN_ID`, `SESSION_SECRET`, `FONNTE_MOCK`, `DARI_REKENING_ID`,
`KE_REKENING_ID`, `NEXT_PUBLIC_MASJID_NAME`, dan semua flag `QURBAN_*`.

---

## 3. Tabel Inventaris Dokumentasi

Status: **CURRENT** (cocok kode) · **STALE** (bertentangan kode) ·
**PARTIAL** (benar tapi tak lengkap) · **DUPLICATE/OVERLAP** ·
**HISTORY** (arsip jejak pengembangan, dinilai per-relevansi bukan per-akurasi).

### 3.1 Root-level

| Path | Audiens | Status | Catatan |
|---|---|---|---|
| `README.md` | adopter+dev | **CURRENT** | Next.js 16, "Auth PIN-based (bcrypt + JWT)" benar. Landing page yang baik. |
| `CLAUDE.md` | dev (instruksi) | **STALE** | Tech stack tulis **Jest**; daftar role hanya 3 (BENDAHARA/PENGURUS/VIEWER); env block mencantumkan `GOOGLE_CLIENT_ID/SECRET` + `NEXTAUTH_*` + `PIN_SALT`. "Database Schema KRITIS" menunjuk `DATABASE_SCHEMA.md` yang justru tak lengkap. |
| `.env.example` | adopter | **STALE** | Lihat §2: cantumkan var usang, hilangkan var wajib. Akar banyak kegagalan setup adopter. |
| `HANDOFF_CURRENCY_INPUT.md` | internal-history | HISTORY | Fitur input ribuan (CurrencyInput). |
| `HANDOFF_IMPORT_DATA.md` | internal-history | HISTORY | Import CSV bank + auto-kategorisasi. Overlap konsep dgn `BANK_TEMPLATES.md`. |
| `HANDOFF_SPRINT01..09.md` (9) | internal-history | DUPLICATE | Isi sprint 1–9; **berduplikasi** dgn `docs/sprints/SPRINT_0..6.md`. |
| `HANDOFF_SPRINT_F01..F6.md` (10) | internal-history | HISTORY | Jejak modul Qurban (F01 auth, F02 edisi, F03 master, F4*, F5*, F6 pembayaran). F01 & F02 sangat detail. |
| `PROMPT_F01_AuthMultiUser.md` | internal-history | HISTORY | Spec/prompt pra-implementasi F01. |

### 3.2 `docs/`

| Path | Audiens | Status | Catatan |
|---|---|---|---|
| `docs/PROJECT_BRIEF.md` | dev | **STALE** (sebagian) | Tabel stack tulis **Jest** & **Chart.js/Recharts** (Chart.js tak dipakai). Ringkasan sheet tak memuat seluruh 9 sheet Qurban. Konten auth/CRUD F01 akurat. |
| `docs/ARCHITECTURE.md` | dev | **CURRENT** | Rantai middleware→API→`google-sheets.ts` benar; auth dijelaskan PIN+bcrypt (bukan NextAuth). Gap: belum ada role-gate F01 & layering Qurban (workbook ke-2). |
| `docs/API_REFERENCE.md` | dev | **PARTIAL** (mostly current) | Mencakup endpoint inti **dan** tree Qurban (edisi, muqorib, master/daftar hewan, peserta, pembayaran, pemetaan, publik). Gap: dua format envelope (legacy `{success}` vs F01+ `{ok}`) tak diringkas di depan. Overlap dgn `HANDOFF_TAHAP_3E`. |
| `docs/DATABASE_SCHEMA.md` | dev | **STALE/PARTIAL** | Hanya 7 sheet (master, transaksi, kategori, rekening_bank, audit_log, anggota, rekonsiliasi). **Hilang**: `donatur`, `reminder_log`, `kelompok` + **9 sheet Qurban**. `anggota` masih pra-F01 (tanpa `pin_hash`, `failed_attempts`, `locked_until`, dll); `audit_log` tanpa `user_id`/`ip_address`. CLAUDE.md menyebutnya "KRITIS" — ironis. |
| `docs/CONVENTIONS.md` | dev | **CURRENT** | Naming, pola route+Zod, akses Sheets via service layer — cocok kode. Gap minor: konvensi 7 role & ID Qurban (`kode_bayar`). |
| `docs/SETUP_GUIDE.md` | adopter/dev | **STALE** | Env var meniru `.env.example` yang salah (NextAuth/OAuth/PIN_SALT, tanpa `SESSION_SECRET`/`GOOGLE_SHEETS_QURBAN_ID`/`QURBAN_*`). Daftar sheet kurang `donatur`/`reminder_log`/`kelompok` + Qurban. Langkah GCP/service account/Vercel **benar**. |
| `docs/ADOPTER_GUIDE.md` | adopter | **PARTIAL** | Alur fork→Vercel→setup & estimasi biaya bagus. Tak menyebut setup modul Qurban (spreadsheet ke-2, flag `QURBAN_*`). Bergantung pada SETUP_GUIDE yang stale. |
| `docs/BANK_TEMPLATES.md` | dev | **CURRENT** | Referensi template CSV bank (Muamalat), aturan deteksi duplikat `bank_ref` — selaras kode. |
| `docs/QURBAN_VA_README.md` | internal | **PARTIAL/WIP** | Stub Xendit Virtual Account; "Work in progress". Fitur VA belum tentu di `main` — verifikasi sebelum dipublikasikan. |
| `docs/SPRINT_PLAN.md` | dev | HISTORY/CURRENT | Roadmap sprint 0–9 + fase F. Acuan perencanaan, bukan referensi user. |
| `docs/ACCEPTANCE_F02.md` | internal-history | HISTORY | Checklist acceptance manual F02. |
| `docs/HANDOFF_TAHAP_2_ARCHITECTURE.md` | internal-history | HISTORY (overlap) | Desain arsitektur Qurban (11-sheet plan, access matrix, rekonsiliasi 4-layer). Rationale; **overlap** dgn `ARCHITECTURE.md`. |
| `docs/HANDOFF_TAHAP_3_INFORMATION_ARCHITECTURE.md` | internal-history | HISTORY | Sitemap/flow/wireframe UI Qurban. |
| `docs/HANDOFF_TAHAP_3E_API_ENDPOINTS.md` | internal-history | HISTORY (overlap) | Spec ~110 endpoint Qurban (desain). **Overlap** dgn `API_REFERENCE.md` (desain vs deployed). |
| `docs/HANDOFF_TAHAP_4_EXECUTION.md` | internal-history | HISTORY | Rencana eksekusi F1–F10, urutan fase, rollback. |
| `docs/sprints/SPRINT_0..6.md` (7) | dev/history | DUPLICATE | Detail sprint 0–6; **berduplikasi** dgn root `HANDOFF_SPRINT0X.md`. |

### 3.3 Lain-lain

| Path | Audiens | Status | Catatan |
|---|---|---|---|
| `LICENSE` | semua | CURRENT | MIT. |
| `public/mockup/images/README.md` | dev | HISTORY | Catatan aset gambar mockup signage. Bukan dok produk. |

---

## 4. Daftar MISSING (fitur/konfig ada di kode, belum terdokumentasi)

Diurutkan prioritas — yang paling menghambat adopter di atas.

1. **[KRITIS — adopter] Env var lengkap & benar.** Belum ada satu tempat yang
   akurat. Wajib: `GOOGLE_SHEETS_QURBAN_ID`, `SESSION_SECRET`, semua `QURBAN_*`
   (`QURBAN_MODULE_ENABLED`, `QURBAN_LEGACY_LOGIN_ENABLED`, `QURBAN_PANITIA_HP`,
   `QURBAN_PAYMENT_*`), `FONNTE_MOCK`, `DARI_REKENING_ID`, `KE_REKENING_ID`,
   `NEXT_PUBLIC_MASJID_NAME`. Sekaligus tandai var usang yang harus dibuang.
2. **[KRITIS — adopter] Setup spreadsheet kedua (Qurban).** Tidak ada panduan
   bahwa modul Qurban butuh spreadsheet terpisah (`GOOGLE_SHEETS_QURBAN_ID`) +
   9 tab sheet. Tanpa ini, adopter yang menyalakan Qurban langsung gagal.
3. **[KRITIS — dev] Skema 12 sheet yang hilang.** `donatur`, `reminder_log`,
   `kelompok` + 9 sheet Qurban tak ada di `DATABASE_SCHEMA.md`. Kolom otoritatif
   tersebar di `src/lib/constants.ts` (`SHEET_HEADERS`) & `scripts/*.gs`.
4. **[TINGGI — dev] Model autentikasi PIN+JWT** sebagai dok eksplisit (cookie
   `skm_session`, `SESSION_SECRET`/`AUTH_SECRET`, role-guard `middleware.ts`,
   lockout `failed_attempts`/`locked_until`). Saat ini hanya tersirat.
5. **[TINGGI — adopter/dev] Sistem 7 role & matriks akses.** `SUPER_ADMIN`,
   `ADMIN_QURBAN`, `PENDAFTARAN`, `DISTRIBUSI` + legacy. CLAUDE.md masih 3 role.
6. **[TINGGI — adopter] Konfigurasi Fonnte (WhatsApp).** Token, `FONNTE_MOCK`,
   kapan WA dikirim (`wa_send_on_*` di `qurban_konfigurasi_edisi`), template.
7. **[SEDANG — adopter/dev] Seed & first-run.** `npm run seed` (`scripts/seed.ts`)
   + urutan migrasi Apps Script (`scripts/migrate_*.gs`) per fase — belum jadi
   panduan langkah.
8. **[SEDANG — adopter] Cara pakai per modul:** rekonsiliasi, import CSV bank,
   reminder WA, dashboard, **mode TV display** (`/publik/qurban/tv`), bulk ops,
   dan lifecycle Qurban (edisi→master→pendaftaran→pemetaan→pembayaran→laporan).
9. **[SEDANG — dev] Kewajiban registrasi sheet baru di `SHEET_HEADERS`.**
   Tertulis sebagai komentar di `constants.ts` ("tanpa entry di sini, semua
   UPDATE throw 'Unknown sheet'") tapi tak diangkat ke dok kontributor.
10. **[RENDAH — dev] Konfigurasi keuangan Qurban:** `DARI_REKENING_ID`/
    `KE_REKENING_ID` & jalur kanonik `skm-bridge.ts` (setor Kas Tunai).

---

## 5. Daftar Konflik / Duplikat

1. **Auth: NextAuth/OAuth vs PIN+JWT.** `.env.example`, `CLAUDE.md` (env block),
   `SETUP_GUIDE.md` menyiratkan NextAuth + Google OAuth (`GOOGLE_CLIENT_ID/SECRET`,
   `NEXTAUTH_URL/SECRET`). Kode: tidak ada `next-auth`; PIN + `jose` JWT. **Kode menang.**
2. **Testing: Jest vs tsx.** `CLAUDE.md` & `PROJECT_BRIEF.md` tulis Jest. Kode &
   CI pakai `tsx --test`. **Kode menang.**
3. **Jumlah role: 3 vs 7.** `CLAUDE.md` (3 legacy) vs enum `UserPeran` (7). Catatan:
   ringkasan tugas §0 menyebut "5 role" — juga tak persis (lihat §7). **Kode menang.**
4. **Cakupan skema sheet.** `DATABASE_SCHEMA.md` (7) vs `SHEET_HEADERS` (19).
   `PROJECT_BRIEF.md` menyebut sebagian sheet Qurban tapi tak lengkap.
5. **Sprint logs berduplikasi.** Root `HANDOFF_SPRINT01..09.md` ↔
   `docs/sprints/SPRINT_0..6.md` — topik sama, dua lokasi, berisiko diverge.
6. **API: desain vs referensi.** `HANDOFF_TAHAP_3E_API_ENDPOINTS.md` (~110 endpoint,
   pra-implementasi, envelope `{ok}`) overlap `API_REFERENCE.md` (deployed,
   campur envelope). Perlu satu sumber kebenaran + label jelas.
7. **Arsitektur: rationale vs current.** `HANDOFF_TAHAP_2_ARCHITECTURE.md`
   (rencana 11-sheet) vs realisasi (9 sheet Qurban) vs `ARCHITECTURE.md`.
8. **Chart lib.** `PROJECT_BRIEF.md`/CLAUDE.md sebut Chart.js; deps hanya recharts.

---

## 6. Usulan Struktur Target + Mapping Sumber

Struktur diusulkan disesuaikan dari template prompt. **Tetap** memisahkan
adopter/developer/history, tetapi menambah `referensi/env-vars.md` (karena env
adalah titik gagal #1 adopter) dan `developer/auth-dan-roles.md`.

```
docs/
├── README.md                         # landing + peta navigasi  [TULIS-BARU, ringkas dari README root]
├── adopter/
│   ├── 01-overview.md                # REUSE: README.md + ADOPTER_GUIDE.md (intro)
│   ├── 02-prasyarat.md               # REUSE: ADOPTER_GUIDE.md (akun Google/Vercel/biaya)
│   ├── 03-setup-google-sheets.md     # GABUNG: SETUP_GUIDE.md §Sheets + DUA spreadsheet (inti+Qurban)  [+TULIS: GOOGLE_SHEETS_QURBAN_ID]
│   ├── 04-deploy-vercel.md           # REUSE: SETUP_GUIDE.md §Vercel (akurat)
│   ├── 05-konfigurasi-auth.md        # TULIS-BARU: PIN+JWT, SESSION_SECRET, 7 role, lockout  (BUKAN NextAuth)
│   ├── 06-konfigurasi-whatsapp.md    # TULIS-BARU: Fonnte token, FONNTE_MOCK, wa_send_on_*
│   ├── 07-first-run-dan-seed.md      # TULIS-BARU: npm run seed + urutan migrate_*.gs
│   └── modul/
│       ├── keuangan.md               # GABUNG: BANK_TEMPLATES.md + HANDOFF_IMPORT_DATA.md (import/rekonsiliasi)
│       ├── reminder-wa.md            # TULIS-BARU
│       ├── tv-display.md             # TULIS-BARU (/publik/qurban/tv)
│       └── qurban.md                 # GABUNG: HANDOFF_TAHAP_3 (flow) + SPRINT_F0x (fitur), disederhanakan
├── developer/
│   ├── arsitektur.md                 # REUSE+UPDATE: ARCHITECTURE.md (+role-gate F01, +workbook ke-2)
│   ├── data-model.md                 # REWRITE: DATABASE_SCHEMA.md → 19 sheet dari SHEET_HEADERS + *.gs
│   ├── api-endpoints.md              # GABUNG: API_REFERENCE.md (kanonik) + serap HANDOFF_TAHAP_3E
│   ├── auth-dan-roles.md             # TULIS-BARU: PIN+JWT, middleware, 7 role + matriks akses
│   ├── env-vars.md                   # TULIS-BARU: tabel lengkap (wajib/opsional/usang) sinkron .env.example
│   ├── conventions.md                # REUSE: CONVENTIONS.md (+ aturan daftar sheet di SHEET_HEADERS)
│   ├── contributing.md               # TULIS-BARU (belum ada CONTRIBUTING)
│   └── history/                      # PINDAH (Tahap B, BUKAN hapus):
│       │                             #   HANDOFF_*, PROMPT_*, HANDOFF_TAHAP_*, ACCEPTANCE_*, SPRINT_PLAN, docs/sprints/*
└── _audit/DOC_AUDIT_REPORT.md        # berkas ini
```

**Catatan struktur:**
- **Resolusi duplikat sprint:** pilih SATU lokasi arsip (`developer/history/`),
  hentikan duplikasi root↔`docs/sprints/`. Keputusan pemindahan = Tahap B.
- **`.env.example` harus disinkronkan** dengan `developer/env-vars.md` (sumber tunggal).
- **`CLAUDE.md`** tetap di root (instruksi agent) tetapi **diperbarui** (Jest→tsx,
  3→7 role, env NextAuth dibuang). Ini perbaikan in-place, bukan pemindahan.
- **`QURBAN_VA_README.md`**: jangan publikasikan sebelum verifikasi VA ada di `main`.

---

## 7. Rencana Tahap B (urutan kerja yang direkomendasikan)

Urut berdasar dampak (unblock adopter dulu), tiap langkah self-contained:

1. **Rekonsiliasi env (sumber tunggal).** Tulis `developer/env-vars.md` dari §2,
   lalu perbaiki `.env.example` agar persis cocok. *Output paling berdampak.*
2. **Perbaiki `CLAUDE.md`** (stale-claims): Jest→`tsx --test`, 3→7 role, buang
   env NextAuth/OAuth/PIN_SALT, perbarui pointer skema.
3. **Rewrite `data-model.md`** dari `DATABASE_SCHEMA.md`: 10 sheet inti (lengkapi
   `donatur`/`reminder_log`/`kelompok`, mutakhirkan `anggota`+`audit_log` F01) +
   9 sheet Qurban (kolom dari `SHEET_HEADERS` & `scripts/*.gs`).
4. **Adopter setup track** (03–07): Google Sheets dua-spreadsheet, deploy Vercel,
   auth PIN, Fonnte, seed/first-run.
5. **Konsolidasi API** (`api-endpoints.md`): jadikan `API_REFERENCE.md` kanonik,
   serap detail dari `HANDOFF_TAHAP_3E`, ringkas dua envelope di depan.
6. **Update `arsitektur.md`**: role-gate F01 + segregasi workbook Qurban.
7. **Modul guides** (keuangan, reminder, TV, qurban) untuk adopter non-teknis.
8. **Pindahkan arsip** ke `developer/history/` (HANDOFF_*, PROMPT_*, TAHAP_*,
   ACCEPTANCE_*, SPRINT_PLAN, `docs/sprints/*`), selesaikan duplikasi sprint —
   `git mv`, **tanpa hapus**.
9. **`docs/README.md`** sebagai peta navigasi + `contributing.md`.

> Pemisahan disarankan: Tahap B1 = perbaikan stale (langkah 1–3, risiko rendah,
> dampak tinggi), Tahap B2 = restrukturisasi/pemindahan (langkah 4–9).

---

## 8. Divergensi (ringkasan §0 vs kode nyata)

| # | Klaim di ringkasan konteks (§0 prompt) | Kenyataan di kode | Verdikt |
|---|---|---|---|
| 1 | "NextAuth (Gmail SSO)" | PIN-based, bcryptjs + `jose` JWT cookie `skm_session`. Tak ada `next-auth`/OAuth. | **Salah** |
| 2 | "Next.js 16" | Benar (`next` 16.2.1). | Cocok |
| 3 | "5 role: SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI" | Enum `UserPeran` punya **7** nilai (+`PENGURUS`, `VIEWER` legacy). Daftar §0 melewatkan dua legacy. | **Sebagian** |
| 4 | (CLAUDE.md) "Testing: Jest" | Node `tsx --test`; tak ada Jest. | **Salah** |
| 5 | (CLAUDE.md/PROJECT_BRIEF) "Chart.js / Recharts" | Hanya recharts. | **Salah** |
| 6 | Implisit DB = satu spreadsheet | **Dua** spreadsheet (`GOOGLE_SHEETS_ID` + `GOOGLE_SHEETS_QURBAN_ID`). | **Tambahan penting** |
| 7 | Modul Qurban "lifecycle penuh" | Benar di kode (9 sheet, ~70 endpoint), **tapi** tak tercermin di `DATABASE_SCHEMA.md`. | Cocok (dok pincang) |
| 8 | Branch kerja `docs/audit-tahap-a` (badan prompt) | Branch yang ditetapkan environment = `claude/docs-audit-tahap-a-mi4sc5`; laporan di-commit ke sana. | **Beda branch** |

---

*Akhir laporan Tahap A. Tidak ada dokumentasi lain yang disentuh.*
