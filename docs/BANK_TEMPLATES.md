# Bank Templates — Panduan Tambah Template Bank Baru

## Overview

SKM mendukung import transaksi dari CSV rekening koran bank. Setiap bank memiliki format CSV yang berbeda, sehingga dibutuhkan **template** untuk masing-masing bank.

Arsitektur template berada di `src/lib/bank-templates/`:

```
src/lib/bank-templates/
  types.ts          # Interface & type definitions
  index.ts          # Registry (daftar semua template)
  muamalat.ts       # Template Bank Muamalat
  bsi.ts            # (contoh) Template BSI
```

---

## Cara Menambah Template Bank Baru

### 1. Buat file template

Buat file baru `src/lib/bank-templates/<nama-bank>.ts`:

```typescript
import { TransaksiJenis } from '@/types';
import type { BankTemplate, ParsedBankRow, CategorizedRow } from './types';

export const namaTemplate: BankTemplate = {
  bankId: 'nama-bank',           // ID unik (lowercase, no spaces)
  bankName: 'Nama Bank',         // Nama tampilan di UI
  headerRowsToSkip: 1,           // Jumlah baris header CSV yang di-skip
  rekeningId: '',                // Diisi saat runtime dari data SKM

  // Keywords yang akan di-highlight di kolom Keterangan
  highlightKeywords: {
    masuk: ['QRIS', 'TRANSFER MASUK', 'SETOR'],
    keluar: ['BIAYA ADMIN', 'TRANSFER KELUAR'],
  },

  // (Opsional) saran teks untuk transaksi berstatus 'review'
  getReviewSuggestion(row) {
    if (/CMS/i.test(row.keterangan)) return 'Transfer CMS — perlu verifikasi';
    return 'Tidak cocok pattern otomatis — pilih kategori manual';
  },

  parseRow(row: string[]): ParsedBankRow | null {
    // Map kolom CSV ke format standar
    // Return null untuk baris yang harus di-skip
    return {
      tanggal: '2026-01-01',     // Format: YYYY-MM-DD
      keterangan: row[1],
      debit: parseFloat(row[2]) || 0,
      kredit: parseFloat(row[3]) || 0,
      saldo: parseFloat(row[4]) || 0,
      referensi: row[0],
    };
  },

  categorize(row: ParsedBankRow): CategorizedRow {
    // Terapkan pattern rules untuk auto-kategorisasi
    const isKredit = row.kredit > 0;
    const jenis = isKredit ? TransaksiJenis.MASUK : TransaksiJenis.KELUAR;
    const jumlah = isKredit ? row.kredit : row.debit;

    // ... pattern matching logic ...

    return {
      tanggal: row.tanggal,
      keterangan: row.keterangan,
      jumlah,
      jenis,
      kategori_id: '',           // Kosong = perlu review manual
      status: 'review',
      kategoriLabel: '',
      reviewSuggestion: this.getReviewSuggestion?.(row) ?? undefined,
    };
  },
};
```

### 2. Daftarkan di index.ts

Edit `src/lib/bank-templates/index.ts`:

```typescript
import { namaTemplate } from './nama-bank';

const templates: Record<string, BankTemplate> = {
  muamalat: muamalatTemplate,
  'nama-bank': namaTemplate,    // Tambahkan di sini
};
```

### 3. Selesai

Template baru akan otomatis muncul di dropdown "Pilih Bank" pada halaman Import CSV.

---

## Referensi: Template Bank Muamalat

### Format CSV

- **Header rows**: 8 (di-skip saat parsing)
- **Separator**: Comma (`,`)
- **Kolom**:

| Index | Kolom | Contoh |
|-------|-------|--------|
| 0 | Nomor Referensi | `REF001` |
| 1 | Tgl Transaksi | `28/03/2026` |
| 2 | Tgl Efektif | `28/03/2026` |
| 3 | Debit | `2,500` |
| 4 | Kredit | `1,500,000` |
| 5 | Saldo | `10,000,000` |
| 6 | Keterangan | `PURCHASE QRIS ACQ ...` |

### Kategori Tujuan

Pattern rules Bank Muamalat menggunakan **nama kategori** (bukan ID) dan
di-resolve ke ID di runtime via `resolveKategori(nama, jenis)`. Kategori
berikut harus ada di sheet `kategori` (dengan nama persis sama) agar
auto-mapping bekerja:

**MASUK:** `Infaq & Sedekah`, `Infaq Jumat`, `Infaq Ramadhan`, `Zakat Mal`,
`Donasi & Wakaf Pembangunan` (baru), `Donasi Sosial`, `Lain-lain Masuk`

