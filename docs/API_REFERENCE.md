# API Reference — SKM v2.1

## Base URL

- **Development**: `http://localhost:3000/api`
- **Production**: `https://[your-domain].vercel.app/api`

## Response Format

Semua API mengembalikan format JSON yang konsisten:

```typescript
// Success response
{
  "success": true,
  "data": T,
  "meta": {                    // Opsional, untuk list endpoints
    "total": number,
    "page": number,
    "limit": number
  }
}

// Error response
{
  "success": false,
  "error": "Pesan error",
  "details": [...]             // Opsional, untuk validation errors
}
```

## Authentication

Semua endpoint kecuali `/api/auth/login` memerlukan session cookie yang valid.

---

## Auth Endpoints (Sprint 1)

### `POST /api/auth/login`

Login dengan PIN.

**Request Body:**
```json
{
  "pin": "1234"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Login berhasil"
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "error": "PIN salah"
}
```

**Side Effects:**
- Set HTTP-only session cookie
- Tulis audit log (`LOGIN`)

---

### `POST /api/auth/logout`

Logout dan hapus session.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logout berhasil"
  }
}
```

**Side Effects:**
- Hapus session cookie
- Tulis audit log (`LOGOUT`)

---

### `GET /api/auth/session`

Cek apakah session masih valid.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "authenticated": true
  }
}
```

---

## Master Endpoints (Sprint 1)

### `GET /api/master`

Ambil data konfigurasi masjid.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "MST-20260101-0001",
    "nama_masjid": "Masjid Al-Ikhlas",
    "alamat": "Jl. Merdeka No. 1",
    "kota": "Jakarta",
    "provinsi": "DKI Jakarta",
    "telepon": "021-1234567",
    "email": "masjid@email.com",
    "logo_url": "https://...",
    "tahun_buku_aktif": "2026",
    "mata_uang": "IDR"
  }
}
```

### `PUT /api/master`

Update konfigurasi masjid.

**Request Body** (partial update):
```json
{
  "nama_masjid": "Masjid Al-Ikhlas Baru",
  "telepon": "021-9876543"
}
```

---

## Transaksi Endpoints (Sprint 2)

### `GET /api/transaksi`

Ambil daftar transaksi. Filtering dilakukan di client-side (semua data dikirim).

**Query Parameters:**
| Param | Type | Default | Deskripsi |
|---|---|---|---|
| `tahun` | string | current year | Filter tahun |
| `bulan` | string | - | Filter bulan (1-12) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "TRX-20260323-0001",
      "tanggal": "2026-03-23",
      "jenis": "MASUK",
      "kategori_id": "KAT-20260101-0001",
      "deskripsi": "Infaq Jumat",
      "jumlah": 1500000,
      "rekening_id": "REK-20260101-0001",
      "bukti_url": "",
      "status": "AKTIF",
      "void_reason": "",
      "void_date": "",
      "koreksi_dari_id": "",
      "created_by": "Bendahara",
      "created_at": "2026-03-23T08:00:00Z",
      "updated_at": "2026-03-23T08:00:00Z"
    }
  ],
  "meta": {
    "total": 150
  }
}
```

### `POST /api/transaksi`

Buat transaksi baru.

**Request Body:**
```json
{
  "tanggal": "2026-03-23",
  "jenis": "MASUK",
  "kategori_id": "KAT-20260101-0001",
  "deskripsi": "Infaq Jumat minggu ke-3",
  "jumlah": 1500000,
  "rekening_id": "REK-20260101-0001"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "TRX-20260323-0001"
  }
}
```

### `GET /api/transaksi/[id]`

Ambil detail satu transaksi.

### `PUT /api/transaksi/[id]`

Update transaksi (hanya jika status AKTIF).

### `POST /api/transaksi/[id]/void`

Void transaksi.

**Request Body:**
```json
{
  "reason": "Salah input nominal"
}
```

**Side Effects:**
- Set status → `VOID`
- Set `void_reason` dan `void_date`
- Tulis audit log (`VOID`)

### `POST /api/transaksi/[id]/koreksi`

Buat transaksi koreksi.

**Request Body:**
```json
{
  "tanggal": "2026-03-24",
  "jenis": "MASUK",
  "kategori_id": "KAT-20260101-0001",
  "deskripsi": "Koreksi: Infaq Jumat (semula salah nominal)",
  "jumlah": 2000000,
  "rekening_id": "REK-20260101-0001"
}
```

**Side Effects:**
- Buat transaksi baru dengan `koreksi_dari_id` menunjuk ke transaksi asli
- Tulis audit log (`KOREKSI`)

---

## Kategori Endpoints (Sprint 1)

### `GET /api/kategori`

Ambil semua kategori.

### `POST /api/kategori`

Buat kategori baru.

