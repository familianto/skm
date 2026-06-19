# HANDOFF — Sprint 5: Rekonsiliasi Bank

**Tanggal**: 2026-03-23
**Sprint**: 5 — Rekonsiliasi Bank
**Branch**: `claude/bank-reconciliation-google-drive-jXSw0`
**Statistik**: 15 files changed, +1264 lines
**Status Build**: PASS (type-check, build — zero errors/warnings)

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | API POST /api/transaksi/[id]/void (void transaksi dengan alasan, validasi status AKTIF) | Done |
| 2 | API POST /api/transaksi/[id]/koreksi (buat transaksi koreksi terhubung ke asli, opsi void asli) | Done |
| 3 | API POST /api/upload/bukti (upload gambar JPG/PNG ke Google Drive, update bukti_url di transaksi) | Done |
| 4 | API GET /api/rekonsiliasi (list riwayat rekonsiliasi, filter per rekening) | Done |
| 5 | API POST /api/rekonsiliasi (hitung saldo_sistem, bandingkan dengan saldo_bank, simpan hasil) | Done |
| 6 | VoidModal component (modal konfirmasi void dengan input alasan dan warning "tidak bisa di-undo") | Done |
| 7 | FileUpload component (drag-and-drop upload dengan validasi tipe/ukuran file) | Done |
| 8 | ImagePreview component (thumbnail dengan lightbox viewer, link buka di tab baru) | Done |
| 9 | UploadBukti component (flow upload lengkap: pilih file → preview → upload → sukses) | Done |
| 10 | Rekonsiliasi page (form, result cards, riwayat tabel per rekening) | Done |
| 11 | Updated transaction detail page (tombol Void, Koreksi, Edit + section bukti upload/preview) | Done |
| 12 | Updated transaction form (support koreksi mode via query param, checkbox void asli) | Done |
| 13 | useRekonsiliasi hook (fetch riwayat rekonsiliasi dengan filter rekening_id) | Done |
| 14 | Zod validators (voidTransaksiSchema, koreksiTransaksiSchema, rekonsiliasiCreateSchema) | Done |
| 15 | Sidebar — tambah link navigasi Rekonsiliasi | Done |

---

## Keputusan Teknis

### Upload Bukti sebagai Base64 Data URL (Tanpa Google Drive)
- Upload bukti **tidak menggunakan Google Drive** karena service account Gmail personal tidak punya storage quota.
- Gambar di-resize client-side via Canvas API (max 600x600px) dan di-compress ke JPEG 70%.
- Hasilnya disimpan sebagai base64 data URL langsung di kolom `bukti_url` sheet transaksi.
- Limit: max 50.000 karakter per cell Google Sheets.
- Validasi file di client: tipe (JPG/PNG only), ukuran (max 500KB sebelum resize).

### Batch Fetching untuk Rekonsiliasi
- `POST /api/rekonsiliasi` menggunakan `sheetsService.batchGet()` untuk fetch data rekening_bank + transaksi dalam 1 API call.
- Saldo sistem dihitung di application layer: `saldo_awal + SUM(MASUK AKTIF) - SUM(KELUAR AKTIF)` untuk rekening yang dipilih.
- Ini menghemat 1 API call per request dibanding 2 `getRows()` terpisah.

### useSearchParams dalam Suspense Boundary
- Halaman `/transaksi/baru` menggunakan `useSearchParams()` untuk membaca query param `koreksi_dari`.
- Next.js 16 memerlukan `useSearchParams()` dibungkus dalam `<Suspense>` boundary saat static generation.
- Pattern: Parent component = `<Suspense fallback={<Loading />}>`, child component = actual content yang menggunakan `useSearchParams()`.

### Audit Logging dengan AuditAksi Types
- Void menggunakan `AuditAksi.VOID` — mencatat alasan void.
- Koreksi menggunakan `AuditAksi.KOREKSI` — mencatat ID transaksi asli dan data koreksi.
- Upload bukti menggunakan `AuditAksi.UPDATE` — mencatat URL bukti baru.
- Rekonsiliasi menggunakan `AuditAksi.CREATE` — mencatat saldo_bank, saldo_sistem, selisih, status.
- Semua audit calls di-wrap try/catch agar gagal audit tidak memblokir operasi utama.

### Koreksi Transaksi: Link, Bukan Replace
- Koreksi membuat transaksi **baru** dengan field `koreksi_dari_id` menunjuk ke transaksi asli.
- Transaksi asli **tetap AKTIF** secara default — user bisa memilih untuk void bersamaan via checkbox "Void transaksi asli bersamaan".
- Jika checkbox dicentang, API melakukan void pada transaksi asli dengan alasan "Dikoreksi oleh TRX-XXX".
- Routing koreksi: dari detail page klik "Koreksi" → redirect ke `/transaksi/baru?koreksi_dari=TRX-XXX` → form pre-fill dari transaksi asli → submit ke `POST /api/transaksi/[id]/koreksi`.

