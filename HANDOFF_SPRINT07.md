# HANDOFF — Sprint 7: UI/UX Polish — Sidebar Grouping + Tema & Layout

**Tanggal**: 2026-04-06
**Sprint**: 7 — UI/UX Polish
**Branch**: `claude/sidebar-grouping-theme-bhLHI`
**Status**: Selesai

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Sidebar: menu dikelompokkan dalam sections (Utama, Laporan, Pengaturan, Lainnya) | Done |
| 2 | Section labels: font kecil, uppercase, warna muted, tidak clickable | Done |
| 3 | Format Rupiah: spasi antara "Rp" dan angka (`Rp 1.234.567`) | Done |
| 4 | Badge: style subtle/muted (light bg + ring border) untuk MASUK, KELUAR, AKTIF, dll | Done |
| 5 | Table: header font-semibold, kolom Aksi text-center di semua tabel | Done |
| 6 | Rekonsiliasi: form dibatasi max-w-2xl | Done |
| 7 | Dokumentasi: PROJECT_BRIEF, HANDOFF_IMPORT_DATA, HANDOFF_SPRINT01-06 diupdate | Done |

---

## Keputusan Teknis

### 1. Sidebar Grouping

**Sebelum**: Flat list 10 menu items tanpa separasi.

**Sesudah**: 4 sections dengan label:
- **Utama**: Dashboard, Transaksi, Import CSV
- **Laporan**: Laporan, Rekonsiliasi
- **Pengaturan**: Kategori, Rekening, Donatur, Reminder WA, Pengaturan
- **Lainnya**: TV Display (di bawah, dekat logout)

Implementasi di `src/components/layout/sidebar.tsx`:
- Data diubah dari flat `navItems[]` menjadi `navSections[]` (array of `{ label, items }`)
- Label section: `text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70`
- Mobile sidebar tetap berfungsi tanpa perubahan

### 2. Format Rupiah

**Sebelum**: `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })` menghasilkan `Rp1.234.567` (tanpa spasi).

**Sesudah**: Menggunakan `Intl.NumberFormat('id-ID')` untuk angka saja, lalu prefix `Rp ` manual.
- Output: `Rp 1.234.567`
- Semua penggunaan di seluruh aplikasi sudah melalui shared `formatRupiah()` di `lib/utils.ts`

### 3. Badge Style

**Sebelum**: Solid color badges (misal `bg-emerald-100 text-emerald-800`).

**Sesudah**: Subtle/muted dengan ring border:
- MASUK: `bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200`
- KELUAR: `bg-red-50 text-red-700 ring-1 ring-inset ring-red-200`
- AKTIF, BENDAHARA, dll: grayscale `bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200`
- PENDING: amber variant tetap dipertahankan untuk visibility

### 4. Table Improvements

- `TableHead`: `font-medium` diubah ke `font-semibold`
- Kolom "Aksi" diubah dari `text-right` ke `text-center` di semua tabel:
  - Transaksi, Rekening, Kategori, Donatur, Import CSV

### 5. Rekonsiliasi Form

- Form dibungkus `max-w-2xl` agar tidak stretching full-width
- Spacing antar field tetap konsisten (space-y-4)

---

## File yang Diubah

| File | Perubahan |
|---|---|
| `src/lib/utils.ts` | `formatRupiah()` — tambah spasi antara Rp dan angka |
| `src/components/layout/sidebar.tsx` | Restructure ke grouped sections |
| `src/components/ui/badge.tsx` | Badge variants diubah ke subtle/muted style |
| `src/components/ui/table.tsx` | TableHead font-weight ke semibold |
| `src/app/(dashboard)/transaksi/page.tsx` | Aksi column text-center |
| `src/app/(dashboard)/rekening/page.tsx` | Aksi column text-center |
| `src/app/(dashboard)/kategori/page.tsx` | Aksi column text-center |
| `src/app/(dashboard)/donatur/page.tsx` | Aksi column text-center |
| `src/app/(dashboard)/import/page.tsx` | Aksi column text-center |
| `src/app/(dashboard)/rekonsiliasi/page.tsx` | Form max-w-2xl |
| `docs/PROJECT_BRIEF.md` | Section 11 Design System + Changelog v2.1.1 |
| `HANDOFF_IMPORT_DATA.md` | UI/UX update notes |
| `HANDOFF_SPRINT01.md` — `HANDOFF_SPRINT06.md` | Post-sprint UI/UX update notes |

---

## Yang TIDAK Diubah (Sudah Sesuai)

- **Card component**: Sudah menggunakan `shadow-sm + border-gray-200 + rounded-xl` — tidak perlu diubah
- **SummaryCard**: Sudah clean, tidak ada border warna-warni
- **TV Display (publik)**: Dark theme tetap, hanya formatRupiah otomatis terupdate
- **Typography**: Heading sudah bold, body regular — sesuai spec
- **globals.css**: Tidak perlu perubahan

---

# Sprint A2: Filter Transaksi, Dashboard Chart, Laporan All Time

**Tanggal**: 2026-04-06
**Status**: Selesai

## Deliverables Sprint A2

