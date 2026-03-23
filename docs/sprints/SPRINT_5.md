# Sprint 5: Communication & Display

**Durasi**: 1-2 minggu
**Tujuan**: Halaman display publik dan fitur komunikasi/notifikasi.

## Prasyarat

- Sprint 3 selesai (dashboard dan data visualisasi tersedia)

## Deliverables

### 1. Halaman Publik (Public Display)

- [ ] `app/publik/page.tsx` (di luar group `(dashboard)`, tanpa auth):
  - Nama dan logo masjid
  - Ringkasan keuangan bulan ini:
    - Total pemasukan
    - Total pengeluaran
    - Saldo
  - Grafik sederhana (tren 6 bulan terakhir)
  - Daftar transaksi terakhir (5-10 item, tanpa detail sensitif)
  - Footer: "Dikelola dengan SKM"
  - **Tidak perlu login** — read-only untuk jamaah
  - Design: clean, besar, bisa ditampilkan di TV/monitor masjid

### 2. API Publik

- [ ] `GET /api/publik/ringkasan`:
  - Return data yang aman untuk publik
  - Tidak include audit log, PIN, atau data sensitif
  - Cache response (SWR revalidate setiap 5 menit)
- [ ] Middleware: endpoint `/api/publik/*` tidak perlu auth

### 3. Template Pesan (Opsional)

- [ ] Template pesan WhatsApp/SMS untuk laporan:
  - Laporan harian: "Pemasukan hari ini: Rp X, Pengeluaran: Rp Y"
  - Laporan bulanan: ringkasan bulan
  - Copy-to-clipboard button
- [ ] `app/(dashboard)/komunikasi/page.tsx`:
  - Pilih template pesan
  - Preview pesan dengan data aktual
  - Tombol "Salin ke Clipboard"
  - Link "Kirim via WhatsApp" (wa.me deep link)

### 4. Auto-refresh untuk Display

- [ ] Halaman publik auto-refresh setiap 5 menit
- [ ] Gunakan SWR `refreshInterval`
- [ ] Fullscreen mode (hide browser chrome via F11 instruction)

## File Baru

```
src/
  app/
    publik/
      page.tsx                  # Halaman publik (no auth)
      layout.tsx                # Layout publik (tanpa sidebar)
    (dashboard)/
      komunikasi/
        page.tsx                # Template pesan
    api/
      publik/
        ringkasan/
          route.ts              # GET ringkasan publik
  components/
    publik/
      public-summary.tsx        # Komponen ringkasan publik
      public-chart.tsx          # Grafik sederhana untuk publik
```

## API Routes

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | `/api/publik/ringkasan` | Tidak | Ringkasan untuk publik |

## Testing

- [ ] Halaman publik: bisa diakses tanpa login
- [ ] Halaman publik: tidak menampilkan data sensitif
- [ ] Halaman publik: auto-refresh berfungsi
- [ ] Template pesan: data aktual ter-inject ke template
- [ ] Copy to clipboard: berfungsi
- [ ] WhatsApp link: terbuka dengan pesan yang benar

## Definition of Done

- [ ] Halaman publik bisa diakses tanpa login
- [ ] Data yang ditampilkan akurat dan tidak sensitif
- [ ] Auto-refresh berfungsi
- [ ] Template pesan siap pakai
- [ ] Responsive di TV/monitor dan HP
- [ ] TypeScript: no errors
- [ ] Tests pass
- [ ] Build pass
