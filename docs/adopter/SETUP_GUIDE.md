# Panduan Setup — SKM v2.1

## Prasyarat

- **Node.js** 18+ (LTS recommended)
- **npm** atau **pnpm**
- **Google Account** (untuk Google Cloud Console)
- **Git**
- **Code editor** (VS Code recommended)

---

## Langkah 1: Clone Repository

```bash
git clone https://github.com/familianto/skm.git
cd skm
```

## Langkah 2: Setup Google Cloud Project

### 2.1 Buat Project Baru

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Klik **Select a project** → **New Project**
3. Nama project: `SKM - [Nama Masjid]`
4. Klik **Create**

### 2.2 Aktifkan API

1. Buka **APIs & Services** → **Library**
2. Cari dan aktifkan:
   - **Google Sheets API**

### 2.3 Buat Service Account

1. Buka **APIs & Services** → **Credentials**
2. Klik **Create Credentials** → **Service Account**
3. Nama: `skm-service`
4. Klik **Create and Continue**
5. Role: **Editor** (atau buat custom role)
6. Klik **Done**
7. Klik service account yang baru dibuat
8. Tab **Keys** → **Add Key** → **Create new key** → **JSON**
9. Download file JSON credentials
10. Simpan file ini dengan aman, **JANGAN** commit ke repository

### 2.4 Catat Informasi

