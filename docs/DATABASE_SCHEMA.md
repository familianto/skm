# Database Schema — Google Sheets

Dokumen ini adalah **definisi schema resmi** untuk semua sheet di Google Sheets SKM.
Karena Google Sheets tidak punya enforced schema, dokumen ini ADALAH schema-nya.

> **PENTING**: Setiap perubahan kolom HARUS di-update di dokumen ini terlebih dahulu.

## Topologi & Aturan Wajib

- **Satu workbook.** Seluruh **19 tab** berada di **satu spreadsheet/workbook**
  yang sama (di-resolve via env `GOOGLE_SHEETS_ID`). Pengelompokan "Inti" (10)
  dan "Qurban" (9) di bawah hanyalah pengelompokan **logis**, bukan dua
  spreadsheet fisik.
  > Pengecualian legacy: endpoint baca-saja `/api/publik/qurban` (landing +
  > TV) membaca workbook **terpisah** via `GOOGLE_SHEETS_QURBAN_ID` (3 tab tanpa
  > prefix: `master_hewan`, `daftar_hewan`, `peserta`). Itu jalur publik legacy,
  > terpisah dari 19 tab terintegrasi di sini.
- **Sumber kebenaran kolom** = `SHEET_HEADERS` di `src/lib/constants.ts` (urutan
  kolom = urutan posisi A, B, C, …). Untuk tab Qurban, definisi kolom otoritatif
  juga ada di script migrasi `scripts/migrate_*.gs`.
- **Wajib daftar di `SHEET_HEADERS`.** Setiap sheet baru HARUS didaftarkan di
  `SHEET_HEADERS`. Tanpa entry di sana, semua operasi UPDATE ke sheet itu
  melempar error **"Unknown sheet"** (header dipakai untuk menghitung range).

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
| P | `mutasi_ref` | string | Tidak | Ref pair untuk transaksi mutasi antar-rekening | `MUT-20260323-0001` |
| Q | `bank_ref` | string | Tidak | Nomor Referensi CSV bank untuk deteksi duplikat saat import. Split-child pakai suffix `_split_<N>`. Kosong untuk input manual. | `320CHDP260060511` |

**Cell reference**: `transaksi!A2:Q`

**Backward compatibility**: Kolom `bank_ref` ditambahkan setelah sprint
awal. Service `sheetsService.ensureColumnHeader('transaksi', 'bank_ref')`
dipanggil dari endpoint import & check-duplicates (idempotent) untuk
meng-upgrade sheet lama tanpa migrasi manual.

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
| H | `user_id` | string | Tidak | ID anggota pelaku (F01) | `ANG-20260101-0001` |
| I | `ip_address` | string | Tidak | IP address pelaku (F01) | `103.10.10.10` |

**Cell reference**: `audit_log!A2:I`

> Kolom `user_id` & `ip_address` ditambahkan pada migrasi F01 (multi-user).

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
| E | `peran` | enum | Ya | Role (`UserPeran`), lihat tabel di bawah | `BENDAHARA` |
| F | `is_active` | boolean | Ya | Aktif atau tidak | `TRUE` |
| G | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |
| H | `pin_hash` | string | Tidak | Hash PIN bcrypt (F01 multi-user) | `$2b$10$...` |
| I | `created_by` | string | Tidak | ID anggota pembuat | `ANG-20260101-0001` |
| J | `updated_at` | timestamp | Tidak | Waktu terakhir diupdate | `2026-03-23T10:00:00Z` |
| K | `last_login_at` | timestamp | Tidak | Waktu login terakhir | `2026-03-23T08:00:00Z` |
| L | `failed_attempts` | integer | Tidak | Jumlah gagal login berturut (lockout) | `0` |
| M | `locked_until` | timestamp | Tidak | Akun terkunci sampai waktu ini | `2026-03-23T08:30:00Z` |

**Cell reference**: `anggota!A2:M`

> Kolom H–M ditambahkan pada migrasi F01 (auth multi-user). Login = PIN
> (bcrypt) → JWT sesi (`jose`) di cookie `skm_session`. Lockout dikelola via
> `failed_attempts` & `locked_until`.

### Role (`UserPeran`)

