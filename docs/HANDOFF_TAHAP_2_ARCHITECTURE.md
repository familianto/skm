# HANDOFF — Modul Qurban di SKM (Architecture)

**Versi:** 1.0
**Tanggal:** 10 Mei 2026
**Status:** Architecture locked, ready untuk Tahap 3 (Information Architecture) dan seterusnya
**Scope:** Sistem informasi Qurban terintegrasi sebagai modul baru di SKM (Sistem Keuangan Masjid) Masjid Al Jabar Jatinegara Baru

---

## TL;DR

Modul Qurban dibangun sebagai sub-route `/qurban` di SKM existing (`skm-pi.vercel.app`), dengan:

- **Storage terpisah:** Sheet baru khusus Qurban (panitia tidak akses Sheet SKM yang berisi data keuangan)
- **Multi-user auth:** PIN per user (4–6 digit), 5 role dengan matriks akses, single role per user
- **Multi-edisi:** entitas `qurban_edisi` sebagai pemisah tahunan, mendukung clone-from-previous
- **Master persist lintas-edisi:** `qurban_muqorib` (master jamaah) terus update tahunan
- **Reconciliation 4-layer:** kode_bayar + nominal suffix `+3` + smart matching + manual queue + cash bridging
- **Strategi 1447H:** import sebagai snapshot read-only sesudah hari H untuk demo ke panitia & baseline
- **MVP bertahap:** sampai sesi pelaporan akhir Qurban; landing page publik existing dibiarkan as-is

---

## 1. Konteks & Objektif

### 1.1 Latar Belakang

SKM (Sistem Keuangan Masjid) sudah live di `skm-pi.vercel.app` — Next.js + TypeScript + Google Sheets sebagai DB (Sheet ID: `1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`). Auth saat ini single-PIN. Sudah ada 6 kategori Qurban + pattern rule `QRB` di CSV import + landing page publik `/publik/qurban`.

Sistem Qurban 1447H berjalan sebagai standalone Google Sheets + Apps Script (Sheet ID: `10tUkEXJlP3ulvaZ798pBq95nLdHrLm5BlYuDFmCLHFU`) — bukan bagian dari SKM.

### 1.2 Objektif Modul Qurban Baru

Promote modul Qurban dari "side system standalone" ke "first-class module di dalam SKM" dengan:
1. End-to-end flow: pendaftaran → pemetaan muqorib-hewan → distribusi → label → pelaporan → korelasi keuangan
2. Pemisah penyelenggaraan per tahun (1447H, 1448H, 1449H, ...)
3. Master muqorib persist lintas-tahun (tidak perlu input ulang)
4. Multi-user role-based access (panitia khusus pendaftaran, distribusi, dll)
5. Korelasi pembayaran Qurban dengan transaksi keuangan SKM

---

## 2. Keputusan Arsitektur Utama

### 2.1 Lima Dimensi Awal (Locked)

| Dimensi | Keputusan | Rationale |
|---|---|---|
| **Auth strategy** | PIN per user (4–6 digit) | Pengurus mostly non-tech, belum tentu punya Gmail; konsisten dengan UX SKM existing |
| **Storage** | Spreadsheet baru khusus Qurban | Panitia tidak perlu/tidak boleh akses Sheet SKM (data keuangan sensitif) |
| **Strategi 1447H** | Opsi A — import sebagai snapshot read-only | Bisa di-show ke panitia 1447H sebagai usulan tahun berikutnya |
| **MVP scope** | Bertahap, sampai sesi pelaporan akhir Qurban | Pelan-pelan; tiap sub-modul deliverable mandiri |
| **Landing page publik existing** | Biarkan as-is | Tetap baca dari GSheet 1447H sampai 1447H selesai |

### 2.2 Akses Control: Auto-Redirect & Menu Visibility

Saat panitia Qurban login dengan PIN-nya, sistem auto-redirect ke `/qurban`. Modul lain tetap visible di sidebar tapi **grayed out + ikon gembok** (Opsi A — paling jujur, tidak ada momen frustrasi klik-error).

**Defense in depth 3 lapis:**
1. **Middleware** — intercept request, blokir kalau bukan route yang diizinkan role
2. **Auto-redirect saat login** — push ke route default sesuai role
3. **UI menu state** — grayed out items yang bukan haknya
4. *(Bonus)* **API-level guard** — setiap API route cek role, return 403 kalau tidak match

### 2.3 Lokasi `users`/`anggota`

