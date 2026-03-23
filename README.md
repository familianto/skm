# SKM — Sistem Keuangan Masjid v2.1

Sistem manajemen keuangan masjid berbasis web yang transparan, akuntabel, dan mudah digunakan.

## Fitur Utama

- **Pencatatan Transaksi** — Catat pemasukan dan pengeluaran dengan kategori dan rekening bank
- **Dashboard Real-time** — Ringkasan keuangan dengan grafik tren dan breakdown kategori
- **Rekonsiliasi Bank** — Bandingkan saldo sistem dengan saldo bank aktual
- **Void & Koreksi** — Batalkan atau koreksi transaksi yang salah dengan audit trail
- **Upload Bukti** — Lampirkan foto bukti transaksi (struk, kwitansi)
- **Export Laporan** — Download laporan dalam format PDF atau Excel
- **Display Publik** — Halaman read-only untuk ditampilkan di TV/monitor masjid
- **Multi-Masjid** — Dapat diadopsi oleh masjid lain dengan mudah

## Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4 |
| Database | Google Sheets API v4 |
| File Storage | Google Drive |
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
| 0 | Setup Wizard | Done | Inisialisasi project, koneksi Google Sheets |
| 1 | Foundation | Done | Auth PIN, CRUD master data, layout UI |
| 2 | Core Transactions | ✅ Done | CRUD transaksi keuangan |
| 3 | Dashboard & Export | - | Grafik, ringkasan, export PDF/Excel |
| 4 | Reconciliation | - | Rekonsiliasi bank, void/koreksi, upload bukti |
| 5 | Communication | - | Halaman publik, template pesan |
| 6 | Polish | - | Pengaturan, logo, optimization, multi-masjid |

Detail setiap sprint: [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md)

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