| Nilai | Era | Keterangan |
|---|---|---|
| `SUPER_ADMIN` | F01 | Akses penuh |
| `BENDAHARA` | inti | Keuangan |
| `ADMIN_QURBAN` | F01 | Admin modul Qurban |
| `PENDAFTARAN` | F01 | Petugas pendaftaran Qurban |
| `DISTRIBUSI` | F01 | Petugas distribusi Qurban |
| `PENGURUS` | legacy | Backward-compat (pra-F01) |
| `VIEWER` | legacy | Backward-compat (pra-F01) |

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

## Sheet: `donatur`

**Fungsi**: Daftar donatur untuk fitur reminder donasi (WhatsApp).

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `DON-20260101-0001` |
| B | `nama` | string | Ya | Nama donatur | `Bapak Hasan` |
| C | `telepon` | string | Tidak | Nomor HP (untuk WA) | `08123456789` |
| D | `alamat` | string | Tidak | Alamat | `Jl. Mawar No. 5` |
| E | `kelompok` | enum | Tidak | `TETAP` / `INSIDENTAL` | `TETAP` |
| F | `jumlah_komitmen` | integer | Tidak | Komitmen donasi rutin (Rupiah) | `100000` |
| G | `catatan` | string | Tidak | Catatan | `Donatur tetap sejak 2024` |
| H | `is_active` | boolean | Ya | Aktif atau tidak | `TRUE` |
| I | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |
| J | `updated_at` | timestamp | Ya | Waktu terakhir diupdate | `2026-01-01T00:00:00Z` |

**Cell reference**: `donatur!A2:J`

---

## Sheet: `reminder_log`

**Fungsi**: Log pengiriman reminder WhatsApp ke donatur (via Fonnte).

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `RMD-20260101-0001` |
| B | `donatur_id` | string | Ya | Referensi ke sheet donatur | `DON-20260101-0001` |
| C | `tanggal_kirim` | date | Ya | Tanggal kirim | `2026-01-01` |
| D | `jenis_reminder` | enum | Ya | Jenis reminder | `DONASI_RUTIN` |
| E | `pesan` | string | Ya | Isi pesan yang dikirim | `Assalamualaikum...` |
| F | `status_kirim` | string | Ya | Status pengiriman | `SENT` |
| G | `error_message` | string | Tidak | Pesan error jika gagal | `Invalid number` |
| H | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |

**Cell reference**: `reminder_log!A2:H`

---

## Sheet: `kelompok`

**Fungsi**: Kelompok anggaran — mengelompokkan beberapa kategori MASUK/KELUAR
untuk pelaporan & dashboard.

| Kolom | Header | Tipe | Wajib | Deskripsi | Contoh |
|---|---|---|---|---|---|
| A | `id` | string | Ya | Auto-generated | `KEL-20260101-0001` |
| B | `nama` | string | Ya | Nama kelompok | `Operasional` |
| C | `deskripsi` | string | Tidak | Keterangan | `Biaya rutin operasional` |
| D | `warna` | string | Tidak | Warna label (hex/nama) | `#22c55e` |
| E | `kategori_masuk` | string | Tidak | Daftar kategori_id MASUK (comma-separated) | `KAT-...0001,KAT-...0002` |
| F | `kategori_keluar` | string | Tidak | Daftar kategori_id KELUAR (comma-separated) | `KAT-...0010` |
| G | `created_at` | timestamp | Ya | Waktu dibuat | `2026-01-01T00:00:00Z` |
| H | `updated_at` | timestamp | Ya | Waktu terakhir diupdate | `2026-01-01T00:00:00Z` |

**Cell reference**: `kelompok!A2:H`

---

# Bagian Qurban (9 tab, workbook yang sama)

> Tab di bawah hanya dipakai bila modul Qurban aktif (`QURBAN_MODULE_ENABLED`).
> Semua berada di workbook yang sama dengan sheet inti. Kolom otoritatif =
> `SHEET_HEADERS` (`src/lib/constants.ts`) + script migrasi `scripts/migrate_*.gs`.
> Nama sheet kanonik ada di `src/lib/qurban/sheets.ts` (`QURBAN_SHEETS`).

## Sheet: `qurban_edisi`