Tabel users **di Sheet SKM**, bukan Sheet Qurban. Memanfaatkan sheet `anggota` existing (yang akan di-extend). Panitia Qurban tetap tidak akses Sheet SKM raw (akses lewat aplikasi saja).

---

## 3. Role & Access Control

### 3.1 Lima Role (Single Role per User)

| Role | Profil | Estimasi |
|---|---|---|
| `SUPER_ADMIN` | Pengelola sistem, full access termasuk user management | 1–2 orang |
| `BENDAHARA` | Owner SKM, full keuangan, read-only Qurban Laporan | 1–2 orang |
| `ADMIN_QURBAN` | Ketua panitia Qurban, full Qurban + read SKM Laporan | 1 orang per edisi |
| `PENDAFTARAN` | Handle muqorib, hewan, pemetaan, pembayaran | 2–3 orang |
| `DISTRIBUSI` | Handle pencetakan label dan tracking pengiriman | 2–3 orang |

**Aturan:**
- Single role per user (peran & tanggung jawab jelas)
- Hanya `SUPER_ADMIN` yang bisa kelola user (add/edit/reset PIN)
- Panitia Qurban (`PENDAFTARAN`, `DISTRIBUSI`) hanya akses edisi yang `AKTIF`; `SUPER_ADMIN`, `BENDAHARA`, `ADMIN_QURBAN` bisa akses semua edisi

### 3.2 Matriks Akses (Role × Modul)

Simbol: ✅ akses penuh, 👁 read-only, 🔒 grayed (Opsi A).

| Grup Modul | Super Admin | Bendahara | Admin Qurban | Pendaftaran | Distribusi |
|---|---|---|---|---|---|
| **SKM — Operasional** (Transaksi, Kategori, Rekening, Donatur, CSV Import, Rekonsiliasi, Reminder WA) | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| **SKM — Laporan** | ✅ | ✅ | 👁 | 🔒 | 🔒 |
| **SKM — Pengaturan** | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| **Qurban — Master** (Muqorib, Hewan, Edisi) | ✅ | 👁 | ✅ | ✅ | 🔒 |
| **Qurban — Operasional** (Pendaftaran/Peserta, Pemetaan, Pembayaran) | ✅ | 👁 | ✅ | ✅ | 🔒 |
| **Qurban — Distribusi** (Tracking, Cetak Label) | ✅ | 🔒 | ✅ | 🔒 | ✅ |
| **Qurban — Laporan** | ✅ | 👁 | ✅ | 👁 | 👁 |
| **Sistem — User Management** (PIN, role assign) | ✅ | 🔒 | 🔒 | 🔒 | 🔒 |

### 3.3 PIN Policy

- Panjang: 4–6 digit numerik
- Tidak boleh berurutan (`1234`, `0987`) atau repeat (`0000`, `1111`)
- Unik antar user (validasi saat create/change)
- Lockout: 5× gagal dalam 5 menit → kunci 15 menit (via field `failed_attempts` + `locked_until` di `anggota`)
- Reset PIN: manual oleh `SUPER_ADMIN` via Pengaturan > Anggota > pilih user > Reset PIN. Self-reset via WA OTP masuk backlog.

---

## 4. Schema Lengkap (11 Sheet)

### 4.1 Sheet `anggota` (di Sheet SKM, di-extend dari existing)

| Kolom | Tipe | Status | Catatan |
|---|---|---|---|
| `id` | string | Existing | Format `ANG-YYYYMMDD-NNNN` |
| `nama` | string | Existing | |
| `telepon` | string | Existing | **Format 628** (cleanup dari scientific notation) |
| `email` | string | Existing | Optional |
| `peran` | enum | Existing → diperluas | `SUPER_ADMIN`, `BENDAHARA`, `ADMIN_QURBAN`, `PENDAFTARAN`, `DISTRIBUSI` (UPPERCASE) |
| `is_active` | boolean | Existing | `TRUE`/`FALSE` |
| `created_at` | datetime | Existing | ISO 8601 + Z |
| **`pin_hash`** | string | NEW | bcrypt hash; kosong = tidak bisa login |
| **`created_by`** | string | NEW | FK ke `anggota.id` |
| **`updated_at`** | datetime | NEW | |
| **`last_login_at`** | datetime | NEW | Update saat login sukses |
| **`failed_attempts`** | number | NEW | Counter untuk lockout |
| **`locked_until`** | datetime | NEW | Kapan unlock (kalau ke-lock) |

