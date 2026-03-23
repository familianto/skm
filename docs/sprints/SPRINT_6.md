# Sprint 6: TV Display, Settings & Polish

**Durasi**: 1-2 minggu
**Tujuan**: Halaman display publik untuk TV masjid, halaman pengaturan, manajemen logo, polish UI, dan dokumentasi adopsi.

## Prasyarat

- Sprint 4 selesai (dashboard dan data visualisasi tersedia)
- Sprint 5 selesai (semua fitur utama sudah diimplementasi)

## Deliverables

### 1. Halaman Publik (TV Display)

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

### 3. Auto-refresh untuk Display

- [ ] Halaman publik auto-refresh setiap 5 menit
- [ ] Gunakan SWR `refreshInterval`
- [ ] Fullscreen mode (hide browser chrome via F11 instruction)

### 4. Halaman Pengaturan

- [ ] `app/(dashboard)/pengaturan/page.tsx`:
  - **Tab Profil Masjid**:
    - Edit nama masjid, alamat, kota, provinsi, telepon, email
    - Upload/ganti logo
    - Pilih tahun buku aktif
  - **Tab Keamanan**:
    - Ganti PIN (input PIN lama, PIN baru, konfirmasi PIN baru)
    - Validasi: PIN harus 4-6 digit
  - **Tab Anggota**:
    - Daftar anggota/pengurus
    - CRUD anggota (dari Sprint 1 API)
    - Assign role (Bendahara, Pengurus, Viewer)
  - **Tab Data**:
    - Kelola kategori (shortcut ke halaman kategori)
    - Kelola rekening (shortcut ke halaman rekening)
    - Info storage usage (perkiraan rows terpakai)

### 5. Upload Logo

- [ ] `POST /api/upload/logo`:
  - Upload logo ke Google Drive folder `logo/`
  - Update `logo_url` di sheet master
  - Validasi: JPG/PNG, max 500KB
  - Resize jika terlalu besar
- [ ] Logo tampil di:
  - Sidebar (kecil)
  - Header halaman publik
  - Laporan PDF (header)
  - Login page

### 6. Ganti PIN

- [ ] `POST /api/auth/change-pin`:
  - Validasi PIN lama
  - Hash PIN baru
  - Update `pin_hash` di sheet master
  - Audit log: `UPDATE`
  - Destroy existing sessions (force re-login)

### 7. UI Polish

- [ ] Review semua halaman untuk konsistensi:
  - Spacing dan padding konsisten
  - Warna badge konsisten
  - Loading states di semua page
  - Empty states (saat tidak ada data)
  - Error states (saat API gagal)
- [ ] Mobile responsiveness:
  - Test semua halaman di viewport 375px
  - Sidebar collapsible di mobile
  - Tabel horizontal scroll di mobile
  - Form full-width di mobile
- [ ] Accessibility:
  - ARIA labels di interactive elements
  - Keyboard navigation
  - Focus indicators
  - Color contrast check

### 8. Performance Optimization

- [ ] Audit Google Sheets API calls:
  - Minimize jumlah calls per page load
  - Gunakan batchGet untuk multiple ranges
  - Cache data yang jarang berubah (kategori, rekening) dengan SWR staleTime panjang
- [ ] Next.js optimizations:
  - Dynamic imports untuk chart components
  - Image optimization untuk bukti dan logo
  - Metadata dan OpenGraph tags

### 9. Multi-Masjid Documentation

- [ ] Finalize `docs/ADOPTER_GUIDE.md`
- [ ] Buat `.env.example` yang lengkap dan terdokumentasi
- [ ] Test proses adopsi end-to-end:
  - Fork → setup → deploy → first login
- [ ] Pastikan seed script membuat semua default data

### 10. Final Testing Pass

- [ ] End-to-end test semua flow utama:
  - Login → Dashboard → Buat Transaksi → Lihat di Dashboard
  - Void transaksi → cek saldo berubah
  - Koreksi transaksi → cek link
  - Upload bukti → lihat di detail
  - Rekonsiliasi → cek hasil
  - Export PDF → verify isi
  - Export Excel → verify isi
  - Kirim reminder WA → cek riwayat
  - Ganti PIN → re-login
  - Halaman publik → data benar
- [ ] Security review:
  - PIN hashed properly
  - No sensitive data in public endpoints
  - CSRF protection
  - Input sanitization

## File Baru

```
src/
  app/
    publik/
      page.tsx                  # Halaman publik (no auth)
      layout.tsx                # Layout publik (tanpa sidebar)
    (dashboard)/
      pengaturan/
        page.tsx                # Halaman pengaturan
    api/
      publik/
        ringkasan/
          route.ts              # GET ringkasan publik
      auth/
        change-pin/
          route.ts              # POST ganti PIN
      upload/
        logo/
          route.ts              # POST upload logo
  components/
    publik/
      public-summary.tsx        # Komponen ringkasan publik
      public-chart.tsx          # Grafik sederhana untuk publik
```

## API Routes

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | `/api/publik/ringkasan` | Tidak | Ringkasan untuk publik |
| POST | `/api/auth/change-pin` | Ya | Ganti PIN |
| POST | `/api/upload/logo` | Ya | Upload logo |

## Testing

- [ ] Halaman publik: bisa diakses tanpa login
- [ ] Halaman publik: tidak menampilkan data sensitif
- [ ] Halaman publik: auto-refresh berfungsi
- [ ] Pengaturan: edit profil masjid berhasil
- [ ] Pengaturan: ganti PIN berhasil, login ulang dengan PIN baru
- [ ] Upload logo: tampil di sidebar, PDF, publik
- [ ] Mobile: semua halaman responsive
- [ ] E2E: semua flow utama berfungsi
- [ ] Security: no data leaks

## Definition of Done

- [ ] Halaman publik bisa diakses tanpa login, data akurat
- [ ] Auto-refresh berfungsi untuk TV display
- [ ] Halaman pengaturan lengkap dan berfungsi
- [ ] Logo management berfungsi
- [ ] Ganti PIN berfungsi
- [ ] Semua halaman responsive dan polished
- [ ] Adopter guide lengkap dan ditest
- [ ] E2E testing pass
- [ ] Security review pass
- [ ] **SKM v2.1 siap production!**
