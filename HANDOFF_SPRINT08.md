# HANDOFF — Sprint 8: Mutasi Internal (Pemindahan Dana Antar Rekening)

**Tanggal**: 2026-04-07
**Sprint**: 8 — Mutasi Internal
**Branch**: `claude/add-mutasi-internal-O6F6g`
**Status**: Selesai

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Kolom baru `mutasi_ref` di sheet `transaksi` (kolom ke-16) | Done |
| 2 | Enum `TransaksiJenis.MUTASI` + field `mutasi_ref` di interface `Transaksi` | Done |
| 3 | Auto-create kategori "Mutasi Internal" (jenis `MUTASI`) saat mutasi pertama | Done |
| 4 | `POST /api/transaksi` extended: jenis=MUTASI buat 2 baris (KELUAR + MASUK) dengan `mutasi_ref` sama | Done |
| 5 | Validator baru `transaksiMutasiCreateSchema` (refine: dari ≠ ke) | Done |
| 6 | Form Transaksi: tab ketiga **Mutasi** dengan field Dari/Ke Rekening + kategori readonly | Done |
| 7 | Halaman Transaksi: badge `MUTASI` (slate), filter "Mutasi", exclude dari ringkasan Masuk/Keluar | Done |
| 8 | Detail Transaksi: tampilkan info "Mutasi dari X ke Y" + link pasangan | Done |
| 9 | PUT transaksi: mirror tanggal/deskripsi/jumlah ke baris pasangan jika `mutasi_ref` set | Done |
| 10 | Void transaksi: ikut void baris pasangan jika `mutasi_ref` set | Done |
| 11 | Exclude mutasi dari semua agregasi: `dashboard/summary`, `dashboard/cumulative`, `dashboard/chart-data`, `export/pdf`, `export/excel`, `publik/ringkasan` | Done |
| 12 | Saldo per Rekening tetap **include** mutasi (saldo akurat) | Done |
| 13 | Update PROJECT_BRIEF.md (changelog v2.3) | Done |
| 14 | Update API_REFERENCE.md (varian MUTASI di POST /api/transaksi) | Done |

---

## Keputusan Teknis

### 1. Data Model — Kolom Baru `mutasi_ref`

Ditambahkan **1 kolom** di sheet `transaksi` (kolom ke-16, setelah `updated_at`):

| Kolom | Isi |
|---|---|
| `mutasi_ref` | ID mutasi (`MUT-YYYYMMDD-NNNN`) untuk kedua baris pasangan; kosong untuk transaksi biasa |

**Mengapa kolom baru, bukan tabel terpisah?** Mempertahankan model row-per-transaksi yang sudah ada — semua agregasi tetap berjalan tanpa join, dan filter `!t.mutasi_ref` cukup untuk meng-exclude mutasi dari laporan pemasukan/pengeluaran.

### 2. 1 Mutasi = 2 Baris (Pair Pattern)

Setiap mutasi menghasilkan 2 baris transaksi:

| jenis | kategori | rekening | jumlah | mutasi_ref |
|-------|----------|----------|--------|------------|
| KELUAR | Mutasi Internal | rekening asal | 2.000.000 | `MUT-20260307-0001` |
| MASUK | Mutasi Internal | rekening tujuan | 2.000.000 | `MUT-20260307-0001` |

Kedua baris dibuat dalam **1 batch append** (`sheetsService.appendRows`) untuk menghindari race condition.

### 3. Auto-Create Kategori "Mutasi Internal"

Daripada memaksa user membuat kategori manual, POST handler otomatis:
1. Cari kategori dengan `jenis === 'MUTASI'` dan `nama === 'Mutasi Internal'`
2. Bila tidak ada, auto-create dengan ID format `KAT-YYYYMMDD-NNNN`
3. Gunakan ID tersebut untuk kedua baris mutasi

Kategori ini tidak muncul di dropdown form transaksi normal karena `useKategori(jenis)` di-filter berdasarkan jenis (MASUK/KELUAR), dan kategori MUTASI hanya muncul saat tab Mutasi aktif (di mana field kategori tidak ditampilkan dropdown — readonly).

### 4. Format `mutasi_ref` ID

`MUT-YYYYMMDD-NNNN` — generator inline membaca sheet `transaksi`, mencari max counter untuk prefix hari ini, lalu increment. Mirip pola `getNextId()` tapi tidak melalui helper karena prefix `MUT` tidak terdaftar di `ID_PREFIXES` (tidak punya sheet sendiri).

### 5. Edit Mutasi — Mirror Strategy

Saat user PUT salah satu baris mutasi, field berikut di-mirror ke baris pasangan:
- `tanggal`
- `deskripsi`
- `jumlah`

Field yang **tidak** di-mirror:
- `rekening_id` — by design berbeda (asal vs tujuan)
- `jenis` — by design KELUAR vs MASUK
- `kategori_id` — sama-sama "Mutasi Internal" (tidak boleh diubah)

Mirror dilakukan dengan membaca ulang sheet untuk menemukan baris pasangan via `mutasi_ref`. 1 PUT = max 2 update calls.

### 6. Void Mutasi — Pair Void

Saat user void salah satu baris mutasi, baris pasangan ikut di-void dengan `void_reason` yang sama. Audit log mencatat void per baris (tidak digabung) agar history tetap dapat dilacak.

### 7. Exclude vs Include — Aturan Penting