### 4.2 Sheet `qurban_edisi` (lintas tahun)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `EDS-YYYYMMDD-NNNN` |
| `tahun_hijriah` | string | `1447H`, `1448H` |
| `tahun_masehi` | number | `2026`, `2027` |
| `tanggal_idul_adha` | date | |
| `tanggal_pendaftaran_buka` | date | |
| `tanggal_pendaftaran_tutup` | date | |
| `status` | enum | `DRAFT`, `AKTIF`, `SELESAI` (hanya 1 boleh AKTIF) |
| `parent_edisi_id` | string | FK ke edisi yang di-clone (lineage) |
| `cloned_at` | datetime | Optional |
| `created_at`, `updated_at`, `created_by` | — | Audit |

### 4.3 Sheet `qurban_muqorib` (lintas-edisi master)

**Tidak ada `edisi_id`** — sengaja, ini master persist.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `MQR-YYYYMMDD-NNNN` |
| `nama_lengkap` | string | Wajib |
| `alamat` | string | Wajib |
| `rt` | string | `001`–`006` atau `Lainnya` |
| `no_hp` | string | Format `628xxx` |
| `is_active` | boolean | Soft-delete |
| `data_induk_ref_1447h` | string | Optional, link ke `data_induk` lama (untuk migrasi 1447H) |
| `notes` | string | Optional |
| `created_at`, `created_by`, `updated_at` | — | Audit |

### 4.4 Sheet `qurban_master_hewan` (per-edisi)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `MHW-YYYYMMDD-NNNN` |
| `edisi_id` | FK | |
| `jenis` | enum | `SAPI`, `KAMBING` |
| `kelas` | enum | `A`, `B`, `C`, `D` |
| `kapasitas_slot` | number | Sapi=7, Kambing=1 |
| `harga_beli` | number | Harga 1 ekor utuh BELI |
| `harga_bawa_sendiri` | number | Jasa penitipan & potong (BAWA_SENDIRI) |
| `is_active` | boolean | |
| `created_at`, `updated_at`, `created_by` | — | Audit |

Harga per slot BELI dihitung di app: `harga_beli / kapasitas_slot`.

### 4.5 Sheet `qurban_konfigurasi_edisi` (single-row pattern, per-edisi)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `KFG-YYYYMMDD-NNNN` |
| `edisi_id` | FK unique | |
| `bop_per_ekor_sapi` | number | |
| `bop_per_ekor_kambing` | number | |
| `target_bungkus_total` | number | Untuk Note 1 (rumus berat per bungkus) |
| `berat_target_per_bungkus` | number | gram |
| `tanggal_distribusi_mulai` | date | |
| `tanggal_distribusi_selesai` | date | |
| `payment_suffix` | number | Default `3` (lihat Reconciliation Layer 1) |
| `notes` | string | |
| `created_at`, `updated_at`, `created_by` | — | Audit |

### 4.6 Sheet `qurban_panitia` (per-edisi)

**Bukan untuk permission gating.** Permission tetap dari `anggota.peran`. Sheet ini mencatat siapa officially panitia di edisi mana untuk laporan & history.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `PNT-YYYYMMDD-NNNN` |
| `edisi_id` | FK | |
| `anggota_id` | FK ke `anggota.id` | |
| `is_active` | boolean | |
| `assigned_at` | datetime | |
| `assigned_by` | FK ke `anggota.id` | |
| `notes` | string | |

### 4.7 Sheet `qurban_daftar_hewan` (per-edisi)

Inventory fisik hewan. `id` permanent vs `nomor_urut` mutable (untuk insight 4 — renumber).

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `HWN-YYYYMMDD-NNNN` — permanent, FK target |
| `edisi_id` | FK | |
| `master_hewan_id` | FK | Ke `qurban_master_hewan` |
| `jenis` | enum | `SAPI`, `KAMBING` (denormalized) |
| `kelas` | enum | `A`–`D` (denormalized) |
| `nomor_urut` | number | **Mutable** — renumber dalam (jenis, kelas) |
| `kapasitas_slot` | number | Denormalized |
| `tipe_pembelian` | enum | `BELI`, `BAWA_SENDIRI` |
| `vendor_nama` | string | Free text di MVP; normalisasi ke `qurban_vendor` (FK `vendor_id`) di Tahap berikutnya |
| `harga_beli_aktual` | number | Cost riil ke masjid; 0 untuk BAWA_SENDIRI |
| `tanggal_pembelian` | date | |
| `status` | enum | `DRAFT`, `AKTIF`, `TERPOTONG`, `BATAL` |
| `notes` | string | |
| `created_at`, `updated_at`, `created_by` | — | Audit |

