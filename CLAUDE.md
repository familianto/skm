# CLAUDE.md — SKM (Sistem Keuangan Masjid) v2.1

## Project Identity

- **Nama**: Sistem Keuangan Masjid (SKM) v2.1
- **Deskripsi**: Sistem manajemen keuangan masjid berbasis web menggunakan Google Sheets sebagai database
- **License**: MIT
- **Owner**: familianto
- **Bahasa UI**: Bahasa Indonesia
- **Bahasa Kode**: English (identifiers, comments)

## Current Sprint

> **Sprint 9 — Bulk Edit & Proteksi Hapus** selesai. Lihat `HANDOFF_SPRINT09.md` untuk detail.

Update baris ini setiap kali sprint berganti.

## Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Backend/API | Next.js API Route Handlers |
| Database | Google Sheets API v4 (Google Sheets sebagai DB) |
| File Storage | Base64 Data URL di Google Sheets (logo & bukti) |
| Auth | PIN-based (hash disimpan di sheet `master`) |
| Charts | Chart.js / Recharts |
| State | React Context + SWR |
| Hosting | Vercel |
| Testing | Jest |
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
- **User roles**: `BENDAHARA`, `PENGURUS`, `VIEWER`
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

```env
# Google Sheets
GOOGLE_SHEETS_ID=               # ID spreadsheet dari URL
GOOGLE_SERVICE_ACCOUNT_EMAIL=   # Email service account
GOOGLE_PRIVATE_KEY=             # Private key dari credentials JSON

# Google OAuth
GOOGLE_CLIENT_ID=               # Client ID dari Google Cloud Console
GOOGLE_CLIENT_SECRET=           # Client Secret dari Google Cloud Console

# NextAuth
NEXTAUTH_URL=                   # URL aplikasi (http://localhost:3000 untuk dev)
NEXTAUTH_SECRET=                # Secret untuk NextAuth session

# App
NEXT_PUBLIC_APP_NAME=SKM
NEXT_PUBLIC_APP_VERSION=2.1

# Auth
AUTH_SECRET=                    # Secret untuk session/cookie encryption
PIN_SALT=                       # Salt untuk hashing PIN

# Fonnte WhatsApp API
FONNTE_API_TOKEN=               # Token API dari fonnte.com
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
| Database Schema | `docs/DATABASE_SCHEMA.md` | **KRITIS** — Schema semua Google Sheets |
| API Reference | `docs/API_REFERENCE.md` | Semua API routes & kontrak |
| Setup Guide | `docs/SETUP_GUIDE.md` | Panduan setup development |
| Sprint Plan | `docs/SPRINT_PLAN.md` | Overview sprint & dependensi |
| Conventions | `docs/CONVENTIONS.md` | Standar coding |
| Adopter Guide | `docs/ADOPTER_GUIDE.md` | Panduan adopsi untuk masjid lain |
| Sprint Details | `docs/sprints/SPRINT_N.md` | Detail per sprint (0-6) |
