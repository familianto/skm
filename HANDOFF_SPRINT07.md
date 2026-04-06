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