Display "Sapi-A-01" computed di app dari `jenis-kelas-nomor_urut`. Slot terisi/penuh juga computed (`count(qurban_peserta WHERE hewan_id = X)`).

### 4.8 Sheet `qurban_peserta` (per-edisi)

**Pendekatan A: 1 row = 1 slot.** Muqorib ambil 3 slot Sapi → 3 rows.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `PST-YYYYMMDD-NNNN` |
| `edisi_id` | FK | |
| `muqorib_id` | FK | Ke `qurban_muqorib` (lintas-edisi) |
| `hewan_id` | FK | Ke `qurban_daftar_hewan` — **mutable** (insight 3, drag-drop) |
| `slot_number` | number | 1–`kapasitas_slot` — **mutable** |
| `tipe_qurban` | enum | `BELI`, `BAWA_SENDIRI` (snapshot dari hewan) |
| `nama_atas_nama` | string | Optional. Kalau diisi, label pakai ini; kalau kosong, pakai `muqorib.nama_lengkap` |
| `keterangan_bagian` | string | "Daging+Jeroan", "Daging+Kepala", dll — untuk label |
| `harga_disepakati` | number | **Frozen** saat pendaftaran (tombol "Refresh harga" manual kalau panitia mau apply harga baru) |
| `kode_bayar` | string | Unique per edisi, format `QRB-{tahun}-{NNN}`, e.g., `QRB-1448-007` |
| `sumber_pendaftaran` | enum | `PUBLIK`, `PANITIA`, `IMPORT_1447H` |
| `status_pendaftaran` | enum | `TERDAFTAR`, `BATAL` |
| `tanggal_daftar` | datetime | |
| `notes` | string | |
| `created_at`, `updated_at`, `created_by` | — | Audit |

**Status pembayaran NOT in this sheet** — computed dari sum `qurban_pembayaran`. `harga_disepakati` jadi acuan total.

### 4.9 Sheet `qurban_pembayaran` (per-edisi)

Multi-bayar per peserta. Linkage dengan SKM via `skm_transaksi_id`.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `BYR-YYYYMMDD-NNNN` |
| `edisi_id` | FK | Denormalized untuk filter |
| `peserta_id` | FK | |
| `tanggal_bayar` | date | |
| `jumlah` | number | |
| `metode` | enum | `TUNAI`, `TRANSFER`, `VA`, `IMPORT_1447H` |
| `bank_ref` | string | Auto-fill dari `transaksi.bank_ref` saat matching (tidak input manual) |
| `skm_transaksi_id` | FK | Optional, ke `transaksi.id` di Sheet SKM. Kosong = belum di-link |
| `bukti_url` | string | Optional, link Google Drive |
| `panitia_terima_id` | FK ke `anggota.id` | Diisi kalau metode=TUNAI |
| `match_metadata` | string (JSON) | Optional, simpan score & signals untuk audit Layer 2 |
| `is_active` | boolean | Soft-delete |
| `notes` | string | |
| `created_at`, `created_by` | — | Audit |

### 4.10 Sheet `qurban_vendor` (lintas-edisi)

Sheet ini dibuat di **Tahap berikutnya** (saat normalisasi `vendor_nama`). Tidak ada di MVP awal.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `VND-YYYYMMDD-NNNN` |
| `nama` | string | Wajib |
| `kontak_pic` | string | |
| `no_hp` | string | Format 628 |
| `alamat` | string | |
| `jenis_supply` | string | Multi-value: `"SAPI"`, `"KAMBING"`, `"SAPI,KAMBING"` |
| `is_active` | boolean | |
| `notes` | string | |
| `created_at`, `updated_at`, `created_by` | — | Audit |

### 4.11 Sheet `qurban_distribusi` (per-edisi)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | string | `DST-YYYYMMDD-NNNN` |
| `edisi_id` | FK | |
| `peserta_id` | FK | Siapa yang dapat paket |
| `tanggal_kirim` | date | |
| `petugas_id` | FK ke `anggota.id` | Panitia DISTRIBUSI yang antar |
| `metode_kirim` | enum | `LANGSUNG_KE_MUQORIB`, `VIA_RT`, `AMBIL_DI_MASJID` |
| `rt_pengiriman` | string | Diisi kalau metode `VIA_RT` |
| `nama_penerima` | string | Yang terima saat handover |
| `bukti_url` | string | Foto bukti, Google Drive |
| `status` | enum | `DRAFT`, `DALAM_PROSES`, `TERKIRIM`, `GAGAL` |
| `notes` | string | |
| `created_at`, `updated_at`, `created_by` | — | Audit |

