# Sprint 2: Core Transactions

**Durasi**: 2 minggu
**Tujuan**: Implementasi CRUD transaksi keuangan — fitur inti dari SKM.

## Prasyarat

- Sprint 1 selesai (auth, master data CRUD, layout, audit log)

## Deliverables

### 1. API Transaksi

- [ ] `GET /api/transaksi` — list transaksi
  - Query params: `tahun`, `bulan`
  - Return semua kolom dari sheet
  - Include meta (total count)
- [ ] `POST /api/transaksi` — buat transaksi baru
  - Validasi input (Zod)
  - Generate ID (`TRX-YYYYMMDD-XXXX`)
  - Set `status: AKTIF`, `created_at`, `updated_at`
  - Audit log: `CREATE`
- [ ] `GET /api/transaksi/[id]` — detail transaksi
- [ ] `PUT /api/transaksi/[id]` — update transaksi
  - Hanya jika status `AKTIF`
  - Audit log: `UPDATE`
- [ ] Zod schemas untuk create dan update

### 2. Halaman Daftar Transaksi

- [ ] `app/(dashboard)/transaksi/page.tsx`:
  - Tabel transaksi dengan kolom: tanggal, jenis, kategori, deskripsi, jumlah, status
  - Badge warna untuk jenis (hijau=MASUK, merah=KELUAR) dan status (AKTIF, VOID)
  - Filter:
    - Jenis: MASUK / KELUAR / Semua
    - Status: AKTIF / VOID / Semua
    - Kategori: dropdown dari daftar kategori
    - Rentang tanggal: dari - sampai
  - Sorting: tanggal (default desc), jumlah
  - Pagination: client-side, 20 items per page
  - Total di footer tabel (total masuk, total keluar, saldo)
  - Tombol "Tambah Transaksi" → navigasi ke form

### 3. Form Transaksi

- [ ] `app/(dashboard)/transaksi/baru/page.tsx`:
  - Input fields:
    - Tanggal (date picker, default hari ini)
    - Jenis (radio: MASUK / KELUAR)
    - Kategori (dropdown, filtered by jenis)
    - Deskripsi (text input)
    - Jumlah (number input, format Rupiah)
    - Rekening (dropdown dari daftar rekening aktif)
  - Validasi client-side (Zod)
  - Submit → POST /api/transaksi
  - Redirect ke daftar transaksi setelah berhasil
  - Loading state saat submit
  - Toast notification sukses/error

### 4. Detail Transaksi

- [ ] `app/(dashboard)/transaksi/[id]/page.tsx`:
  - Tampilkan semua field transaksi
  - Jika ada bukti: tampilkan thumbnail
  - Jika VOID: tampilkan alasan dan tanggal void
  - Jika koreksi: tampilkan link ke transaksi asli
  - Tombol Edit (jika AKTIF)
  - Tombol Void (jika AKTIF) → Sprint 4
  - Tombol Koreksi → Sprint 4
  - Riwayat audit log untuk transaksi ini

### 5. SWR Hooks

- [ ] `hooks/use-transaksi.ts`:
  - `useTransaksi()`: fetch daftar transaksi
  - `useTransaksiDetail(id)`: fetch detail transaksi
  - `useCreateTransaksi()`: mutate function untuk create
  - `useUpdateTransaksi()`: mutate function untuk update
  - Revalidation setelah create/update
- [ ] `hooks/use-kategori.ts`:
  - `useKategori()`: fetch daftar kategori (reuse dari Sprint 1)
- [ ] `hooks/use-rekening.ts`:
  - `useRekening()`: fetch daftar rekening (reuse dari Sprint 1)

### 6. Helper Functions

- [ ] `lib/utils.ts` — tambahkan:
  - `parseRupiah(input: string): number`: parse input Rupiah ke integer
  - `filterTransaksi(transactions, filters)`: filter transaksi di client
  - `sortTransaksi(transactions, sortBy, order)`: sort transaksi
  - `paginateData(data, page, limit)`: pagination helper

## File Baru

```
src/
  app/
    (dashboard)/
      transaksi/
        page.tsx                # Daftar transaksi
        baru/
          page.tsx              # Form tambah transaksi
        [id]/
          page.tsx              # Detail transaksi
          edit/
            page.tsx            # Form edit transaksi
    api/
      transaksi/
        route.ts                # GET (list), POST (create)
        [id]/
          route.ts              # GET (detail), PUT (update)
  components/
    forms/
      transaction-form.tsx      # Reusable transaction form (create & edit)
  hooks/
    use-transaksi.ts
    use-kategori.ts
    use-rekening.ts
```

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/api/transaksi` | List transaksi |
| POST | `/api/transaksi` | Create transaksi |
| GET | `/api/transaksi/[id]` | Detail transaksi |
| PUT | `/api/transaksi/[id]` | Update transaksi |

## Testing

- [ ] Create transaksi: masuk dan keluar
- [ ] List transaksi: data tampil di tabel
- [ ] Filter: jenis, status, kategori, tanggal berfungsi
- [ ] Pagination: halaman 1, 2, dst berfungsi
- [ ] Form validation: field wajib, jumlah > 0
- [ ] Edit transaksi: data terisi, update berhasil
- [ ] Detail transaksi: semua field tampil
- [ ] Audit log: create dan update tercatat
- [ ] SWR: data ter-refresh setelah mutasi

## Definition of Done

- [ ] Bendahara bisa mencatat pemasukan dan pengeluaran
- [ ] Daftar transaksi bisa di-filter dan di-sort
- [ ] Detail transaksi menampilkan semua informasi
- [ ] Edit transaksi berfungsi (hanya status AKTIF)
- [ ] Semua operasi tercatat di audit log
- [ ] UI responsive (desktop & mobile)
- [ ] TypeScript: no errors
- [ ] Tests pass
- [ ] Build pass
