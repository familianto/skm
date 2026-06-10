# SKM — Sistem Keuangan Masjid v2.1

Sistem manajemen keuangan masjid berbasis web yang transparan, akuntabel, dan mudah digunakan.

## Fitur Utama

- **Pencatatan Transaksi** — Catat pemasukan dan pengeluaran dengan kategori dan rekening bank
- **Dashboard Real-time** — Ringkasan keuangan kumulatif lintas tahun, tren tahunan, grafik tren bulanan, dan breakdown kategori
- **Rekonsiliasi Bank** — Bandingkan saldo sistem dengan saldo bank aktual
- **Void & Koreksi** — Batalkan atau koreksi transaksi yang salah dengan audit trail
- **Upload Bukti** — Lampirkan foto bukti transaksi (struk, kwitansi)
- **Export Laporan** — Download laporan dalam format PDF atau Excel, dengan filter kategori per jenis (Masuk/Keluar)
- **Display Publik** — Halaman read-only untuk ditampilkan di TV/monitor masjid
- **Landing Page Qurban** — Laporan progress Qurban publik dengan search, filter, share WA, dan TV mode
- **Multi-Masjid** — Dapat diadopsi oleh masjid lain dengan mudah
- **Bulk Edit Kategori** — Ubah kategori banyak transaksi sekaligus dengan checkbox dan dialog konfirmasi
- **Proteksi Hapus** — Kategori dan rekening yang memiliki transaksi tidak dapat dihapus tanpa memindahkan transaksi terlebih dahulu

## Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4 |
| Database | Google Sheets API v4 |
| File Storage | Base64 Data URL (di Google Sheets) |
| Auth | PIN-based (bcrypt + JWT) |
| Validation | Zod v4 |
| Hosting | Vercel |

## Quick Start

```bash
# Clone repository
git clone https://github.com/familianto/skm.git
cd skm

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local dengan credentials Anda

# Run development server
npm run dev
```

Buka `http://localhost:3000` di browser.

> Untuk panduan setup lengkap (Google Cloud, Sheets, Drive), lihat [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md).

## Struktur Project

```
docs/                           # Dokumentasi lengkap
  PROJECT_BRIEF.md              # Brief proyek
  ARCHITECTURE.md               # Arsitektur sistem
  DATABASE_SCHEMA.md            # Schema Google Sheets
  API_REFERENCE.md              # Referensi API
  SETUP_GUIDE.md                # Panduan setup
  SPRINT_PLAN.md                # Rencana sprint
  CONVENTIONS.md                # Standar coding
  ADOPTER_GUIDE.md              # Panduan adopsi masjid lain
  sprints/                      # Detail per sprint (0-6)
CLAUDE.md                       # Panduan untuk AI-assisted development
```

## Sprint Roadmap

| Sprint | Nama | Status | Deskripsi |
|---|---|---|---|
| 0 | Setup Wizard | ✅ Done | Inisialisasi project, koneksi Google Sheets |
| 1 | Foundation | ✅ Done | Auth PIN, CRUD master data, layout UI |
| 2 | Core Transactions | ✅ Done | CRUD transaksi keuangan |
| 3 | Donatur & Reminder WA | ✅ Done | Manajemen donatur, reminder WhatsApp via Fonnte |
| 4 | Dashboard & Export | ✅ Done | Grafik, ringkasan, export PDF/Excel |
| 5 | Rekonsiliasi Bank | ✅ Done | Rekonsiliasi bank, void/koreksi, upload bukti |
| 6 | TV Display, Settings & Polish | ✅ Done | Display publik, pengaturan, logo, optimization |
| 7 | UI/UX Polish | ✅ Done | Sidebar grouping, badge style, format Rupiah |
| 8 | Mutasi Internal | ✅ Done | Transfer dana antar rekening |
| 9 | Bulk Edit & Proteksi Hapus | ✅ Done | Bulk edit kategori, proteksi hapus, dialog konfirmasi, toast |

Detail setiap sprint: [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md)

## Environment Variables

Salin `.env.example` ke `.env.local` dan isi sesuai setup Anda:

| Variable | Wajib | Deskripsi |
|---|---|---|
| `SESSION_SECRET` | ✅ | Secret key untuk JWT (min 32 karakter) |
| `GOOGLE_SHEETS_ID` | ✅ | ID spreadsheet utama Google Sheets |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ | Email service account Google Cloud |
| `GOOGLE_PRIVATE_KEY` | ✅ | Private key service account (dengan `\n`) |
| `FONNTE_API_TOKEN` | ⬜ | Token API WhatsApp Fonnte |
| `FONNTE_MOCK` | ⬜ | `true` = WhatsApp tidak dikirim sungguhan |
| `QURBAN_MODULE_ENABLED` | ⬜ | `false` = matikan modul Qurban |
| `QURBAN_PAYMENT_BANK_NAME` | ⬜ | Nama bank rekening Qurban |
| `QURBAN_PAYMENT_ACCOUNT_NUMBER` | ⬜ | Nomor rekening Qurban |
| `QURBAN_PANITIA_HP` | ⬜ | Nomor WA panitia (format 628xx) |
| `NEXT_PUBLIC_MASJID_NAME` | ⬜ | Nama masjid fallback untuk laporan |

> Lihat `.env.example` untuk daftar lengkap dan nilai default.

## Security

SKM menerapkan beberapa lapis keamanan:

- **CSP (Content Security Policy)** — Mencegah XSS dan injection
- **HTTP-only cookies** — Session token tidak bisa diakses JavaScript
- **XSS sanitization** — Semua input text otomatis dibersihkan dari HTML tags
- **Audit trail** — Setiap perubahan data tercatat dengan user ID dan IP address
- **Rate limiting** — Proteksi brute-force di endpoint login
- **Role-based access** — SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI, BENDAHARA, PENGURUS, VIEWER

Jalankan audit keamanan secara berkala:
```bash
npm run audit
```

## Troubleshooting

| Masalah | Solusi |
|---|---|
| "SESSION_SECRET is not set" | Pastikan `.env.local` ada dan `SESSION_SECRET` terisi |
| "Google Sheets API error" | Periksa `GOOGLE_PRIVATE_KEY` — harus mengandung karakter `\n` (bukan newline literal) |
| WhatsApp tidak terkirim | Set `FONNTE_MOCK=false` dan pastikan token valid |
| Modul Qurban tidak muncul | Pastikan `QURBAN_MODULE_ENABLED` tidak diset ke `'false'` |
| Build gagal | Jalankan `npm run type-check` untuk melihat error TypeScript |

## Untuk Masjid Lain

SKM dapat diadopsi oleh masjid manapun secara **gratis**. Lihat [`docs/ADOPTER_GUIDE.md`](docs/ADOPTER_GUIDE.md) untuk panduan lengkap.

**Estimasi biaya**: Rp 0/bulan (semua menggunakan free tier).

## Dokumentasi

| Dokumen | Deskripsi |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Entry point untuk AI-assisted development |
| [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) | Brief proyek lengkap |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arsitektur dan design decisions |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Schema semua Google Sheets |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Referensi semua API endpoints |
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) | Panduan setup development |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Standar dan konvensi coding |
| [`docs/ADOPTER_GUIDE.md`](docs/ADOPTER_GUIDE.md) | Panduan adopsi untuk masjid lain |

## Contributing

1. Fork repository
2. Buat branch fitur (`sprint-N/feature-name`)
3. Ikuti konvensi di [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)
4. Commit dengan [Conventional Commits](https://www.conventionalcommits.org/)
5. Buat Pull Request

## License

[MIT](LICENSE) - Copyright 2026 familianto