### Upload Flow
- Client-side: FileUpload component → validasi tipe/ukuran → preview lokal (FileReader) → user klik "Upload" → resize via Canvas API (max 600px, JPEG 70%) → kirim JSON `{ transaksiId, buktiDataUrl }` ke API.
- Server-side: validasi data URL (harus `data:image/*`, max 50K chars) → simpan langsung di kolom `bukti_url` sheet transaksi.
- Tidak ada file terpisah — semua tersimpan inline di cell Google Sheets.

### Rekonsiliasi Result Display
- Hasil rekonsiliasi ditampilkan dalam 3 kartu berwarna: Saldo Sistem (biru), Saldo Bank (abu), Selisih (hijau jika 0, merah jika tidak).
- Status otomatis: `SESUAI` jika selisih = 0, `TIDAK_SESUAI` jika selisih ≠ 0.
- Riwayat rekonsiliasi per rekening ditampilkan dalam tabel di bawah form.

---

## File Baru Sprint 5

```
src/
  app/
    (dashboard)/
      rekonsiliasi/
        page.tsx                    # Halaman rekonsiliasi bank
      transaksi/
        [id]/
          page.tsx                  # Updated — tambah void/koreksi/upload buttons
        baru/
          page.tsx                  # Updated — support koreksi mode
    api/
      transaksi/
        [id]/
          void/
            route.ts                # POST void transaksi
          koreksi/
            route.ts                # POST koreksi transaksi
      upload/
        bukti/
          route.ts                  # POST upload bukti ke Google Drive
      rekonsiliasi/
        route.ts                    # GET list, POST create
  components/
    forms/
      void-modal.tsx                # Modal konfirmasi void
      upload-bukti.tsx              # Upload component dengan preview
      transaction-form.tsx          # Updated — koreksi mode + void original checkbox
    ui/
      file-upload.tsx               # Generic drag-and-drop file upload
      image-preview.tsx             # Thumbnail + lightbox viewer
    layout/
      sidebar.tsx                   # Updated — tambah link Rekonsiliasi
  hooks/
    use-rekonsiliasi.ts             # Hook untuk fetch data rekonsiliasi
  lib/
    validators.ts                   # Updated — tambah void, koreksi, rekonsiliasi schemas
```

---

## Known Issues / Tech Debt

1. **No client-side image compression** — Sprint plan menyebutkan `browser-image-compression` library, tapi belum diimplementasi. Saat ini validasi ukuran file max 1MB dilakukan tanpa compression. Untuk MVP ini cukup karena foto bukti biasanya kecil. Bisa ditambahkan di Sprint 6 jika dibutuhkan.
2. **No progress bar saat upload** — Upload bukti hanya menampilkan "Mengupload..." tanpa progress bar persentase. Karena max 1MB, upload biasanya cepat.
3. **Tidak ada validasi folder Google Drive** — Upload bukti tidak membuat folder `bukti/` secara otomatis di Drive. File diupload ke root Drive service account. Bisa ditambahkan folder management di Sprint 6.
4. **ImagePreview menggunakan external URL** — `<img>` tag langsung menggunakan Google Drive URL. Jika permissions Drive berubah, gambar tidak akan tampil. Tidak menggunakan Next.js `<Image>` component karena domain Google Drive perlu dikonfigurasi di `next.config.ts`.
5. **No tests** — Unit tests untuk void, koreksi, upload, dan rekonsiliasi API belum dibuat.
6. **rowToTransaksi duplicated** — Fungsi `rowToTransaksi()` diduplikasi di 3 file (transaksi route, void route, koreksi route). Bisa di-extract ke shared utility.
7. **Rekonsiliasi hitung saldo all-time** — Saldo sistem dihitung dari semua transaksi (tanpa filter tanggal). Ini benar untuk saldo aktual, tapi jika ingin rekonsiliasi per periode tertentu, perlu filter tambahan.
8. **No pagination untuk riwayat rekonsiliasi** — Semua riwayat ditampilkan sekaligus. Untuk masjid yang rutin rekonsiliasi setiap hari, tabel bisa panjang.

---

## Konteks untuk Sprint 6: TV Display, Settings & Polish

Sprint 6 akan mengimplementasi halaman publik (TV display), halaman pengaturan, upload logo, ganti PIN, UI polish, dan dokumentasi adopsi.

### Dependency dari Sprint 1-5

