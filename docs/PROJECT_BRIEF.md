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
| File Storage | Base64 Data URL (di Google Sheets) | Logo & bukti transaksi disimpan sebagai base64 |
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
│  │  .ts   │  │     Logo & bukti disimpan
│  └────────┘  │     sebagai base64 data URL
│              │     langsung di cell Sheets
└──────────────┘
```

### Data Flow

1. **Baca data**: Client → SWR fetch → API Route → `lib/google-sheets.ts` → Google Sheets API → Spreadsheet
2. **Tulis data**: Client → Form submit → API Route → Validasi (Zod) → `lib/google-sheets.ts` → Append/Update row → Audit log
3. **Upload bukti/logo**: Client → Resize & compress via Canvas API → Base64 data URL → API Route → Simpan di cell Google Sheets
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
| `rekonsiliasi` | Data rekonsiliasi bank | Sprint 5 |
| `donatur` | Data donatur masjid | Sprint 3 |
| `reminder` | Log pengiriman reminder WA | Sprint 3 |

## 5. Fitur Utama

### 5.1 Manajemen Transaksi (Sprint 2)
- Catat pemasukan (MASUK) dan pengeluaran (KELUAR)
- Pilih kategori dan rekening bank
- Upload bukti transaksi (foto struk/kwitansi)
- Filter berdasarkan tanggal, kategori, jenis, status
- Pagination untuk daftar transaksi

### 5.2 Manajemen Donatur & Reminder WA (Sprint 3)
- CRUD data donatur (tetap/insidental)
- Komitmen donasi bulanan per donatur
- Kirim reminder via WhatsApp (Fonnte API)
- Template pesan bawaan + custom
- Bulk send ke banyak donatur sekaligus
- Riwayat pengiriman reminder

### 5.3 Dashboard & Laporan (Sprint 4)
- **Dashboard kumulatif lintas tahun**: Kartu all-time (total pemasukan, pengeluaran, saldo kumulatif) + bar chart tren tahunan (pemasukan vs pengeluaran per tahun, dinamis dari data)
- **Kartu ringkasan per periode**: Total masuk, total keluar, saldo (filter tahun/bulan)
- **Grafik tren bulanan**: Bar chart pemasukan vs pengeluaran per bulan
- **Grafik kategori**: Pie/donut chart breakdown per kategori (top 5 + Lainnya)
- **Filter periode**: Pilih tahun dan bulan
- **Filter kategori**: Multi-select kategori untuk laporan (dikelompokkan per jenis MASUK/KELUAR)
- **Export PDF**: Laporan keuangan format PDF (ringkasan/detail), dengan filter kategori opsional (dikelompokkan per jenis MASUK/KELUAR di judul)
- **Export Excel**: Data transaksi format spreadsheet (2 sheets: Ringkasan + Detail), dengan filter kategori opsional

### 5.4 Void & Koreksi (Sprint 5)
- **Void**: Batalkan transaksi yang salah (status → VOID, wajib isi alasan)
- **Koreksi**: Buat transaksi koreksi yang terhubung ke transaksi asli
- Semua void/koreksi tercatat di audit log

### 5.5 Upload Bukti Transaksi (Sprint 5)
- Upload foto bukti dari device (kamera/galeri)
- Resize otomatis di client (max 600px) dan compress ke JPEG 70%
- Simpan sebagai base64 data URL di kolom `bukti_url` sheet transaksi
- Preview bukti di detail transaksi (lightbox viewer)

### 5.6 Rekonsiliasi Bank (Sprint 5)
- Input saldo bank aktual
- Bandingkan dengan saldo sistem
- Tampilkan selisih
- Catat hasil rekonsiliasi

### 5.7 Autentikasi PIN (Sprint 1)
- Login dengan PIN (bukan username/password)
- PIN di-hash sebelum disimpan
- Session berbasis cookie (HTTP-only)
- Middleware proteksi untuk semua halaman kecuali login
- Cocok untuk device bersama di masjid
- **Rate limiting**: Maksimal 5x percobaan login gagal berturut-turut, setelahnya akun di-lock selama 5 menit dengan countdown timer real-time
- **Warning visual**: Peringatan sisa percobaan setelah gagal ke-3 dengan border merah pada input

### 5.8 Import CSV Rekening Koran — BARU
- Import transaksi dari CSV rekening koran bank
- Arsitektur extensible: bank template per bank (saat ini: Bank Muamalat)
- Auto-kategorisasi berdasarkan pattern rules di keterangan transaksi
- Preview tabel dengan status: Auto / Review / Perlu Split
- Split handler untuk transaksi gabungan (misal Setor Tunai)
- Duplikat detection (tanggal + jumlah + keterangan)
- Batch insert ke sheet Transaksi via API
- Template bank disimpan di `src/lib/bank-templates/` — lihat `docs/BANK_TEMPLATES.md`

### 5.9 Import Master Bank & Rekonsiliasi (Sprint 4) — BARU
- Import data rekening bank dari file
- Setup saldo awal
- Pantau saldo per rekening
### 5.8 TV Display Publik (Sprint 6)
- Halaman read-only untuk ditampilkan di TV/monitor masjid
- Ringkasan keuangan dan grafik sederhana
- Auto-refresh setiap 5 menit
- Tidak perlu login

### 5.9 Logo & Branding (Sprint 6)
- Upload logo masjid
- Resize otomatis di client (max 200px) dan compress ke JPEG 80%
- Simpan sebagai base64 data URL di kolom `logo_url` sheet master
- Logo tampil di sidebar, halaman publik, dan laporan PDF

### 5.10 Multi-Masjid / Adopter (Sprint 6)
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
| 0 | Setup Wizard | 1 minggu | ✅ Done |
| 1 | Foundation | 2 minggu | ✅ Done |
| 2 | Core Transactions | 2 minggu | ✅ Done |
| 3 | Donatur & Reminder WA | 1-2 minggu | ✅ Done |
| 4 | Dashboard, Laporan & Export | 2 minggu | ✅ Done |
| 5 | Rekonsiliasi Bank | 2 minggu | ✅ Done |
| 6 | TV Display, Settings & Polish | 1-2 minggu | ✅ Done |

## 9. Saran Fitur Masa Depan (Backlog)

Fitur-fitur berikut **tidak termasuk** dalam scope v2.1, tapi bisa ditambahkan di versi selanjutnya:

1. **OTP/SMS untuk Board Tighter** — Autentikasi 2-faktor
2. **Automated Zakat Calculator** — Kalkulator zakat otomatis
3. **Keyboard Shortcut Dashboard** — Navigasi cepat via keyboard
4. **Multi-Bahasa (i18n)** — Support bahasa selain Indonesia
5. **Recurring Transactions** — Transaksi berulang (listrik bulanan, dll)
6. **Scheduled WA Reminders** — Reminder otomatis terjadwal (via Vercel Cron)
7. **Donation Tracking per Donatur** — Hubungkan donatur ke transaksi untuk lacak total donasi
8. **Mobile App (PWA)** — Progressive Web App untuk mobile

## 10. Estimasi Biaya Operasional

### Skenario: Masjid menggunakan semua fitur

| Komponen | Biaya/Bulan |
|---|---|
| Google Sheets | Gratis (logo & bukti disimpan sebagai base64 di Sheets) |
| Vercel Hosting (Free tier) | Gratis |
| Domain (opsional) | Rp 12.000 - Rp 150.000/tahun |
| **Total** | **Rp 0 - Rp 12.500/bulan** |

---

## 11. Design System & Theme

### Prinsip Desain
- **Clean & Modern**: Minimalis, less colorful, good readability
- **Primary Color**: Emerald/green hanya untuk elemen aktif dan CTA
- **Grayscale**: Sisanya menggunakan abu-abu, putih, hitam

### Sidebar
- Menu dikelompokkan dalam sections dengan label: **Utama**, **Laporan**, **Pengaturan**, **Lainnya**
- Label section: font kecil, uppercase, warna abu-abu, tidak clickable

### Komponen UI
- **Badge**: Subtle/muted style — light background, dark text, ring border (bukan solid color)
  - MASUK: `bg-emerald-50 text-emerald-700 ring-emerald-200`
  - KELUAR: `bg-red-50 text-red-700 ring-red-200`
  - Status: grayscale muted
- **Card**: `shadow-sm + border-gray-200 + rounded-xl`, padding `p-6`
- **Table**: Header `bg-gray-50 font-semibold`, row hover `bg-gray-50`, kolom Aksi `text-center`
- **Rupiah**: Format dengan spasi: `Rp 1.234.567` (via `formatRupiah()` di `lib/utils.ts`)

### Rekonsiliasi Form
- Form dibatasi `max-w-2xl` agar tidak full-width

---

## Changelog

### v2.1.2 (6 April 2026)
- Transaksi: Multi-select kategori filter dengan checkbox dropdown
- Transaksi: Sticky summary bar (Masuk/Keluar/Saldo) di atas tabel
- Dashboard: Transaction count pada semua cumulative cards
- Dashboard: Yearly trend chart diubah dari bar ke line chart + area fill
- Dashboard: Category breakdown all-time (horizontal bar chart top 10)
- Dashboard: Yearly trend mulai dari 2025 (exclude data parsial 2024)
- Laporan: Opsi "Semua Tahun" untuk laporan lintas tahun
- Export PDF/Excel: Support mode all-time (tahun=all)

### v2.1.1 (6 April 2026)
- UI/UX Polish: Sidebar grouping dengan section labels
- Theme: Badge subtle/muted, tabel header semibold, Aksi column text-center
- Format Rupiah dengan spasi: "Rp 1.234.567"
- Rekonsiliasi form layout fix (max-w-2xl)

### v2.1 (23 Maret 2026)
- Tambah fitur Upload Bukti Pengiriman
- Tambah fitur Void & Koreksi
- Tambah fitur Logo & Branding
- Tambah fitur Import Master Bank & Rekonsiliasi
- Tambah panduan adopsi untuk masjid lain
- Update dokumentasi development lengkap
