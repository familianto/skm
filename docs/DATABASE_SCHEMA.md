# Database Schema — Google Sheets

Dokumen ini adalah **definisi schema resmi** untuk semua sheet di Google Sheets SKM.
Karena Google Sheets tidak punya enforced schema, dokumen ini ADALAH schema-nya.

> **PENTING**: Setiap perubahan kolom HARUS di-update di dokumen ini terlebih dahulu.

---

## Konvensi Umum

- **Row 1**: Selalu header (nama kolom)
- **Data**: Mulai dari Row 2
- **Naming**: `snake_case` untuk nama kolom
- **ID format**: `PREFIX-YYYYMMDD-XXXX` (sequential per hari)
- **Date format**: `YYYY-MM-DD` (ISO 8601)
- **Boolean**: `TRUE` / `FALSE` (string)
- **Currency**: Integer (Rupiah tanpa desimal). Contoh: `1500000` = Rp 1.500.000
- **Timestamp**: `YYYY-MM-DDTHH:mm:ss.sssZ` (ISO 8601 dengan waktu)
- **Empty/null**: String kosong `""`
- **Cell reference pattern**: `sheet_name!A2:Z` (tanpa batas bawah untuk baca semua data)

---

## Sheet: `master`

**Fungsi**: Konfigurasi masjid. Hanya 1 baris data (Row 2).

| Kolom | Header | Tipe | Deskripsi | Contoh |
|---|---|---|---|---|
| A | `id` | string | Auto-generated ID | `MST-YYYYMMDD-0001` |
| B | `nama_masjid` | string | Nama masjid | `Masjid Al-Ikhlas` |
| C | `alamat` | string | Alamat lengkap | `Jl. Merdeka No. 1` |
| D | `kota` | string | Kota | `Jakarta` |
| E | `provinsi` | string | Provinsi | `DKI Jakarta` |
| F | `telepon` | string | Nomor telepon | `021-1234567` |
| G | `email` | string | Email masjid | `masjid@email.com` |
| H | `pin_hash` | string | Hash PIN untuk autentikasi | `$2b$10$...` |
| I | `logo_url` | string | Base64 data URL logo masjid (max 200x200px JPEG) | `data:image/jpeg;base64,...` |
| J | `tahun_buku_aktif` | string | Tahun buku yang aktif | `2026` |
| K | `mata_uang` | string | Kode mata uang | `IDR` |
| L | `created_at` | timestamp | Waktu dibuat | `2026-01-01T00:00:00Z` |
| M | `updated_at` | timestamp | Waktu terakhir diupdate | `2026-03-23T10:00:00Z` |

**Cell reference**: `master!A2:M2` (single row)

---

## Sheet: `transaksi`

**Fungsi**: Semua transaksi keuangan masjid.

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `TRX-20260323-0001` |
| B | `tanggal` | date | Ya | Tanggal transaksi | `2026-03-23` |
| C | `jenis` | enum | Ya | `MASUK` atau `KELUAR` | `MASUK` |
| D | `kategori_id` | string | Ya | Referensi ke sheet kategori | `KAT-20260101-0001` |
| E | `deskripsi` | string | Ya | Keterangan transaksi | `Infaq Jumat minggu ke-3` |
| F | `jumlah` | integer | Ya | Nominal dalam Rupiah | `1500000` |
| G | `rekening_id` | string | Ya | Referensi ke sheet rekening | `REK-20260101-0001` |
| H | `bukti_url` | string | Tidak | Base64 data URL bukti transaksi (max 600x600px JPEG) | `data:image/jpeg;base64,...` |
| I | `status` | enum | Ya | `AKTIF` atau `VOID` | `AKTIF` |
| J | `void_reason` | string | Tidak | Alasan void (wajib jika VOID) | `Salah input nominal` |
| K | `void_date` | date | Tidak | Tanggal void | `2026-03-24` |
| L | `koreksi_dari_id` | string | Tidak | ID transaksi yang dikoreksi | `TRX-20260323-0001` |
| M | `created_by` | string | Ya | Siapa yang membuat | `Bendahara` |
| N | `created_at` | timestamp | Ya | Waktu dibuat | `2026-03-23T08:00:00Z` |
| O | `updated_at` | timestamp | Ya | Waktu terakhir diupdate | `2026-03-23T08:00:00Z` |