Field reserved untuk Note 1 (rumus berat per bungkus): `berat_aktual_gram`, `jumlah_bungkus` — tambah belakangan, non-breaking.

---

## 5. Reconciliation Strategy (4-Layer)

### 5.1 Layer 1 — Pre-payment Intent (Paling Akurat)

**Dua mekanisme paralel:**

**A. Kode bayar unik per peserta** (`qurban_peserta.kode_bayar`):
- Format: `QRB-{tahun}-{NNN}`, e.g., `QRB-1448-007`
- Auto-generated saat daftar
- Ditampilkan di: form konfirmasi pendaftaran, WA confirmation otomatis (kalau Fonnte aktif), halaman publik check status
- Muqorib diinstruksikan tulis kode di berita transfer

**B. Nominal "+3" suffix:**
- Semua transfer Qurban dapat suffix angka 3 di rupiah
- Sapi A: Rp 4.000.000 → ditransfer Rp 4.000.003
- Sapi D: Rp 5.000.000 → ditransfer Rp 5.000.003
- Storage tetap harga asli; display ke muqorib include suffix
- Configurable per edisi via `qurban_konfigurasi_edisi.payment_suffix`

**Saat CSV import:**
- Regex baru: `QRB-\d{4}-\d{3}` → 100% match ke `kode_bayar`
- Signal `nominal mod 1000 == 3` → boost score Layer 2

### 5.2 Layer 2 — Smart Matching (Confidence Score)

Untuk transaksi tanpa Layer 1 match, hitung score:

| Signal | Bobot | Logic |
|---|---|---|
| Nominal suffix `3` | +30 | `nominal mod 1000 == 3` |
| Keyword `QRB`/`QURBAN`/`KURBAN` | +30 | Existing SKM logic |
| Nominal match harga peserta (±1%) | +25 | `harga_disepakati - sum(pembayaran)` |
| Tanggal dalam 14 hari sejak `tanggal_daftar` | +15 | |
| Fuzzy match nama transfer ↔ `muqorib.nama_lengkap` | +20 | Levenshtein/Jaro-Winkler ≥ 0.8 |
| Phone match | +10 | Berita transfer mengandung `muqorib.no_hp` |

Threshold suggest match: ≥ 50. UI tampilkan kandidat descending. Bendahara klik konfirmasi. Score di-log di `qurban_pembayaran.match_metadata`.

### 5.3 Layer 3 — Manual Reconciliation Queue

Transaksi tidak match apapun masuk antrian "Belum Ter-link":
- Filter: range nominal Qurban (Rp 1jt – Rp 30jt), belum punya `skm_transaksi_id` di `qurban_pembayaran`
- Bendahara/Admin Qurban search peserta manual, klik link
- Tracking durasi unmatched untuk indikator "perlu tindak lanjut"

### 5.4 Layer 4 — Cash via Bridging Record

1. Panitia terima cash → input langsung di modul Qurban: `qurban_pembayaran` dengan `metode=TUNAI`, `peserta_id`, `jumlah`, `panitia_terima_id`. Tidak terikat ke transaksi SKM (`skm_transaksi_id = null`)
2. Panitia kumpul cash → setor tunai ke bank
3. Setor tunai muncul di CSV → existing logic SETOR TUNAI = SPLIT mandatory di SKM
4. Saat split, bendahara isi kategori Qurban dengan total yang match dengan total cash Qurban di modul Qurban
5. **Banyak-ke-satu** — banyak `qurban_pembayaran` cash records ↔ satu split entry SKM. Tidak perlu link 1-to-1.

### 5.5 WA Confirmation Workflow (Manual Entry MVP)

**Workflow:**
```
1. Muqorib (atau perwakilan) transfer → screenshot bukti
2. WA panitia: kirim bukti + sebut nama/kode_bayar
3. Panitia receive WA, buka modul Qurban → "Konfirmasi Pembayaran"
4. Search peserta (by nama / kode_bayar / no HP)
5. Branching:
   a. Sudah auto-matched (Layer 1/2 dari CSV import sebelumnya):
      → Status "Tercatat" sudah ter-link transaksi SKM
      → Upload bukti WA sebagai backup → bukti_url
      → Reply WA: "Sudah tercatat, terima kasih"
   b. Belum tercatat (Layer 3 manual):
      → Form input pembayaran: jumlah, tanggal, metode, bukti (upload)
        - bank_ref TIDAK input manual (auto-fill saat CSV match nanti)
      → Submit → record baru di qurban_pembayaran
      → Reply WA: "Sudah dikonfirmasi, terima kasih"
```

