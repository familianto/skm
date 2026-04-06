# HANDOFF — Sprint 4: Dashboard, Laporan & Export

**Tanggal**: 2026-03-23
**Sprint**: 4 — Dashboard, Laporan & Export
**Branch**: `claude/sprint-4-dashboard-export-xpNkL`
**Statistik**: 12 files changed, +3031 lines
**Status Build**: PASS (lint, type-check, build — zero errors/warnings)

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | API GET /api/dashboard/summary (total masuk/keluar/saldo, saldo per rekening, filter tahun/bulan) | Done |
| 2 | API GET /api/dashboard/chart-data (monthly-trend + category-breakdown with top 5 + Lainnya) | Done |
| 3 | API GET /api/export/pdf (jsPDF + autoTable, mode ringkasan & detail, header nama masjid) | Done |
| 4 | API GET /api/export/excel (ExcelJS, 2 sheets: Ringkasan + Detail Transaksi, formatted currency) | Done |
| 5 | Dashboard page — summary cards, period filter, monthly trend chart, category breakdown chart, recent transactions, saldo per rekening | Done |
| 6 | Laporan page — filter tahun/bulan/tipe, preview ringkasan, download PDF & Excel buttons | Done |
| 7 | MonthlyTrendChart component (Recharts BarChart, Rupiah tooltip, responsive) | Done |
| 8 | CategoryBreakdownChart component (Recharts PieChart/donut, legend with percentages) | Done |
| 9 | SummaryCard UI component (green/red/blue/gray color variants, icon slot) | Done |
| 10 | useDashboardSummary hook (fetch summary with tahun/bulan filter) | Done |
| 11 | useChartData hook (fetch monthly-trend or category-breakdown data) | Done |
| 12 | Dependencies added: recharts, jspdf, jspdf-autotable, exceljs | Done |

---

## Keputusan Teknis

### Charting Library: Recharts
- Dipilih Recharts (bukan Chart.js) karena lebih native React — deklaratif via JSX, SSR-friendly, dan tree-shakeable.
- BarChart untuk tren bulanan (lebih jelas perbandingan masuk/keluar per bulan dibanding LineChart).
- PieChart (donut) untuk breakdown kategori — menampilkan proporsi relatif secara visual.
- Custom tooltip dengan `formatRupiah()` agar konsisten dengan format seluruh aplikasi.
- Y-axis formatter menampilkan singkatan (1jt, 500rb) agar label tidak terpotong.

### PDF Generation: jsPDF + jspdf-autotable
- Dipilih jsPDF (bukan @react-pdf/renderer) karena server-side generation di API route lebih cocok — tidak perlu render React component.
- `jspdf-autotable` untuk table rendering otomatis (header styling, pagination, column alignment).
- Dua mode laporan:
  - **Ringkasan**: Summary table + breakdown per kategori (pemasukan & pengeluaran terpisah).
  - **Detail**: Tabel semua transaksi dengan total di footer.
