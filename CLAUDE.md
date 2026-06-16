# CLAUDE.md — SKM (Sistem Keuangan Masjid) v2.1

## Project Identity

- **Nama**: Sistem Keuangan Masjid (SKM) v2.1
- **Deskripsi**: Sistem manajemen keuangan masjid berbasis web menggunakan Google Sheets sebagai database
- **License**: MIT
- **Owner**: familianto
- **Bahasa UI**: Bahasa Indonesia
- **Bahasa Kode**: English (identifiers, comments)

## Current Sprint

> **Sprint F6 — Pembayaran & Rekonsiliasi Qurban** selesai (A–D3, akumulasi
> PR #100 Draft). Sheet `qurban_pembayaran` (BYR-) + lifecycle BELUM_BAYAR →
> TERIMA_PANITIA → LUNAS/BATAL. A fondasi+auto-create registrasi (field
> `metode_pembayaran`). B TUNAI Model A (PY2 terima-panitia, PY3 setor Kas
> Tunai via jalur kanonik SKM `skm-bridge.ts`, PY4 list). C rekonsiliasi
> TRANSFER Layer 1 (PY5 auto-match `kode_bayar` + koreksi kategori, PY6 link
> manual). C2 smart-scoring Layer 2 + antrian (PY7). D1 UX registrasi
> per-metode. D2 halaman `/qurban/pembayaran` + WA "pembayaran confirmed".
> D3 tab Rekonsiliasi (band-filter code-less, PY8 cari-transaksi, PY9
> resolve-kategori mixed). 547 tes hijau. Lihat `HANDOFF_SPRINT_F6.md`.
> PR #100 Draft — menunggu verifikasi iPad sebelum Hopy flip ke Ready, lalu
> migrasi PRODUCTION `migrate_F6A_pembayaran.gs`. Sebelumnya: F5b Pemetaan ✅.

> **Polish pendaftaran (cabang sendiri, di luar F6).** (A) Wizard publik kini
> menampilkan banner **"Pendaftaran Penuh"** saat PB1 BUKA tapi semua slot terisi
> (helper `hasAvailableOptions` di `publik-daftar-form.ts`). (B) `keterangan_bagian`
> jadi **checklist bagian + "Lainnya"** (panitia PS2/PS4 & publik PB3), via modul
> shared `lib/qurban/bagian-options.ts` (`composeBagian`/`parseBagian`); **storage
> tetap STRING comma-separated** (kompatibel data historis). PB3 sudah menerima
> `keterangan_bagian` (validator in-repo).

Update baris ini setiap kali sprint berganti.

## Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend/API | Next.js API Route Handlers |
| Database | Google Sheets API v4 (Google Sheets sebagai DB) |
| File Storage | Base64 Data URL di Google Sheets (logo & bukti) |
| Auth | PIN-based (bcryptjs) + JWT sesi (jose) di cookie `skm_session`; bukan NextAuth |
| Charts | Recharts |
| State | React Context + SWR |
| Hosting | Vercel |
| Testing | Node test runner (`tsx --test`) — `npm test`; bukan Jest |
| CI/CD | GitHub Actions |

## Architecture Rule

```
Browser → Next.js (Vercel) → API Routes → Google Sheets API → Google Sheets
```

**Catatan**: Logo dan bukti transaksi disimpan sebagai base64 data URL langsung di cell Google Sheets (bukan Google Drive). Gambar di-resize dan compress client-side sebelum disimpan.

**Semua akses Google Sheets HARUS melalui `lib/google-sheets.ts`** — jangan panggil API langsung dari route handler.

## Key Conventions

- **Monetary values**: Integer (Rupiah, tanpa desimal). Contoh: `Rp 1.500.000` disimpan sebagai `1500000`
- **Date format di sheets**: ISO 8601 (`YYYY-MM-DD`)
- **ID format**: `PREFIX-YYYYMMDD-XXXX` (auto-generated). Contoh: `TRX-20260323-0001`
- **Transaction types**: `MASUK` (pemasukan) dan `KELUAR` (pengeluaran)
- **Transaction status**: `AKTIF`, `VOID`
- **User roles** (`UserPeran`, 7 nilai): `SUPER_ADMIN`, `BENDAHARA`, `ADMIN_QURBAN`, `PENDAFTARAN`, `DISTRIBUSI` (F01 multi-user) + `PENGURUS`, `VIEWER` (legacy, backward-compat). Role-guard di `src/middleware.ts`.
- **Auth**: login PIN (hash bcrypt) → sesi JWT (`jose`) di cookie httpOnly `skm_session`; secret `SESSION_SECRET` (utama) / `AUTH_SECRET` (fallback). Lockout via `failed_attempts`/`locked_until` di sheet `anggota`.
- **Sheet row 1**: Selalu header, data mulai dari row 2
- **API response format**: `{ success: boolean, data?: T, error?: string }`

## Directory Structure (Planned)

```
app/
  (auth)/login/page.tsx
  (dashboard)/
    page.tsx                    # Dashboard utama
    transaksi/                  # CRUD transaksi
    kategori/                   # CRUD kategori
    rekening/                   # CRUD rekening bank
    rekonsiliasi/               # Rekonsiliasi bank
    laporan/                    # Laporan & export
    pengaturan/                 # Settings
  api/
    auth/                       # Login/logout/session
    transaksi/                  # Transaction CRUD + void + koreksi
    kategori/                   # Category CRUD
    rekening/                   # Bank account CRUD
    rekonsiliasi/               # Reconciliation
    upload/                     # File upload (bukti)
    export/                     # PDF/Excel export
    master/                     # Master data (masjid config)
    dashboard/                  # Dashboard data aggregation
components/
  ui/                           # Reusable UI primitives
  forms/                        # Form components
  charts/                       # Chart components
  layout/                       # Sidebar, Header, etc.
lib/
  google-sheets.ts              # Google Sheets service layer (SATU-SATUNYA entry point)
  google-drive.ts               # Google Drive service (legacy, tidak dipakai untuk logo/bukti)
  auth.ts                       # PIN auth helpers
  utils.ts                      # Utility functions
  constants.ts                  # Constants & enums
types/
  index.ts                      # Shared TypeScript interfaces
hooks/
  useTransaksi.ts               # SWR hooks untuk transaksi
  useDashboard.ts               # SWR hooks untuk dashboard
  useAuth.ts                    # Auth hook
```

## Environment Variables

> **Sumber kebenaran daftar env var = `.env.example`** (setiap var di sana
> benar-benar dibaca kode). Tidak ada NextAuth/Google OAuth/`PIN_SALT`.

```env
# Wajib
GOOGLE_SHEETS_ID=               # ID spreadsheet utama (10 sheet inti + 9 tab Qurban, satu workbook)
GOOGLE_SERVICE_ACCOUNT_EMAIL=   # Email service account
GOOGLE_PRIVATE_KEY=             # Private key dari credentials JSON (\n di-escape)
SESSION_SECRET=                 # Secret penanda-tangan JWT sesi (cookie skm_session)

# Opsional
AUTH_SECRET=                    # Fallback secret bila SESSION_SECRET kosong
FONNTE_API_TOKEN=               # Token Fonnte; kosong → mode mock
FONNTE_MOCK=                    # "true" memaksa mode mock WA
NEXT_PUBLIC_MASJID_NAME=        # Fallback nama masjid utk export
QURBAN_MODULE_ENABLED=          # "false" mematikan rute Qurban (kill-switch)
QURBAN_LEGACY_LOGIN_ENABLED=    # "true" izinkan login legacy single-PIN
QURBAN_PANITIA_HP=              # Tidak dibaca kode (landing publik 1447H di-decommission); simpan utk rebuild
QURBAN_PAYMENT_BANK_NAME=       # idem
QURBAN_PAYMENT_ACCOUNT_NUMBER=  # idem
QURBAN_PAYMENT_ACCOUNT_HOLDER=  # idem
DARI_REKENING_ID=               # Hanya utk script migrasi mutasi
KE_REKENING_ID=                 # Hanya utk script migrasi mutasi
```

## Common Pitfalls

1. **Google Sheets API rate limit**: 100 requests per 100 seconds per user. Gunakan batch reads.
2. **Private key newlines**: Saat set env var, pastikan `\n` di-escape dengan benar (`\\n` di `.env`, actual newline di Vercel)
3. **Sheet name case-sensitive**: `Transaksi` ≠ `transaksi`. Gunakan constants.
4. **Row-based concurrency**: Google Sheets tidak punya row locking. Untuk SKM ini acceptable karena single-user write per masjid.
5. **Vercel serverless limit**: Body size max 4.5MB. Gambar di-resize dan compress client-side sebelum upload.
6. **Google Sheets cell limit**: Max ~10 juta cells per spreadsheet. Untuk 1 masjid, ini lebih dari cukup.
7. **Google Sheets cell character limit**: Max 50.000 karakter per cell. Logo/bukti di-resize agar base64 muat di 1 cell (logo max 200px, bukti max 600px).

## Key Patterns (Sprint 9+)

- **Bulk edit with chunking + audit `batch_id`**: `POST /api/transaksi/bulk-update-kategori` updates transaksi in chunks of 50, each audit log entry shares a `batch_id` for traceability.
- **Usage-count check before delete (proteksi hapus)**: `GET /api/kategori/[id]/usage-count` and `GET /api/rekening/[id]/usage-count` count active (non-VOID) transactions. Frontend shows protection dialog if count > 0, confirmation dialog if count = 0.
- **Reuse dialog/toast pattern from Kelompok Anggaran**: `ConfirmDialog` component (variant `primary` or `danger`), `useToast()` hook from `ToastProvider`.
- **URL query param for pre-filtered navigation**: Transaksi page reads `?kategori=ID` and `?rekening=ID` from URL to pre-set filters.

## Documentation Map

| Dokumen | Path | Deskripsi |
|---|---|---|
| Project Brief | `docs/PROJECT_BRIEF.md` | Referensi utama proyek |
| Architecture | `docs/ARCHITECTURE.md` | Arsitektur sistem & data flow |
| Database Schema | `docs/DATABASE_SCHEMA.md` | **KRITIS** — Schema 19 tab (10 inti + 9 Qurban) dalam SATU workbook. Sheet baru WAJIB didaftarkan di `SHEET_HEADERS` (`src/lib/constants.ts`). |
| API Reference | `docs/API_REFERENCE.md` | Semua API routes & kontrak |
| Setup Guide | `docs/SETUP_GUIDE.md` | Panduan setup development |
| Sprint Plan | `docs/SPRINT_PLAN.md` | Overview sprint & dependensi |
| Conventions | `docs/CONVENTIONS.md` | Standar coding |
| Adopter Guide | `docs/ADOPTER_GUIDE.md` | Panduan adopsi untuk masjid lain |
| Sprint Details | `docs/sprints/SPRINT_N.md` | Detail per sprint (0-6) |