**Cell reference**: `transaksi!A2:O`

### Aturan Bisnis Transaksi

1. Transaksi yang sudah `AKTIF` tidak boleh dihapus, hanya bisa di-VOID
2. VOID wajib mengisi `void_reason` dan `void_date`
3. Koreksi membuat transaksi baru dengan `koreksi_dari_id` menunjuk ke transaksi asli
4. Saldo dihitung dari: `SUM(MASUK yang AKTIF) - SUM(KELUAR yang AKTIF)`
5. `jumlah` selalu positif, `jenis` menentukan arah (masuk/keluar)

---

## Sheet: `kategori`

**Fungsi**: Daftar kategori transaksi.

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `KAT-20260101-0001` |
| B | `nama` | string | Ya | Nama kategori | `Infaq Jumat` |
| C | `jenis` | enum | Ya | `MASUK` atau `KELUAR` | `MASUK` |
| D | `deskripsi` | string | Tidak | Keterangan kategori | `Infaq mingguan hari Jumat` |
| E | `is_active` | boolean | Ya | Aktif atau tidak | `TRUE` |
| F | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |

**Cell reference**: `kategori!A2:F`

### Kategori Default (Seeded saat Setup)

**Pemasukan (MASUK)**:
- Infaq Jumat
- Infaq Harian
- Zakat
- Donasi
- Lain-lain Masuk

**Pengeluaran (KELUAR)**:
- Listrik & Air
- Kebersihan
- Honorarium Imam/Khatib
- Perbaikan/Renovasi
- Kegiatan Ramadhan
- Kegiatan Sosial
- ATK & Perlengkapan
- Lain-lain Keluar

---

## Sheet: `rekening_bank`

**Fungsi**: Daftar rekening bank masjid.

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `REK-20260101-0001` |
| B | `nama_bank` | string | Ya | Nama bank | `Bank Syariah Indonesia` |
| C | `nomor_rekening` | string | Ya | Nomor rekening | `7123456789` |
| D | `atas_nama` | string | Ya | Nama pemilik rekening | `Masjid Al-Ikhlas` |
| E | `saldo_awal` | integer | Ya | Saldo awal (Rupiah) | `5000000` |
| F | `is_active` | boolean | Ya | Aktif atau tidak | `TRUE` |
| G | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |
| H | `updated_at` | timestamp | Ya | Waktu terakhir diupdate | `2026-01-01T00:00:00Z` |

**Cell reference**: `rekening_bank!A2:H`

### Kalkulasi Saldo Rekening

```
Saldo Rekening = saldo_awal
  + SUM(transaksi MASUK AKTIF untuk rekening ini)
  - SUM(transaksi KELUAR AKTIF untuk rekening ini)
```

---

## Sheet: `audit_log`

**Fungsi**: Log semua perubahan data untuk audit trail.

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `LOG-20260323-0001` |
| B | `timestamp` | timestamp | Ya | Waktu kejadian | `2026-03-23T08:00:00Z` |
| C | `aksi` | enum | Ya | Jenis aksi | `CREATE` |
| D | `entitas` | string | Ya | Nama sheet/entitas | `transaksi` |
| E | `entitas_id` | string | Ya | ID entitas yang berubah | `TRX-20260323-0001` |
| F | `detail` | string | Ya | Detail perubahan (JSON string) | `{"field":"jumlah","old":"100000","new":"150000"}` |
| G | `user_info` | string | Ya | Info user yang melakukan | `Bendahara` |

**Cell reference**: `audit_log!A2:G`

### Aksi yang Di-log

| Aksi | Kapan |
|---|---|
| `CREATE` | Buat data baru (transaksi, kategori, dll) |
| `UPDATE` | Update data existing |
| `DELETE` | Hapus data (soft delete) |
| `VOID` | Void transaksi |
| `KOREKSI` | Buat transaksi koreksi |
| `LOGIN` | User login |
| `LOGOUT` | User logout |
| `EXPORT` | Export laporan |

