# HANDOFF — Sprint 2: Core Transactions

**Tanggal**: 2026-03-23
**Sprint**: 2 — Core Transactions
**Branch**: `claude/sprint-2-transactions-2LcQx`
**Statistik**: 12 files changed, +1044 lines
**Status Build**: PASS (lint, type-check, build — zero errors/warnings)

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | API GET /api/transaksi (list + filter tahun/bulan) | Done |
| 2 | API POST /api/transaksi (create + audit log) | Done |
| 3 | API GET /api/transaksi/[id] (detail) | Done |
| 4 | API PUT /api/transaksi/[id] (update, hanya AKTIF) | Done |
| 5 | Zod validators (transaksiCreateSchema, transaksiUpdateSchema) | Done |
| 6 | Halaman Daftar Transaksi (filter, sort, pagination, totals) | Done |
| 7 | Halaman Tambah Transaksi (form + validasi) | Done |
| 8 | Halaman Detail Transaksi | Done |
| 9 | Halaman Edit Transaksi (hanya AKTIF) | Done |
| 10 | Reusable TransactionForm component | Done |
| 11 | Custom hooks (useTransaksi, useKategori, useRekening) | Done |
| 12 | Helper functions (parseRupiah, paginateData) | Done |

---

## Keputusan Teknis

### Transaction ID Format
- `TRX-YYYYMMDD-XXXX` — auto-generated via `sheetsService.getNextId(ID_PREFIXES.TRANSAKSI)`.
- Sequential counter per day, 4-digit zero-padded.

### Pagination Strategy
- Client-side pagination (20 items per page via `APP_CONFIG.PAGINATION_LIMIT`).
- Server returns all rows, client filters/sorts/paginates in-memory.
- Acceptable for typical masjid scale (<5000 transactions/year).

### Sorting
- Default: tanggal descending (newest first), secondary sort by ID.
- User can toggle sort on `tanggal` and `jumlah` columns.
- Sort icon: ↕ (neutral), ↓ (desc), ↑ (asc).

### Filter Implementation
- All filters are client-side on the full dataset.
- 5 filters: jenis (MASUK/KELUAR), status (AKTIF/VOID), kategori (dropdown), date range (from/to).
- Changing any filter resets page to 1.

### Footer Totals
- Computed from filtered data (not paginated view).
- Only counts AKTIF transactions for totals.
- Shows: total masuk, total keluar, saldo (masuk - keluar).

### Form Component Reuse
- `TransactionForm` component is shared between create (`/transaksi/baru`) and edit (`/transaksi/[id]/edit`).
- `mode` prop determines POST vs PUT behavior and button labels.
- Kategori dropdown filters automatically when jenis changes.

### Auth on Write Operations
- POST and PUT routes verify session via `getSession(request)`.
- `created_by` field populated from session role.
- GET routes do not require auth (handled by middleware).

### Hooks Pattern
- Custom hooks use `useState` + `useEffect` + `useCallback` (not SWR library).
- Each hook returns `{ data, loading, error, refetch }`.
- `useKategori` and `useRekening` are lightweight wrappers for dropdown data.

---

## File Baru Sprint 2

```
src/
  app/
    (dashboard)/
      transaksi/
        page.tsx                # Daftar transaksi (filter, sort, pagination)
        baru/
          page.tsx              # Form tambah transaksi
        [id]/
          page.tsx              # Detail transaksi
          edit/
            page.tsx            # Form edit transaksi
    api/
      transaksi/
        route.ts                # GET (list), POST (create)
        [id]/
          route.ts              # GET (detail), PUT (update)
  components/
    forms/
      transaction-form.tsx      # Reusable transaction form (create & edit)
  hooks/
    use-transaksi.ts            # useTransaksi(), useTransaksiDetail()
    use-kategori.ts             # useKategori()
    use-rekening.ts             # useRekening()
  lib/
    utils.ts                    # + parseRupiah(), paginateData()
    validators.ts               # + transaksiCreateSchema, transaksiUpdateSchema
```

---

## Known Issues / Tech Debt

