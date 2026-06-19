# HANDOFF — Sprint 3: Donatur & Reminder WA

**Tanggal**: 2026-03-23
**Sprint**: 3 — Donatur & Reminder WA
**Branch**: `claude/sprint-3-donor-reminder-Bh7l0`
**Statistik**: 16 files changed, +1659 lines
**Status Build**: PASS (lint, type-check, build — zero errors/warnings)

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Donatur types, enums, constants, sheet headers | Done |
| 2 | Donatur Zod validators (create, update) | Done |
| 3 | Reminder types, enums, constants, sheet headers | Done |
| 4 | Reminder Zod validators (create, bulk) | Done |
| 5 | Fonnte WA service (`lib/fonnte.ts`) with mock fallback | Done |
| 6 | API GET /api/donatur (list + filter kelompok) | Done |
| 7 | API POST /api/donatur (create) | Done |
| 8 | API GET /api/donatur/[id] (detail) | Done |
| 9 | API PUT /api/donatur/[id] (update) | Done |
| 10 | API DELETE /api/donatur/[id] (soft delete) | Done |
| 11 | API GET /api/reminder (list + filter donatur_id) | Done |
| 12 | API POST /api/reminder (single send) | Done |
| 13 | API POST /api/reminder/send (bulk send) | Done |
| 14 | API GET /api/reminder/send (Fonnte status check) | Done |
| 15 | Halaman Daftar Donatur (stats, search, filter, CRUD modal) | Done |
| 16 | Halaman Detail Donatur (info, stats, reminder history, send WA) | Done |
| 17 | Halaman Reminder WA (bulk select, templates, send, history) | Done |
| 18 | Custom hooks (useDonatur, useDonaturDetail, useReminder, useFonnteStatus) | Done |
| 19 | Sidebar navigation updated (Donatur, Reminder WA) | Done |
| 20 | Badge variants added (TETAP, INSIDENTAL, TERKIRIM, GAGAL, PENDING) | Done |

---

## Keputusan Teknis

### Fonnte Integration Approach
- Fonnte API diakses via `lib/fonnte.ts` (single entry point, mirip pattern `lib/google-sheets.ts`).
- **Mock mode otomatis**: Jika `FONNTE_API_TOKEN` tidak di-set atau `FONNTE_MOCK=true`, semua send mengembalikan success mock tanpa panggil API. Ini memungkinkan development dan testing tanpa device WA aktif.
- Nomor telepon di-normalize otomatis (08xxx → 628xxx).
- Response dari Fonnte disimpan di kolom `response` sheet reminder untuk debugging.

### Donor Schema Design
- Sheet `donatur` terpisah dari `anggota` — donatur adalah pihak luar yang berdonasi, bukan pengurus internal.
- Field `kelompok`: `TETAP` (donasi rutin bulanan) vs `INSIDENTAL` (donasi tidak rutin).
- Field `jumlah_komitmen`: komitmen donasi per bulan (hanya relevan untuk TETAP, 0 untuk INSIDENTAL).
- Soft delete via `is_active` flag (konsisten dengan entity lain).

### Reminder Schema Design
- Setiap send = 1 row di sheet `reminder` (termasuk bulk send: 10 donatur = 10 rows).
- Status: `TERKIRIM` / `GAGAL` / `PENDING`.
- Pesan disimpan lengkap per row (sudah di-personalize per donatur).
- Template `{nama}` di-replace server-side sebelum kirim.

### Message Templates
- 4 built-in templates: Donasi Rutin, Ucapan Terima Kasih, Laporan Keuangan, Custom.
- Templates di-hardcode di frontend (bukan di sheet) karena bersifat static dan jarang berubah.
- User bisa edit pesan sebelum kirim.

### Bulk Send Strategy
- Bulk send dilakukan secara sequential (bukan parallel) untuk menghindari rate limit Fonnte.
- Setiap pesan dipersonalisasi dengan `{nama}` sebelum dikirim.
- Hasil per donatur dicatat individual di sheet reminder.

### No Scheduled Reminders
- Reminder dikirim secara manual (on-demand), bukan otomatis/terjadwal.
- Alasan: Vercel serverless tidak support cron job, dan scope sprint ini adalah manual reminder.
- Scheduled reminders bisa ditambahkan di sprint berikutnya jika dibutuhkan (via Vercel Cron atau external scheduler).

---

## File Baru Sprint 3

