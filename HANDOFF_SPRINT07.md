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

---

# Sprint A4: Filter Rekening (v2.2.1)

**Tanggal**: 2026-04-07
**Branch**: `claude/rekening-filter`
**Status**: Selesai

## Deliverables Sprint A4

| # | Deliverable | Status |
|---|---|---|
| 1 | Transaksi page: dropdown filter Rekening + URL param `?rekening=ID` | Done |
| 2 | Laporan page: dropdown filter Rekening (posisi setelah Kelompok, sebelum Kategori) | Done |
| 3 | Dashboard "Saldo per Rekening" rows clickable → `/transaksi?rekening=ID` | Done |
| 4 | API `/api/dashboard/summary`: query param `rekening` | Done |
| 5 | API `/api/export/pdf`: query param `rekening` (label di header PDF) | Done |
| 6 | API `/api/export/excel`: query param `rekening` (appended ke periode label) | Done |
| 7 | Hook `useDashboardSummary`: parameter `rekeningId` | Done |
| 8 | Preview title Laporan: "Preview Ringkasan — Tahun 2026 — Bank Syariah Indonesia" | Done |

## Keputusan Teknis Sprint A4

### 1. Transaksi Page (Client-side Filter)
- Filter rekening dilakukan client-side di useMemo (sama seperti filter lain)
- Tidak perlu modify hook `useTransaksi` — semua transaksi sudah diload, filter di komponen
- URL query param `?rekening=ID` dibaca via `useSearchParams()` di useEffect — auto-set state filter
- Component dibungkus `<Suspense>` karena Next.js App Router require Suspense untuk `useSearchParams()`
- Grid filter diubah dari 5 kolom (lg) ke 6 kolom (xl) untuk akomodasi field baru

### 2. Laporan Page (API-side Filter)
- Selected rekening dikirim ke `useDashboardSummary` (parameter ke-4) dan ke export API
- Preview title dinamis: tambahkan ` — {nama_bank}` jika rekening dipilih
- Dropdown rekening terpisah dari Kelompok (independent filter, bukan auto-populate)
- Grid Filter Laporan diubah dari 5 kolom (lg) ke 6 kolom (xl)

### 3. API Changes
- `dashboard/summary`: tambah `searchParams.get('rekening')` lalu filter `t.rekening_id === rekeningId`
- `export/pdf`: tambah baris "Rekening: ..." di header PDF (group dengan kategori filter lines, mengikuti existing wrapping logic)
- `export/excel`: append rekening label ke `periode` string — otomatis muncul di title kedua worksheet (Ringkasan + Detail) tanpa restructuring rows
- Semua API filter di-apply setelah filter status AKTIF dan periode

### 4. Dashboard Saldo per Rekening — Clickable
- `<div>` rows diubah jadi `<Link>` dengan `href="/transaksi?rekening=${id}"`
- Hover state: `hover:bg-gray-50` + padding -mx-2 untuk visual feedback edge-to-edge
- Saldo per rekening tetap menggunakan all-time data (existing behavior dipertahankan)

### 5. Catatan tentang Mutasi
- Schema transaksi saat ini tidak punya field `mutasi_ref` — task menyebutkan ini sebagai constraint behavioral, tapi karena field belum ada, tidak ada special handling yang perlu ditambahkan. Filter rekening apply ke semua transaksi aktif yang `rekening_id` match.

## File yang Diubah Sprint A4

| File | Perubahan |
|---|---|
| `src/app/(dashboard)/transaksi/page.tsx` | useSearchParams + filterRekening state + dropdown + Suspense wrapper |
| `src/app/(dashboard)/laporan/page.tsx` | selectedRekening state + dropdown + preview title |
| `src/app/(dashboard)/page.tsx` | Saldo per Rekening rows → Link to /transaksi?rekening=ID |
| `src/hooks/use-dashboard.ts` | useDashboardSummary accepts rekeningId param |
| `src/app/api/dashboard/summary/route.ts` | Filter by rekening_id |
| `src/app/api/export/pdf/route.ts` | Fetch rekening rows + filter + add Rekening line in PDF header |
| `src/app/api/export/excel/route.ts` | Fetch rekening rows + filter + append rekening to periode |
| `docs/PROJECT_BRIEF.md` | Changelog v2.2.1 |
## Sprint A4 Updates (April 2026) — Import CSV Informative Description