| # | Deliverable | Status |
|---|---|---|
| 1 | Transaksi: Multi-select kategori filter dengan checkbox dropdown | Done |
| 2 | Transaksi: Sticky summary bar (Masuk/Keluar/Saldo) di atas tabel | Done |
| 3 | Transaksi: Auto-scroll ke tabel saat filter diterapkan | Done |
| 4 | Transaksi: Filter spacing diperbaiki (gap-4) | Done |
| 5 | Dashboard: Transaction count pada semua 3 cumulative cards | Done |
| 6 | Dashboard: Yearly trend → line chart + area fill (dari bar chart) | Done |
| 7 | Dashboard: Yearly trend mulai dari 2025 (exclude 2024) | Done |
| 8 | Dashboard: Category breakdown all-time — horizontal bar chart top 10 | Done |
| 9 | Laporan: "Semua Tahun" option di dropdown tahun | Done |
| 10 | Laporan: Preview label berubah saat "Semua Tahun" dipilih | Done |
| 11 | Export PDF: Support tahun=all (semua tahun) | Done |
| 12 | Export Excel: Support tahun=all (semua tahun) | Done |
| 13 | API: dashboard/summary support tahun=all | Done |
| 14 | API: dashboard/cumulative return jumlahMasuk, jumlahKeluar, categoryBreakdown | Done |

## Keputusan Teknis Sprint A2

### 1. Multi-Select Kategori (Transaksi Page)
- Custom dropdown component dengan checkbox per kategori
- Grouped by jenis (Pemasukan/Pengeluaran) dengan header warna
- Label trigger: "Semua Kategori" atau "N Kategori"
- Close on click outside (mousedown listener)
- Reused pattern dari KategoriMultiSelect di Laporan page

### 2. Sticky Summary Bar
- Summary (Masuk/Keluar/Saldo/jumlah transaksi) dipindah dari footer tabel ke sticky bar di atas tabel
- `sticky top-0 z-10` dengan background putih dan shadow
- Selalu visible saat scroll tabel ke bawah

### 3. Yearly Trend → Line Chart
- Diganti dari BarChart ke ComposedChart (Area + Line) dari recharts
- 2 line: Pemasukan (hijau) dan Pengeluaran (merah)
- Area fill subtle dengan gradient (opacity 0.15 → 0.02)
- Dot markers di setiap data point
- Data mulai dari tahun 2025 (filter `year >= '2025'` di API)

### 4. Category Breakdown All-Time
- Horizontal bar chart custom (bukan recharts Treemap — terlalu kompleks untuk data ini)
- Top 10 kategori + "Lainnya" bucket
- Toggle Pemasukan/Pengeluaran
- Progress bar visual dengan persentase dan jumlah Rupiah

### 5. Laporan All-Time Mode
- Dropdown tahun menambah "Semua Tahun" sebagai opsi pertama (value=`all`)
- API dashboard/summary: `tahun=all` → skip tahun filter, hanya bulan jika ada
- API export/pdf dan export/excel: `tahun=all` → include semua transaksi aktif
- Periode label: "Semua Tahun" atau "Januari (Semua Tahun)"
- Preview title berubah menjadi "Pemasukan dan Pengeluaran Semua Tahun"

## File yang Diubah Sprint A2

| File | Perubahan |
|---|---|
| `src/app/(dashboard)/transaksi/page.tsx` | Multi-select filter, sticky summary, auto-scroll |
| `src/app/(dashboard)/page.tsx` | Cumulative cards subtitle, category bar chart |
| `src/app/(dashboard)/laporan/page.tsx` | Semua Tahun option, preview title |
| `src/components/charts/yearly-trend.tsx` | Bar → Line + Area chart |
| `src/components/charts/category-bar.tsx` | New: horizontal bar chart component |
| `src/hooks/use-dashboard.ts` | CumulativeDashboard type updated |
| `src/app/api/dashboard/cumulative/route.ts` | jumlahMasuk/Keluar, categoryBreakdown, year>=2025 |
| `src/app/api/dashboard/summary/route.ts` | Support tahun=all |
| `src/app/api/export/pdf/route.ts` | Support tahun=all |
| `src/app/api/export/excel/route.ts` | Support tahun=all |
| `docs/PROJECT_BRIEF.md` | Changelog v2.1.2 |
| `docs/API_REFERENCE.md` | Updated dashboard & export endpoint docs |
| `HANDOFF_IMPORT_DATA.md` | Sprint A2 notes |

---

# Sprint A3: Kelompok Anggaran (v2.2)

**Tanggal**: 2026-04-07
**Branch**: `claude/kelompok-anggaran-feature`
**Status**: Selesai

## Deliverables Sprint A3