**Fungsi**: Edisi Qurban per tahun (lifecycle `DRAFT → AKTIF → SELESAI`).

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `tahun_hijriah` | mis. `1448` |
| `tahun_masehi` | mis. `2027` |
| `tanggal_idul_adha` | ISO date |
| `tanggal_pendaftaran_buka` | ISO date |
| `tanggal_pendaftaran_tutup` | ISO date |
| `status` | `DRAFT` / `AKTIF` / `SELESAI` |
| `parent_edisi_id` | Edisi sumber clone (opsional) |
| `cloned_at` | Timestamp clone |
| `created_at` / `updated_at` / `created_by` | Audit |
| `pemetaan_version` | Token concurrency Pemetaan (F5b); di-bump tiap batch-save |

## Sheet: `qurban_konfigurasi_edisi`

**Fungsi**: Konfigurasi per-edisi (BOP, target distribusi, opsi WA).

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `edisi_id` | Referensi `qurban_edisi` |
| `bop_per_ekor_sapi` | Biaya operasional per ekor sapi (Rupiah) |
| `bop_per_ekor_kambing` | Biaya operasional per ekor kambing (Rupiah) |
| `target_bungkus_total` | Target jumlah bungkus distribusi |
| `berat_target_per_bungkus` | Target berat per bungkus |
| `tanggal_distribusi_mulai` / `tanggal_distribusi_selesai` | Rentang distribusi |
| `payment_suffix` | Suffix nominal untuk kode bayar transfer |
| `wa_send_on_pendaftaran` | Kirim WA saat pendaftaran (TRUE/FALSE) |
| `wa_send_on_pembayaran_confirmed` | Kirim WA saat pembayaran terkonfirmasi |
| `notes` | Catatan |
| `created_at` / `updated_at` / `created_by` | Audit |

## Sheet: `qurban_panitia`

**Fungsi**: Penugasan anggota sebagai panitia per-edisi.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `edisi_id` | Referensi `qurban_edisi` |
| `anggota_id` | Referensi `anggota` |
| `is_active` | Aktif atau tidak |
| `assigned_at` / `assigned_by` | Audit penugasan |
| `notes` | Catatan |

## Sheet: `qurban_muqorib`

**Fungsi**: Master muqorib (peng-qurban) lintas-edisi.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `nama_lengkap` | Nama muqorib |
| `alamat` | Alamat |
| `rt` | RT |
| `no_hp` | Nomor HP |
| `is_active` | Aktif atau tidak |
| `data_induk_ref_1447h` | Ref arsip historis 1447H |
| `notes` | Catatan |
| `created_at` / `created_by` / `updated_at` | Audit |

## Sheet: `qurban_master_hewan`

**Fungsi**: Master jenis/kelas hewan + harga, per-edisi.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `edisi_id` | Referensi `qurban_edisi` |
| `jenis` | Jenis hewan (mis. SAPI/KAMBING) |
| `kelas` | Kelas/grade |
| `kapasitas_slot` | Jumlah slot per ekor |
| `harga_beli` | Harga beli (Rupiah) |
| `harga_bawa_sendiri` | Harga untuk tipe bawa sendiri |
| `is_active` | Aktif atau tidak |
| `created_at` / `updated_at` / `created_by` | Audit |

## Sheet: `qurban_daftar_hewan`

**Fungsi**: Inventaris fisik hewan per-ekor (F5a). Status
`DRAFT` / `AKTIF` / `TERPOTONG` / `BATAL`.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `edisi_id` | Referensi `qurban_edisi` |
| `master_hewan_id` | Referensi `qurban_master_hewan` |
| `jenis` / `kelas` | Salinan jenis & kelas |
| `nomor_urut` | Nomor urut hewan |
| `kapasitas_slot` | Jumlah slot |
| `tipe_pembelian` | Tipe pembelian |
| `vendor_nama` | Nama vendor |
| `harga_beli_aktual` | Harga beli aktual (Rupiah) |
| `tanggal_pembelian` | ISO date |
| `status` | `DRAFT` / `AKTIF` / `TERPOTONG` / `BATAL` |
| `notes` | Catatan |
| `nomor_urut_pemotongan` | Urutan pemotongan |
| `created_at` / `updated_at` / `created_by` | Audit |

