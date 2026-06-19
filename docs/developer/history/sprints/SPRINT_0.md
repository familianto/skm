# Sprint 0: Setup Wizard

**Durasi**: 1 minggu
**Tujuan**: Inisialisasi project Next.js, konfigurasi environment, setup koneksi Google Sheets, dan health check.

## Prasyarat

- Google Cloud Project sudah dibuat (lihat `SETUP_GUIDE.md`)
- Google Sheets sudah disiapkan dengan semua sheet tabs
- Service Account credentials sudah tersedia
- Node.js 18+ terinstall

## Deliverables

### 1. Inisialisasi Project Next.js

- [ ] `npx create-next-app@latest skm --typescript --tailwind --app --src-dir --import-alias "@/*"`
- [ ] Konfigurasi `tsconfig.json` (strict mode)
- [ ] Setup Tailwind CSS
- [ ] Buat directory structure sesuai `ARCHITECTURE.md`
- [ ] Tambah `.env.example` dengan semua variabel (tanpa nilai)
- [ ] Setup `.gitignore` (pastikan `.env.local` dan credentials tidak di-commit)

### 2. Setup Google Sheets Connection

- [ ] Install `googleapis` package
- [ ] Buat `lib/google-sheets.ts` — skeleton service class
  - Constructor: inisialisasi Google Sheets API client
  - `getRows(sheetName, range?)`: baca rows dari sheet
  - `appendRow(sheetName, values)`: tambah row baru
  - `updateRow(sheetName, rowIndex, values)`: update row
  - `batchGet(ranges)`: batch read
  - `getNextId(prefix)`: generate ID berikutnya
  - `findRowIndex(sheetName, id)`: cari index row berdasarkan ID
- [ ] Buat `lib/google-drive.ts` — skeleton service class
  - `uploadFile(file, fileName, mimeType, folderId?)`: upload file
  - `getFileUrl(fileId)`: get public URL
- [ ] Test koneksi ke Google Sheets

### 3. Health Check API

- [ ] Buat `app/api/health/route.ts`
  - GET endpoint
  - Test read dari sheet `master`
  - Return status koneksi

### 4. Seed Script

- [ ] Buat `scripts/seed.ts`
  - Setup header rows di semua sheets (jika belum ada)
  - Seed default categories (lihat `DATABASE_SCHEMA.md`)
  - Insert data awal ke sheet `master`
- [ ] Tambah npm script: `"seed": "ts-node scripts/seed.ts"`

### 5. Basic Configuration Files

- [ ] `.env.example` — template environment variables
- [ ] `lib/constants.ts` — sheet names, prefixes, default values
- [ ] `types/index.ts` — placeholder (kosong, diisi di Sprint 1)

### 6. CI/CD Setup

- [ ] Buat `.github/workflows/ci.yml`
  - Trigger: push to main, pull request
  - Steps: install, lint, type-check, test, build
- [ ] Setup ESLint config
- [ ] Setup Prettier config (opsional)

## File Baru

```
src/
  app/
    api/
      health/
        route.ts                # Health check endpoint
    layout.tsx                  # Root layout (minimal)
    page.tsx                    # Landing/redirect ke login
  lib/
    google-sheets.ts            # Google Sheets service
    google-drive.ts             # Google Drive service
    constants.ts                # Constants
  types/
    index.ts                    # TypeScript types (placeholder)
scripts/
  seed.ts                       # Database seeding
.env.example                    # Environment template
.github/
  workflows/
    ci.yml                      # CI pipeline
```

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/api/health` | Health check & test koneksi |

## Testing

- [ ] Health check endpoint returns 200
- [ ] Google Sheets connection successful
- [ ] Seed script creates headers without error
- [ ] Build passes (`npm run build`)
- [ ] TypeScript check passes (`npm run type-check`)

## Definition of Done

- [ ] Project Next.js bisa di-run (`npm run dev`)
- [ ] Health check API mereturn `{ success: true, sheets_connected: true }`
- [ ] Seed script berhasil membuat headers dan default categories
- [ ] CI/CD pipeline berjalan tanpa error
- [ ] Semua environment variables terdokumentasi di `.env.example`
- [ ] Code committed dan pushed
