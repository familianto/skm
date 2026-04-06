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

#### Rate Limiting

Endpoint ini dilindungi oleh mekanisme rate limiting untuk mencegah brute force attack.

| Parameter | Nilai |
|---|---|
| Maksimum percobaan | 5x berturut-turut |
| Durasi lockout | 5 menit |
| Warning threshold | Setelah gagal ke-3 |
| Tracking | Server-side (in-memory per IP) + Client-side (localStorage) |

**Response saat locked (429):**
```json
{
  "success": false,
  "error": "Terlalu banyak percobaan login. Silakan coba lagi nanti.",
  "data": {
    "locked": true,
    "lockoutUntil": 1711234567890,
    "remainingAttempts": 0
  }
}
```

**Response saat warning (401, setelah gagal ke-3):**
```json
{
  "success": false,
  "error": "PIN salah. Sisa 2 percobaan sebelum akun di-lock.",
  "data": {
    "locked": false,
    "remainingAttempts": 2,
    "attemptCount": 3
  }
}
```

**Behavior:**
- Setelah 5x gagal berturut-turut → HTTP 429, locked selama 5 menit
- Setelah gagal ke-3 → pesan warning dengan sisa percobaan
- Login berhasil → reset counter ke 0
- Lockout expired → counter otomatis reset
- Client-side: countdown timer real-time, persist via localStorage

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

### `POST /api/transaksi/import`

Batch import transaksi dari CSV rekening koran bank.

**Request Body:**
```json
{
  "items": [
    {
      "tanggal": "2026-03-28",
      "jenis": "MASUK",
      "kategori_id": "KAT-20260406-0002",
      "deskripsi": "PURCHASE QRIS ACQ ...",
      "jumlah": 150000,
      "rekening_id": "REK-20260101-0001"
    }
  ]
}
```

**Validation:**
- `items`: Array of 1-500 transaksi
- Each item follows the same schema as `POST /api/transaksi`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "imported": 25,
    "ids": ["TRX-20260328-0001", "TRX-20260328-0002", "..."]
  }
}
```

**Side Effects:**
- Append rows ke sheet transaksi (satu per item)
- Tulis audit log (`CREATE`, entitas_id: `BATCH_IMPORT`)
- Setiap transaksi mendapat ID unik `TRX-YYYYMMDD-XXXX`

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

Upload bukti transaksi sebagai base64 data URL.

**Request**: `application/json`
| Field | Type | Deskripsi |
|---|---|---|
| `transaksiId` | string | ID transaksi terkait |
| `buktiDataUrl` | string | Base64 data URL gambar (di-resize client-side max 600px, JPEG 70%) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "bukti_url": "data:image/jpeg;base64,..."
  }
}
```

**Validasi:**
- Data URL harus dimulai dengan `data:image/`
- Panjang maksimal 50.000 karakter (limit cell Google Sheets)

**Side Effects:**
- Update `bukti_url` di sheet transaksi dengan base64 data URL
- Audit log: UPDATE

### `POST /api/upload/logo`

Upload logo masjid sebagai base64 data URL.

**Request**: `application/json`
| Field | Type | Deskripsi |
|---|---|---|
| `logoDataUrl` | string | Base64 data URL gambar (di-resize client-side max 200px, JPEG 80%) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logo_url": "data:image/jpeg;base64,..."
  }
}
```

**Validasi:**
- Data URL harus dimulai dengan `data:image/`
- Panjang maksimal 50.000 karakter (limit cell Google Sheets)

**Side Effects:**
- Update `logo_url` di sheet master dengan base64 data URL
- Audit log: UPDATE

---

## Dashboard Endpoints (Sprint 3)

### `GET /api/dashboard/summary`

Ambil ringkasan keuangan.

**Query Parameters:**
| Param | Type | Default | Deskripsi |
|---|---|---|---|
| `tahun` | string | current year | Tahun buku. Gunakan `all` untuk semua tahun. |
| `bulan` | string | - | Bulan spesifik (opsional). Jika tahun=all, filter bulan diterapkan lintas tahun. |
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

### `GET /api/dashboard/cumulative`

Ambil data kumulatif all-time (lintas tahun) beserta tren tahunan.

**Query Parameters:** Tidak ada.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalMasuk": 150000000,
    "totalKeluar": 100000000,
    "saldo": 50000000,
    "jumlahTransaksi": 3208,
    "jumlahMasuk": 1500,
    "jumlahKeluar": 1708,
    "yearlyTrend": [
      { "tahun": "2025", "masuk": 80000000, "keluar": 55000000 },
      { "tahun": "2026", "masuk": 50000000, "keluar": 30000000 }
    ],
    "categoryBreakdown": {
      "masuk": [
        { "kategori_id": "KAT-001", "nama": "Infaq", "jumlah": 80000000, "persentase": 53.33 }
      ],
      "keluar": [
        { "kategori_id": "KAT-002", "nama": "Listrik", "jumlah": 30000000, "persentase": 30 }
      ]
    }
  }
}
```

**Catatan:**
- Semua transaksi aktif (status `AKTIF`) dihitung, tanpa filter periode.
- `yearlyTrend` diurutkan berdasarkan tahun ascending, mulai dari 2025 (exclude data parsial sebelumnya).
- `jumlahMasuk` dan `jumlahKeluar` menunjukkan jumlah transaksi per jenis.
- `categoryBreakdown` menampilkan top 10 kategori + "Lainnya" per jenis, diurutkan by jumlah descending.

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
| `tahun` | string | Tahun buku. Gunakan `all` untuk semua tahun. |
| `bulan` | string | Bulan (opsional). Jika tahun=all, filter bulan diterapkan lintas tahun. |
| `type` | enum | `ringkasan` atau `detail` |
| `kategori` | string | Comma-separated kategori IDs (opsional). Jika diisi, hanya transaksi dari kategori tersebut yang dimasukkan. Judul PDF mencantumkan nama kategori yang difilter, dikelompokkan berdasarkan jenis (Kategori Masuk / Kategori Keluar). Teks kategori mengikuti margin tabel dan otomatis wrap jika terlalu panjang. |

**Response**: PDF file (application/pdf)

### `GET /api/export/excel`

Export data transaksi ke Excel.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `tahun` | string | Tahun buku. Gunakan `all` untuk semua tahun. |
| `bulan` | string | Bulan (opsional). Jika tahun=all, filter bulan diterapkan lintas tahun. |
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