### Konteks
Saat user import CSV rekening koran, kolom Keterangan di tabel preview perlu lebih informatif agar mudah dipetakan ke kategori yang tepat — terutama untuk transaksi yang masuk status `review`.

### Deliverables

| # | Item | Status |
|---|---|---|
| 1 | Expandable Keterangan: tap baris untuk tampilkan keterangan lengkap (default truncate) | Done |
| 2 | Highlight keyword auto-categorize: bg-yellow + bold pada match | Done |
| 3 | Suggestion text untuk status Review (teks abu-abu kecil di bawah keterangan) | Done |
| 4 | `highlightKeywords` dan `getReviewSuggestion` ditambahkan ke `BankTemplate` interface | Done |
| 5 | Implementasi `HIGHLIGHT_KEYWORDS` + `getReviewSuggestion()` di `muamalat.ts` | Done |
| 6 | RowGroup di-`memo()` agar expand/collapse 1 row tidak re-render seluruh tabel | Done |
| 7 | Update docs PROJECT_BRIEF.md (section 5.8.1) dan BANK_TEMPLATES.md | Done |

### Keputusan Teknis Sprint A4

**Highlight Keywords disimpan di template, bukan di UI**
- Setiap bank punya pattern unik → keywords harus disimpan di `lib/bank-templates/<bank>.ts`
- Field baru: `highlightKeywords: { masuk: string[]; keluar: string[] }` di `BankTemplate`
- UI di import page baca dari template, bangun regex sekali (memoized per `bankId`)
- Bank baru cukup tambahkan keywords sendiri → otomatis dapat highlight tanpa ubah UI

**`buildHighlightRegex()` helper**
- Sort keywords longest-first agar phrase panjang match sebelum sub-word
- Escape special regex chars
- Return single combined regex `(kw1|kw2|kw3)` dengan flag `gi`

**`HighlightedText` component**
- Tidak mutate prop `regex` (eslint react-hooks/immutability) → buat **fresh local regex** dari `regex.source` + `regex.flags`
- Split text dengan local regex, test setiap part dengan non-global testRegex untuk wrap match dengan `<mark>`

**Suggestion Text di kategorisasi (server logic, not UI)**
- `getReviewSuggestion(row)` dipanggil di `categorize()` dan hasilnya disimpan di `CategorizedRow.reviewSuggestion`
- UI hanya render `row.reviewSuggestion` jika status `review` dan kategori belum dipilih
- Suggestion order: KELUAR-specific patterns dulu (BMICMS01, A IMRON ROSADI, BiFast), fallback generic

**Performance**
- `RowGroup` di-wrap dengan `memo()` agar React skip re-render saat parent state lain berubah
- Expand state lokal di RowGroup (`useState`) agar toggle 1 row tidak menyebabkan re-render row lain
- Highlight regex dibuat sekali per bankId via `useMemo`

### File Diubah Sprint A4

| File | Perubahan |
|---|---|
| `src/lib/bank-templates/types.ts` | Tambah `highlightKeywords`, `getReviewSuggestion?`, `reviewSuggestion?` |
| `src/lib/bank-templates/muamalat.ts` | Tambah `HIGHLIGHT_KEYWORDS`, `getReviewSuggestion()`, populate `reviewSuggestion` di `categorize()` |
| `src/app/(dashboard)/import/page.tsx` | Tambah `buildHighlightRegex`, `HighlightedText`, expand state, suggestion render, RowGroup `memo()` |
| `docs/PROJECT_BRIEF.md` | Section 5.8.1 Import CSV Keterangan Informatif |
| `docs/BANK_TEMPLATES.md` | Dokumentasi `highlightKeywords` & `getReviewSuggestion` di interface reference + Muamalat section |