## Sheet: `qurban_peserta`

**Fungsi**: Pendaftaran peserta — **1 baris = 1 slot** (F4a). Status
`TERDAFTAR` / `BATAL`.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `edisi_id` | Referensi `qurban_edisi` |
| `muqorib_id` | Referensi `qurban_muqorib` |
| `hewan_id` | Referensi `qurban_daftar_hewan` |
| `slot_number` | Nomor slot dalam hewan |
| `tipe_qurban` | mis. `BAWA_SENDIRI` dll |
| `nama_atas_nama` | Nama "atas nama" qurban |
| `keterangan_bagian` | Checklist bagian (string comma-separated) |
| `harga_disepakati` | Harga disepakati (Rupiah) |
| `kode_bayar` | Kode bayar (1 per pendaftaran) |
| `sumber_pendaftaran` | mis. publik / panitia |
| `status_pendaftaran` | `TERDAFTAR` / `BATAL` |
| `tanggal_daftar` | ISO date |
| `notes` | Catatan |
| `created_at` / `updated_at` / `created_by` | Audit |

## Sheet: `qurban_pembayaran`

**Fungsi**: Pembayaran qurban — **1 baris = 1 pendaftaran / kode_bayar** (F6,
19 kolom). Status `BELUM_BAYAR` / `TERIMA_PANITIA` / `LUNAS` / `BATAL`.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `edisi_id` | Referensi `qurban_edisi` |
| `kode_bayar` | Kode bayar (link ke `qurban_peserta`) |
| `muqorib_id` | Referensi `qurban_muqorib` |
| `nominal_total` | Total tagihan (Rupiah) |
| `nominal_transfer` | Nominal transfer (termasuk suffix) |
| `metode` | `TUNAI` / `TRANSFER` |
| `status` | `BELUM_BAYAR` / `TERIMA_PANITIA` / `LUNAS` / `BATAL` |
| `tanggal_terima_panitia` | Timestamp terima panitia |
| `panitia_terima_id` | ID panitia penerima |
| `tanggal_lunas` | Timestamp lunas |
| `bank_ref` | Ref mutasi bank (rekonsiliasi transfer) |
| `skm_transaksi_id` | ID transaksi SKM hasil setor (jalur `skm-bridge`) |
| `bukti_url` | Base64 data URL bukti |
| `match_metadata` | Metadata hasil smart-matching rekonsiliasi (JSON) |
| `notes` | Catatan |
| `created_at` / `updated_at` / `created_by` | Audit |

## Sheet: `qurban_bagian_kanonik`

**Fungsi**: Peta bagian kanonik (Rekap Bagian) — alias → nama kanonik untuk
menormalkan `keterangan_bagian` lintas-rezim.

| Header | Deskripsi |
|---|---|
| `id` | Auto-generated |
| `nama_kanonik` | Nama bagian kanonik |
| `aliases` | Daftar alias (comma-separated) |
| `tipe` | Tipe bagian |
| `is_active` | Aktif atau tidak |
| `created_at` / `updated_at` / `created_by` | Audit |

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
| Donatur | `DON` | `DON-20260101-0001` |
| Reminder Log | `RMD` | `RMD-20260101-0001` |
| Kelompok | `KEL` | `KEL-20260101-0001` |

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

Header otoritatif hidup di `SHEET_HEADERS` (`src/lib/constants.ts`) — gunakan
sumber itu, bukan salinan di sini, agar tidak drift. Cuplikan (sinkron per B1):