**Request Body:**
```json
{
  "nama": "Infaq Tarawih",
  "jenis": "MASUK",
  "deskripsi": "Infaq saat Tarawih Ramadhan"
}
```

### `PUT /api/kategori/[id]`

Update kategori.

### `DELETE /api/kategori/[id]`

Soft delete kategori (`is_active` → `FALSE`).

---

## Rekening Endpoints (Sprint 1)

### `GET /api/rekening`

Ambil semua rekening bank (termasuk saldo terhitung).

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "REK-20260101-0001",
      "nama_bank": "Bank Syariah Indonesia",
      "nomor_rekening": "7123456789",
      "atas_nama": "Masjid Al-Ikhlas",
      "saldo_awal": 5000000,
      "saldo_saat_ini": 15000000,
      "is_active": true
    }
  ]
}
```

### `POST /api/rekening`

Buat rekening baru.

### `PUT /api/rekening/[id]`

Update rekening.

### `DELETE /api/rekening/[id]`

Soft delete rekening (`is_active` → `FALSE`).

---

## Rekonsiliasi Endpoints (Sprint 4)

### `GET /api/rekonsiliasi`

Ambil riwayat rekonsiliasi.

### `POST /api/rekonsiliasi`

Buat catatan rekonsiliasi baru.

**Request Body:**
```json
{
  "rekening_id": "REK-20260101-0001",
  "tanggal": "2026-03-23",
  "saldo_bank": 15000000
}
```

**Side Effects:**
- Hitung `saldo_sistem` dari sheet transaksi
- Hitung `selisih`
- Set `status` (SESUAI/TIDAK_SESUAI)
- Tulis audit log

---

## Upload Endpoints (Sprint 4)

### `POST /api/upload/bukti`

Upload bukti transaksi (gambar).

**Request**: `multipart/form-data`
| Field | Type | Deskripsi |
|---|---|---|
| `file` | File | Gambar (JPG/PNG, max 1MB setelah compress) |
| `transaksi_id` | string | ID transaksi terkait |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "url": "https://drive.google.com/..."
  }
}
```

**Side Effects:**
- Upload file ke Google Drive folder `bukti/`
- Update `bukti_url` di sheet transaksi

### `POST /api/upload/logo`

Upload logo masjid. (Sprint 6)

---

## Dashboard Endpoints (Sprint 3)

### `GET /api/dashboard/summary`

Ambil ringkasan keuangan.

**Query Parameters:**
| Param | Type | Default | Deskripsi |
|---|---|---|---|
| `tahun` | string | current year | Tahun buku |
| `bulan` | string | - | Bulan spesifik (opsional) |
| `kategori` | string | - | Comma-separated kategori IDs (opsional). Filter transaksi berdasarkan kategori. |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_masuk": 50000000,
    "total_keluar": 30000000,
    "saldo": 20000000,
    "jumlah_transaksi": 150,
    "periode": {
      "tahun": "2026",
      "bulan": null
    }
  }
}
```

### `GET /api/dashboard/chart-data`

Ambil data untuk grafik.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `type` | enum | `monthly-trend` atau `category-breakdown` |
| `tahun` | string | Tahun buku |

**Response (200) — monthly-trend:**
```json
{
  "success": true,
  "data": {
    "labels": ["Jan", "Feb", "Mar", ...],
    "masuk": [5000000, 6000000, 7000000, ...],
    "keluar": [3000000, 4000000, 3500000, ...]
  }
}
```

---

## Export Endpoints (Sprint 3)

### `GET /api/export/pdf`

Generate laporan PDF.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `tahun` | string | Tahun buku |
| `bulan` | string | Bulan (opsional) |
| `type` | enum | `ringkasan` atau `detail` |
| `kategori` | string | Comma-separated kategori IDs (opsional). Jika diisi, hanya transaksi dari kategori tersebut yang dimasukkan. Judul PDF akan mencantumkan nama kategori yang difilter. |

**Response**: PDF file (application/pdf)

### `GET /api/export/excel`

Export data transaksi ke Excel.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `tahun` | string | Tahun buku |
| `bulan` | string | Bulan (opsional) |
| `kategori` | string | Comma-separated kategori IDs (opsional). Jika diisi, hanya transaksi dari kategori tersebut yang dimasukkan. Header Excel akan mencantumkan nama kategori yang difilter. |

**Response**: Excel file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

---

## Health Check

### `GET /api/health`

Cek koneksi ke Google Sheets.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "sheets_connected": true,
    "timestamp": "2026-03-23T10:00:00Z"
  }
}
```

---

## Error Codes

| HTTP Status | Keterangan |
|---|---|
| 200 | OK |
| 201 | Created (setelah buat data baru) |
| 400 | Bad Request (validasi gagal) |
| 401 | Unauthorized (belum login / session expired) |
| 404 | Not Found (data tidak ditemukan) |
| 500 | Internal Server Error (error server / Google API) |
