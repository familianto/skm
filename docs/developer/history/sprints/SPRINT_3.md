# Sprint 3: Donatur & Reminder WA

**Durasi**: 1-2 minggu
**Tujuan**: Manajemen data donatur dan pengiriman reminder donasi via WhatsApp menggunakan Fonnte API.
**Status**: ✅ Done

## Prasyarat

- Sprint 2 selesai (CRUD transaksi berfungsi, infrastruktur API sudah ada)

## Deliverables

### 1. Data Layer (Types, Constants, Validators)

- [x] Types: `Donatur`, `Reminder`, enums `DonaturKelompok`, `ReminderTipe`, `ReminderStatus`
- [x] Constants: `SHEET_NAMES.DONATUR`, `SHEET_NAMES.REMINDER`, `ID_PREFIXES.DONATUR` (DON), `ID_PREFIXES.REMINDER` (RMD)
- [x] Sheet headers: `donatur` (10 kolom), `reminder` (9 kolom)
- [x] Validators: `donaturCreateSchema`, `donaturUpdateSchema`, `reminderCreateSchema`, `reminderBulkSchema`

### 2. Fonnte WA Service

- [x] `lib/fonnte.ts`:
  - `sendWhatsApp(target, message)` — Kirim pesan WA via Fonnte API
  - `getFonnteStatus()` — Cek status koneksi
  - Auto mock mode jika `FONNTE_API_TOKEN` tidak di-set atau `FONNTE_MOCK=true`
  - Normalisasi nomor telepon (08xxx → 628xxx)

### 3. Donatur API

- [x] `GET /api/donatur` — List donatur aktif, filter by `kelompok`
- [x] `POST /api/donatur` — Tambah donatur baru
- [x] `GET /api/donatur/[id]` — Detail donatur
- [x] `PUT /api/donatur/[id]` — Update donatur
- [x] `DELETE /api/donatur/[id]` — Soft delete (is_active → FALSE)

### 4. Reminder API

- [x] `GET /api/reminder` — List riwayat reminder, filter by `donatur_id`
- [x] `POST /api/reminder` — Kirim reminder ke 1 donatur (single send)
- [x] `POST /api/reminder/send` — Kirim reminder ke banyak donatur (bulk send)
- [x] `GET /api/reminder/send` — Cek status koneksi Fonnte

### 5. Halaman Donatur

- [x] `/donatur` — Daftar donatur:
  - 3 kartu stats: Total Donatur, Donatur Tetap, Total Komitmen/Bulan
  - Pencarian nama/telepon
  - Filter kelompok (Tetap/Insidental)
  - Tabel: nama (link ke detail), telepon, kelompok, komitmen, aksi
  - Modal CRUD (tambah/edit)
- [x] `/donatur/[id]` — Detail donatur:
  - Informasi donatur (telepon, alamat, kelompok, komitmen, catatan)
  - Statistik reminder (total, terkirim, gagal)
  - Riwayat reminder (tabel)
  - Tombol "Kirim WA" — modal dengan pilihan template dan editor pesan

### 6. Halaman Reminder WA

- [x] `/reminder` — Halaman utama reminder:
  - Status koneksi Fonnte (connected / mock mode)
  - Panel kiri: pilih donatur (checkbox, filter kelompok, select all)
  - Panel kanan: pilih tipe pesan, edit isi pesan, tombol kirim
  - 4 template bawaan: Donasi Rutin, Ucapan Terima Kasih, Laporan Keuangan, Custom
  - Personalisasi `{nama}` otomatis
  - Riwayat pengiriman (tabel: waktu, donatur, tipe, nomor, status, detail)

### 7. Hooks

- [x] `useDonatur(options?)` — Fetch daftar donatur dengan filter
- [x] `useDonaturDetail(id)` — Fetch detail donatur
- [x] `useReminder(options?)` — Fetch riwayat reminder dengan filter
- [x] `useFonnteStatus()` — Fetch status koneksi Fonnte