---

## Sheet: `anggota`

**Fungsi**: Data pengurus masjid yang memiliki akses ke sistem.

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `ANG-20260101-0001` |
| B | `nama` | string | Ya | Nama lengkap | `Ahmad Fauzi` |
| C | `telepon` | string | Tidak | Nomor HP | `08123456789` |
| D | `email` | string | Tidak | Email | `ahmad@email.com` |
| E | `peran` | enum | Ya | Role: `BENDAHARA` / `PENGURUS` / `VIEWER` | `BENDAHARA` |
| F | `is_active` | boolean | Ya | Aktif atau tidak | `TRUE` |
| G | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |

**Cell reference**: `anggota!A2:G`

---

## Sheet: `rekonsiliasi`

**Fungsi**: Catatan rekonsiliasi bank (membandingkan saldo bank vs saldo sistem).

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `RKN-20260323-0001` |
| B | `rekening_id` | string | Ya | Referensi ke rekening | `REK-20260101-0001` |
| C | `tanggal` | date | Ya | Tanggal rekonsiliasi | `2026-03-23` |
| D | `saldo_bank` | integer | Ya | Saldo aktual di bank | `15000000` |
| E | `saldo_sistem` | integer | Ya | Saldo menurut sistem | `14500000` |
| F | `selisih` | integer | Ya | Selisih (bank - sistem) | `500000` |
| G | `status` | enum | Ya | `SESUAI` / `TIDAK_SESUAI` | `TIDAK_SESUAI` |
| H | `catatan` | string | Tidak | Catatan/penjelasan selisih | `Ada transfer belum tercatat` |
| I | `created_at` | timestamp | Ya | Waktu dibuat | `2026-03-23T10:00:00Z` |

**Cell reference**: `rekonsiliasi!A2:I`

---

## ID Generation Strategy

Setiap entitas menggunakan format ID: `PREFIX-YYYYMMDD-XXXX`

| Entitas | Prefix | Contoh |
|---|---|---|
| Master | `MST` | `MST-20260101-0001` |
| Transaksi | `TRX` | `TRX-20260323-0001` |
| Kategori | `KAT` | `KAT-20260101-0001` |
| Rekening | `REK` | `REK-20260101-0001` |
| Audit Log | `LOG` | `LOG-20260323-0001` |
| Anggota | `ANG` | `ANG-20260101-0001` |
| Rekonsiliasi | `RKN` | `RKN-20260323-0001` |

### Implementasi ID Generation

```typescript
function generateId(prefix: string): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // Baca row terakhir untuk mendapatkan counter
  // Increment counter, pad dengan 4 digit
  const counter = getNextCounter(prefix, today);
  return `${prefix}-${today}-${counter.toString().padStart(4, '0')}`;
}
```

---

## Template: Setup Header Script

Script untuk membuat semua header di Google Sheets saat initial setup:

```typescript
const SHEET_HEADERS = {
  master: ['id', 'nama_masjid', 'alamat', 'kota', 'provinsi', 'telepon', 'email', 'pin_hash', 'logo_url', 'tahun_buku_aktif', 'mata_uang', 'created_at', 'updated_at'],
  transaksi: ['id', 'tanggal', 'jenis', 'kategori_id', 'deskripsi', 'jumlah', 'rekening_id', 'bukti_url', 'status', 'void_reason', 'void_date', 'koreksi_dari_id', 'created_by', 'created_at', 'updated_at'],
  kategori: ['id', 'nama', 'jenis', 'deskripsi', 'is_active', 'created_at'],
  rekening_bank: ['id', 'nama_bank', 'nomor_rekening', 'atas_nama', 'saldo_awal', 'is_active', 'created_at', 'updated_at'],
  audit_log: ['id', 'timestamp', 'aksi', 'entitas', 'entitas_id', 'detail', 'user_info'],
  anggota: ['id', 'nama', 'telepon', 'email', 'peran', 'is_active', 'created_at'],
  rekonsiliasi: ['id', 'rekening_id', 'tanggal', 'saldo_bank', 'saldo_sistem', 'selisih', 'status', 'catatan', 'created_at'],
};
```
