# Project Brief: Sistem Keuangan Masjid (SKM) v2.1

Dokumen ini adalah panduan utama untuk development menggunakan Claude Code.
Update dokumen ini setiap kali ada perubahan signifikan.

---

## 1. Ringkasan Proyek

**Nama Proyek**: Sistem Keuangan Masjid (SKM) v2.1
**Repository**: [familianto/skm](https://github.com/familianto/skm)

SKM adalah sistem manajemen keuangan masjid berbasis web yang bertujuan untuk mendigitalkan pengelolaan keuangan masjid agar lebih transparan, akuntabel, dan mudah digunakan.

### Primary Objective

- **Transparansi Keuangan** — Semua transaksi tercatat dan dapat diaudit
- **Kemudahan Akses** — Bendahara dapat mencatat transaksi dari mana saja
- **Laporan Otomatis** — Dashboard real-time dengan grafik dan ringkasan
- **Reusability** — Sistem dapat diadopsi oleh masjid lain dengan mudah
- **Biaya Minimal** — Menggunakan Google Sheets (gratis) sebagai database
- **Bahasa Indonesia** — Seluruh antarmuka dalam Bahasa Indonesia
- **Audit Trail** — Setiap perubahan tercatat di log

## 2. Tech Stack

| Komponen | Teknologi | Catatan |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | TypeScript strict |
| Styling | Tailwind CSS | Mobile-first |
| Backend | Next.js API Routes | Route Handlers |
| Database | Google Sheets API v4 | Sheets sebagai DB |
| File Storage | Google Drive | Upload bukti transaksi |
| Auth | PIN-based | Hash + cookie session |
| Charts | Chart.js / Recharts | Dashboard visualisasi |
| State | SWR + React Context | Client-side caching |
| Hosting | Vercel | Free tier cukup |
| Testing | Jest | Unit + integration |
| CI/CD | GitHub Actions | Lint, test, build |
| Validasi | Zod | Input validation |
| PDF Export | jspdf / @react-pdf/renderer | Laporan PDF |
| Excel Export | xlsx / exceljs | Laporan Excel |

## 3. Arsitektur Sistem

```
┌─────────────┐
│   Browser    │
│  (Pengguna)  │
└──────┬───────┘
       │ HTTPS
┌──────▼───────┐
│   Next.js    │
│   (Vercel)   │
│              │
│  ┌────────┐  │
│  │  App   │  │     ┌──────────────────┐
│  │ Router │  │     │  Google Sheets   │
│  └───┬────┘  │     │  (Database)      │
│      │       │     │                  │
│  ┌───▼────┐  │     │  - master        │
│  │  API   │──┼────▶│  - transaksi     │
│  │ Routes │  │     │  - kategori      │
│  └───┬────┘  │     │  - rekening_bank │
│      │       │     │  - audit_log     │
│  ┌───▼────┐  │     │  - anggota       │
│  │  lib/  │  │     │  - rekonsiliasi  │
│  │ google │  │     └──────────────────┘
│  │-sheets │  │
│  │  .ts   │  │     ┌──────────────────┐
│  └───┬────┘  │     │  Google Drive    │
│      └───────┼────▶│  (File Storage)  │
│              │     │  - Bukti foto    │
└──────────────┘     └──────────────────┘
```

### Data Flow

1. **Baca data**: Client → SWR fetch → API Route → `lib/google-sheets.ts` → Google Sheets API → Spreadsheet
2. **Tulis data**: Client → Form submit → API Route → Validasi (Zod) → `lib/google-sheets.ts` → Append/Update row → Audit log
3. **Upload bukti**: Client → Compress image → API Route → `lib/google-drive.ts` → Google Drive → Return URL → Simpan URL di sheet transaksi
4. **Export**: Client → API Route → Baca data dari sheets → Generate PDF/Excel → Return file

## 4. Struktur Google Sheets

Lihat detail lengkap di `DATABASE_SCHEMA.md`.

### Ringkasan Sheets

| Sheet | Fungsi | Sprint |
|---|---|---|
| `master` | Konfigurasi masjid (nama, alamat, PIN hash, logo) | Sprint 0 |
| `transaksi` | Semua transaksi keuangan (masuk/keluar) | Sprint 2 |
| `kategori` | Kategori transaksi (infaq, zakat, listrik, dll) | Sprint 1 |
| `rekening_bank` | Daftar rekening bank masjid | Sprint 1 |
| `audit_log` | Log semua perubahan data | Sprint 1 |
| `anggota` | Data pengurus masjid (bendahara, dll) | Sprint 1 |
| `rekonsiliasi` | Data rekonsiliasi bank | Sprint 4 |

## 5. Fitur Utama

### 5.1 Manajemen Transaksi (Sprint 2)
- Catat pemasukan (MASUK) dan pengeluaran (KELUAR)
- Pilih kategori dan rekening bank
- Upload bukti transaksi (foto struk/kwitansi)
- Filter berdasarkan tanggal, kategori, jenis, status
- Pagination untuk daftar transaksi

### 5.2 Void & Koreksi (Sprint 4) — BARU
- **Void**: Batalkan transaksi yang salah (status → VOID, wajib isi alasan)
- **Koreksi**: Buat transaksi koreksi yang terhubung ke transaksi asli
- Semua void/koreksi tercatat di audit log

### 5.3 Upload Bukti Pengiriman (Sprint 4) — BARU
- Upload foto bukti dari device (kamera/galeri)
- Compress otomatis di client sebelum upload
- Simpan di Google Drive, URL disimpan di sheet transaksi
- Preview bukti di detail transaksi

### 5.4 Dashboard & Laporan (Sprint 3)
- **Kartu ringkasan**: Total masuk, total keluar, saldo
- **Grafik tren bulanan**: Line chart pemasukan vs pengeluaran
- **Grafik kategori**: Pie/bar chart breakdown per kategori
- **Filter periode**: Pilih rentang tanggal
- **Export PDF**: Laporan keuangan format PDF
- **Export Excel**: Data transaksi format spreadsheet

### 5.5 Rekonsiliasi Bank (Sprint 4) — BARU
- Input saldo bank aktual
- Bandingkan dengan saldo sistem
- Tampilkan selisih
- Catat hasil rekonsiliasi

### 5.6 Logo & Branding (Sprint 6) — BARU
- Upload logo masjid
- Logo tampil di header dan laporan PDF
- Simpan di Google Drive

### 5.7 Autentikasi PIN (Sprint 1)
- Login dengan PIN (bukan username/password)
- PIN di-hash sebelum disimpan
- Session berbasis cookie (HTTP-only)
- Middleware proteksi untuk semua halaman kecuali login
- Cocok untuk device bersama di masjid

### 5.8 Import Master Bank & Rekonsiliasi (Sprint 4) — BARU
- Import data rekening bank dari file
- Setup saldo awal
- Pantau saldo per rekening

### 5.9 Multi-Masjid / Adopter (Sprint 6)
- Dokumentasi adopsi untuk masjid lain
- Fork repository → setup Google Cloud sendiri → deploy ke Vercel
- Kustomisasi nama, logo, kategori

## 6. Target Pengguna

| Peran | Akses | Deskripsi |
|---|---|---|
| **Bendahara** | Full access | Catat transaksi, kelola data, lihat laporan |
| **Pengurus** | Read + limited write | Lihat laporan, approve transaksi besar |
| **Viewer** | Read only | Lihat dashboard publik |

## 7. Batasan & Asumsi

1. **Google Sheets sebagai DB**: Tidak support complex queries, JOIN, atau indexing. Semua filtering dilakukan di application layer.
2. **Cell limit**: Max ~10 juta cells per spreadsheet. Cukup untuk 1 masjid selama bertahun-tahun.
3. **Single writer**: Diasumsikan hanya 1 bendahara yang menulis data secara bersamaan. Tidak ada row-level locking.
4. **API rate limit**: 100 requests per 100 seconds per user. Gunakan batch operations.
5. **File upload**: Max 4.5MB per request di Vercel serverless. Compress gambar di client.
6. **Gratis**: Seluruh stack menggunakan free tier (Google Sheets, Vercel, GitHub).

## 8. Rencana Sprint

Lihat detail di `SPRINT_PLAN.md` dan file individual di `sprints/`.

| Sprint | Nama | Estimasi | Status |
|---|---|---|---|
| 0 | Setup Wizard | 1 minggu | Belum dimulai |
| 1 | Foundation | 2 minggu | Belum dimulai |
| 2 | Core Transactions | 2 minggu | Belum dimulai |
| 3 | Dashboard & Export | 2 minggu | Belum dimulai |
| 4 | Reconciliation & Additional | 2 minggu | Belum dimulai |
| 5 | Communication & Display | 1-2 minggu | Belum dimulai |
| 6 | Settings, Polish & Reusability | 1-2 minggu | Belum dimulai |

## 9. Saran Fitur Masa Depan (Backlog)

Fitur-fitur berikut **tidak termasuk** dalam scope v2.1, tapi bisa ditambahkan di versi selanjutnya:

1. **OTP/SMS untuk Board Tighter** — Autentikasi 2-faktor
2. **Automated Zakat Calculator** — Kalkulator zakat otomatis
3. **Keyboard Shortcut Dashboard** — Navigasi cepat via keyboard
4. **Multi-Bahasa (i18n)** — Support bahasa selain Indonesia
5. **Recurring Transactions** — Transaksi berulang (listrik bulanan, dll)
6. **Dashboard Publik untuk Jamaah** — Halaman publik tanpa login
7. **Notifikasi WhatsApp** — Kirim laporan via WhatsApp
8. **Mobile App (PWA)** — Progressive Web App untuk mobile

## 10. Estimasi Biaya Operasional

### Skenario: Masjid menggunakan semua fitur

| Komponen | Biaya/Bulan |
|---|---|
| Google Sheets + Drive | Gratis (15GB per Google account) |
| Vercel Hosting (Free tier) | Gratis |
| Domain (opsional) | Rp 12.000 - Rp 150.000/tahun |
| **Total** | **Rp 0 - Rp 12.500/bulan** |

---

## Changelog

### v2.1 (23 Maret 2026)
- Tambah fitur Upload Bukti Pengiriman
- Tambah fitur Void & Koreksi
- Tambah fitur Logo & Branding
- Tambah fitur Import Master Bank & Rekonsiliasi
- Tambah panduan adopsi untuk masjid lain
- Update dokumentasi development lengkap