**KELUAR:** `Honorarium Pemateri Kajian`, `Honorarium Marbot/Petugas`,
`Honorarium Imam/Khatib`, `Kegiatan Ramadhan`, `Kegiatan Sosial`,
`Operasional Masjid`, `Perbaikan/Renovasi`, `Kebersihan`,
`Pengadaan Aset` (baru), `ATK & Perlengkapan`, `Listrik & Air`,
`Konsumsi`, `Pengeluaran Zakat` (baru), `Biaya Admin Bank`

Jika kategori belum ada, baris terkait akan di-downgrade ke status `review`
dengan suggestion `Kategori "X" belum ada di sheet — buat dulu di halaman Kategori`.

### Pattern Rules

**MASUK (Kredit) — first-match-wins:**

| Pattern | Kategori | Status |
|---------|----------|--------|
| `PURCHASE QRIS ACQ` / `MERCHANT QRIS` | Infaq & Sedekah | Auto |
| `SETORAN INFAQ` + `TARAWIH` | Infaq Ramadhan | Auto |
| `SETORAN` + `ZAKAT MAL` | Infaq Ramadhan | Review (setoran campuran) |
| `SETORAN INFAQ PER PEKAN` (no tarawih/ramadhan/zakat) | Infaq Jumat | Auto |
| `SETOR TUNAI` + `KARPET`/`WAKAF`/`WAQAF` | Donasi & Wakaf Pembangunan | Auto |
| `SETOR TUNAI` + `ZAKAT` | Zakat Mal | Auto |
| `SETOR TUNAI` (fallback) | Donasi Sosial | Review |
| `CDT TRF BENFC BIFAST/BERSAMA` + `KARPET`/`WAKAF`/`WAQAF` | Donasi & Wakaf Pembangunan | Auto |
| `CDT TRF BENFC BIFAST/BERSAMA` (umum) | Infaq & Sedekah | Auto |
| `INTERNAL TRANSFER MOBILE BANKING` + `KARPET`/`WAKAF`/`WAQAF` | Donasi & Wakaf Pembangunan | Auto |
| `INTERNAL TRANSFER MOBILE BANKING` + `ZAKAT` | Zakat Mal | Auto |
| `INTERNAL TRANSFER MOBILE BANKING` + `TPQ`/`Fatih` | Lain-lain Masuk | Auto |
| `INTERNAL TRANSFER MOBILE BANKING` + `Infaq`/`Infak` | Infaq & Sedekah | Auto |
| `INTERNAL TRANSFER MOBILE BANKING` (umum) | Infaq & Sedekah | Review |
| `FLIPTECH` + `TPQ` | Lain-lain Masuk | Auto |
| `FLIPTECH` + `zakat` | Zakat Mal | Auto |

**KELUAR (Debit) — first-match-wins:**