**Halaman "Konfirmasi Pembayaran"** (untuk panitia):
- Search box: nama / kode_bayar / no HP
- List hasil: nama, hewan, slot, total harga, sisa belum bayar
- Klik peserta → form input pembayaran (atau view existing + tambah backup bukti)
- Upload bukti → Google Drive (existing infra SKM)

**Mengapa manual entry, bukan WA bot otomatis?**
- Parsing screenshot bukti (OCR) belum reliable di MVP
- Risiko false positive lebih tinggi dari panitia entry manual
- Volume 1448H estimasi 50-100 peserta — manual entry tidak ekstrem
- WA bot bisa masuk Phase 2 kalau scale up

### 5.6 Akurasi Expected

| Layer | Cakupan target | Confidence |
|---|---|---|
| L1 (kode_bayar + suffix `+3`) | 70–85% transfer | 100% akurat saat match |
| L2 (smart matching) | 10–25% sisa transfer | 80–95% akurat (manual confirm) |
| L3 (manual queue) | Sisa edge cases | 100% akurat (manual) |
| L4 (cash) | Semua pembayaran tunai | Akurat di level kategori |

Realistis: unmatched < 5% dari total volume.

---

## 6. Migration Plan 1447H

### 6.1 Strategi: Snapshot Sesudah Hari H

- Migrasi dilakukan **sesudah** hari H 1447H (~awal Juni 2026)
- Edisi 1447H langsung status `SELESAI` (read-only)
- Tidak ada sync dua arah dengan GSheet 1447H. GSheet existing tetap source-of-truth selama 1447H berjalan.

### 6.2 Source-Target Mapping

| Sumber (GSheet 1447H) | Target (Sheet Qurban baru) | Strategi |
|---|---|---|
| `data_induk` (263+ rows) | `qurban_muqorib` | **Migrate semua** (bukan hanya peserta 1447H), isi `data_induk_ref_1447h` |
| `master_hewan` (8 rows) | `qurban_master_hewan` | Snapshot edisi 1447H, mapping `harga_penitipan` → `harga_bawa_sendiri` |
| `daftar_hewan` (48 rows: 20 Sapi + 28 Kambing) | `qurban_daftar_hewan` | Generate `id` baru, simpan kode lama (`SP-A01`, dll) di `notes` |
| `peserta` (dynamic) | `qurban_peserta` | Match `nama_muqorib` → `qurban_muqorib.id`. `tipe_qurban="Penitipan"` → `BAWA_SENDIRI`. `sumber_pendaftaran=IMPORT_1447H` |
| `vendor` (kosong) | `qurban_vendor` | Skip (tidak ada data) |
| `Form Responses 2` | — | Tidak migrate (sudah materialized di `peserta`) |
| `ringkasan` | — | Computed di modul baru, regenerate |
| Pembayaran 1447H di `peserta.jumlah_bayar` | `qurban_pembayaran` | **Opsi B**: 1 record per peserta yang sudah bayar, `metode=IMPORT_1447H` |

### 6.3 Catatan Penting

- **Phone number cleanup:** `data_induk.HP` formatnya bervariasi (`08xxx`, `628xxx`, scientific notation). Saat migrasi, normalisasi ke `628xxx`.
- **Mengapa migrate seluruh `data_induk` (bukan hanya peserta 1447H):** master jamaah jadi lebih lengkap, dipakai untuk smart-lookup di pendaftaran 1448H (insight 1).

---

## 7. Naming Conventions

### 7.1 ID Format

`XXX-YYYYMMDD-NNNN` — 3-letter prefix + tanggal + sequential 4-digit.

Prefix yang digunakan:
- `ANG` — Anggota (user)
- `EDS` — Edisi
- `MQR` — Muqorib
- `MHW` — Master Hewan
- `KFG` — Konfigurasi Edisi
- `PNT` — Panitia
- `HWN` — Daftar Hewan
- `PST` — Peserta
- `BYR` — Pembayaran
- `VND` — Vendor
- `DST` — Distribusi
- `KAT` — Kategori (existing SKM)
- `REK` — Rekening (existing SKM)
- `TRX` — Transaksi (existing SKM)
- `LOG` — Audit Log (existing SKM)

### 7.2 Format & Konvensi