| File/Komponen | Dipakai untuk |
|---|---|
| `src/lib/google-sheets.ts` | `sheetsService.getRows()`, `getRowById()`, `updateRow()`, `appendRow()`, `batchGet()` — semua CRUD + batch operations |
| `src/lib/google-drive.ts` | Legacy — **tidak digunakan** untuk upload logo/bukti (diganti base64 data URL) |
| `src/lib/auth.ts` | `getSession()` untuk protected endpoints, `hashPin()` & `verifyPin()` untuk ganti PIN, `deleteSession()` untuk force re-login setelah ganti PIN |
| `src/lib/audit.ts` | `logAudit()` — untuk log ganti PIN, update profil, upload logo |
| `src/lib/constants.ts` | `SHEET_NAMES.MASTER` untuk update profil/PIN, `APP_CONFIG` untuk konfigurasi |
| `src/lib/utils.ts` | `formatRupiah()`, `formatTanggal()`, `nowISO()` — dipakai di halaman publik |
| `src/types/index.ts` | `Master`, `SessionData`, `ApiResponse<T>`, semua enums |
| `src/lib/validators.ts` | Pattern Zod schema untuk validasi ganti PIN, update profil |
| `src/app/api/dashboard/summary/route.ts` | Pattern & logic untuk API publik ringkasan (reuse penghitungan total masuk/keluar/saldo) |
| `src/app/api/dashboard/chart-data/route.ts` | Pattern untuk grafik publik (tren 6 bulan terakhir) |
| `src/app/api/upload/bukti/route.ts` | Pattern upload base64 data URL — reuse untuk upload logo |
| `src/components/ui/*` | Button, Card, Input, Modal, Loading, Badge, Table, SummaryCard, FileUpload, ImagePreview |
| `src/components/charts/*` | MonthlyTrendChart — bisa reuse/simplify untuk chart publik |
| `src/components/forms/upload-bukti.tsx` | Pattern upload component — referensi untuk upload logo |
| `src/components/layout/sidebar.tsx` | Perlu update untuk tampilkan logo, link Pengaturan sudah ada |
| `src/hooks/*` | Pattern hooks (useState, useCallback, fetch, error handling) untuk hook baru |
| `src/app/(dashboard)/rekonsiliasi/page.tsx` | Referensi pattern halaman dengan form + result + riwayat |
| `src/app/api/master/route.ts` | GET master data — dipakai untuk halaman pengaturan profil |
| `src/app/middleware.ts` | Perlu update agar `/publik/*` dan `/api/publik/*` tidak require auth |

### File baru yang dibutuhkan Sprint 6
- `src/app/publik/page.tsx` — Halaman publik (TV display, tanpa auth)
- `src/app/publik/layout.tsx` — Layout publik (tanpa sidebar)
- `src/app/(dashboard)/pengaturan/page.tsx` — Halaman pengaturan (tabs: profil, keamanan, anggota, data)
- `src/app/api/publik/ringkasan/route.ts` — GET ringkasan publik (tanpa auth)
- `src/app/api/auth/change-pin/route.ts` — POST ganti PIN
- `src/app/api/upload/logo/route.ts` — POST upload logo
- `src/components/publik/public-summary.tsx` — Komponen ringkasan publik
- `src/components/publik/public-chart.tsx` — Grafik sederhana untuk TV display

### Perhatian Khusus Sprint 6
- Halaman publik harus **di luar** group `(dashboard)` dan **tanpa middleware auth**.
- Upload logo reuse pattern dari upload bukti — validasi, Drive upload, simpan URL di sheet master.
- Ganti PIN harus destroy session dan force re-login.
- UI polish memerlukan review semua halaman existing — pastikan consistent spacing, responsive, empty/error states.

---

## Environment Variables

### Tidak ada env vars baru di Sprint 5

Semua fitur Sprint 5 menggunakan env vars existing. Google Drive credentials (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`) sudah dipakai sejak Sprint 0 — hanya sekarang aktif digunakan untuk upload bukti.

### Existing (Sprint 0-4)

```env
GOOGLE_SHEETS_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
NEXT_PUBLIC_APP_NAME=SKM
NEXT_PUBLIC_MASJID_NAME=
AUTH_SECRET=
PIN_SALT=
FONNTE_API_TOKEN=
FONNTE_MOCK=
```

---

## Post-Sprint UI/UX Updates (Sprint 7 — 6 April 2026)

Komponen yang dibuat di Sprint 5 dan diupdate di Sprint 7:
- **Rekonsiliasi page**: Form dibatasi max-w-2xl agar proporsional, tidak lagi full-width
- **Badge SESUAI/TIDAK_SESUAI**: Style diubah ke subtle/muted
- **Format Rupiah**: Saldo sistem/bank/selisih menggunakan spasi baru
