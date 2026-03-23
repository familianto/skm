# Sprint 6: Settings, Polish & Reusability

**Durasi**: 1-2 minggu
**Tujuan**: Halaman pengaturan, manajemen logo, polish UI, dan dokumentasi adopsi.

## Prasyarat

- Sprint 4 dan Sprint 5 selesai (semua fitur utama sudah diimplementasi)

## Deliverables

### 1. Halaman Pengaturan

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

### 2. Upload Logo

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

### 3. Ganti PIN

- [ ] `POST /api/auth/change-pin`:
  - Validasi PIN lama
  - Hash PIN baru
  - Update `pin_hash` di sheet master
  - Audit log: `UPDATE`
  - Destroy existing sessions (force re-login)

### 4. UI Polish

- [ ] Review semua halaman untuk konsistensi:
  - Spacing dan padding konsisten
  - Warna badge konsisten (MASUK=hijau, KELUAR=merah, VOID=abu-abu)
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

### 5. Performance Optimization

- [ ] Audit Google Sheets API calls:
  - Minimize jumlah calls per page load
  - Gunakan batchGet untuk multiple ranges
  - Cache data yang jarang berubah (kategori, rekening) dengan SWR staleTime panjang
- [ ] Next.js optimizations:
  - Dynamic imports untuk chart components
  - Image optimization untuk bukti dan logo
  - Metadata dan OpenGraph tags

### 6. Multi-Masjid Documentation

- [ ] Finalize `docs/ADOPTER_GUIDE.md`
- [ ] Buat `.env.example` yang lengkap dan terdokumentasi
- [ ] Test proses adopsi end-to-end:
  - Fork → setup → deploy → first login
- [ ] Pastikan seed script membuat semua default data

### 7. Final Testing Pass

- [ ] End-to-end test semua flow utama:
  - Login → Dashboard → Buat Transaksi → Lihat di Dashboard
  - Void transaksi → cek saldo berubah
  - Koreksi transaksi → cek link
  - Upload bukti → lihat di detail
  - Rekonsiliasi → cek hasil
  - Export PDF → verify isi
  - Export Excel → verify isi
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
    (dashboard)/
      pengaturan/
        page.tsx                # Halaman pengaturan
    api/
      auth/
        change-pin/
          route.ts              # POST ganti PIN
      upload/
        logo/
          route.ts              # POST upload logo
```

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/api/auth/change-pin` | Ganti PIN |
| POST | `/api/upload/logo` | Upload logo |

## Testing

- [ ] Pengaturan: edit profil masjid berhasil
- [ ] Pengaturan: ganti PIN berhasil, login ulang dengan PIN baru
- [ ] Upload logo: tampil di sidebar, PDF, publik
- [ ] Mobile: semua halaman responsive
- [ ] E2E: semua flow utama berfungsi
- [ ] Security: no data leaks

## Definition of Done

- [ ] Halaman pengaturan lengkap dan berfungsi
- [ ] Logo management berfungsi
- [ ] Ganti PIN berfungsi
- [ ] Semua halaman responsive dan polished
- [ ] Adopter guide lengkap dan ditest
- [ ] E2E testing pass
- [ ] Security review pass
- [ ] **SKM v2.1 siap production!** 🎉