| Konteks | Mutasi |
|---|---|
| Total Pemasukan / Pengeluaran (Dashboard, Laporan, Export, Publik) | **Exclude** (`!t.mutasi_ref`) |
| Yearly trend, monthly trend, category breakdown | **Exclude** |
| Kelompok Anggaran (saldo per kelompok) | **Auto-exclude** (kategori Mutasi Internal tidak masuk kelompok manapun) |
| **Saldo per Rekening** (Dashboard summary `saldoPerRekening`, Publik `saldoTotal`) | **Include** — supaya saldo Bank turun dan Kas Tunai naik secara konsisten |
| Halaman Transaksi: ringkasan Masuk/Keluar/Saldo | **Exclude** |
| Halaman Transaksi: daftar baris | **Tampil** (dengan badge MUTASI) |
| Filter "Mutasi" di halaman Transaksi | **Hanya** baris dengan `mutasi_ref` |

### 8. Badge `MUTASI`

Badge variant baru di `src/components/ui/badge.tsx`:
```ts
MUTASI: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200'
```
Konsisten dengan design system subtle/muted yang sudah ada (Sprint 7). Warna slate dipilih agar netral, jelas berbeda dari emerald (MASUK) dan red (KELUAR).

Di halaman list, render badge dipilih berdasarkan `mutasi_ref`:
```tsx
{t.mutasi_ref ? <Badge label="MUTASI" /> : <Badge label={t.jenis} />}
```
Kolom Jumlah juga di-render dengan warna `text-slate-600` tanpa prefix +/− untuk baris mutasi (karena bukan masuk/keluar riil).

### 9. Backward Compatibility

Kolom `mutasi_ref` baru ditambahkan **di akhir** SHEET_HEADERS sehingga:
- Sheet existing tanpa kolom ke-16: row reads otomatis menghasilkan `mutasi_ref = ''` (filter `!t.mutasi_ref` jadi true → dianggap transaksi normal)
- Append baru selalu menulis 16 cell. Untuk row legacy yang di-update via PUT/Void, kolom ke-16 ikut ter-set.

`POST /api/transaksi/import` (CSV) juga di-update untuk menulis empty mutasi_ref di kolom ke-16.

---

## File Baru Sprint 8

- `HANDOFF_SPRINT08.md` (file ini)

## File yang Diubah Sprint 8

| File | Perubahan |
|---|---|
| `src/lib/constants.ts` | Tambah `mutasi_ref` di SHEET_HEADERS.transaksi (kolom 16) |
| `src/types/index.ts` | Tambah `MUTASI` ke `TransaksiJenis`, tambah `mutasi_ref` ke interface `Transaksi` |
| `src/lib/validators.ts` | Tambah `transaksiMutasiCreateSchema` dengan refine dari ≠ ke |
| `src/components/ui/badge.tsx` | Tambah variant `MUTASI` (slate) |
| `src/app/api/transaksi/route.ts` | POST handler branch jenis=MUTASI: auto-create kategori, generate `mutasi_ref`, append 2 baris dalam 1 batch |
| `src/app/api/transaksi/[id]/route.ts` | PUT handler mirror tanggal/deskripsi/jumlah ke pair row jika `mutasi_ref` set |
| `src/app/api/transaksi/[id]/void/route.ts` | Void handler ikut void pair row + tulis kolom 16 |
| `src/app/api/transaksi/[id]/koreksi/route.ts` | Tulis kolom 16 (empty) untuk row baru & voided original |
| `src/app/api/transaksi/import/route.ts` | Tulis kolom 16 (empty) untuk batch import |
| `src/app/api/dashboard/summary/route.ts` | Filter `!mutasi_ref` untuk total masuk/keluar; saldoPerRekening tetap include mutasi |
| `src/app/api/dashboard/cumulative/route.ts` | Filter `!mutasi_ref` |
| `src/app/api/dashboard/chart-data/route.ts` | Filter `!mutasi_ref` |
| `src/app/api/export/pdf/route.ts` | Filter `!mutasi_ref` |
| `src/app/api/export/excel/route.ts` | Filter `!mutasi_ref` |
| `src/app/api/publik/ringkasan/route.ts` | Pisah `aktifNonMutasi` (untuk total/trend/last10) vs `aktifTransaksi` (untuk saldo) |
| `src/components/forms/transaction-form.tsx` | Tab MUTASI ketiga + field dari/ke rekening + kategori readonly + payload mutasi |
| `src/app/(dashboard)/transaksi/page.tsx` | Filter "Mutasi", badge MUTASI, exclude mutasi dari ringkasan, kolom Jumlah neutral untuk mutasi |
| `src/app/(dashboard)/transaksi/[id]/page.tsx` | Tampilkan info "Mutasi dari X ke Y" + link pasangan |
| `docs/PROJECT_BRIEF.md` | Changelog v2.3 |
| `docs/API_REFERENCE.md` | Varian MUTASI di `POST /api/transaksi` + catatan PUT/Void |

---

## Yang Perlu Diperhatikan

1. **Sheet existing perlu manual add header `mutasi_ref` di kolom P** atau biarkan kosong — kode tetap bekerja karena `getRows` mengembalikan `''` untuk cell kosong.
2. **Kategori "Mutasi Internal"** tidak bisa di-edit/hapus dari UI Kategori (best-effort: user diharapkan tidak mengutak-atik). Jika dihapus, mutasi pertama berikutnya akan auto re-create dengan ID baru.
3. **Edit form mutasi belum disediakan UI khusus** — edit via halaman edit existing hanya merubah field non-rekening (tanggal, deskripsi, jumlah). Untuk mengganti rekening tujuan/asal, void mutasi lama lalu buat baru.
4. **Koreksi mutasi**: tidak didukung secara khusus — gunakan void + buat ulang.
