# Sprint 4: Reconciliation & Additional

**Durasi**: 2 minggu
**Tujuan**: Fitur rekonsiliasi bank, void/koreksi transaksi, dan upload bukti transaksi.

## Prasyarat

- Sprint 2 selesai (CRUD transaksi berfungsi)

## Deliverables

### 1. Void Transaksi

- [ ] `POST /api/transaksi/[id]/void`:
  - Validasi: transaksi harus berstatus `AKTIF`
  - Wajib: `reason` (alasan void)
  - Update fields: `status → VOID`, `void_reason`, `void_date`
  - Audit log: `VOID`
- [ ] UI: Tombol "Void" di detail transaksi
  - Modal konfirmasi dengan input alasan
  - Tampilkan warning: "Transaksi yang di-void tidak bisa di-undo"
  - Setelah void: refresh data, tampilkan badge VOID

### 2. Koreksi Transaksi

- [ ] `POST /api/transaksi/[id]/koreksi`:
  - Buat transaksi baru dengan `koreksi_dari_id` menunjuk ke transaksi asli
  - Transaksi asli tetap `AKTIF` (tidak di-void otomatis)
  - User bisa memilih untuk void transaksi asli secara terpisah
  - Audit log: `KOREKSI`
- [ ] UI: Tombol "Koreksi" di detail transaksi
  - Buka form transaksi baru, pre-fill data dari transaksi asli
  - Label "Koreksi dari: TRX-XXXX"
  - Option: void transaksi asli bersamaan

### 3. Upload Bukti Transaksi

- [ ] `POST /api/upload/bukti`:
  - Terima multipart/form-data (file + transaksi_id)
  - Validasi: file type (JPG, PNG), max size
  - Upload ke Google Drive folder `bukti/`
  - Set file permission: viewable by anyone with link
  - Update `bukti_url` di sheet transaksi
  - Audit log: `UPDATE`
- [ ] Client-side image compression:
  - Compress sebelum upload (target: max 1MB)
  - Library: browser-image-compression
  - Show progress indicator
- [ ] UI di form transaksi:
  - File input / kamera capture
  - Preview thumbnail sebelum upload
  - Progress bar saat upload
- [ ] UI di detail transaksi:
  - Thumbnail bukti (klik untuk full size)
  - Link download
  - Tombol ganti bukti

### 4. Rekonsiliasi Bank

- [ ] `GET /api/rekonsiliasi`:
  - List riwayat rekonsiliasi
  - Include data rekening (join manual)
- [ ] `POST /api/rekonsiliasi`:
  - Input: `rekening_id`, `tanggal`, `saldo_bank`
  - Hitung `saldo_sistem` dari sheet transaksi (saldo_awal + masuk - keluar)
  - Hitung `selisih` = saldo_bank - saldo_sistem
  - Set `status`: SESUAI (selisih = 0) atau TIDAK_SESUAI
  - Audit log: `CREATE`
- [ ] Halaman `app/(dashboard)/rekonsiliasi/page.tsx`:
  - Pilih rekening bank (dropdown)
  - Tampilkan saldo sistem saat ini
  - Input saldo bank aktual
  - Tombol "Rekonsiliasi"
  - Hasil: saldo sistem vs saldo bank, selisih, status
  - Riwayat rekonsiliasi per rekening (tabel)

### 5. Update Detail Transaksi

- [ ] Tambahkan ke halaman detail transaksi:
  - Tombol Void (baru)
  - Tombol Koreksi (baru)
  - Upload/ganti bukti (baru)
  - Riwayat koreksi (jika ada)
  - Link ke transaksi asli (jika ini adalah koreksi)

## File Baru

```
src/
  app/
    (dashboard)/
      rekonsiliasi/
        page.tsx                # Halaman rekonsiliasi
    api/
      transaksi/
        [id]/
          void/
            route.ts            # POST void
          koreksi/
            route.ts            # POST koreksi
      upload/
        bukti/
          route.ts              # POST upload bukti
      rekonsiliasi/
        route.ts                # GET list, POST create
  components/
    forms/
      void-modal.tsx            # Modal konfirmasi void
      upload-bukti.tsx          # Upload component dengan preview
    ui/
      file-upload.tsx           # Generic file upload component
      image-preview.tsx         # Image preview/lightbox
  hooks/
    use-rekonsiliasi.ts
```

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/api/transaksi/[id]/void` | Void transaksi |
| POST | `/api/transaksi/[id]/koreksi` | Koreksi transaksi |
| POST | `/api/upload/bukti` | Upload bukti |
| GET | `/api/rekonsiliasi` | List rekonsiliasi |
| POST | `/api/rekonsiliasi` | Create rekonsiliasi |

## Schema Changes

Tidak ada kolom baru — semua kolom sudah didefinisikan di `DATABASE_SCHEMA.md` sejak awal. Sprint ini hanya mengaktifkan fitur yang menggunakan kolom-kolom tersebut (`void_reason`, `void_date`, `koreksi_dari_id`, `bukti_url`, dan sheet `rekonsiliasi`).

## Testing

- [ ] Void: status berubah ke VOID, alasan tersimpan
- [ ] Void: transaksi yang sudah VOID tidak bisa di-void lagi
- [ ] Koreksi: transaksi baru terbuat dengan link ke asli
- [ ] Upload: file terupload ke Google Drive, URL tersimpan
- [ ] Upload: file > 4.5MB di-reject
- [ ] Upload: compression berfungsi di client
- [ ] Rekonsiliasi: saldo sistem terhitung benar
- [ ] Rekonsiliasi: selisih dan status ditampilkan
- [ ] Rekonsiliasi: riwayat tersimpan dan tampil

## Definition of Done

- [ ] Void transaksi berfungsi end-to-end
- [ ] Koreksi transaksi berfungsi end-to-end
- [ ] Upload bukti berfungsi (dengan compression)
- [ ] Bukti tampil di detail transaksi
- [ ] Rekonsiliasi bank berfungsi
- [ ] Riwayat rekonsiliasi tersimpan
- [ ] Semua operasi tercatat di audit log
- [ ] TypeScript: no errors
- [ ] Tests pass
- [ ] Build pass