```typescript
const SHEET_HEADERS = {
  // Inti (10)
  master: ['id', 'nama_masjid', 'alamat', 'kota', 'provinsi', 'telepon', 'email', 'pin_hash', 'logo_url', 'tahun_buku_aktif', 'mata_uang', 'created_at', 'updated_at'],
  transaksi: ['id', 'tanggal', 'jenis', 'kategori_id', 'deskripsi', 'jumlah', 'rekening_id', 'bukti_url', 'status', 'void_reason', 'void_date', 'koreksi_dari_id', 'created_by', 'created_at', 'updated_at', 'mutasi_ref', 'bank_ref'],
  kategori: ['id', 'nama', 'jenis', 'deskripsi', 'is_active', 'created_at'],
  rekening_bank: ['id', 'nama_bank', 'nomor_rekening', 'atas_nama', 'saldo_awal', 'is_active', 'created_at', 'updated_at'],
  audit_log: ['id', 'timestamp', 'aksi', 'entitas', 'entitas_id', 'detail', 'user_info', 'user_id', 'ip_address'],
  anggota: ['id', 'nama', 'telepon', 'email', 'peran', 'is_active', 'created_at', 'pin_hash', 'created_by', 'updated_at', 'last_login_at', 'failed_attempts', 'locked_until'],
  rekonsiliasi: ['id', 'rekening_id', 'tanggal', 'saldo_bank', 'saldo_sistem', 'selisih', 'status', 'catatan', 'created_at'],
  donatur: ['id', 'nama', 'telepon', 'alamat', 'kelompok', 'jumlah_komitmen', 'catatan', 'is_active', 'created_at', 'updated_at'],
  reminder_log: ['id', 'donatur_id', 'tanggal_kirim', 'jenis_reminder', 'pesan', 'status_kirim', 'error_message', 'created_at'],
  kelompok: ['id', 'nama', 'deskripsi', 'warna', 'kategori_masuk', 'kategori_keluar', 'created_at', 'updated_at'],

  // Qurban (9) — sama-sama di workbook ini
  qurban_edisi: ['id', 'tahun_hijriah', 'tahun_masehi', 'tanggal_idul_adha', 'tanggal_pendaftaran_buka', 'tanggal_pendaftaran_tutup', 'status', 'parent_edisi_id', 'cloned_at', 'created_at', 'updated_at', 'created_by', 'pemetaan_version'],
  qurban_konfigurasi_edisi: ['id', 'edisi_id', 'bop_per_ekor_sapi', 'bop_per_ekor_kambing', 'target_bungkus_total', 'berat_target_per_bungkus', 'tanggal_distribusi_mulai', 'tanggal_distribusi_selesai', 'payment_suffix', 'wa_send_on_pendaftaran', 'wa_send_on_pembayaran_confirmed', 'notes', 'created_at', 'updated_at', 'created_by'],
  qurban_panitia: ['id', 'edisi_id', 'anggota_id', 'is_active', 'assigned_at', 'assigned_by', 'notes'],
  qurban_muqorib: ['id', 'nama_lengkap', 'alamat', 'rt', 'no_hp', 'is_active', 'data_induk_ref_1447h', 'notes', 'created_at', 'created_by', 'updated_at'],
  qurban_master_hewan: ['id', 'edisi_id', 'jenis', 'kelas', 'kapasitas_slot', 'harga_beli', 'harga_bawa_sendiri', 'is_active', 'created_at', 'updated_at', 'created_by'],
  qurban_daftar_hewan: ['id', 'edisi_id', 'master_hewan_id', 'jenis', 'kelas', 'nomor_urut', 'kapasitas_slot', 'tipe_pembelian', 'vendor_nama', 'harga_beli_aktual', 'tanggal_pembelian', 'status', 'notes', 'nomor_urut_pemotongan', 'created_at', 'updated_at', 'created_by'],
  qurban_peserta: ['id', 'edisi_id', 'muqorib_id', 'hewan_id', 'slot_number', 'tipe_qurban', 'nama_atas_nama', 'keterangan_bagian', 'harga_disepakati', 'kode_bayar', 'sumber_pendaftaran', 'status_pendaftaran', 'tanggal_daftar', 'notes', 'created_at', 'updated_at', 'created_by'],
  qurban_pembayaran: ['id', 'edisi_id', 'kode_bayar', 'muqorib_id', 'nominal_total', 'nominal_transfer', 'metode', 'status', 'tanggal_terima_panitia', 'panitia_terima_id', 'tanggal_lunas', 'bank_ref', 'skm_transaksi_id', 'bukti_url', 'match_metadata', 'notes', 'created_at', 'updated_at', 'created_by'],
  qurban_bagian_kanonik: ['id', 'nama_kanonik', 'aliases', 'tipe', 'is_active', 'created_at', 'updated_at', 'created_by'],
};
```