```
src/
  app/
    (dashboard)/
      donatur/
        page.tsx                # Daftar donatur (stats, search, filter, CRUD)
        [id]/
          page.tsx              # Detail donatur + riwayat reminder + send WA
      reminder/
        page.tsx                # Reminder WA (bulk select, templates, history)
    api/
      donatur/
        route.ts                # GET (list), POST (create)
        [id]/
          route.ts              # GET (detail), PUT (update), DELETE (soft delete)
      reminder/
        route.ts                # GET (list), POST (single send)
        send/
          route.ts              # POST (bulk send), GET (Fonnte status)
  hooks/
    use-donatur.ts              # useDonatur(), useDonaturDetail()
    use-reminder.ts             # useReminder(), useFonnteStatus()
  lib/
    fonnte.ts                   # Fonnte WA service (send + mock fallback)
    validators.ts               # + donaturCreateSchema, donaturUpdateSchema,
                                #   reminderCreateSchema, reminderBulkSchema
  types/
    index.ts                    # + Donatur, Reminder, DonaturKelompok,
                                #   ReminderTipe, ReminderStatus
  components/
    layout/sidebar.tsx          # + Donatur & Reminder WA nav items
    ui/badge.tsx                # + TETAP, INSIDENTAL, TERKIRIM, GAGAL, PENDING variants
```

---

## Known Issues / Tech Debt

1. **Fonnte device belum terkoneksi** — Semua reminder berjalan di mock mode. Setelah device di-connect, set `FONNTE_API_TOKEN` di env vars dan hapus/unset `FONNTE_MOCK`.
2. **No scheduled reminders** — Hanya manual send. Scheduled bisa ditambahkan via Vercel Cron jika dibutuhkan.
3. **No donation tracking** — Donatur belum terhubung langsung ke transaksi (tidak ada `donatur_id` di sheet transaksi). Bisa ditambahkan di sprint berikutnya jika perlu melacak total donasi per donatur.
4. **Sequential bulk send** — Untuk jumlah besar (100+ donatur), bulk send mungkin lambat karena sequential. Bisa di-optimize dengan batching jika dibutuhkan.
5. **Message templates hardcoded** — Templates di-hardcode di frontend. Jika ingin user bisa edit/simpan template, perlu sheet baru `template_pesan`.
6. **No tests** — Unit tests untuk donatur & reminder API belum dibuat.
7. **No rate limit protection** — Bulk send tidak ada throttling. Fonnte punya rate limit sendiri, tapi kita tidak handle retry on rate limit.

---

## Konteks untuk Sprint 4: Dashboard, Laporan & Export

Sprint 4 akan mengimplementasi dashboard real-time dengan chart dan export laporan PDF/Excel.

### Dependency dari Sprint 1-3

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

### File baru yang dibutuhkan Sprint 4
- `src/app/api/dashboard/summary/route.ts` — Ringkasan keuangan (total masuk/keluar/saldo)
- `src/app/api/dashboard/chart-data/route.ts` — Data untuk chart (tren bulanan, breakdown kategori)
- `src/app/api/export/pdf/route.ts` — Generate PDF laporan
- `src/app/api/export/excel/route.ts` — Generate Excel laporan
- `src/app/(dashboard)/page.tsx` — Update dashboard dengan data real + chart
- `src/app/(dashboard)/laporan/page.tsx` — Halaman laporan & export
- `src/components/charts/monthly-trend.tsx` — Chart tren bulanan
- `src/components/charts/category-breakdown.tsx` — Chart breakdown kategori
- `src/hooks/use-dashboard.ts` — Hooks untuk dashboard data

### Library baru yang dibutuhkan Sprint 4
- `recharts` atau `chart.js` + `react-chartjs-2` — Charting
- `jspdf` atau `@react-pdf/renderer` — PDF generation
- `xlsx` atau `exceljs` — Excel generation

---

## Environment Variables

### Baru di Sprint 3

```env
# Fonnte WhatsApp API (opsional — mock mode jika tidak di-set)
FONNTE_API_TOKEN=               # Token dari dashboard Fonnte
FONNTE_MOCK=                    # Set 'true' untuk force mock mode (opsional)
```

### Existing (Sprint 0-2)

```env
GOOGLE_SHEETS_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
NEXT_PUBLIC_APP_NAME=SKM
NEXT_PUBLIC_MASJID_NAME=
AUTH_SECRET=
PIN_SALT=
```

---

## Post-Sprint UI/UX Updates (Sprint 7 — 6 April 2026)

Komponen yang dibuat di Sprint 3 dan diupdate di Sprint 7:
- **Donatur page**: Kolom Aksi diubah ke text-center
- **Badge TETAP/INSIDENTAL**: Style diubah ke grayscale muted
- **Format Rupiah**: Komitmen donasi sekarang menggunakan spasi ("Rp 1.234.567")

---

## Post-Sprint Updates — Search & Expandable Deskripsi (April 2026)

Tidak ada perubahan langsung di Sprint 3 (Donatur/Reminder), tetapi pola
"search input + debounce + clear button" yang dipakai di Transaksi page
bisa direplikasi ke Donatur page jika dibutuhkan nanti. Lihat
HANDOFF_SPRINT02.md untuk detail teknis.