| Pattern | Kategori | Status |
|---------|----------|--------|
| `Hadiah Kajian Taraweh MAJ` | Kegiatan Ramadhan | Auto |
| `Hadiah Kajian MAJ` (tanpa Taraweh) | Honorarium Pemateri Kajian | Auto |
| `Honor Cash Ustadz Tabligh Akbar` | Honorarium Pemateri Kajian | Auto |
| `MAJ THR` / `THR Mushrif` / `THR Mukafaah` | Honorarium Marbot/Petugas | Auto |
| `MAJ Honor Mushrif` | Honorarium Marbot/Petugas | Auto |
| `MAJ Mukafaah` | Honorarium Imam/Khatib | Auto |
| `MAJ Honor [bulan]` (exclude Mushrif/Mukafaah/THR) | Honorarium Marbot/Petugas | Auto |
| `MAJ Biaya Perawatan Santri` | Kegiatan Sosial | Auto |
| `Fee Payroll` / `CMS BIAYA PAYROLL` | Biaya Admin Bank | Auto |
| `BULK TXN CMS FILE payrollMAJ` | Honorarium Marbot/Petugas | Auto |
| `Biaya Adm Pengajian Ibu-Ibu MAJ` | Operasional Masjid | Auto |
| `HONOR GURU TPQ` | Honorarium Marbot/Petugas | Auto |
| `Honor Bantuan Operasional Ramadhan` | Kegiatan Ramadhan | Auto |
| `Perbaikan` / `Pemindahan` / `Lampu Injeksi/Dinding` | Perbaikan/Renovasi | Auto |
| `Pasang Kabel` / `Lampu area` / `kontak Lampu` / `Ganti Lampu` | Perbaikan/Renovasi | Auto |
| `Pengecatan` | Perbaikan/Renovasi | Auto |
| `Biaya buat pagar` | Perbaikan/Renovasi | Auto |
| `Service AC` / `Perbaikan AC` | Perbaikan/Renovasi | Auto |
| `Tebang Pohon` | Kebersihan | Auto |
| `Pembelian CCTV` / `CCTV Kabel` / `Peralatan Digital` / `Beli 2 Unit TV` / `Bracket` | Pengadaan Aset | Auto |
| `Jasa Pasang CCTV` / `Pasang CCTV` (tanpa Pembelian/Kabel) | Operasional Masjid | Auto |
| `Beli Dispenser` | ATK & Perlengkapan | Auto |
| `Karpet` / `Alas Lantai` | Pengadaan Aset | Auto |
| `Beli Voucher Listrik` | Listrik & Air | Auto |
| `Rak Buku` / `Beli keset` | ATK & Perlengkapan | Auto |
| `Tenda dan Paket Ambulan` / `Tenda` | Kegiatan Sosial | Auto |
| `Santunan Anak Yatim` / `SANTUNAN` | Kegiatan Sosial | Auto |
| `Pembagian Zakat Fitrah` / `PEMBAGIAN ZAKAT` | Pengeluaran Zakat | Auto |
| `Konsumsi Itikaf Ramadhan` | Kegiatan Ramadhan | Auto |
| `Konsumsi Tabligh Akbar` | Konsumsi | Auto |
| `KEPERLUAN MAJ` | Operasional Masjid | Auto |
| `DBT TRF CHARGE BERSAMA` / `CHARGE DBT TRF BIFAST` / `DBT TRF CHARGE PRIMA` / `DBT TRF CHARGE` / (`BIFAST` + 2500) | Biaya Admin Bank | Auto |
| `INTERNAL TRANSFER CMS` | — | Review |

### Priority Order — SETOR TUNAI & INTERNAL TRANSFER

Beberapa prefix (SETOR TUNAI, CDT TRF BENFC, INTERNAL TRANSFER MOBILE
BANKING) punya banyak kemungkinan kategori. Pattern di-cek berurutan
(specific → generic) dengan prioritas keyword:

**SETOR TUNAI:**
1. `KARPET` / `WAKAF` / `WAQAF` → Donasi & Wakaf Pembangunan
2. `ZAKAT` → Zakat Mal
3. fallback → Donasi Sosial (review)

**INTERNAL TRANSFER MOBILE BANKING:**
1. `KARPET` / `WAKAF` / `WAQAF` → Donasi & Wakaf Pembangunan
2. `ZAKAT` → Zakat Mal
3. `TPQ` / `Fatih` → Lain-lain Masuk
4. `Infaq` / `Infak` → Infaq & Sedekah
5. fallback → Infaq & Sedekah (review)

**CDT TRF BENFC (BIFAST/BERSAMA):**
1. `KARPET` / `WAKAF` / `WAQAF` → Donasi & Wakaf Pembangunan
2. fallback → Infaq & Sedekah

### Nomor Rekening

Rekening Bank Muamalat di SKM: **3200028199**

### Highlight Keywords (Bank Muamalat)

Keyword berikut di-highlight di kolom Keterangan tabel preview Import CSV untuk membantu user memahami alasan auto-categorize:

**MASUK**: `PURCHASE QRIS ACQ`, `MERCHANT QRIS`, `SETORAN INFAQ`, `SETORAN INFAK`, `PER PEKAN`, `PERPEKAN`, `TARAWIH`, `RAMADHAN`, `ZAKAT MAL`, `PEMBANGUNAN`, `SETOR TUNAI`, `CDT TRF BENFC BIFAST`, `CDT TRF BENFC BERSAMA`, `INTERNAL TRANSFER MOBILE BANKING`, `FLIPTECH LENTERA`, `FLIPTECH`, `karpet`/`KARPET`, `wakaf`/`WAKAF`, `waqaf`/`WAQAF`, `zakat`/`ZAKAT`, `TPQ`, `Fatih`, `Infaq`, `Infak`