| # | Deliverable | Status |
|---|---|---|
| 1 | Sheet baru `kelompok` dengan 8 kolom (id, nama, deskripsi, warna, kategori_masuk, kategori_keluar, timestamps) | Done |
| 2 | Type `Kelompok` ditambahkan ke `src/types/index.ts` | Done |
| 3 | ID_PREFIXES.KELOMPOK = 'KEL' | Done |
| 4 | API `/api/kelompok` — GET (list), POST (create) | Done |
| 5 | API `/api/kelompok/[id]` — GET, PUT, DELETE (hard delete) | Done |
| 6 | API `/api/dashboard/kelompok` — ringkasan saldo per kelompok | Done |
| 7 | Hook `useKelompok()` dan `useKelompokSummary()` | Done |
| 8 | Halaman `/kelompok` — card grid + modal form create/edit | Done |
| 9 | Custom `KategoriPicker` dengan chip + dropdown (click outside handler) | Done |
| 10 | Color picker dengan 8 preset warna | Done |
| 11 | Sidebar menu "Kelompok Anggaran" di group Pengaturan | Done |
| 12 | Dashboard section "Ringkasan per Kelompok" dengan card dan bar chart | Done |
| 13 | Laporan: dropdown filter "Kelompok" auto-populate selectedKategori | Done |
| 14 | ConfirmDialog component baru — reusable confirmation dialog | Done |
| 15 | Toast notifications: berhasil disimpan / diupdate / dihapus | Done |
| 16 | Dialog konfirmasi UPDATE: "Apakah Anda yakin ingin mengupdate kelompok ini?" | Done |
| 17 | Dialog konfirmasi DELETE dengan tombol merah "Ya, Hapus" | Done |
| 18 | Seed script update untuk auto-create sheet baru | Done |
| 19 | Dokumentasi: PROJECT_BRIEF, API_REFERENCE, HANDOFF | Done |

## Keputusan Teknis Sprint A3

### 1. Data Model
- Kategori IDs disimpan sebagai comma-separated string di 2 kolom (`kategori_masuk`, `kategori_keluar`) — sederhana, mudah dibaca di Google Sheets
- Alternative yang tidak dipilih: tabel junction terpisah (terlalu kompleks untuk 1-2 kelompok per masjid)
- 1 kategori bisa masuk ke banyak kelompok (no unique constraint)

### 2. Delete Strategy
- **Hard delete** — row di-blank (bukan soft delete dengan `is_active`) karena kelompok adalah organisasional, bukan entitas transaksional. Audit log tetap dicatat.
- Filter di list API: `.filter(k => k.id)` untuk skip blanked rows.

### 3. Laporan Integration (No API Change)
- Dropdown Kelompok di Laporan **hanya memanipulasi state `selectedKategori`** di frontend. Ketika kelompok dipilih, otomatis `selectedKategori` di-set ke gabungan `kategori_masuk + kategori_keluar` kelompok tersebut.
- Keuntungan: **tidak perlu modifikasi API `dashboard/summary`, export PDF, atau export Excel** — filter kategori yang sudah ada cukup
- Jika user mengedit kategori manual setelah pilih kelompok, dropdown kelompok auto-reset ke "Semua"

### 4. KategoriPicker Component
- Custom component inline di `kelompok/page.tsx` (tidak di-extract karena spesifik)
- Click outside handler via `mousedown` listener pada document
- Dropdown hanya menampilkan kategori yang **belum dipilih** (mencegah duplikat)
- Chip dapat dihapus via tombol X dengan warna sesuai jenis (emerald/red)

### 5. ConfirmDialog Component Baru
- Reusable: `src/components/ui/confirm-dialog.tsx`
- Membungkus `Modal` dengan prop `variant: 'primary' | 'danger'` untuk warna tombol confirm
- Bisa digunakan di fitur lain di masa depan (gantikan `window.confirm()`)

### 6. Dashboard Section
- Conditional render: hanya muncul jika `kelompokSummary.length > 0` (hide jika belum ada kelompok)
- Border-left 4px dengan warna kelompok sebagai visual identifier
- Bar chart manual (div-based) untuk konsistensi dengan existing `CategoryBarChart` pattern

## File Baru Sprint A3

- `src/app/api/kelompok/route.ts`
- `src/app/api/kelompok/[id]/route.ts`
- `src/app/api/dashboard/kelompok/route.ts`
- `src/hooks/use-kelompok.ts`
- `src/app/(dashboard)/kelompok/page.tsx`
- `src/components/ui/confirm-dialog.tsx`

## File yang Diubah Sprint A3

| File | Perubahan |
|---|---|
| `src/lib/constants.ts` | Tambah SHEET_NAMES.KELOMPOK, ID_PREFIXES.KELOMPOK, SHEET_HEADERS kelompok |
| `src/lib/google-sheets.ts` | Tambah mapping KELOMPOK → 'kelompok' |
| `src/types/index.ts` | Tambah interface Kelompok |
| `src/components/layout/sidebar.tsx` | Tambah link "Kelompok Anggaran" di group Pengaturan |
| `src/app/(dashboard)/page.tsx` | Tambah section "Ringkasan per Kelompok" |
| `src/app/(dashboard)/laporan/page.tsx` | Tambah dropdown Kelompok (5 kolom grid) |
| `scripts/seed.ts` | Tambah header kelompok untuk auto-setup |
| `docs/PROJECT_BRIEF.md` | Section 5.11 Kelompok Anggaran + changelog v2.2 |
| `docs/API_REFERENCE.md` | Dokumentasi endpoint `/api/kelompok` dan `/api/dashboard/kelompok` |
