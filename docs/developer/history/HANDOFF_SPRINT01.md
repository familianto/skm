# HANDOFF — Sprint 1: Foundation

**Tanggal**: 2026-03-23
**Sprint**: 1 — Foundation
**Branch**: `claude/update-dev-documentation-RGwH6`
**Statistik**: 36 files changed, +2135 lines
**Status Build**: PASS (lint, type-check, build — zero errors/warnings)

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | PIN Authentication (bcrypt + JWT sessions) | Done |
| 2 | Middleware (redirect unauthenticated) | Done |
| 3 | Auth API (`/login`, `/logout`, `/session`) | Done |
| 4 | Audit Log Helper | Done |
| 5 | CRUD Kategori (API + halaman) | Done |
| 6 | CRUD Rekening Bank (API + halaman) | Done |
| 7 | CRUD Anggota (API only) | Done |
| 8 | Master API (GET/PUT) | Done |
| 9 | Layout (Sidebar responsive + Dashboard) | Done |
| 10 | UI Components (8 komponen) | Done |
| 11 | Login Page (PIN input) | Done |
| 12 | Zod Validators | Done |
| 13 | Utility Functions | Done |
| 14 | Auth Hook (useAuth) | Done |

---

## Keputusan Teknis

### Library Choices
- **bcryptjs** (v3.0.3) — PIN hashing. Pure JS, no native compile needed (Vercel-compatible).
- **jose** (v6.2.2) — JWT sign/verify for session tokens. Lightweight, Web Crypto API-based, edge-compatible (works in Next.js middleware).
- **zod** (v4.3.6) — Schema validation for all API inputs. Note: Zod v4 uses `.issues` instead of `.errors` on `ZodError`.
- **clsx** + **tailwind-merge** — Utility `cn()` function for merging Tailwind classes.

### Auth Flow
- PIN-based (4-6 digit). Single PIN stored as bcrypt hash in `master` sheet row 2, column H (`pin_hash`).
- Session: JWT token in `skm_session` httpOnly cookie, 24h expiry.
- Middleware (`src/middleware.ts`): intercepts all routes, redirects to `/login` if no valid session. Public paths: `/login`, `/api/auth/login`, `/api/health`.
- Role is hardcoded to `BENDAHARA` at login (single-user system per masjid).

### Folder Structure
```
src/
  app/
    login/page.tsx              # Login page (public, outside dashboard layout)
    (dashboard)/                # Route group with shared layout
      layout.tsx                # Sidebar + ToastProvider
      page.tsx                  # Dashboard (root /)
      kategori/page.tsx         # Kategori CRUD page
      rekening/page.tsx         # Rekening bank CRUD page
    api/
      auth/{login,logout,session}/route.ts
      kategori/route.ts + [id]/route.ts
      rekening/route.ts + [id]/route.ts
      anggota/route.ts + [id]/route.ts
      master/route.ts
  components/
    layout/{sidebar,header,page-title}.tsx
    ui/{button,input,card,modal,table,badge,loading,toast}.tsx
  lib/
    auth.ts                     # PIN hash/verify, session create/get/delete
    audit.ts                    # Audit log helper (append to audit_log sheet)
    utils.ts                    # formatRupiah, formatTanggal, cn, nowISO, todayISO
    validators.ts               # Zod schemas for all API inputs
    google-sheets.ts            # (Sprint 0) Google Sheets service
    constants.ts                # (Sprint 0) Sheet names, headers, defaults
  hooks/
    use-auth.ts                 # Client-side auth hook
  middleware.ts                 # Auth middleware
```

### API Pattern
- All API routes return `{ success: boolean, data?: T, error?: string }` (`ApiResponse<T>`).
- Zod validation on all POST/PUT bodies. Error message from `parsed.error.issues[0].message`.
- Soft delete pattern: `is_active` set to `FALSE` (never actually deletes rows from sheets).
- Audit logging on all write operations via `logAudit()` — fire-and-forget with `void` for deletes.

### UI Decisions
- Emerald color palette for primary brand.
- Sidebar navigation, responsive (collapsible on mobile via state toggle).
- Toast notifications via React Context (`ToastProvider` in dashboard layout).
- Modal dialogs for create/edit forms (no separate pages for CRUD forms).

---

## Known Issues / Tech Debt