- Header: nama masjid + alamat (dari sheet master) + garis hijau separator.
- Footer: tanggal cetak + "Dibuat oleh SKM" + halaman X/Y.
- Warna header tabel: emerald (#059669) untuk pemasukan, red (#dc2626) untuk pengeluaran.

### Excel Generation: ExcelJS
- Dipilih ExcelJS (bukan xlsx/SheetJS) karena support styling yang lebih baik (font, fill, number format) dan API yang lebih modern.
- 2 sheets:
  - **Ringkasan**: Header masjid + summary table + breakdown per kategori (pemasukan & pengeluaran).
  - **Detail Transaksi**: Semua transaksi dengan nomor urut, total di footer.
- Number format `#,##0` untuk kolom jumlah (currency tanpa desimal, sesuai konvensi).
- Header cells: emerald fill + white font (konsisten dengan theme aplikasi).

### Dashboard Data Structure
- **Summary API** mengembalikan `totalMasuk`, `totalKeluar`, `saldo`, `jumlahTransaksi`, dan `saldoPerRekening[]`.
- `saldoPerRekening` dihitung all-time (tidak di-filter periode) — ini saldo riil saat ini per rekening (saldo_awal + semua masuk - semua keluar).
- Summary lain (totalMasuk, totalKeluar, saldo) di-filter sesuai tahun/bulan yang dipilih.
- **Chart Data API** menggunakan parameter `type` untuk membedakan monthly-trend vs category-breakdown.
- Category breakdown otomatis menampilkan top 5 + "Lainnya" jika lebih dari 5 kategori — menghindari chart terlalu crowded.

### Period Filter
- Dashboard menggunakan 2 dropdown: tahun (5 tahun terakhir) dan bulan (opsional "Semua Bulan").
- Chart tren bulanan selalu menampilkan 12 bulan (Jan-Des) untuk tahun yang dipilih — filter bulan tidak berlaku untuk chart tren (hanya untuk summary cards).
- Default: tahun buku aktif dari `APP_CONFIG.DEFAULT_TAHUN_BUKU`.

### Export Authentication
- Export PDF dan Excel memerlukan session yang valid (`getSession()` check).
- Alasan: Laporan keuangan adalah data sensitif, hanya user terautentikasi yang boleh mengeksport.

### Batch Fetching
- Dashboard summary dan chart data API menggunakan `sheetsService.batchGet()` untuk fetch transaksi + rekening/kategori dalam 1 API call ke Google Sheets.
- Ini menghemat 1 API call per request (2 ranges dalam 1 batchGet vs 2 getRows terpisah).

---

## File Baru Sprint 4

```
src/
  app/
    (dashboard)/
      page.tsx                    # Dashboard (replaced placeholder with real data)
      laporan/
        page.tsx                  # Halaman laporan & export
    api/
      dashboard/
        summary/
          route.ts                # GET — ringkasan keuangan
        chart-data/
          route.ts                # GET — data grafik (monthly-trend, category-breakdown)
      export/
        pdf/
          route.ts                # GET — generate PDF laporan
        excel/
          route.ts                # GET — generate Excel laporan
  components/
    charts/
      monthly-trend.tsx           # BarChart tren bulanan (Recharts)
      category-breakdown.tsx      # PieChart/donut breakdown kategori (Recharts)
    ui/
      summary-card.tsx            # Kartu ringkasan (total masuk/keluar/saldo)
  hooks/
    use-dashboard.ts              # useDashboardSummary(), useChartData()
```

---

## Known Issues / Tech Debt

1. **No caching for dashboard data** — Setiap load dashboard fetch fresh dari Google Sheets. Untuk masjid dengan banyak transaksi (1000+), bisa lambat. Bisa ditambahkan SWR caching atau in-memory cache di API route.
2. **PDF font terbatas** — jsPDF hanya support font standar (Helvetica). Karakter khusus Indonesia (é, ñ) mungkin tidak render. Untuk 99% kasus penggunaan masjid, ini tidak masalah.
3. **Chart tidak responsive di mobile kecil** — Recharts ResponsiveContainer bekerja, tapi chart dengan banyak data bisa terlalu kecil di layar < 360px. Untuk MVP ini acceptable.
4. **No audit log untuk export** — Export PDF/Excel belum dicatat di audit log. Bisa ditambahkan jika perlu tracking siapa yang mengexport laporan.
5. **Category breakdown hanya 1 jenis per view** — User harus toggle antara Pemasukan dan Pengeluaran. Bisa ditambahkan side-by-side view jika dibutuhkan.
6. **No tests** — Unit tests untuk dashboard & export API belum dibuat.
7. **ExcelJS bundle size** — ExcelJS menambah ~500KB ke bundle. Karena hanya dipakai di API route (server-side), ini tidak mempengaruhi client bundle.
8. **PDF landscape mode** — Laporan detail dengan banyak kolom bisa terpotong di portrait. Bisa ditambahkan opsi landscape.

---

## Konteks untuk Sprint 5: Rekonsiliasi Bank

Sprint 5 akan mengimplementasi void/koreksi transaksi, upload bukti, dan rekonsiliasi bank.

### Dependency dari Sprint 1-4

| File/Komponen | Dipakai untuk |
|---|---|
| `src/lib/google-sheets.ts` | `sheetsService.getRows()`, `getRowById()`, `updateRow()`, `appendRow()` untuk semua operasi CRUD |
| `src/lib/google-drive.ts` | `driveService.uploadFile()` untuk upload bukti transaksi ke Google Drive |
| `src/lib/constants.ts` | `SHEET_NAMES.TRANSAKSI`, `SHEET_NAMES.REKONSILIASI`, `SHEET_NAMES.REKENING_BANK`, `SHEET_HEADERS`, `ID_PREFIXES` |
| `src/types/index.ts` | `Transaksi`, `TransaksiStatus`, `RekeningBank`, `Rekonsiliasi`, `RekonsiliasiStatus`, `AuditAksi` |
| `src/lib/utils.ts` | `formatRupiah()`, `formatTanggal()`, `nowISO()` |
| `src/lib/auth.ts` | `getSession()` untuk semua mutating endpoints |
| `src/lib/audit.ts` | `logAudit()` — WAJIB untuk void, koreksi, upload, dan rekonsiliasi |
| `src/lib/validators.ts` | Referensi pattern untuk schema validasi baru (void, koreksi, rekonsiliasi) |
| `src/app/api/transaksi/route.ts` | Referensi pattern `rowToTransaksi()`, API response format |
| `src/app/api/transaksi/[id]/route.ts` | Referensi pattern update transaksi (untuk void & koreksi) |
| `src/app/(dashboard)/transaksi/[id]/page.tsx` | Halaman detail transaksi — akan ditambah tombol Void, Koreksi, Upload Bukti |
| `src/hooks/use-transaksi.ts` | Referensi pattern untuk `useRekonsiliasi()` |
| `src/components/ui/*` | Button, Card, Modal, Loading, Badge, Input, Table |
| `src/components/forms/transaction-form.tsx` | Referensi untuk form koreksi (pre-fill dari transaksi asli) |
| `src/components/layout/*` | PageTitle, Sidebar (link Rekonsiliasi sudah ada di sidebar) |
| `src/app/api/dashboard/summary/route.ts` | Pattern penghitungan saldo per rekening — dipakai ulang untuk saldo_sistem di rekonsiliasi |

### File baru yang dibutuhkan Sprint 5
- `src/app/api/transaksi/[id]/void/route.ts` — POST void transaksi
- `src/app/api/transaksi/[id]/koreksi/route.ts` — POST koreksi transaksi
- `src/app/api/upload/bukti/route.ts` — POST upload bukti (multipart)
- `src/app/api/rekonsiliasi/route.ts` — GET list, POST create rekonsiliasi
- `src/app/(dashboard)/rekonsiliasi/page.tsx` — Halaman rekonsiliasi bank
- `src/components/forms/void-modal.tsx` — Modal konfirmasi void
- `src/components/forms/upload-bukti.tsx` — Upload component dengan preview
- `src/components/ui/file-upload.tsx` — Generic file upload
- `src/components/ui/image-preview.tsx` — Image preview/lightbox
- `src/hooks/use-rekonsiliasi.ts` — Hook untuk rekonsiliasi data

### Library baru yang mungkin dibutuhkan Sprint 5
- `browser-image-compression` — Client-side image compression sebelum upload

---

## Environment Variables

### Tidak ada env vars baru di Sprint 4

Semua fitur Sprint 4 menggunakan env vars existing (Google Sheets credentials + auth).

### Existing (Sprint 0-3)

```env
GOOGLE_SHEETS_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
NEXT_PUBLIC_APP_NAME=SKM
NEXT_PUBLIC_MASJID_NAME=
AUTH_SECRET=
PIN_SALT=
FONNTE_API_TOKEN=
FONNTE_MOCK=
```
