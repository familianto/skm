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

> Untuk panduan setup lengkap (Google Cloud, Sheets, Drive), lihat [`docs/adopter/SETUP_GUIDE.md`](docs/adopter/SETUP_GUIDE.md).

## Struktur Project

```
docs/                           # Dokumentasi (lihat docs/README.md utk peta navigasi)
  README.md                     # Indeks navigasi dokumentasi
  adopter/                      # Untuk masjid yang memasang/memakai SKM
    SETUP_GUIDE.md              # Panduan setup
    ADOPTER_GUIDE.md            # Panduan adopsi masjid lain
    BANK_TEMPLATES.md           # Referensi template import CSV bank
  developer/                    # Untuk kontributor/pengembang
    PROJECT_BRIEF.md            # Brief proyek
    ARCHITECTURE.md             # Arsitektur sistem
    DATABASE_SCHEMA.md          # Schema Google Sheets
    API_REFERENCE.md            # Referensi API
    CONVENTIONS.md              # Standar coding
    history/                    # Arsip riwayat pengembangan (HANDOFF/PROMPT/sprints)
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

Detail setiap sprint: [`docs/developer/history/SPRINT_PLAN.md`](docs/developer/history/SPRINT_PLAN.md)

## Untuk Masjid Lain

SKM dapat diadopsi oleh masjid manapun secara **gratis**. Lihat [`docs/adopter/ADOPTER_GUIDE.md`](docs/adopter/ADOPTER_GUIDE.md) untuk panduan lengkap.

**Estimasi biaya**: Rp 0/bulan (semua menggunakan free tier).

## Dokumentasi

Peta navigasi lengkap: **[`docs/README.md`](docs/README.md)**. Dua jalur utama:

- **Adopter** (masjid yang ingin memasang SKM) → [`docs/adopter/`](docs/adopter/)
- **Developer/kontributor** → [`docs/developer/`](docs/developer/) (arsip riwayat di [`docs/developer/history/`](docs/developer/history/))

| Dokumen | Deskripsi |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Entry point untuk AI-assisted development |
| [`docs/developer/PROJECT_BRIEF.md`](docs/developer/PROJECT_BRIEF.md) | Brief proyek lengkap |
| [`docs/developer/ARCHITECTURE.md`](docs/developer/ARCHITECTURE.md) | Arsitektur dan design decisions |
| [`docs/developer/DATABASE_SCHEMA.md`](docs/developer/DATABASE_SCHEMA.md) | Schema semua Google Sheets |
| [`docs/developer/API_REFERENCE.md`](docs/developer/API_REFERENCE.md) | Referensi semua API endpoints |
| [`docs/developer/CONVENTIONS.md`](docs/developer/CONVENTIONS.md) | Standar dan konvensi coding |
| [`docs/adopter/SETUP_GUIDE.md`](docs/adopter/SETUP_GUIDE.md) | Panduan setup development |
| [`docs/adopter/ADOPTER_GUIDE.md`](docs/adopter/ADOPTER_GUIDE.md) | Panduan adopsi untuk masjid lain |

## Contributing

1. Fork repository
2. Buat branch fitur (`sprint-N/feature-name`)
3. Ikuti konvensi di [`docs/developer/CONVENTIONS.md`](docs/developer/CONVENTIONS.md)
4. Commit dengan [Conventional Commits](https://www.conventionalcommits.org/)
5. Buat Pull Request

## License

[MIT](LICENSE) - Copyright 2026 familianto