**KELUAR**: `Hadiah Kajian Taraweh MAJ`, `Hadiah Kajian MAJ`, `Honor Cash Ustadz Tabligh Akbar`, `MAJ Honor Mushrif`, `MAJ Honor`, `MAJ Mukafaah`, `MAJ THR`, `THR Mushrif`/`THR Mukafaah`, `HONOR GURU TPQ`, `Honor Bantuan Operasional Ramadhan`, `MAJ Biaya Perawatan Santri`, `Santunan Anak Yatim`/`SANTUNAN`, `Tenda dan Paket Ambulan`/`Tenda`, `BULK TXN CMS FILE`, `payrollMAJ`, `Fee Payroll`, `CMS BIAYA PAYROLL`, `Perbaikan`, `Pemindahan`, `Pengecatan`, `Lampu Injeksi`/`Lampu Dinding`, `Pasang Kabel`, `Ganti Lampu`, `Biaya buat pagar`, `Service AC`/`Perbaikan AC`, `Tebang Pohon`, `Pembelian CCTV`, `CCTV Kabel`, `Jasa Pasang CCTV`/`Pasang CCTV`, `Peralatan Digital`, `Beli 2 Unit TV`, `Bracket`, `Beli Dispenser`, `DP Karpet`/`Pelunasan Karpet`/`Setup Karpet`, `Karpet`, `Alas Lantai`, `Rak Buku`, `Beli keset`, `Beli Voucher Listrik`, `Pembagian Zakat Fitrah`/`PEMBAGIAN ZAKAT`, `Konsumsi Itikaf Ramadhan`, `Konsumsi Tabligh Akbar`, `KEPERLUAN MAJ`, `Biaya Adm Pengajian Ibu-Ibu MAJ`, `DBT TRF CHARGE BERSAMA`/`PRIMA`, `CHARGE DBT TRF BIFAST`, `DBT TRF CHARGE`, `BIFAST`, `INTERNAL TRANSFER CMS`

### Review Suggestions (Bank Muamalat)

Untuk transaksi berstatus `review`, ada dua sumber suggestion:

1. **Per-rule suggestion** (prioritas): rule di `masukRules`/`keluarRules` yang
   statusnya `review` punya field `reviewSuggestion` sendiri. Contoh:
   - `SETORAN` + `ZAKAT MAL` → "Setoran campuran — pertimbangkan split manual"
   - `SETOR TUNAI` fallback → "Setor tunai atas nama — verifikasi tujuan donasi"
   - `INTERNAL TRANSFER MOBILE BANKING` (umum) → "Transfer internal — verifikasi jenis penerimaan"
   - `INTERNAL TRANSFER CMS` (keluar) → "Transfer CMS keluar — pilih kategori sesuai tujuan"
2. **Kategori belum di-seed**: jika rule punya `kategoriName` tapi kategori
   tersebut belum ada di sheet, baris di-downgrade ke review dengan suggestion
   `Kategori "X" belum ada di sheet — buat dulu di halaman Kategori`.
3. **Fallback** (`getReviewSuggestion()`): dipakai ketika row tidak match rule
   manapun. Pola: `BMICMS01`, `A IMRON ROSADI`, `BIFAST` (keluar), dan default
   "Tidak cocok pattern otomatis — pilih kategori manual".

Suggestion text ditampilkan sebagai teks kecil abu-abu di bawah keterangan pada baris dengan status `review`.

---

## Interface Reference

```typescript
type KategoriResolver = (nama: string, jenis: TransaksiJenis) => string;

interface BankTemplate {
  bankId: string;
  bankName: string;
  headerRowsToSkip: number;
  rekeningId: string;
  parseRow: (row: string[]) => ParsedBankRow | null;
  /**
   * `resolveKategori` dipakai untuk menukar nama kategori di rule
   * menjadi ID real dari sheet `kategori`. Optional — kalau tidak
   * di-pass, semua baris akan berstatus review.
   */
  categorize: (row: ParsedBankRow, resolveKategori?: KategoriResolver) => CategorizedRow;
  /**
   * Keywords untuk highlight di kolom Keterangan, dipisah per jenis.
   * UI akan wrap setiap match dengan <mark> styled element.
   */
  highlightKeywords: {
    masuk: string[];
    keluar: string[];
  };
  /**
   * Hasilkan teks saran (kenapa perlu review). Dipanggil oleh categorize()
   * untuk row dengan status='review'. Optional.
   */
  getReviewSuggestion?: (row: ParsedBankRow) => string | null;
}

interface ParsedBankRow {
  tanggal: string;    // YYYY-MM-DD
  keterangan: string;
  debit: number;
  kredit: number;
  saldo: number;
  referensi: string;
}

type ImportStatus = 'auto' | 'review' | 'split';

interface CategorizedRow {
  tanggal: string;
  keterangan: string;
  jumlah: number;
  jenis: TransaksiJenis;
  kategori_id: string;
  status: ImportStatus;
  kategoriLabel: string;
  /** Saran teks (hanya terisi untuk status='review') */
  reviewSuggestion?: string;
}
```