Dari file JSON credentials, catat:
- `client_email` → untuk `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → untuk `GOOGLE_PRIVATE_KEY`

## Langkah 3: Setup Google Sheets

### 3.1 Buat Spreadsheet Baru

1. Buka [Google Sheets](https://sheets.google.com)
2. Buat spreadsheet baru
3. Beri nama: `SKM - [Nama Masjid]`
4. Catat **Spreadsheet ID** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

### 3.2 Share dengan Service Account

1. Klik **Share** di spreadsheet
2. Tambahkan email service account (`client_email` dari JSON)
3. Berikan akses **Editor**
4. Klik **Send**

### 3.3 Buat Sheet Tabs

Buat 10 sheet/tab inti dengan nama **persis** seperti ini (case-sensitive):

1. `master`
2. `transaksi`
3. `kategori`
4. `rekening_bank`
5. `audit_log`
6. `anggota`
7. `rekonsiliasi`
8. `donatur`
9. `reminder_log`
10. `kelompok`

Hapus sheet default "Sheet1" jika ada.

> **Modul Qurban (opsional).** Bila modul Qurban dipakai, ada **9 tab tambahan**
> (`qurban_edisi`, `qurban_konfigurasi_edisi`, `qurban_panitia`, `qurban_muqorib`,
> `qurban_master_hewan`, `qurban_daftar_hewan`, `qurban_peserta`,
> `qurban_pembayaran`, `qurban_bagian_kanonik`) — semuanya berada di **workbook
> yang sama** (`GOOGLE_SHEETS_ID`), bukan spreadsheet terpisah. Tab ini dibuat
> via script migrasi Apps Script di `scripts/migrate_*.gs`. Modul diaktifkan/
> dimatikan dengan env `QURBAN_MODULE_ENABLED`. Daftar kolom lengkap (semua 19
> tab) ada di `DATABASE_SCHEMA.md`.

### 3.4 Tambah Header

Untuk setiap sheet, tambahkan header di Row 1 sesuai `DATABASE_SCHEMA.md`:

**Sheet `master`** (Row 1):
```
id | nama_masjid | alamat | kota | provinsi | telepon | email | pin_hash | logo_url | tahun_buku_aktif | mata_uang | created_at | updated_at
```

**Sheet `transaksi`** (Row 1):
```
id | tanggal | jenis | kategori_id | deskripsi | jumlah | rekening_id | bukti_url | status | void_reason | void_date | koreksi_dari_id | created_by | created_at | updated_at
```

**Sheet `kategori`** (Row 1):
```
id | nama | jenis | deskripsi | is_active | created_at
```

**Sheet `rekening_bank`** (Row 1):
```
id | nama_bank | nomor_rekening | atas_nama | saldo_awal | is_active | created_at | updated_at
```

**Sheet `audit_log`** (Row 1):
```
id | timestamp | aksi | entitas | entitas_id | detail | user_info | user_id | ip_address
```

**Sheet `anggota`** (Row 1):
```
id | nama | telepon | email | peran | is_active | created_at | pin_hash | created_by | updated_at | last_login_at | failed_attempts | locked_until
```

**Sheet `rekonsiliasi`** (Row 1):
```
id | rekening_id | tanggal | saldo_bank | saldo_sistem | selisih | status | catatan | created_at
```

**Sheet `donatur`** (Row 1):
```
id | nama | telepon | alamat | kelompok | jumlah_komitmen | catatan | is_active | created_at | updated_at
```

**Sheet `reminder_log`** (Row 1):
```
id | donatur_id | tanggal_kirim | jenis_reminder | pesan | status_kirim | error_message | created_at
```

**Sheet `kelompok`** (Row 1):
```
id | nama | deskripsi | warna | kategori_masuk | kategori_keluar | created_at | updated_at
```

> **Header tab Qurban**: untuk 9 tab `qurban_*`, lihat `DATABASE_SCHEMA.md`
> (sumber otoritatif = `SHEET_HEADERS` di `src/lib/constants.ts`). Tab ini lebih
> mudah dibuat lewat script migrasi `scripts/migrate_*.gs` daripada manual.

> **TIP**: Header & seed data juga bisa dibuat otomatis lewat `npm run seed`
> (`scripts/seed.ts`).

## Langkah 4: Environment Variables

> **Catatan**: Google Drive **tidak diperlukan**. Logo dan bukti transaksi disimpan langsung sebagai base64 data URL di cell Google Sheets. Gambar otomatis di-resize dan compress di browser sebelum disimpan.

### 4.1 Buat File `.env.local`

```bash
cp .env.example .env.local
```

### 4.2 Isi Environment Variables

> **Daftar lengkap & otoritatif ada di `.env.example`** (setiap var di sana
> benar-benar dibaca kode). Salin lalu isi. SKM memakai login **PIN + JWT**
> (cookie `skm_session`), **bukan** NextAuth/Google OAuth — jadi tidak ada
> `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_*`, atau `PIN_SALT`.

Minimal yang **wajib** untuk menjalankan aplikasi:

```env
# Google Sheets (database) — satu workbook untuk semua tab (inti + Qurban)
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Auth/Session — penanda-tangan JWT sesi
# Generate dengan: openssl rand -hex 32
SESSION_SECRET=generate_random_string_32_chars_here
```

Opsional yang umum dipakai (lihat `.env.example` untuk komentar lengkap):

```env
AUTH_SECRET=                       # fallback bila SESSION_SECRET kosong
FONNTE_API_TOKEN=                  # WhatsApp; kosong → mode mock
FONNTE_MOCK=                       # "true" memaksa mode mock
NEXT_PUBLIC_MASJID_NAME=           # fallback nama masjid utk export
QURBAN_MODULE_ENABLED=             # "false" mematikan rute Qurban
QURBAN_LEGACY_LOGIN_ENABLED=       # "true" izinkan login legacy single-PIN
```

### 4.3 Catatan Penting untuk `GOOGLE_PRIVATE_KEY`

Private key dari file JSON credentials perlu di-handle dengan benar:

**Di `.env.local`**:
- Wrap dengan double quotes
- Newlines sebagai `\n` (literal string)

**Di Vercel Dashboard**:
- Paste private key apa adanya (dengan actual newlines)
- Vercel akan handle escaping otomatis

**Test koneksi**: jalankan `npm run seed` (Langkah 7) — skrip itu mengecek koneksi
ke spreadsheet dulu (menampilkan judul workbook) sebelum menulis apa pun. Bila
kredensial/sharing salah, ia berhenti dengan pesan error.

## Langkah 5: Install Dependencies & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Buka browser
# http://localhost:3000
```

## Langkah 6: Vercel Deployment

