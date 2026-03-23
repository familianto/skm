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
   - **Google Drive API**

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

Buat 7 sheet/tab dengan nama **persis** seperti ini (case-sensitive):

1. `master`
2. `transaksi`
3. `kategori`
4. `rekening_bank`
5. `audit_log`
6. `anggota`
7. `rekonsiliasi`

Hapus sheet default "Sheet1" jika ada.

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
id | timestamp | aksi | entitas | entitas_id | detail | user_info
```

**Sheet `anggota`** (Row 1):
```
id | nama | telepon | email | peran | is_active | created_at
```

**Sheet `rekonsiliasi`** (Row 1):
```
id | rekening_id | tanggal | saldo_bank | saldo_sistem | selisih | status | catatan | created_at
```

> **TIP**: Di Sprint 0, kita akan buat script otomatis untuk setup header dan seed data.

## Langkah 4: Setup Google Drive Folder

1. Buka [Google Drive](https://drive.google.com)
2. Buat folder baru: `SKM - [Nama Masjid]`
3. Di dalam folder, buat sub-folder:
   - `bukti` — untuk foto bukti transaksi
   - `logo` — untuk logo masjid
4. Share folder dengan service account email (Editor access)
5. Catat **Folder ID** dari URL:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID]
   ```

## Langkah 5: Environment Variables

### 5.1 Buat File `.env.local`

```bash
cp .env.example .env.local
```

### 5.2 Isi Environment Variables

```env
# Google Sheets
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Google Drive
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id_here

# App Config
NEXT_PUBLIC_APP_NAME=SKM
NEXT_PUBLIC_APP_VERSION=2.1

# Auth
AUTH_SECRET=generate_random_string_32_chars_here
PIN_SALT=generate_random_string_16_chars_here
```

### 5.3 Catatan Penting untuk `GOOGLE_PRIVATE_KEY`

Private key dari file JSON credentials perlu di-handle dengan benar:

**Di `.env.local`**:
- Wrap dengan double quotes
- Newlines sebagai `\n` (literal string)

**Di Vercel Dashboard**:
- Paste private key apa adanya (dengan actual newlines)
- Vercel akan handle escaping otomatis

**Test connection**:
```bash
npm run test:connection  # Script untuk test koneksi ke Google Sheets
```

## Langkah 6: Install Dependencies & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Buka browser
# http://localhost:3000
```

## Langkah 7: Vercel Deployment

### 7.1 Connect Repository

1. Buka [Vercel Dashboard](https://vercel.com)
2. **Import Project** → pilih repository `familianto/skm`
3. Framework: **Next.js** (auto-detected)

### 7.2 Set Environment Variables

Di Vercel project settings → **Environment Variables**, tambahkan semua variabel dari `.env.local`.

### 7.3 Deploy

Setiap push ke branch `main` akan auto-deploy.

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

### Error: "File upload too large"

- Vercel serverless function body limit: 4.5MB
- Compress image di client sebelum upload
- Target: max 1MB per image setelah compression

### Sheet tidak ditemukan

- Nama sheet case-sensitive: `transaksi` ≠ `Transaksi`
- Pastikan nama sheet persis sama dengan yang di `constants.ts`