1. **No SWR library** — Hooks use manual `useState`/`useEffect` instead of SWR. Works fine but doesn't provide automatic revalidation, deduplication, or cache. Can migrate later if needed.
2. **Client-side pagination** — All transactions fetched from API, filtered/paginated in browser. Fine for <5000 rows. Server-side pagination with `offset`/`limit` should be considered if data grows significantly.
3. **No void/koreksi API** — Detail page shows void info and koreksi link but the actual void/koreksi endpoints are deferred to Sprint 4 (as per sprint plan).
4. **No file upload** — `bukti_url` field exists but upload functionality is Sprint 4.
5. **Dashboard placeholder** — Dashboard page (`/`) still shows static placeholder cards. Will be replaced in Sprint 3.
6. **No tests** — Unit tests for transaksi API and components should be added.
7. **Kategori dropdown reset on edit** — When editing, changing jenis resets kategori_id to empty (by design for create, but in edit mode it could preserve the existing selection if jenis hasn't changed).

---

## Konteks untuk Sprint 3: Dashboard & Export

Sprint 3 akan mengimplementasi dashboard real-time dengan chart dan export laporan PDF/Excel.

### Dependency dari Sprint 1 & 2

| File/Komponen | Dipakai untuk |
|---|---|
| `src/lib/google-sheets.ts` | `sheetsService.getRows()` untuk agregasi data transaksi |
| `src/lib/constants.ts` | `SHEET_NAMES.TRANSAKSI`, `SHEET_NAMES.KATEGORI`, `SHEET_NAMES.REKENING_BANK` |
| `src/types/index.ts` | `Transaksi`, `TransaksiJenis`, `TransaksiStatus`, `Kategori`, `RekeningBank` |
| `src/lib/utils.ts` | `formatRupiah()`, `formatTanggal()`, `nowISO()` |
| `src/lib/auth.ts` | `getSession()` untuk export endpoints |
| `src/app/api/transaksi/route.ts` | Referensi pattern `rowToTransaksi()` untuk API dashboard |
| `src/hooks/use-transaksi.ts` | Referensi pattern untuk `useDashboardSummary()`, `useChartData()` |
| `src/components/ui/*` | Card, Badge, Loading, Button, Table untuk dashboard layout |
| `src/components/layout/*` | PageTitle, Sidebar (link Laporan sudah ada di sidebar) |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout wrapping halaman laporan |
| `src/app/(dashboard)/page.tsx` | Placeholder dashboard — akan di-replace dengan data real |

### File baru yang dibutuhkan Sprint 3
- `src/app/api/dashboard/summary/route.ts` — Ringkasan keuangan (total masuk/keluar/saldo)
- `src/app/api/dashboard/chart-data/route.ts` — Data untuk chart (tren bulanan, breakdown kategori)
- `src/app/api/export/pdf/route.ts` — Generate PDF laporan
- `src/app/api/export/excel/route.ts` — Generate Excel laporan
- `src/app/(dashboard)/page.tsx` — Update dashboard dengan data real + chart
- `src/app/(dashboard)/laporan/page.tsx` — Halaman laporan & export
- `src/components/charts/monthly-trend.tsx` — Chart tren bulanan
- `src/components/charts/category-breakdown.tsx` — Chart breakdown kategori
- `src/hooks/use-dashboard.ts` — Hooks untuk dashboard data

### Library baru yang dibutuhkan Sprint 3
- `recharts` atau `chart.js` + `react-chartjs-2` — Charting
- `jspdf` atau `@react-pdf/renderer` — PDF generation
- `xlsx` atau `exceljs` — Excel generation

---

## Environment Requirements

Tidak ada perubahan environment variables dari Sprint 1. Semua konfigurasi yang ada sudah cukup untuk Sprint 2.

---

## Post-Sprint UI/UX Updates (Sprint 7 — 6 April 2026)

Komponen yang dibuat di Sprint 2 dan diupdate di Sprint 7:
- **Transaksi page**: Kolom Aksi diubah ke text-center, format Rupiah ditambah spasi ("Rp 1.234.567")
- **Badge MASUK/KELUAR**: Style diubah ke subtle (bg-emerald-50/bg-red-50 dengan ring border)

---

## Post-Sprint Updates — Search & Expandable Deskripsi (April 2026)

Komponen Transaksi page (dibuat di Sprint 2) dapat update fitur:

- **Search Deskripsi**:
  - Input search baru di filter bar (sejajar dengan filter Jenis/Status/Kategori/Tanggal), grid berubah dari 5 → 6 kolom
  - State `searchInput` (immediate, controlled) → `searchQuery` (debounced 300ms via setTimeout di useEffect)
  - Filter di-apply dalam memo `filtered` dengan `t.deskripsi.toLowerCase().includes(searchQuery)`
  - Search reset page ke 1 saat query berubah (di-handle di efek debounce)
  - Tombol clear (X) di dalam input untuk reset cepat
  - Search ikut update sticky summary bar dan totals (Masuk/Keluar/Saldo)
  - Bisa dikombinasikan dengan semua filter existing (jenis, status, kategori, tanggal)

- **Deskripsi Expandable**:
  - State `expandedKeys: Set<string>` di parent komponen, helper `toggleExpanded(id)`
  - Default render: `truncate` (1 baris dengan ellipsis)
  - Klik teks → expand `whitespace-normal break-words` (multi-line, expand ke bawah)
  - Visual hint: chevron icon kecil di kanan teks, rotasi 180° saat expanded
  - Cell dibuat `align-top` agar layout tidak shift saat 1 row expand
  - `max-w-[260px]` untuk pertahankan lebar kolom — expand hanya menambah tinggi

Lihat juga catatan di HANDOFF_SPRINT07.md.