### 6.1 Connect Repository

1. Buka [Vercel Dashboard](https://vercel.com)
2. **Import Project** → pilih repository `familianto/skm`
3. Framework: **Next.js** (auto-detected)

### 6.2 Set Environment Variables

Di Vercel project settings → **Environment Variables**, tambahkan semua variabel dari `.env.local`.

### 6.3 Deploy

Setiap push ke branch `main` akan auto-deploy.

---

## Langkah 7: First-Run (Seed, Admin Pertama, Login)

### 7.1 Seed (header sheet + kategori default)

Dengan `.env.local` terisi (Langkah 4), jalankan:

```bash
npm run seed
```

Skrip `scripts/seed.ts` akan:
1. Mengecek koneksi ke spreadsheet (menampilkan judulnya).
2. Membuat header Row 1 untuk sheet yang belum berheader.
3. Mengisi **kategori default** (Infaq, Zakat, Listrik & Air, dll).
4. Membuat 1 baris placeholder di sheet `master` (`nama_masjid` = "Nama Masjid").

> ⚠️ **Catatan akurasi (per kondisi repo saat ini):** `scripts/seed.ts` membuat
> header untuk **8 sheet** (`master`, `transaksi`, `kategori`, `rekening_bank`,
> `audit_log`, `anggota`, `rekonsiliasi`, `kelompok`) dan **belum** mencakup
> `donatur` & `reminder_log`, serta header `anggota`/`audit_log`-nya masih versi
> lama (tanpa kolom F01). Sumber kebenaran kolom = `DATABASE_SCHEMA.md` /
> `SHEET_HEADERS` (`src/lib/constants.ts`). Untuk sekarang, **lengkapi** sheet
> `donatur`, `reminder_log`, dan kolom tambahan `anggota`/`audit_log` secara
> manual sesuai `DATABASE_SCHEMA.md` setelah menjalankan seed.
> _(Lihat FLAG di deskripsi PR — penyelarasan `seed.ts` perlu keputusan maintainer.)_

### 7.2 Admin pertama & login

SKM memakai login **nomor telepon + PIN** per anggota (sheet `anggota`); PIN
di-hash bcrypt, sesi disimpan sebagai JWT di cookie `skm_session`. Membuat
anggota baru lewat aplikasi memerlukan peran **SUPER_ADMIN** (lihat
`src/middleware.ts` & `requireSuperAdmin`) — sehingga **anggota pertama tidak
bisa dibuat dari UI** (belum ada SUPER_ADMIN). PIN juga tidak boleh lemah/berurutan
(mis. `1234`, `0000` ditolak oleh kebijakan PIN).

> 🚩 **FLAG — perlu konfirmasi maintainer (Hopy).** Repo **tidak memuat** skrip
> resmi untuk menyemai **admin pertama** (tidak ada `migrate_F01`/seed-admin yang
> menulis baris `anggota` SUPER_ADMIN atau mengisi `master.pin_hash`). Mekanisme
> bootstrap yang dipakai di produksi belum terverifikasi dari repo. Dua kemungkinan
> jalur (perlu dikonfirmasi, **jangan diasumsikan**):
> 1. **Tambah baris `anggota` SUPER_ADMIN secara manual** di Google Sheets dengan
>    `pin_hash` bcrypt yang sudah dihitung (mis. via skrip kecil `bcrypt.hash`),
>    `peran = SUPER_ADMIN`, `is_active = TRUE`, lalu login pakai telepon + PIN itu.
> 2. **Login legacy single-PIN**: set `QURBAN_LEGACY_LOGIN_ENABLED=true` dan isi
>    `master.pin_hash` (hash bcrypt) — login jatuh ke jalur legacy (`master.pin_hash`).
>    Namun **tidak ada endpoint** yang mengisi `master.pin_hash` (master PUT sengaja
>    tidak mengubahnya), jadi pengisian awal pun manual.
>
> Langkah persisnya (perintah/skrip pembuat hash) **belum dibakukan di repo** —
> menunggu keputusan maintainer untuk menambah skrip `seed:admin` resmi.

### 7.3 Isi data masjid

Setelah bisa login, perbarui data masjid (nama, alamat, dll) di halaman
**Pengaturan**, lalu tambahkan **rekening bank** dan sesuaikan **kategori**.

## Langkah 8: Verifikasi Berjalan

- Buka aplikasi (lokal `http://localhost:3000` atau URL Vercel) → halaman **login** tampil.
- Login berhasil → **Dashboard** memuat ringkasan (saldo/komponen) tanpa error.
- Tambah satu transaksi uji → muncul di daftar **Transaksi** dan ter-tulis ke
  sheet `transaksi` (cek di Google Sheets).
- Halaman publik read-only `/publik` (laporan keuangan untuk TV/monitor) tampil.

Bila muncul error koneksi/permission, lihat **Troubleshooting** di bawah.

## Langkah 9 (Opsional): WhatsApp via Fonnte

Reminder WhatsApp memakai [Fonnte](https://fonnte.com). Konfigurasi via env:

- `FONNTE_API_TOKEN` — token dari dashboard Fonnte. **Kosong → mode mock**
  (pesan tidak benar-benar dikirim, hanya disimulasikan).
- `FONNTE_MOCK=true` — paksa mode mock walau token terisi (berguna saat uji coba).

Tanpa token, fitur reminder tetap berjalan dalam mode mock — aman untuk dicoba
lebih dulu sebelum mengaktifkan pengiriman nyata.

---

## Troubleshooting

### Error: "The caller does not have permission"

- Pastikan spreadsheet sudah di-share dengan service account email
- Pastikan Google Sheets API sudah diaktifkan di Google Cloud Console

### Error: "Invalid private key"

- Cek apakah `\n` di private key ter-escape dengan benar
- Di `.env.local`, pastikan value di-wrap dengan double quotes
- Coba extract private key ulang dari file JSON credentials

### Error: "Quota exceeded"

- Google Sheets API rate limit: 100 requests per 100 seconds
- Implementasi batch reads (baca beberapa range dalam 1 API call)
- Tambah delay/retry dengan exponential backoff

### Error: "Ukuran bukti/logo terlalu besar"

- Google Sheets cell limit: 50.000 karakter
- Gambar di-resize otomatis client-side (logo max 200px, bukti max 600px)
- Jika masih terlalu besar, gunakan gambar dengan resolusi lebih kecil

### Sheet tidak ditemukan

- Nama sheet case-sensitive: `transaksi` ≠ `Transaksi`
- Pastikan nama sheet persis sama dengan yang di `constants.ts`

---

## Halaman Publik Qurban 1447H — DECOMMISSIONED

Landing publik & TV display Qurban **1447H** (`/publik/qurban`, `/publik/qurban/tv`,
API `/api/publik/qurban`) **sudah dihapus**. Jalur ini dulu membaca **workbook
Qurban terpisah** lewat env legacy khusus yang kini **dipensiunkan** — sudah tidak
dibaca kode mana pun.

Data Qurban 1447H sudah diarsipkan ke modul terintegrasi (Sprint F9); Google Sheet
lama tetap disimpan di Google Drive sebagai backup (tidak dihapus). Halaman publik
TV yang **live** sekarang hanyalah **`/publik`** (laporan keuangan), yang membaca
workbook utama (`GOOGLE_SHEETS_ID`).

> Bila edisi berikutnya (mis. 1448H) butuh landing/TV publik Qurban lagi, halaman
> itu akan **dibangun ulang di atas modul terintegrasi** (tab `qurban_*` di workbook
> utama), bukan menghidupkan jalur legacy ini.
>
> **Konfigurasi pembayaran & kontak panitia** (rekening, nomor panitia) untuk edisi
> mendatang dikelola lewat sheet konfigurasi edisi (`qurban_konfigurasi_edisi`),
> **bukan** env var. Env legacy `QURBAN_PAYMENT_*` & `QURBAN_PANITIA_HP` sudah
> **dipensiunkan** (tidak lagi dibaca kode mana pun).
