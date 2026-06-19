# Panduan Adopsi SKM untuk Masjid Lain

## Tentang

SKM (Sistem Keuangan Masjid) adalah sistem open-source yang dapat diadopsi oleh masjid manapun. Panduan ini menjelaskan langkah-langkah untuk men-deploy SKM untuk masjid Anda.

## Persyaratan Minimum

- **Akun Google** (untuk Google Sheets)
- **Akun GitHub** (untuk fork repository)
- **Akun Vercel** (gratis, untuk hosting) — atau hosting provider lain yang support Next.js
- **Komputer/laptop** dengan browser modern
- **Koneksi internet** yang stabil

## Estimasi Biaya

| Komponen | Biaya |
|---|---|
| Google Sheets | Gratis |
| Vercel Hosting (Free tier) | Gratis |
| GitHub (Free tier) | Gratis |
| Domain (opsional) | Rp 12.000 - Rp 150.000/tahun |
| **Total** | **Rp 0 - Rp 12.500/bulan** |

## Langkah-langkah Adopsi

### Langkah 1: Fork Repository

1. Buka repository SKM di GitHub
2. Klik tombol **Fork**
3. Repository akan ter-copy ke akun GitHub Anda

### Langkah 2: Setup Google Cloud

Ikuti panduan lengkap di [`SETUP_GUIDE.md`](SETUP_GUIDE.md), bagian:
- Langkah 2: Setup Google Cloud Project
- Langkah 3: Setup Google Sheets

### Langkah 3: Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) dan login dengan GitHub
2. Klik **Add New** → **Project**
3. Import repository fork Anda
4. Set environment variables (lihat `SETUP_GUIDE.md` Langkah 5)
5. Klik **Deploy**
6. Tunggu deployment selesai (~2 menit)

### Langkah 4: Setup Awal

1. Buka URL yang diberikan Vercel
2. Masukkan PIN awal (default: `1234`)
3. **Segera ganti PIN** di halaman Pengaturan
4. Isi data masjid (nama, alamat, dll)
5. Tambah kategori transaksi sesuai kebutuhan masjid
6. Tambah rekening bank masjid

### Langkah 5: Kustomisasi (Opsional)

- **Logo**: Upload logo masjid di halaman Pengaturan
- **Kategori**: Tambah/edit kategori sesuai kebutuhan
- **Domain**: Hubungkan custom domain di Vercel dashboard

## Kustomisasi Lanjutan

### Menambah Kategori Baru

Kategori bisa ditambah langsung dari halaman Kategori di aplikasi, tanpa perlu coding.

### Mengubah Tampilan

Jika ingin mengubah warna/theme:
1. Edit file `tailwind.config.ts`
2. Ubah warna primary/secondary sesuai identitas masjid
3. Commit dan push — Vercel akan auto-deploy

### Custom Domain

1. Beli domain (contoh: keuangan-masjidalikhlas.id)
2. Di Vercel dashboard → Settings → Domains
3. Tambahkan domain dan ikuti instruksi DNS

## FAQ

### Apakah data aman?

Data disimpan di Google Sheets milik akun Google Anda sendiri. Hanya Anda dan service account yang memiliki akses.

### Berapa kapasitas penyimpanan?

Google Sheets mendukung hingga ~10 juta cells per spreadsheet. Dengan rata-rata 15 kolom per transaksi, Anda bisa menyimpan ~600.000+ transaksi — cukup untuk puluhan tahun.

### Apa yang terjadi jika Vercel free tier habis?

Free tier Vercel sangat generous (100GB bandwidth/bulan). Untuk penggunaan normal 1 masjid, Anda tidak akan melewati batas ini.

### Bagaimana jika butuh bantuan teknis?

- Buka issue di GitHub repository
- Baca dokumentasi di folder `docs/`

### Bisa digunakan di HP?

Ya, aplikasi responsive dan bisa diakses dari browser HP. Tidak perlu install aplikasi.

## Checklist Adopsi

- [ ] Fork repository ke GitHub Anda
- [ ] Buat Google Cloud Project
- [ ] Aktifkan Google Sheets API
- [ ] Buat Service Account + download credentials
- [ ] Buat Google Sheets + share ke service account
- [ ] Deploy ke Vercel + set environment variables
- [ ] Login dan ganti PIN default
- [ ] Isi data masjid
- [ ] Tambah kategori dan rekening bank
- [ ] Upload logo masjid
- [ ] Mulai catat transaksi!