### 8. UI Updates

- [x] Sidebar: tambah link Donatur dan Reminder WA
- [x] Badge: tambah variants TETAP, INSIDENTAL, TERKIRIM, GAGAL, PENDING

## File Baru

```
src/
  app/
    (dashboard)/
      donatur/
        page.tsx                # Daftar donatur (stats, search, filter, CRUD)
        [id]/
          page.tsx              # Detail donatur + riwayat reminder + send WA
      reminder/
        page.tsx                # Reminder WA (bulk select, templates, history)
    api/
      donatur/
        route.ts                # GET (list), POST (create)
        [id]/
          route.ts              # GET (detail), PUT (update), DELETE (soft delete)
      reminder/
        route.ts                # GET (list), POST (single send)
        send/
          route.ts              # POST (bulk send), GET (Fonnte status)
  hooks/
    use-donatur.ts              # useDonatur(), useDonaturDetail()
    use-reminder.ts             # useReminder(), useFonnteStatus()
  lib/
    fonnte.ts                   # Fonnte WA service
```

## Google Sheets Schema

### Sheet: `donatur`

| Kolom | Header | Tipe | Deskripsi |
|---|---|---|---|
| A | `id` | string | DON-YYYYMMDD-XXXX |
| B | `nama` | string | Nama lengkap donatur |
| C | `telepon` | string | Nomor telepon (WhatsApp) |
| D | `alamat` | string | Alamat donatur |
| E | `kelompok` | enum | TETAP / INSIDENTAL |
| F | `jumlah_komitmen` | integer | Komitmen donasi per bulan (Rp) |
| G | `catatan` | string | Catatan tambahan |
| H | `is_active` | boolean | TRUE / FALSE |
| I | `created_at` | timestamp | Waktu dibuat |
| J | `updated_at` | timestamp | Waktu terakhir diupdate |

### Sheet: `reminder`

| Kolom | Header | Tipe | Deskripsi |
|---|---|---|---|
| A | `id` | string | RMD-YYYYMMDD-XXXX |
| B | `donatur_id` | string | Referensi ke donatur |
| C | `tipe` | enum | DONASI_RUTIN / UCAPAN_TERIMA_KASIH / LAPORAN_KEUANGAN / CUSTOM |
| D | `pesan` | string | Isi pesan (sudah dipersonalisasi) |
| E | `nomor_tujuan` | string | Nomor WA tujuan |
| F | `status` | enum | TERKIRIM / GAGAL / PENDING |
| G | `response` | string | Response dari Fonnte API |
| H | `sent_at` | timestamp | Waktu kirim |
| I | `created_at` | timestamp | Waktu record dibuat |

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/api/donatur` | List donatur (filter: kelompok) |
| POST | `/api/donatur` | Tambah donatur |
| GET | `/api/donatur/[id]` | Detail donatur |
| PUT | `/api/donatur/[id]` | Update donatur |
| DELETE | `/api/donatur/[id]` | Soft delete donatur |
| GET | `/api/reminder` | List reminder (filter: donatur_id) |
| POST | `/api/reminder` | Kirim reminder ke 1 donatur |
| POST | `/api/reminder/send` | Bulk send reminder |
| GET | `/api/reminder/send` | Status koneksi Fonnte |

## Environment Variables Baru

```env
FONNTE_API_TOKEN=               # Token dari dashboard Fonnte (opsional)
FONNTE_MOCK=                    # Set 'true' untuk force mock mode (opsional)
```

## Definition of Done

- [x] Donatur CRUD berfungsi end-to-end
- [x] Reminder WA single send berfungsi
- [x] Reminder WA bulk send berfungsi
- [x] Mock mode berfungsi tanpa device Fonnte
- [x] Template pesan dengan personalisasi `{nama}`
- [x] Riwayat reminder tersimpan dan tampil
- [x] Sidebar navigation updated
- [x] TypeScript: no errors
- [x] Lint: no warnings
- [x] Build pass