- **Boolean:** `TRUE` / `FALSE` (UPPERCASE string literal)
- **Datetime:** ISO 8601 dengan ms + Z, e.g., `2026-04-12T10:08:48.614Z`
- **Date:** ISO 8601, e.g., `2026-06-15`
- **Phone:** Format `628xxxxxxxxxx` (bukan `08xxx`)
- **Enum values:** UPPERCASE, snake_case untuk compound (e.g., `BATCH_IMPORT`, `BAWA_SENDIRI`)
- **Nama kolom:** snake_case dengan `is_active` (bukan `aktif`), `peran` (bukan `role`)

### 7.3 Naming Change: PENITIPAN → BAWA_SENDIRI

**Hanya berlaku di sistem baru (modul SKM Qurban).** Sistem 1447H di GSheet existing tetap pakai `PENITIPAN`.

| Lokasi | Sebelum | Sesudah |
|---|---|---|
| `qurban_master_hewan` kolom | `harga_penitipan` | `harga_bawa_sendiri` |
| `qurban_daftar_hewan.tipe_pembelian` enum | `BELI`, `PENITIPAN` | `BELI`, `BAWA_SENDIRI` |
| `qurban_peserta.tipe_qurban` enum | `BELI`, `PENITIPAN` | `BELI`, `BAWA_SENDIRI` |

**Yang TIDAK berubah:**
- Kategori SKM existing `KAT-20260406-0007 Qurban Jasa Titip & Pakan` tetap. UI modul Qurban pakai term "Bawa Sendiri", mapping ke kategori SKM ini sebagai keuangan.

**UI labels untuk form pendaftaran:**
> "Tipe Qurban: ⚪ Beli (hewan disediakan masjid) | ⚪ Bawa Sendiri (saya bawa hewan)"

---

## 8. Insights & Notes

### 8.1 Empat Insights yang Sudah Baked-in

**Insight 1 — Pendaftaran dual-channel (publik + panitia)**
- Halaman publik dengan smart-lookup: ketik nama → match `qurban_muqorib` → auto-fill alamat/HP/RT, atau create row baru
- Panitia juga punya UI internal untuk input on-behalf
- Tracked via `qurban_peserta.sumber_pendaftaran` enum: `PUBLIK`, `PANITIA`, `IMPORT_1447H`

**Insight 2 — Smart-lookup berbasis nama**
- Nama bisa duplikat → UI tampilkan kandidat dengan disambiguator (RT, HP partial)
- Edge case: kesalahan ketik bisa bikin double entry — perlu validasi/dedupe di future

**Insight 3 — Pemetaan muqorib drag-drop, lintas-tipe**
- Drag-drop UI (desktop only) untuk pindah Sapi-A-3 → Sapi-A-1 → Sapi-B-1
- `qurban_peserta.hewan_id` + `slot_number` mutable
- Setiap perpindahan ditrack di `audit_log` SKM (sheet yang sama)

**Insight 4 — Renumber hewan dalam satu tipe**
- Beda dari #3: yang dipindah hewan-nya, muqorib ikut otomatis (ref ke `id`, bukan `nomor_urut`)
- `qurban_daftar_hewan.id` permanent vs `nomor_urut` mutable
- Hanya untuk tipe sama (jenis + kelas)

### 8.2 Dua Notes Parked

**Note 1 — Rumus perhitungan berat daging per bungkus**
- Berat per bungkus = total berat hewan / target bungkus
- Belum diputuskan oleh panitia
- Saat panitia putuskan, tinggal tambah field di `qurban_konfigurasi_edisi` (target_bungkus, berat_per_bungkus) dan `qurban_distribusi` (berat_aktual_gram, jumlah_bungkus)
- **Non-breaking change** — schema sudah accommodate

**Note 2 — Cloning dari edisi sebelumnya**
- Sudah baked-in via `qurban_edisi.parent_edisi_id` + `cloned_at`
- Saat bikin edisi baru, opsi "Salin dari edisi sebelumnya" dengan checkbox per kategori:

| Yang di-clone | Default |
|---|---|
| `qurban_master_hewan` (semua row → ganti `edisi_id`) | ✅ ya |
| `qurban_konfigurasi_edisi` (BOP, target, dll) | ✅ ya |
| `qurban_panitia` | ⬜ default tidak (panitia berganti tahunan) |
| `qurban_muqorib` | — (lintas-edisi, tidak relevan) |

- Field harga/BOP bisa di-edit setelah cloning sebelum status `AKTIF` (harga tahun baru biasanya naik)

