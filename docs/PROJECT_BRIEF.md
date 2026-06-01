# Project Brief: Sistem Keuangan Masjid (SKM) v2.1

Dokumen ini adalah panduan utama untuk development menggunakan Claude Code.
Update dokumen ini setiap kali ada perubahan signifikan.

---

## 1. Ringkasan Proyek

**Nama Proyek**: Sistem Keuangan Masjid (SKM) v2.1
**Repository**: [familianto/skm](https://github.com/familianto/skm)

SKM adalah sistem manajemen keuangan masjid berbasis web yang bertujuan untuk mendigitalkan pengelolaan keuangan masjid agar lebih transparan, akuntabel, dan mudah digunakan.

### Primary Objective

- **Transparansi Keuangan** — Semua transaksi tercatat dan dapat diaudit
- **Kemudahan Akses** — Bendahara dapat mencatat transaksi dari mana saja
- **Laporan Otomatis** — Dashboard real-time dengan grafik dan ringkasan
- **Reusability** — Sistem dapat diadopsi oleh masjid lain dengan mudah
- **Biaya Minimal** — Menggunakan Google Sheets (gratis) sebagai database
- **Bahasa Indonesia** — Seluruh antarmuka dalam Bahasa Indonesia
- **Audit Trail** — Setiap perubahan tercatat di log

## 2. Tech Stack

| Komponen | Teknologi | Catatan |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | TypeScript strict |
| Styling | Tailwind CSS | Mobile-first |
| Backend | Next.js API Routes | Route Handlers |
| Database | Google Sheets API v4 | Sheets sebagai DB |
| File Storage | Base64 Data URL (di Google Sheets) | Logo & bukti transaksi disimpan sebagai base64 |
| Auth | PIN-based | Hash + cookie session |
| Charts | Chart.js / Recharts | Dashboard visualisasi |
| State | SWR + React Context | Client-side caching |
| Hosting | Vercel | Free tier cukup |
| Testing | Jest | Unit + integration |
| CI/CD | GitHub Actions | Lint, test, build |
| Validasi | Zod | Input validation |
| PDF Export | jspdf / @react-pdf/renderer | Laporan PDF |
| Excel Export | xlsx / exceljs | Laporan Excel |

## 3. Arsitektur Sistem

```
┌─────────────┐
│   Browser    │
│  (Pengguna)  │
└──────┬───────┘
       │ HTTPS
┌──────▼───────┐
│   Next.js    │
│   (Vercel)   │
│              │
│  ┌────────┐  │
│  │  App   │  │     ┌──────────────────┐
│  │ Router │  │     │  Google Sheets   │
│  └───┬────┘  │     │  (Database)      │
│      │       │     │                  │
│  ┌───▼────┐  │     │  - master        │
│  │  API   │──┼────▶│  - transaksi     │
│  │ Routes │  │     │  - kategori      │
│  └───┬────┘  │     │  - rekening_bank │
│      │       │     │  - audit_log     │
│  ┌───▼────┐  │     │  - anggota       │
│  │  lib/  │  │     │  - rekonsiliasi  │
│  │ google │  │     └──────────────────┘
│  │-sheets │  │
│  │  .ts   │  │     Logo & bukti disimpan
│  └────────┘  │     sebagai base64 data URL
│              │     langsung di cell Sheets
└──────────────┘
```

### Data Flow

1. **Baca data**: Client → SWR fetch → API Route → `lib/google-sheets.ts` → Google Sheets API → Spreadsheet
2. **Tulis data**: Client → Form submit → API Route → Validasi (Zod) → `lib/google-sheets.ts` → Append/Update row → Audit log
3. **Upload bukti/logo**: Client → Resize & compress via Canvas API → Base64 data URL → API Route → Simpan di cell Google Sheets
4. **Export**: Client → API Route → Baca data dari sheets → Generate PDF/Excel → Return file

## 4. Struktur Google Sheets

Lihat detail lengkap di `DATABASE_SCHEMA.md`.

### Ringkasan Sheets

| Sheet | Fungsi | Sprint |
|---|---|---|
| `master` | Konfigurasi masjid (nama, alamat, PIN hash, logo) | Sprint 0 |
| `transaksi` | Semua transaksi keuangan (masuk/keluar) | Sprint 2 |
| `kategori` | Kategori transaksi (infaq, zakat, listrik, dll) | Sprint 1 |
| `rekening_bank` | Daftar rekening bank masjid | Sprint 1 |
| `audit_log` | Log semua perubahan data | Sprint 1 |
| `anggota` | Data pengurus masjid (bendahara, dll) | Sprint 1 |
| `rekonsiliasi` | Data rekonsiliasi bank | Sprint 5 |
| `donatur` | Data donatur masjid | Sprint 3 |
| `reminder` | Log pengiriman reminder WA | Sprint 3 |
| `qurban_muqorib` | Master jamaah qurban (lintas-edisi) | Sprint F03 |
| `qurban_master_hewan` | Katalog tipe hewan qurban (per-edisi) | Sprint F03 |

## 5. Fitur Utama

### 5.1 Manajemen Transaksi (Sprint 2)
- Catat pemasukan (MASUK) dan pengeluaran (KELUAR)
- Pilih kategori dan rekening bank
- Upload bukti transaksi (foto struk/kwitansi)
- Filter berdasarkan tanggal, kategori, jenis, status
- **Search deskripsi** (debounced 300ms, case-insensitive partial match) — bisa dikombinasikan dengan filter lain, tombol clear (X) di dalam input
- **Deskripsi expandable**: kolom deskripsi default truncate 1 baris, klik untuk expand/collapse menampilkan teks lengkap (chevron icon sebagai visual hint)
- Pagination untuk daftar transaksi

### 5.2 Manajemen Donatur & Reminder WA (Sprint 3)
- CRUD data donatur (tetap/insidental)
- Komitmen donasi bulanan per donatur
- Kirim reminder via WhatsApp (Fonnte API)
- Template pesan bawaan + custom
- Bulk send ke banyak donatur sekaligus
- Riwayat pengiriman reminder

### 5.3 Dashboard & Laporan (Sprint 4)
- **Dashboard kumulatif lintas tahun**: Kartu all-time (total pemasukan, pengeluaran, saldo kumulatif) + bar chart tren tahunan (pemasukan vs pengeluaran per tahun, dinamis dari data)
- **Kartu ringkasan per periode**: Total masuk, total keluar, saldo (filter tahun/bulan)
- **Grafik tren bulanan**: Bar chart pemasukan vs pengeluaran per bulan
- **Grafik kategori**: Pie/donut chart breakdown per kategori (top 5 + Lainnya)
- **Filter periode**: Pilih tahun dan bulan
- **Filter kategori**: Multi-select kategori untuk laporan (dikelompokkan per jenis MASUK/KELUAR)
- **Export PDF**: Laporan keuangan format PDF (ringkasan/detail), dengan filter kategori opsional (dikelompokkan per jenis MASUK/KELUAR di judul)
- **Export Excel**: Data transaksi format spreadsheet (2 sheets: Ringkasan + Detail), dengan filter kategori opsional

### 5.4 Void & Koreksi (Sprint 5)
- **Void**: Batalkan transaksi yang salah (status → VOID, wajib isi alasan)
- **Koreksi**: Buat transaksi koreksi yang terhubung ke transaksi asli
- Semua void/koreksi tercatat di audit log

### 5.5 Upload Bukti Transaksi (Sprint 5)
- Upload foto bukti dari device (kamera/galeri)
- Resize otomatis di client (max 600px) dan compress ke JPEG 70%
- Simpan sebagai base64 data URL di kolom `bukti_url` sheet transaksi
- Preview bukti di detail transaksi (lightbox viewer)

### 5.6 Rekonsiliasi Bank (Sprint 5)
- Input saldo bank aktual
- Bandingkan dengan saldo sistem
- Tampilkan selisih
- Catat hasil rekonsiliasi

### 5.7 Autentikasi PIN (Sprint 1)
- Login dengan PIN (bukan username/password)
- PIN di-hash sebelum disimpan
- Session berbasis cookie (HTTP-only)
- Middleware proteksi untuk semua halaman kecuali login
- Cocok untuk device bersama di masjid
- **Rate limiting**: Maksimal 5x percobaan login gagal berturut-turut, setelahnya akun di-lock selama 5 menit dengan countdown timer real-time
- **Warning visual**: Peringatan sisa percobaan setelah gagal ke-3 dengan border merah pada input

### 5.8 Landing Page Qurban Publik — BARU
- **Route publik** `/publik/qurban` (mobile) dan `/publik/qurban/tv` (TV display)
- Data dari Google Sheets terpisah (master hewan, daftar hewan, peserta)
- Summary card, search, tab filter (Semua/Sapi/Kambing/Penitipan)
- Card per hewan dengan slot list, status bayar, badge PENITIPAN
- Share ke WA (text terformat), Copy Link
- TV mode: slide auto-rotate 10 detik per slide
  - Sapi: 4 card per slide (grid 2×2), dipisah per kelas (A, B, C, D)
  - Kambing: 6 card per slide (grid 3×2), semua kelas digabung
  - Klausul penomoran (versi panjang) di footer semua slide
  - Nama muqorib lunas: warna hijau (visual distinction dari kejauhan)
  - Font size dalam card: +10%, padding horizontal card: +10%
- Cache 5 menit, auto-refresh, `noindex` meta tag

### 5.9 Import CSV Rekening Koran — BARU
- Import transaksi dari CSV rekening koran bank
- Arsitektur extensible: bank template per bank (saat ini: Bank Muamalat)
- Auto-kategorisasi berdasarkan pattern rules di keterangan transaksi
- Preview tabel dengan status: Auto / Review / Perlu Split
- Split handler untuk transaksi gabungan (misal Setor Tunai)
- **Hybrid duplicate detection** berdasarkan Nomor Referensi CSV (kolom
  `bank_ref` di sheet transaksi) + fallback tanggal+jumlah+jenis untuk
  matching dengan input manual (lihat Import Duplicate Detection di
  `docs/BANK_TEMPLATES.md` & endpoint
  `POST /api/transaksi/check-duplicates` di `docs/API_REFERENCE.md`).
- SummaryDialog pre-import: menampilkan Siap Import / Duplikat (auto-skip)
  / Mungkin Duplikat dengan checkbox opt-in per baris sebelum user
  menekan "Import N Transaksi".
- Batch insert ke sheet Transaksi via API, dengan `bank_ref` tersimpan
  per row untuk mencegah re-import.
- Template bank disimpan di `src/lib/bank-templates/` — lihat `docs/BANK_TEMPLATES.md`

### 5.9 Import Master Bank & Rekonsiliasi (Sprint 4) — BARU
- Import data rekening bank dari file
- Setup saldo awal
- Pantau saldo per rekening
### 5.8 TV Display Publik (Sprint 6)
- Halaman read-only untuk ditampilkan di TV/monitor masjid
- Ringkasan keuangan dan grafik sederhana
- Auto-refresh setiap 5 menit
- Tidak perlu login

### 5.9 Logo & Branding (Sprint 6)
- Upload logo masjid
- Resize otomatis di client (max 200px) dan compress ke JPEG 80%
- Simpan sebagai base64 data URL di kolom `logo_url` sheet master
- Logo tampil di sidebar, halaman publik, dan laporan PDF

### 5.10 Multi-Masjid / Adopter (Sprint 6)
- Dokumentasi adopsi untuk masjid lain
- Fork repository → setup Google Cloud sendiri → deploy ke Vercel
- Kustomisasi nama, logo, kategori

### 5.8.1 Import CSV — Keterangan Informatif (v2.2)
- **Expandable keterangan**: klik teks keterangan di tabel preview untuk expand row dan tampilkan keterangan lengkap (di-truncate secara default)
- **Highlight keyword auto-categorize**: keyword yang menjadi alasan auto-categorize di-highlight dengan background kuning + bold di kolom keterangan, sesuai pattern rules per bank template
- **Suggestion text untuk Review**: transaksi berstatus "Review" menampilkan saran kecil di bawah keterangan (misal: "Mengandung BMICMS01 — kemungkinan transfer CMS keluar") untuk membantu user memilih kategori
- Highlight keywords dan suggestion mapping disimpan sebagai bagian dari `BankTemplate` di `src/lib/bank-templates/<bank>.ts` — reusable per bank
- RowGroup di-`memo()` agar expand/collapse 1 row tidak re-render seluruh tabel (performa baik untuk 1000+ baris)

### 5.11 Kelompok Anggaran (v2.2)
- Pengelompokan beberapa kategori terkait (MASUK + KELUAR) untuk pelaporan terpadu
- Contoh: Kelompok "Qurban" berisi kategori MASUK (Qurban Sapi, Qurban Kambing) + KELUAR (Qurban Operasional, Qurban Pembelian Hewan)
- 1 kategori bisa masuk ke banyak kelompok — total per kelompok bersifat independen
- Halaman Kelompok (sidebar > Pengaturan): card grid + form create/edit dengan chip kategori & color picker
- Dashboard section "Ringkasan per Kelompok" — bar chart perbandingan masuk vs keluar per kelompok
- Laporan dropdown filter Kelompok — auto-populate kategori, export PDF/Excel ikut terfilter

### 5.12 Bulk Edit Kategori (Sprint 9, v2.4)
- Checkbox di setiap baris tabel Transaksi untuk memilih transaksi (disabled untuk VOID dan MUTASI)
- "Select All" checkbox di header — hanya memilih transaksi di halaman aktif, skip VOID/MUTASI
- Sticky toolbar di bawah tabel saat ada transaksi tercentang: "X transaksi dipilih" + tombol "Ubah Kategori"
- Dialog konfirmasi: summary transaksi terpilih, dropdown kategori baru (grouped by jenis), preview perubahan
- Batch update via API `POST /api/transaksi/bulk-update-kategori` (chunking 50 per batch)
- Audit log per transaksi dengan shared `batch_id`

### 5.13 Proteksi Hapus Kategori & Rekening (Sprint 9, v2.4)
- Saat hapus kategori/rekening: cek dulu apakah ada transaksi yang menggunakan (API `usage-count`)
- Jika ada transaksi: dialog proteksi "Tidak dapat menghapus" + link ke halaman Transaksi yang terfilter
- Jika tidak ada transaksi: dialog konfirmasi hapus dengan tombol destructive (merah)
- Toast notification untuk semua aksi (edit, hapus) kategori dan rekening

### 5.14 Auth Multi-User & Anggota CRUD (Sprint F01)

Refactor login single-PIN menjadi sistem multi-user dengan 5 peran dan
CRUD pengurus penuh oleh Super Admin. Fondasi untuk modul Qurban
(Sprint F02+) yang butuh role-based access.

- **Login telepon + PIN** per pengurus (sebelumnya: single PIN pakai
  bareng). Telepon di-normalize ke format `628xxx` server-side.
- **5 peran**: SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN,
  DISTRIBUSI. Setiap peran punya allow-list path access per Tahap 3 §3.7;
  F01 enforce strict gate hanya untuk `/pengaturan/anggota/**` (SA only),
  Qurban routes enforce di F02+.
- **Anggota CRUD** di `/pengaturan/anggota/*` (SA only):
  - List dengan search nama/telepon, filter peran + is_active, pagination
  - Create dengan PIN awal yang ditampilkan **sekali** via modal
    force-acknowledge (tidak bisa di-dismiss kecuali tombol konfirmasi)
  - Detail + aksi: Edit, Reset PIN, Unlock (kalau locked), Nonaktifkan
    (dengan optional catatan), Aktifkan Kembali
  - Edit nama / telepon / peran (PIN dan is_active via aksi terpisah)
- **PIN policy**: 4–6 digit numerik, tidak boleh berurutan/repeat/dalam
  blocklist umum. Server validasi via `validatePin()`, UI surface
  constraint message Bahasa.
- **Account lockout**: 5× gagal login berturut → akun terkunci 15 menit
  via field `failed_attempts` + `locked_until` di sheet anggota (per-
  user, persistent). SUPER_ADMIN dapat unlock manual via U6.
- **Self-protection**: SUPER_ADMIN tidak dapat menonaktifkan akun
  sendiri (UI gate + server `BUSINESS_CANNOT_DEACTIVATE_SELF`); ubah
  peran SA terakhir ke non-SA juga di-block (`BUSINESS_LAST_SUPER_ADMIN`).
- **Audit trail**: setiap aksi sensitif (login_success/failed/locked,
  pin_changed, pin_reset_by_admin, unlocked_manual, anggota.created/
  updated/peran_changed/deactivated/reactivated) tercatat di sheet
  `audit_log` dengan kolom baru `user_id` + `ip_address` (Choice B
  minimal extension). Deactivate event optionally menyimpan `notes`
  dari SA input (Decision #20).
- **Session**: JWT HS256 di cookie `skm_session` (HttpOnly, Secure,
  SameSite=Lax, Max-Age 12 jam). Payload superset
  `{user_id, peran, role, masjidName}` — `role` + `masjidName` di-mirror
  untuk backwards-compat dengan 10 callsite legacy yang baca
  `session.role`.
- **Parallel legacy login** (Opsi B): selama window 1–2 hari post-deploy,
  env `QURBAN_LEGACY_LOGIN_ENABLED=true` membolehkan fallback ke
  `master.pin_hash` lama saat anggota lookup gagal. Setelah confirm
  multi-user works, flag flipped ke `false`.

**Out of Scope F01** (planned for F02+):
- Tidak ada self-service PIN recovery — SUPER_ADMIN wajib reset via U5
- Tidak ada audit log viewer UI — review masih manual via sheet
- Tidak ada multi-mosque support — masih single-mosque per deployment
- Strict role enforcement untuk Qurban routes belum di-apply di F1
  (existing SKM routes pakai session-only auth); akan di-tighten di F2
  bersamaan dengan `/qurban/**` rollout

## 6. Target Pengguna

Daftar pengurus + peran setelah Sprint F01:

| Peran | Akses Utama | Deskripsi |
|---|---|---|
| **Super Admin** | Full access termasuk manajemen anggota | Pengelola sistem, kelola akun pengurus lain |
| **Bendahara** | Full keuangan SKM, read-only Qurban Laporan | Catat transaksi, kelola data, lihat laporan |
| **Admin Qurban** | Full Qurban (F2+), read SKM Laporan | Ketua panitia Qurban per edisi |
| **Pendaftaran** | Qurban: muqorib, pemetaan, pembayaran (F2+) | Panitia pendaftaran |
| **Distribusi** | Qurban: cetak label, tracking pengiriman (F2+) | Panitia distribusi |

Pre-F01 roles `BENDAHARA` / `PENGURUS` / `VIEWER` masih ada di enum
untuk backwards-compat — `PENGURUS` di-migrate ke `ADMIN_QURBAN` saat
F01 schema migration berjalan.

## 7. Batasan & Asumsi

1. **Google Sheets sebagai DB**: Tidak support complex queries, JOIN, atau indexing. Semua filtering dilakukan di application layer.
2. **Cell limit**: Max ~10 juta cells per spreadsheet. Cukup untuk 1 masjid selama bertahun-tahun.
3. **Single writer**: Diasumsikan hanya 1 bendahara yang menulis data secara bersamaan. Tidak ada row-level locking.
4. **API rate limit**: 100 requests per 100 seconds per user. Gunakan batch operations.
5. **File upload**: Max 4.5MB per request di Vercel serverless. Compress gambar di client.
6. **Gratis**: Seluruh stack menggunakan free tier (Google Sheets, Vercel, GitHub).

## 8. Rencana Sprint

Lihat detail di `SPRINT_PLAN.md` dan file individual di `sprints/`.

| Sprint | Nama | Estimasi | Status |
|---|---|---|---|
| 0 | Setup Wizard | 1 minggu | ✅ Done |
| 1 | Foundation | 2 minggu | ✅ Done |
| 2 | Core Transactions | 2 minggu | ✅ Done |
| 3 | Donatur & Reminder WA | 1-2 minggu | ✅ Done |
| 4 | Dashboard, Laporan & Export | 2 minggu | ✅ Done |
| 5 | Rekonsiliasi Bank | 2 minggu | ✅ Done |
| 6 | TV Display, Settings & Polish | 1-2 minggu | ✅ Done |
| 7 | UI/UX Polish | 1 minggu | ✅ Done |
| 8 | Mutasi Internal | 1 minggu | ✅ Done |
| 9 | Bulk Edit & Proteksi Hapus | 1 minggu | ✅ Done |
| F01 | Auth Multi-User & Anggota CRUD | 6-8 hari | ✅ Done |
| F02 | Qurban Edisi Management | 5 hari (5 milestone A–E) | ✅ Done |
| F03 | Master Muqorib + Master Hewan Qurban | 5 milestone A–E | ✅ Done |
| F5a | Inventaris Hewan Fisik (`qurban_daftar_hewan`) | 4 milestone A–D | ✅ Done |
| F4a | Modul Pendaftaran Peserta — Backend (PS1–PS8) | — | ✅ Done |
| F4b | Pendaftaran Publik + Integrasi Fonnte (PB1–PB4) | — | ✅ Done |
| F4c | UI Pendaftaran Qurban (panitia + publik daftar + cek-status) | 6 milestone A–F | ✅ Done |
| F4d | Phone-primary lookup (PB2 v2 + M7 dual-mode) | 2 milestone A–B | ✅ Done |
| F5b | Pemetaan Peserta↔Hewan (drag-drop) — A1 infra+PM2, A2 PM1, B UI | 3 milestone A1/A2/B | ✅ Done |
| F6 | Pembayaran & Rekonsiliasi Qurban (`qurban_pembayaran`) — A fondasi, B TUNAI, C match Layer 1, C2 scoring+antrian, D UI | A–D | 🚧 A+B+C+C2+D1+D2 done |
| F7 | Hari-H | TBD | ⏳ Planned |

### Sprint F6 — Pembayaran & Rekonsiliasi Qurban

**Milestone A (fondasi + integrasi registrasi):** sheet baru `qurban_pembayaran`
(prefix `BYR-`, grain per-pendaftaran/`kode_bayar`, di workbook utama). Registrasi
PS2 (admin) & PB3 (publik) kini **auto-create** satu baris pembayaran
`BELUM_BAYAR` setelah insert peserta (field baru `metode_pembayaran`, default
`TRANSFER`; `VA` ditolak "segera hadir"). PS5 cancel kini **memblokir** bila
pembayaran `TERIMA_PANITIA`/`LUNAS` dan **kaskade-batal** pembayaran `BELUM_BAYAR`
saat seluruh slot pendaftaran dibatalkan. Migrasi `scripts/migrate_F6A_pembayaran.gs`
(STAGING dulu). Repo/builder/audit: `pembayaran-repo.ts`, `pembayaran-create.ts`,
`pembayaran-audit.ts`.

**Milestone B (status TUNAI + Cash Model A):** endpoint **PY2** terima-panitia
(`BELUM_BAYAR → TERIMA_PANITIA`), **PY3** lunaskan (`TERIMA_PANITIA → LUNAS`,
**Model A** menulis transaksi pemasukan ke Kas Tunai lewat jalur kanonik SKM —
`jumlah = nominal_total` bulat tanpa suffix; transaksi-first lalu link
`skm_transaksi_id`), **PY4** list+enrichment. Jembatan island→ledger
`src/lib/qurban/skm-bridge.ts` (resolve kategori/rekening by-name + create
transaksi kanonik). Kaskade cancel parsial (B-6) kini **recompute** nominal
pembayaran `BELUM_BAYAR`.

**Milestone C (rekonsiliasi TRANSFER, Layer 1 + link manual):** pass **terpisah
yang MEMBACA sheet `transaksi`** (bukan disuntik ke import). **PY5**
`/pembayaran/rekonsiliasi` auto-match deterministik via `kode_bayar`
(`QRB-\d{4}-\d{3}`) di `deskripsi` + nominal pas → set `LUNAS` + link + koreksi
`kategori_id` transaksi per-tipe (import salah auto-kategori "QRB"→Sapi); **PY6**
`/[id]/link-transaksi` link manual (nominal beda diizinkan, selisih dicatat).
Engine murni `rekonsiliasi-engine.ts`; apply bersama `rekonsiliasi-apply.ts`;
koreksi kategori via jalur UPDATE kanonik SKM (`skm-bridge.correctTransaksiKategori`).
C-0: peran PY2 tanpa BD, PY4 tanpa DISTRIBUSI.

**Milestone C2 (smart-scoring Layer 2 + antrian Layer 3):** Q3 — auto-match
diperluas (`jumlah ∈ {nominal_total, nominal_transfer}`, mencakup "lupa suffix").
Kode-cocok-nominal-janggal → **suggestion** (bukan auto). Skorer murni
`rekonsiliasi-scoring.ts` (suffix +30, keyword +30, nominal±1% +25, tanggal≤14h
+15, fuzzy nama JW≥0.8 +20, phone +10; ambang ≥50) untuk transfer tanpa kode.
**PY5** kini mengembalikan `suggestions[]` berperingkat; **PY7**
`/rekonsiliasi/queue` antrian READ-ONLY untuk tab triase.

**Milestone D1 (UX registrasi — UI pertama):** dropdown **Metode Pembayaran**
(Transfer / Cash·Datang Langsung; VA disabled "segera hadir") di form daftar
publik (`PublikDaftarWizard`) & admin (`PesertaForm`), wajib dipilih. Layar
"Pendaftaran Tercatat" bercabang per-metode (TRANSFER: nominal-suffix + rekening
Bank Muamalat + berita; TUNAI: nominal bulat + "datang ke masjid, bayar ke
panitia"). WA pendaftaran (`publik-wa-template.ts`) bercabang sama.

**Milestone D2 (manajemen pembayaran admin + WA confirmed):** halaman
**`/qurban/pembayaran`** (sidebar grup QURBAN, tab "Daftar Pembayaran" + slot tab
"Rekonsiliasi" M-D3). Daftar (PY4) + filter + badge status (`PembayaranStatusBadge`,
dipakai juga di daftar Peserta). Aksi alur TUNAI: **Terima Panitia** (PY2, modal)
+ **Setor ke Kas** (PY3, dialog konfirmasi → transaksi Kas Tunai). WA "pembayaran
confirmed" (`notifyPembayaranLunas`, gated `wa_send_on_pembayaran_confirmed`,
best-effort) dipanggil dari PY3 & `applyMatch`. **Belum:** UI triase rekonsiliasi
(M-D3). Detail: `HANDOFF_SPRINT_F6.md`, `docs/API_REFERENCE.md`.

### Sprint F02 — Qurban Edisi Management

Fondasi modul Qurban sebagai layer operasional terpisah di atas auth F01.
Setiap penyelenggaraan Qurban (per tahun hijriah) dimodelkan sebagai
**edisi** dengan state machine `DRAFT → AKTIF → SELESAI`. Maksimal satu
edisi `AKTIF` pada satu waktu, dengan force-close opsional.

**Kemampuan modul (delivered):**

- **Edisi CRUD** (E1–E6): create + clone (konfigurasi default ON,
  panitia default OFF), edit dengan field-lock per status, activate
  dengan pre-flight (konfigurasi present + ≥1 panitia aktif + single
  AKTIF), close, list/detail.
- **Konfigurasi per edisi** (K1–K2, 1:1 dengan edisi): BOP per ekor
  sapi/kambing, target distribusi (bungkus + berat), tanggal
  distribusi, payment suffix, flag notifikasi WhatsApp.
- **Panitia per edisi** (P1–P3): daftar penugasan anggota; whitelist
  peran (`SUPER_ADMIN`/`ADMIN_QURBAN`/`PENDAFTARAN`/`DISTRIBUSI` —
  `BENDAHARA` ditolak); soft-remove dengan jejak audit.
- **Edition Switcher** (cookie + query param): satu strip top-of-page
  yang memilih edisi konteks; sticky deep-link via middleware.
- **Role-based access** untuk modul Qurban: SA/AQ full-write; BD/PD
  read-only; DS scoped ke distribusi (sprint mendatang).
- **3 sheet baru:** `qurban_edisi` (12 kolom), `qurban_konfigurasi_edisi`
  (15), `qurban_panitia` (7). Migrasi via Apps Script `migrate_F02`.

**Tertunda (sengaja) ke F03+:** master hewan, master muqorib, peserta
pendaftaran, pembayaran, distribusi pemetaan, laporan keuangan Qurban.
Pre-flight aktivasi punya TODO marker untuk cek master_hewan (F3) dan
hewan AKTIF (F4); pre-flight close punya TODO untuk blok peserta
TERDAFTAR belum lunas (F4+).

Detail lengkap: `HANDOFF_SPRINT_F02.md`, `docs/API_REFERENCE.md`
(section Qurban Edisi/Konfigurasi/Panitia), `docs/ACCEPTANCE_F02.md`.

### Sprint F03 — Master Muqorib + Master Hewan (Opsi B)

Data master modul Qurban: **muqorib** (jamaah, lintas-edisi) dan **master
tipe hewan** (katalog jenis+kelas per edisi). Lingkup dibatasi ke Opsi B —
katalog tipe hewan, bukan inventory hewan fisik per ekor (ditunda ke F05
bersama Pemetaan).

**Kemampuan modul (delivered):**

- **Muqorib CRUD lintas-edisi** (M1–M6): list dengan search/filter
  status/sort/paginasi, create, detail (+ seksi riwayat partisipasi yang
  kosong sampai F04), edit, deactivate/reactivate. `no_hp` dinormalisasi
  server-side ke `628…`.
- **Smart-lookup muqorib** (M7): autocomplete Jaro-Winkler + boost telepon
  (last-4) & alamat/RT; `no_hp` di-mask di response. Konsumennya modul
  Pendaftaran (F04).
- **Master tipe hewan per-edisi** (MH1–MH5): list per edisi, create tipe
  (`jenis`×`kelas` unik per edisi), update inline (kapasitas/harga;
  `jenis`/`kelas` immutable), deactivate. Bulk-upsert (MH5) tersedia di API
  tetapi tanpa UI di F03.
- **UI Muqorib** (4 halaman): `/qurban/muqorib`, `/baru`, `/[id]`,
  `/[id]/edit` — mirror pola CRUD Anggota F01.
- **UI Master Hewan**: `/qurban/hewan` dengan tab Master Tipe (fungsional,
  inline edit + modal tambah) + tab Daftar Inventory (placeholder F05).
- **Role-gating**: Muqorib tulis = SA/AQ/PD, status = SA/AQ; Master Hewan
  tulis = SA/AQ. Akses halaman mengikuti `path-rules.ts`
  (`/qurban/(muqorib|hewan)` → SA/BD/AQ/PD).
- **2 sheet baru:** `qurban_muqorib` (11 kolom, lintas-edisi),
  `qurban_master_hewan` (11 kolom, per-edisi). Migrasi via Apps Script
  `migrate_F03`.

**Tertunda (sengaja) ke F05:** inventory hewan fisik per ekor
(`qurban_daftar_hewan`), halaman Pemetaan, dan UI bulk-setup tipe.

Detail lengkap: `HANDOFF_SPRINT_F03.md`, `docs/API_REFERENCE.md`
(section Qurban Muqorib + Master Hewan).

### Sprint F5a — Inventaris Hewan Fisik

Lapisan **inventaris fisik per-ekor** di atas katalog tipe F03. Tabel
`qurban_daftar_hewan` mencatat tiap ekor hewan nyata (1 baris = 1 ekor),
dengan `jenis`/`kelas`/`kapasitas_slot` didenormalisasi dari master tipe.

**Kemampuan modul (delivered):**

- **CRUD per-ekor** (H1–H4): list per edisi (filter jenis/kelas/status,
  diperkaya `nama_display` + slot), create dengan **auto-numbering** grup
  `(jenis, kelas)` (BAWA_SENDIRI selalu mendahului BELI), detail (+ ringkasan
  slot & penghuni), edit field non-penomoran. `BAWA_SENDIRI` → harga 0.
- **Operasi batch & status** (H5–H7): reorder manual per grup (naik/turun,
  bukan drag-drop), batch ubah status (`AKTIF`/`TERPOTONG`/`BATAL`, validasi
  atomik), batalkan satu hewan. State machine: `DRAFT→AKTIF`, `DRAFT→BATAL`,
  `AKTIF→TERPOTONG`, `AKTIF→BATAL` (TERPOTONG/BATAL terminal).
- **UI**: tab "Daftar Inventory" di `/qurban/hewan` (list + reorder +
  multi-select batch-status), `/qurban/hewan/baru`, `/[id]` (detail +
  batalkan), `/[id]/edit`.
- **Role-gating**: baca = SA/BD/AQ/PD; tulis CRUD + reorder = SA/AQ/PD;
  batch-status + cancel = SA/AQ. Edisi `SELESAI` mengunci semua tulis.
- **1 sheet baru:** `qurban_daftar_hewan` (17 kolom). Migrasi via Apps Script
  `migrate_F5a` (idempoten, `verify_F5a` dengan guard jumlah kolom).

**Keputusan terkunci:** `tanggal_pemotongan` direkam di audit log (bukan
kolom, Opsi A); `nomor_urut_pemotongan` dibuat sekarang tapi milik F7;
penanganan defensif `qurban_peserta` (sheet belum ada hingga F4a → slot `0`).

Detail lengkap: `HANDOFF_SPRINT_F5a.md`, `docs/API_REFERENCE.md`
(section Qurban Daftar Hewan H1–H7).

### Sprint F4a — Pendaftaran Peserta (Backend)

Modul **Pendaftaran** peserta qurban — lapisan di atas inventaris F5a. Tabel
`qurban_peserta` dengan pendekatan **"1 baris = 1 slot"** (1 muqorib ambil 3
slot Sapi → 3 baris). **Backend-only**; UI menyusul F4c, pendaftaran publik F4b.

**Kemampuan modul (delivered):**

- **CRUD peserta** (PS1–PS5): list per edisi (filter status/hewan/muqorib/tipe/
  sumber), create **multi-slot** (auto-assign slot + freeze harga + generate
  `kode_bayar` + deteksi duplikat Layer 1), detail, update field non-slot
  (`nama_atas_nama`/`keterangan_bagian`/`notes`), cancel (`TERDAFTAR → BATAL`).
- **Helper pra-daftar** (PS6–PS8): check-duplicate (informasional), refresh-harga
  (terapkan harga master terkini), available-slots (slot kosong per edisi).
- **Keputusan harga:** `harga_disepakati = master ÷ kapasitas_slot` —
  `BELI`=`harga_beli`, `BAWA_SENDIRI`=`harga_bawa_sendiri` (keduanya per-ekor).
  `kode_bayar` = `QRB-{tahun_hijriah}-{NNN}`, urutan lintas-status per edisi
  (BATAL tak membebaskan kode). PS2 wajib edisi `AKTIF`; peserta `BATAL`
  immutable.
- **Role-gating** (di handler): baca = SA/BD/AQ/PD; tulis create/patch = SA/AQ/PD;
  cancel/refresh-harga = SA/AQ. Edisi `SELESAI` mengunci tulis.
- **Perbaikan okupansi F5a:** `peserta-occupancy.ts` kini membaca
  `status_pendaftaran=TERDAFTAR` + resolusi nama (`nama_atas_nama`/`muqorib_id`)
  — slot_terisi/occupants F5a (H1/H3/H7) jadi **nyata**.
- **1 sheet baru:** `qurban_peserta` (17 kolom). Migrasi via Apps Script
  `migrate_F4a` (idempoten, `verify_F4a` dengan guard jumlah kolom).

Detail lengkap: `HANDOFF_SPRINT_F4a.md`, `docs/API_REFERENCE.md`
(section Qurban Peserta PS1–PS8).

### Sprint F4b — Pendaftaran Publik + Integrasi Fonnte

Endpoint **publik tanpa-auth** (PB1–PB4) agar jamaah mendaftar qurban sendiri,
plus notifikasi WhatsApp. **Backend-only**; UI menyusul F4c. **Tanpa migrasi**
(config edisi sudah memuat `payment_suffix`, `wa_send_on_pendaftaran`,
`wa_send_on_pembayaran_confirmed` sejak F02).

**Kemampuan modul (delivered):**

- **Endpoint publik (PB1–PB4):** `options` (info edisi + status pendaftaran +
  tipe hewan bookable + rekening), `daftar/lookup` (exact match muqorib by
  nama+no_hp), `daftar` (submit; analog publik PS2 + auto-create muqorib),
  `cek-status` (by `kode_bayar`/`no_hp`, lintas-edisi, tak di-gate window).
- **Pengaman publik:** rate-limit *cascading* per-IP per-endpoint (di atas
  `checkRateLimit` F1), honeypot (field `email`), masking nama/no_hp. Window
  pendaftaran 3-keadaan (`BELUM_BUKA`/`BUKA`/`TUTUP`) dari tanggal edisi.
- **Nominal-ber-suffix:** `nominal = total_harga + payment_suffix` (dihitung
  sekali pada total) — sinyal kategorisasi transaksi; pencocokan peserta lewat
  `kode_bayar` di berita transfer (bukan suffix).
- **Fonnte WhatsApp:** dua template (`pendaftaran_publik` untuk PB3,
  `pendaftaran_panitia` retrofit ke PS2), gated `wa_send_on_pendaftaran`,
  di-await-tapi-error-ditangkap (gagal-WA ≠ gagal-response), audit `wa_sent_*`.
  Klien `@/lib/fonnte` dipakai ulang (env `FONNTE_API_TOKEN`; tanpa token →
  mock graceful).
- **Polish:** PB3 menolak muqorib nonaktif (konsisten PS2); kill-switch
  `QURBAN_MODULE_ENABLED` kini mencakup `/api/publik/qurban/*`.
- **Keterbatasan jujur:** rate-limit `Map` in-memory (per-instance serverless,
  bukan global) — friksi-abuse MVP; pengerasan = Upstash Redis (backlog).

Detail lengkap: `HANDOFF_SPRINT_F4b.md`, `docs/API_REFERENCE.md`
(section Qurban Public Pendaftaran PB1–PB4).

### Sprint F4c — UI Pendaftaran Qurban

UI penuh untuk pendaftaran, mengonsumsi endpoint F4a (PS1–PS8) & F4b (PB1–PB4)
— **tanpa perubahan backend / migrasi**. Modul Qurban kini punya UI lengkap:
panitia (list/detail/form/edit/aksi) + publik (daftar + cek-status). 6 milestone:

- **A** — `/qurban/peserta` (list) + `/qurban/peserta/[id]` (detail) read-only +
  timeline audit reusable.
- **B** — `/qurban/peserta/baru` form panitia (smart-lookup muqorib, deteksi
  duplikat, multi-slot).
- **C** — **revisi model**: `kode_bayar` per-pendaftaran (satu kode dibagi N
  baris), atas-nama per-slot (panitia), aturan slot cerdas-konteks + guard
  kapasitas, template WA & success satu-kode.
- **D** — edit peserta (PS4) + aksi Tandai BATAL (PS5) & Refresh Harga (PS7),
  gate SA·AQ.
- **E** — `/publik/qurban/daftar` wizard 3-langkah (PB1→PB2→PB3) + halaman sukses
  (satu kode, instruksi transfer, honeypot `email`).
- **F** — `/publik/qurban/cek-status` (PB4, nama ter-mask) + polish (copy
  button, fix stale-error & nav-highlight, CTA "Daftarkan Lagi").

Keputusan in-repo: PB3 menerima **`nama_atas_nama` tunggal** (bukan per-slot —
beda dari form panitia); honeypot field `email`; **phone-primary lookup (PB2 v2)
diparkir ke F4d**. Detail lengkap: `HANDOFF_SPRINT_F4c.md`.

### Sprint F4d — Phone-Primary Lookup (PB2 v2) — Milestone A

Pendaftaran publik kini **HP-dulu**: jamaah cukup memasukkan nomor HP untuk
dikenali (tahan terhadap variasi ejaan nama), dan duplikat dicegah sebelum
terbentuk. Karena seed 196 muqorib (1447H) ber-grain **1 muqorib per HP**
(satu keluarga = satu muqorib; nama anggota di `notes`), HP cukup sebagai
kunci.

**Revisi disengaja PB2** (`POST /api/publik/qurban/daftar/lookup`):
`{nama_lengkap, no_hp}` strict-match → **`{no_hp, email?}` phone-primary,
response tersamar**. Identitas penuh tidak pernah dibalas; user mengkonfirmasi
visual via `nama_masked` + `alamat_masked` + `rt` → 2-faktor baru =
**HP + pengenalan**. Inactive-only match disembunyikan (silent not-found).

**Frontend Step 2** wizard publik: input HP saja → kartu konfirmasi "Apakah
ini Anda atau keluarga Anda?" → **"Ya, lanjutkan"** (kirim `muqorib_id` ke
PB3) atau **"Bukan / nomor salah"** (TIDAK fall-through ke form pendaftar-baru
dengan HP yang sama — anti diam-diam-attach). HP tidak terdaftar → form
pendaftar baru. Honeypot `email` dipasang juga pada Step 2.

**Milestone B — panitia M7 dual-mode.** Selector pure yang sama
(`selectActiveMuqoribByPhone` di `lib/qurban/muqorib-lookup.ts`) dipakai
ulang: M7 mendeteksi `q` HP-like (`isPhoneQuery`) → exact-match HP; selain
itu → fuzzy nama (perilaku lama). Balasan panitia **PENUH** (tidak di-mask)
sesuai PII matrix — beda kontrak dari publik yang tetap tersamar. Komponen
`MuqoribLookup` di `PesertaForm` tetap memakai satu field bebas; HP
panjang otomatis ditangani server. PS6 dup-check tetap sebagai jaring
pengaman saat submit. Satu mesin lookup, dua kontrak.

## 9. Saran Fitur Masa Depan (Backlog)

Fitur-fitur berikut **tidak termasuk** dalam scope v2.1, tapi bisa ditambahkan di versi selanjutnya:

1. **OTP/SMS untuk Board Tighter** — Autentikasi 2-faktor
2. **Automated Zakat Calculator** — Kalkulator zakat otomatis
3. **Keyboard Shortcut Dashboard** — Navigasi cepat via keyboard
4. **Multi-Bahasa (i18n)** — Support bahasa selain Indonesia
5. **Recurring Transactions** — Transaksi berulang (listrik bulanan, dll)
6. **Scheduled WA Reminders** — Reminder otomatis terjadwal (via Vercel Cron)
7. **Donation Tracking per Donatur** — Hubungkan donatur ke transaksi untuk lacak total donasi
8. **Mobile App (PWA)** — Progressive Web App untuk mobile

## 10. Estimasi Biaya Operasional

### Skenario: Masjid menggunakan semua fitur

| Komponen | Biaya/Bulan |
|---|---|
| Google Sheets | Gratis (logo & bukti disimpan sebagai base64 di Sheets) |
| Vercel Hosting (Free tier) | Gratis |
| Domain (opsional) | Rp 12.000 - Rp 150.000/tahun |
| **Total** | **Rp 0 - Rp 12.500/bulan** |

---

## 11. Design System & Theme

### Prinsip Desain
- **Clean & Modern**: Minimalis, less colorful, good readability
- **Primary Color**: Emerald/green hanya untuk elemen aktif dan CTA
- **Grayscale**: Sisanya menggunakan abu-abu, putih, hitam

### Sidebar
- Menu dikelompokkan dalam sections dengan label: **Utama**, **Laporan**, **Pengaturan**, **Lainnya**
- Label section: font kecil, uppercase, warna abu-abu, tidak clickable

### Komponen UI
- **Badge**: Subtle/muted style — light background, dark text, ring border (bukan solid color)
  - MASUK: `bg-emerald-50 text-emerald-700 ring-emerald-200`
  - KELUAR: `bg-red-50 text-red-700 ring-red-200`
  - Status: grayscale muted
- **Card**: `shadow-sm + border-gray-200 + rounded-xl`, padding `p-6`
- **Table**: Header `bg-gray-50 font-semibold`, row hover `bg-gray-50`, kolom Aksi `text-center`
- **Rupiah**: Format dengan spasi: `Rp 1.234.567` (via `formatRupiah()` di `lib/utils.ts`)
- **CurrencyInput** (`components/ui/currency-input.tsx`): Reusable input untuk nominal Rupiah dengan thousand separator titik (format Indonesia). Props: `value: number | null`, `onChange: (value: number | null) => void`. Internally memakai `Intl.NumberFormat('id-ID')` untuk display, raw integer untuk state. Paste "Rp 1.000.000" / "1,000,000" / "1000000" semua di-parse jadi `1000000`. Karakter non-digit otomatis di-strip. Dipakai di SELURUH form input nominal SKM: Rekonsiliasi (Saldo Bank Aktual), Rekening Tambah/Edit (Saldo Awal), Donatur Tambah/Edit (Komitmen Donasi/Bulan), Transaksi Tambah/Edit/Koreksi/Mutasi Internal (Jumlah), Import CSV split SETOR TUNAI (Jumlah per split). Single source of truth untuk format nominal input.

### Rekonsiliasi Form
- Form dibatasi `max-w-2xl` agar tidak full-width

---

## Changelog

### v2.5 (18 Mei 2026) — Sprint F01 — Auth Multi-User + Anggota CRUD

- **Fitur baru: Login multi-user telepon + PIN** — refactor dari single
  PIN. 5 peran (SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN,
  DISTRIBUSI) sebagai fondasi untuk modul Qurban (F02+).
- **Anggota CRUD di `/pengaturan/anggota/*`** (SUPER_ADMIN only):
  List + search + filter, Create dengan PIN-once modal force-acknowledge,
  Detail page dengan aksi (Edit, Reset PIN, Unlock, Nonaktifkan,
  Aktifkan Kembali), Edit form (nama/telepon/peran).
- **Endpoint baru** (Sprint F01 envelope `{ok, data, error: {code, message, details}}`):
  - Auth A1-A4: `/api/auth/{login, logout, me, change-pin}` (login + logout
    refactored, me + change-pin baru)
  - Anggota U1-U9: `/api/pengaturan/anggota` (list + create) + `/[id]`
    (detail + patch) + 4 action endpoints + `/roles` dropdown helper
- **Schema delta**:
  - Sheet `anggota` extend +6 kolom: `pin_hash, created_by, updated_at,
    last_login_at, failed_attempts, locked_until` (total 13 kolom)
  - Sheet `audit_log` extend +2 kolom: `user_id, ip_address` (total 9
    kolom, Choice B Minimal Extension)
- **Middleware defense-in-depth** (root `src/middleware.ts`): session
  check + strict role gate untuk `/pengaturan/anggota/**`. Existing SKM
  routes pakai session-only auth (strict allow-list per Tahap 3 §3.7
  diapply incremental di F02 saat `/qurban/*` routes ship).
- **PIN policy** (4-6 digit, no sequential/repeat/blocklist) + account
  lockout (5× gagal → 15 menit) + IP rate limit (10/menit per IP untuk
  login). PIN reset oleh SA membersihkan lockout state.
- **Parallel legacy login** (Opsi B per Tahap 4 §3.3): env
  `QURBAN_LEGACY_LOGIN_ENABLED=true` membolehkan fallback ke
  `master.pin_hash` saat anggota lookup gagal. Window 1-2 hari
  post-deploy lalu flag flipped ke `false`.
- **Audit log richness**: 12 event types canonical
  (`auth.login_*`, `auth.locked`, `auth.unlocked_manual`, `auth.logout`,
  `auth.pin_changed`, `auth.pin_reset_by_admin`, `anggota.created`,
  `anggota.updated`, `anggota.peran_changed`, `anggota.deactivated`,
  `anggota.reactivated`). Deactivate optional `notes` body (Decision #20).
- **Helpers reusable** di `src/lib/api/` (foundation untuk F02-F10):
  response envelope, error codes catalog, ID generator (WIB), JWT auth,
  PIN policy, phone normalize, rate-limit, audit writer, anggota
  repository, role-based path rules.
- **UI/UX**: Mobile-first untuk iPad primary device. Login refactor +
  PinOnceModal (force-acknowledge) + Anggota list (cards di <lg, table
  di lg+ per Decision #19) + Detail dengan action set + Edit form.
- **Verification**: 31 unit tests pass + 26/26 GitHub Actions integration
  tests pass terhadap Vercel preview deployment.

### v2.4.2 (5 Mei 2026) — CurrencyInput Rollout
- Standardisasi `<CurrencyInput>` ke seluruh form nominal di SKM
- Cakupan baru: Transaksi (Tambah/Edit/Koreksi/Mutasi Internal — field Jumlah), Import CSV split SETOR TUNAI (Jumlah per split)
- Inline `formatRupiah(string)` di `transaction-form.tsx` dan `formatDots` di `import/page.tsx` dihapus — semua delegated ke `CurrencyInput`
- State internal form berubah: `jumlah` di TransactionForm sekarang `number | null` (bukan string ber-separator)
- Kelompok Anggaran: tidak ada field nominal (out-of-scope), Dashboard read-only, Laporan tidak punya filter min/max amount — tidak ada perubahan
- API contract tidak berubah — backend tetap menerima/mengirim integer

### v2.4.1 (5 Mei 2026) — Currency Input Separator
- **Reusable `CurrencyInput` component** (`components/ui/currency-input.tsx`) untuk semua input nominal Rupiah
- Format: Indonesian thousand separator titik (mis. `1.500.000`); raw integer di state & API, display formatted only
- Diaplikasikan di: Rekonsiliasi (Saldo Bank Aktual), Rekening Tambah/Edit (Saldo Awal), Donatur Tambah/Edit (Komitmen Donasi/Bulan)
- API contract tidak berubah — backend tetap menerima/mengirim integer

### v2.4 (10 April 2026) — Sprint 9
- **Fitur baru: Bulk Edit Kategori** — Pilih banyak transaksi via checkbox, ubah kategori sekaligus lewat dialog konfirmasi dengan preview perubahan
- Checkbox di tabel Transaksi (disabled untuk VOID/MUTASI), Select All per halaman, sticky toolbar bawah
- API baru: `POST /api/transaksi/bulk-update-kategori` (chunking 50/batch, audit log per transaksi dengan shared `batch_id`)
- **Proteksi Hapus Kategori & Rekening** — Cek `usage-count` sebelum hapus; jika ada transaksi: dialog proteksi + link ke transaksi terfilter
- API baru: `GET /api/kategori/[id]/usage-count`, `GET /api/rekening/[id]/usage-count`
- **Dialog Konfirmasi Hapus** — Reuse ConfirmDialog (variant danger) untuk kategori/rekening tanpa transaksi
- **Toast Notification** — Toast konsisten untuk edit/hapus kategori dan rekening
- Halaman Transaksi: support URL query param `?kategori=ID` untuk pre-filter kategori

### v2.2.1 (7 April 2026)
- **Filter Rekening** di halaman Transaksi (dropdown + URL `?rekening=ID`)
- **Filter Rekening** di halaman Laporan (preview + PDF/Excel export ikut terfilter)
- **Dashboard "Saldo per Rekening"** rows sekarang clickable — navigate ke `/transaksi?rekening=ID`
- API `/api/dashboard/summary`, `/api/export/pdf`, `/api/export/excel` menerima query param `rekening`
### v2.3 (7 April 2026) — Sprint 8
- **Fitur baru: Mutasi Internal** — Pemindahan dana antar rekening (Bank ↔ Kas Tunai dst.)
- 1 mutasi = 2 baris transaksi (KELUAR di rekening asal + MASUK di rekening tujuan) dihubungkan via kolom baru `mutasi_ref` (format `MUT-YYYYMMDD-NNNN`) di sheet `transaksi`
- Kategori baru "Mutasi Internal" dengan jenis `MUTASI` (auto-create saat mutasi pertama dibuat)
- Form Tambah Transaksi: tab ketiga **Mutasi** — input Dari Rekening, Ke Rekening, Jumlah, Deskripsi, Tanggal (kategori auto = Mutasi Internal, readonly)
- Halaman Transaksi: badge `MUTASI` (slate), filter jenis menambahkan opsi "Mutasi", baris mutasi dikecualikan dari ringkasan Masuk/Keluar/Saldo
- Detail transaksi: menampilkan info "Mutasi dari [rekening asal] ke [rekening tujuan]" + link ke pasangan
- Void/Edit pada salah satu baris mutasi otomatis ikut meng-void/edit pasangannya
- Mutasi **dikecualikan** dari semua perhitungan Pemasukan/Pengeluaran (Dashboard summary & cumulative, chart-data, Laporan, Export PDF/Excel, ringkasan Publik), tetapi **disertakan** dalam Saldo per Rekening agar saldo tetap akurat

### v2.2 (7 April 2026)
- **Fitur baru: Kelompok Anggaran** — Pengelompokan beberapa kategori (MASUK+KELUAR) yang saling berkaitan untuk pelaporan terpadu (misal: Qurban, Ramadhan)
- Halaman Kelompok Anggaran (sidebar > Pengaturan) dengan card grid + form create/edit modal
- Dashboard: section "Ringkasan per Kelompok" dengan card dan bar chart perbandingan masuk/keluar per kelompok
- Laporan: dropdown filter Kelompok — otomatis populate kategori saat kelompok dipilih, PDF/Excel export ikut terfilter
- API baru: `/api/kelompok` (CRUD), `/api/dashboard/kelompok` (ringkasan)
- Sheet baru: `kelompok` dengan kolom id, nama, deskripsi, warna, kategori_masuk, kategori_keluar, timestamps

### v2.1.2 (6 April 2026)
- Transaksi: Multi-select kategori filter dengan checkbox dropdown
- Transaksi: Sticky summary bar (Masuk/Keluar/Saldo) di atas tabel
- Dashboard: Transaction count pada semua cumulative cards
- Dashboard: Yearly trend chart diubah dari bar ke line chart + area fill
- Dashboard: Category breakdown all-time (horizontal bar chart top 10)
- Dashboard: Yearly trend mulai dari 2025 (exclude data parsial 2024)
- Laporan: Opsi "Semua Tahun" untuk laporan lintas tahun
- Export PDF/Excel: Support mode all-time (tahun=all)

### v2.1.1 (6 April 2026)
- UI/UX Polish: Sidebar grouping dengan section labels
- Theme: Badge subtle/muted, tabel header semibold, Aksi column text-center
- Format Rupiah dengan spasi: "Rp 1.234.567"
- Rekonsiliasi form layout fix (max-w-2xl)

### v2.1 (23 Maret 2026)
- Tambah fitur Upload Bukti Pengiriman
- Tambah fitur Void & Koreksi
- Tambah fitur Logo & Branding
- Tambah fitur Import Master Bank & Rekonsiliasi
- Tambah panduan adopsi untuk masjid lain
- Update dokumentasi development lengkap

## Display Layer Conventions

### Tipe Qurban / Pengadaan Display Mapping

Master data di GSheet menggunakan istilah legacy:
- `peserta.tipe_qurban`: `'Beli'` atau `'Penitipan'`
- `daftar_hewan.pengadaan`: `'Via Panitia'`, `'Penitipan'`, atau `'Bawa Sendiri'`

Untuk display ke user di public-facing pages, istilah `'Penitipan'` di-translate jadi `'Bawa Sendiri'`. Translasi disentral di:
- **Helper**: `src/lib/qurban-display.ts` → `displayTipeQurban(raw)`
- **Konstanta**: `LABEL_BAWA_SENDIRI = 'Bawa Sendiri'`, `LABEL_BELI = 'Beli'`

| Layer | Pakai apa? |
|---|---|
| Logic comparison (`if`, `filter`, etc.) | `'Penitipan'` (master data) |
| Type definitions | `'Penitipan'` valid |
| Data fetching (qurban-sheets.ts) | Raw "Penitipan" |
| Display JSX (page.tsx, components) | `LABEL_BAWA_SENDIRI` constant |
| WA share message (qurban-wa-text.ts) | `LABEL_BAWA_SENDIRI` constant |

Kalau perlu mengubah istilah lagi nanti, edit di `src/lib/qurban-display.ts` saja.