1. **Dashboard placeholder** — `(dashboard)/page.tsx` shows static placeholder cards. Real data aggregation deferred to Sprint 3.
2. **Hardcoded role** — Login always assigns `BENDAHARA` role. Multi-role support can be added later with anggota PIN matching.
3. **No tests yet** — Sprint 1 plan includes tests but implementation focused on features first. Unit tests for auth and CRUD should be added.
4. **Sidebar `masjidName` prop** — Currently defaults to `'SKM'`. Should be fetched from master data on layout mount.
5. **No pagination** — CRUD list pages fetch all rows. Fine for typical masjid scale (<1000 rows), but pagination should be added for transaksi in Sprint 2.
6. **`PIN_SALT` env var** — Defined in `.env.example` but not actually used (bcryptjs generates its own salt). Can be removed or repurposed.

---

## Konteks untuk Sprint 2: Transaksi Inti

Sprint 2 akan mengimplementasi pencatatan pemasukan & pengeluaran — fitur inti SKM.

### Dependency dari Sprint 1

| File/Komponen | Dipakai untuk |
|---|---|
| `src/lib/google-sheets.ts` | `sheetsService.appendRow()`, `getRows()`, `getRowById()`, `updateRow()`, `getNextId()` |
| `src/lib/audit.ts` | `logAudit()` untuk setiap transaksi create/void/koreksi |
| `src/lib/validators.ts` | Tambahkan `transaksiCreateSchema`, `transaksiVoidSchema` |
| `src/lib/utils.ts` | `formatRupiah()`, `nowISO()`, `todayISO()` |
| `src/lib/constants.ts` | `SHEET_NAMES.TRANSAKSI`, `ID_PREFIXES.TRANSAKSI`, `SHEET_HEADERS` |
| `src/types/index.ts` | `Transaksi`, `TransaksiJenis`, `TransaksiStatus`, `ApiResponse<T>` |
| `src/lib/auth.ts` | `getSession()` untuk `created_by` field |
| `src/components/ui/*` | Button, Input, Card, Modal, Table, Badge, Loading, Toast |
| `src/components/layout/*` | PageTitle, Sidebar (tambah link Transaksi — sudah ada) |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout wrapping halaman transaksi |
| `src/app/api/kategori/route.ts` | GET untuk dropdown kategori di form transaksi |
| `src/app/api/rekening/route.ts` | GET untuk dropdown rekening di form transaksi |

### File baru yang dibutuhkan Sprint 2
- `src/app/api/transaksi/route.ts` — GET (list), POST (create)
- `src/app/api/transaksi/[id]/route.ts` — GET (detail), PUT (update)
- `src/app/api/transaksi/[id]/void/route.ts` — POST (void transaksi)
- `src/app/(dashboard)/transaksi/page.tsx` — List + filter + search
- `src/app/(dashboard)/transaksi/baru/page.tsx` — Form input transaksi baru
- `src/hooks/use-transaksi.ts` — SWR hook untuk data transaksi

---

## Environment Requirements

```env
# Google Sheets (wajib)
GOOGLE_SHEETS_ID=               # ID spreadsheet dari URL
GOOGLE_SERVICE_ACCOUNT_EMAIL=   # Email service account
GOOGLE_PRIVATE_KEY=""           # Private key, wrap in quotes, \n for newlines

# Google Drive (opsional, untuk upload bukti di Sprint 4)
GOOGLE_DRIVE_FOLDER_ID=

# Auth (wajib)
AUTH_SECRET=                    # JWT signing secret. Generate: openssl rand -hex 32

# App Config (opsional)
NEXT_PUBLIC_APP_NAME=SKM
NEXT_PUBLIC_APP_VERSION=2.1
PIN_SALT=                       # Tidak dipakai saat ini (bcryptjs auto-salt)
```

---

## Post-Sprint UI/UX Updates (Sprint 7 — 6 April 2026)

Komponen yang dibuat di Sprint 1 dan diupdate di Sprint 7:
- **Sidebar**: Menu diubah dari flat list menjadi grouped sections (Utama, Laporan, Pengaturan, Lainnya)
- **Badge**: Style diubah menjadi subtle/muted (light background + ring border)
- **Table**: Header font-weight diubah ke semibold, kolom Aksi alignment text-center
- **Card**: Sudah sesuai (shadow-sm + border-gray-200), tidak ada perubahan