### Verifikasi Task 1 (Card Kelompok + Sidebar)

Task 1 (standardisasi card Kelompok dengan layout fixed + pindah menu ke Utama) sudah diimplementasi sebelumnya di `claude/kelompok-anggaran-feature` (commit 405f047 di main):
- Card: `flex flex-col h-full min-h-[280px]` + grid `items-stretch` → equal height
- Layout: header → saldo → bar masuk/keluar → chip kategori (mt-auto)
- Max 4 chip, MASUK first, "+n lainnya" jika lebih dari 4
- Sidebar: Kelompok Anggaran sudah berada di group Utama antara Transaksi dan Import CSV

Tidak ada perubahan tambahan yang diperlukan untuk Task 1 di sprint A4 ini.

---

## Post-Sprint Updates — Transaksi Search & Expandable Deskripsi (April 2026)

### Konteks
User membutuhkan cara cepat menemukan transaksi spesifik di antara ribuan baris dan melihat deskripsi panjang tanpa harus klik ke halaman detail.

### Deliverables

| # | Item | Status |
|---|---|---|
| 1 | Input search "Cari Deskripsi" di filter bar (case-insensitive partial match) | Done |
| 2 | Debounce 300ms via setTimeout di useEffect | Done |
| 3 | Tombol clear (X) di dalam input untuk reset cepat | Done |
| 4 | Search ikut update sticky summary bar (Total/Masuk/Keluar/Saldo) | Done |
| 5 | Search bisa dikombinasikan dengan filter lain (jenis, status, kategori, tanggal) | Done |
| 6 | Deskripsi expandable per-row (chevron icon, klik untuk expand/collapse) | Done |
| 7 | Layout: deskripsi expand ke bawah, kolom lain tidak shift | Done |
| 8 | State expand pakai `Set<string>` agar O(1) toggle | Done |

### Keputusan Teknis

**Debounce search** — Pakai setTimeout di useEffect (bukan useDeferredValue) karena lebih predictable dan kompatibel dengan flow pagination reset:
```typescript
useEffect(() => {
  const t = setTimeout(() => {
    setSearchQuery(searchInput.trim().toLowerCase());
    setPage(1);
  }, 300);
  return () => clearTimeout(t);
}, [searchInput]);
```

**Filter bar grid** — Diubah dari `lg:grid-cols-5` → `lg:grid-cols-6`. Search input ditaruh sebagai slot pertama (paling kiri), diikuti Jenis, Status, Kategori, Dari Tanggal, Sampai Tanggal.

**Expanded state** — `Set<string>` memungkinkan O(1) `has()`, `add()`, `delete()` tanpa array manipulation. Toggle helper:
```typescript
const toggleExpanded = (id: string) => {
  setExpandedKeys((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};
```

**Layout stability** — Cell deskripsi diberi `max-w-[260px] align-top`. Saat collapsed, span pakai `truncate`. Saat expanded, span pakai `whitespace-normal break-words`. Width tidak berubah, hanya height.

**Performa** — Filter berjalan di array yang sudah di-load (client-side). Untuk 3000+ baris, search adalah single pass `array.filter()` di memo — cukup cepat. Pagination tetap dilakukan setelah filter+sort, jadi rendering hanya 20 row per halaman.

### File Diubah

| File | Perubahan |
|---|---|
| `src/app/(dashboard)/transaksi/page.tsx` | + state `searchInput`/`searchQuery`/`expandedKeys`, + debounce useEffect, + filter di useMemo, + UI input search dengan clear button, + toggle di kolom Deskripsi dengan chevron icon |
| `docs/PROJECT_BRIEF.md` | Section 5.1 ditambah catatan search dan expandable deskripsi |
| `HANDOFF_SPRINT02.md` | Catatan post-sprint update |
| `HANDOFF_SPRINT03.md` | Catatan referensi pola search untuk replikasi |
