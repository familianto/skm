# Sprint 4: Dashboard, Laporan & Export

**Durasi**: 2 minggu
**Tujuan**: Dashboard dengan visualisasi keuangan dan export laporan ke PDF/Excel.

## Prasyarat

- Sprint 2 selesai (CRUD transaksi berfungsi, ada data transaksi untuk ditampilkan)

## Deliverables

### 1. Dashboard API

- [ ] `GET /api/dashboard/summary`:
  - Hitung total masuk, total keluar, saldo
  - Jumlah transaksi
  - Filter by tahun dan bulan
  - Data per rekening (saldo per rekening)
- [ ] `GET /api/dashboard/chart-data`:
  - `type=monthly-trend`: data masuk/keluar per bulan
  - `type=category-breakdown`: data per kategori (masuk dan keluar terpisah)
  - Filter by tahun

### 2. Halaman Dashboard

- [ ] `app/(dashboard)/page.tsx`:
  - **Kartu Ringkasan** (3 cards):
    - Total Pemasukan (hijau, ikon ↑)
    - Total Pengeluaran (merah, ikon ↓)
    - Saldo (biru, ikon 💰)
  - **Filter Periode**:
    - Dropdown tahun
    - Dropdown bulan (opsional, bisa "Semua")
  - **Grafik Tren Bulanan**:
    - Line chart / bar chart
    - X-axis: bulan (Jan-Des)
    - Y-axis: nominal (Rupiah)
    - 2 series: Pemasukan, Pengeluaran
  - **Grafik Kategori**:
    - Pie chart atau horizontal bar chart
    - Tab: Pemasukan / Pengeluaran
    - Tampilkan top 5 kategori + "Lainnya"
  - **Transaksi Terakhir**:
    - 5 transaksi terbaru
    - Link "Lihat Semua" ke halaman transaksi
  - **Saldo per Rekening**:
    - List rekening dengan saldo masing-masing

### 3. Chart Components

- [ ] Install Chart.js + react-chartjs-2 (atau Recharts)
- [ ] `components/charts/monthly-trend.tsx`:
  - Line/bar chart pemasukan vs pengeluaran per bulan
  - Responsive
  - Tooltip dengan format Rupiah
- [ ] `components/charts/category-breakdown.tsx`:
  - Pie/doughnut chart per kategori
  - Legend dengan persentase
  - Tab switch masuk/keluar

### 4. Export PDF

- [ ] Install jspdf atau @react-pdf/renderer
- [ ] `GET /api/export/pdf`:
  - Query params: tahun, bulan (opsional), type (ringkasan/detail)
  - **Laporan Ringkasan**:
    - Header: Logo + Nama Masjid + Periode
    - Ringkasan: Total masuk, keluar, saldo
    - Tabel: Per kategori breakdown
    - Footer: Tanggal cetak, "Dibuat oleh SKM"
  - **Laporan Detail**:
    - Header: Logo + Nama Masjid + Periode
    - Tabel: Semua transaksi (tanggal, deskripsi, masuk, keluar)
    - Total di footer tabel
- [ ] Tombol "Export PDF" di halaman Laporan

### 5. Export Excel

- [ ] Install xlsx atau exceljs
- [ ] `GET /api/export/excel`:
  - Query params: tahun, bulan (opsional)
  - Sheet 1: "Ringkasan" — summary per kategori
  - Sheet 2: "Detail Transaksi" — semua transaksi
  - Header dengan nama masjid dan periode
  - Format kolom jumlah sebagai currency
- [ ] Tombol "Export Excel" di halaman Laporan

### 6. Halaman Laporan

- [ ] `app/(dashboard)/laporan/page.tsx`:
  - Filter: tahun, bulan
  - Pilihan tipe laporan: Ringkasan / Detail
  - Tombol Download PDF
  - Tombol Download Excel
  - Preview ringkasan sebelum download

### 7. Hooks

- [ ] `hooks/use-dashboard.ts`:
  - `useDashboardSummary(tahun, bulan?)`: fetch summary data
  - `useChartData(type, tahun)`: fetch chart data

## File Baru

```
src/
  app/
    (dashboard)/
      page.tsx                  # Dashboard (update dari placeholder)
      laporan/
        page.tsx                # Halaman laporan & export
    api/
      dashboard/
        summary/
          route.ts
        chart-data/
          route.ts
      export/
        pdf/
          route.ts
        excel/
          route.ts
  components/
    charts/
      monthly-trend.tsx
      category-breakdown.tsx
    ui/
      summary-card.tsx          # Kartu ringkasan (total masuk/keluar/saldo)
  hooks/
    use-dashboard.ts
```

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/api/dashboard/summary` | Ringkasan keuangan |
| GET | `/api/dashboard/chart-data` | Data grafik |
| GET | `/api/export/pdf` | Generate PDF |
| GET | `/api/export/excel` | Generate Excel |

## Testing

- [ ] Dashboard summary: total masuk, keluar, saldo benar
- [ ] Chart: data tren bulanan akurat
- [ ] Chart: breakdown kategori akurat
- [ ] Filter periode: data berubah sesuai filter
- [ ] Export PDF: file valid, data benar, format rapi
- [ ] Export Excel: file valid, data benar, 2 sheets
- [ ] PDF header: logo dan nama masjid tampil
- [ ] Responsive: dashboard dan grafik di mobile

## Definition of Done

- [ ] Dashboard menampilkan ringkasan keuangan real-time
- [ ] Grafik tren bulanan berfungsi dan akurat
- [ ] Grafik kategori berfungsi dan akurat
- [ ] Export PDF menghasilkan laporan yang rapi
- [ ] Export Excel menghasilkan spreadsheet yang benar
- [ ] Filter periode berfungsi di semua komponen
- [ ] TypeScript: no errors
- [ ] Tests pass
- [ ] Build pass