---

## 9. Roadmap

### 9.1 Tahap Sudah Selesai (Architecture)

- ✅ **Tahap 1** — Konsep & 5 dimensi awal
- ✅ **Tahap 2.A** — Schema `anggota` (extend existing)
- ✅ **Tahap 2.B** — Schema master Qurban (5 sheet)
- ✅ **Tahap 2.C** — Schema operasional Qurban (3 sheet)
- ✅ **Tahap 2.D** — Schema auxiliary + migration plan 1447H (2 sheet + plan)
- ✅ **Tahap 2.E** — Reconciliation strategy 4-layer + WA workflow

### 9.2 Tahap Berikutnya

**Tahap 3 — Information Architecture (di chat baru, dengan dokumen ini sebagai input)**
- Peta halaman modul `/qurban`
- Navigasi & flow per role
- Wireframe high-level
- API endpoint inventory

**Tahap 4 — Rencana Eksekusi Migrasi**
- Urutan deploy: schema migration → code change → data migration
- Checklist per step
- Rollback plan
- Coordination dengan production live

**Tahap 5+ — Implementasi Bertahap**
1. Auth multi-user (extend `anggota`, refactor login flow)
2. Setup Sheet Qurban + sheet master (`qurban_edisi`, `qurban_muqorib`, `qurban_master_hewan`, `qurban_konfigurasi_edisi`, `qurban_panitia`)
3. Modul Master Muqorib (CRUD + smart-lookup foundation)
4. Modul Pendaftaran (publik + panitia channel)
5. Modul Master Hewan + Pemetaan (drag-drop)
6. Modul Pembayaran + Reconciliation (WA confirmation + Layer 1-3)
7. Modul Distribusi + Cetak Label
8. Modul Laporan + Dashboard
9. Migration data 1447H (post-Idul Adha)
10. Pengaturan Panitia per edisi + Cloning UI

---

## 10. Appendix

### 10.1 Referensi Existing System

**SKM:**
- Repo: `github.com/familianto/skm`
- Live: `skm-pi.vercel.app`
- Stack: Next.js + TypeScript + Google Sheets DB
- Sheet ID: `1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`
- Auth saat ini: single PIN (sudah diganti dari 8686, tersimpan di `master.pin_hash` sebagai bcrypt)

**Sistem Qurban 1447H (existing standalone):**
- Sheet ID: `10tUkEXJlP3ulvaZ798pBq95nLdHrLm5BlYuDFmCLHFU`
- 7 sheets: Form Responses 2, data_induk (263+ jamaah), master_hewan (8 rows), daftar_hewan (48 rows: 20 Sapi + 28 Kambing), peserta, vendor (kosong), ringkasan
- Apps Script Kode.gs v2.2 (label printing per Hewan + per RT)
- Drive Folder ID: `1PmIvJckpoIZU6UoCqCNww6jbqP9ibZ2u`

**Landing Page Publik Qurban:**
- `/publik/qurban` (mobile/desktop) + `/publik/qurban/tv` (TV display)
- Read-only dari GSheet 1447H, cache 5 menit
- **Biarkan as-is** sampai 1447H selesai (tidak diubah jadi baca dari modul SKM)

**Existing Kategori Qurban di SKM:**
- MASUK: `KAT-20260406-0007` Qurban Jasa Titip & Pakan, `KAT-20260406-0008` Qurban Kambing, `KAT-20260406-0009` Qurban Sapi
- KELUAR: `KAT-20260406-0027` Qurban Biaya Jasa & Pakan Ternak, `KAT-20260406-0028` Qurban Operasional, `KAT-20260406-0029` Qurban Pembelian Hewan
- Kelompok: `KEL-20260407-0002` Qurban (warna `#dc2626`)

### 10.2 Konvensi Migration

- Saat migration code atau data, gunakan ID generator yang sesuai pattern `XXX-YYYYMMDD-NNNN` dengan tanggal saat migration dijalankan
- Existing IDs di GSheet 1447H (`SP-A01`, dll) disimpan di kolom `notes` sebagai referensi historis
- Phone normalization: regex `^0` → replace dengan `62`; format scientific notation (`8.123E9`) → parse ke string `628123...`

---

## Status Akhir Architecture

Semua keputusan locked. 11 sheet schema lengkap. 4-layer reconciliation strategy. Migration plan 1447H. Naming convention. Insights & notes dokumented.

**Ready untuk Tahap 3 (Information Architecture) di chat baru** dengan dokumen ini sebagai input utama.
