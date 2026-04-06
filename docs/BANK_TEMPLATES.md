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

### Pattern Rules

**MASUK (Kredit):**

| Pattern | Kategori | Status |
|---------|----------|--------|
| `PURCHASE QRIS ACQ` | Infaq Harian | Auto |
| `CDT TRF BENFC BIFAST` / `TRANSFER DARI` | Donasi | Auto |
| `INTERNAL TRANSFER` + `Ke 3200028199` | Donasi | Auto |
| keyword `karpet` / `waqaf` / `wakaf` | Donasi | Auto |
| keyword `zakat` | Zakat Mal | Auto |
| keyword `TPQ` | Infaq Harian | Auto |
| `SETOR TUNAI` | Infaq Harian (default) | Perlu Split |
| `ATMOFFUS` | Donasi | Auto |
| `FLIPTECH LENTERA INSPIRASI` | Donasi | Auto |

**KELUAR (Debit):**

| Pattern | Kategori | Status |
|---------|----------|--------|
| `DBT TRF CHARGE` / (`BIFAST` + 2500) | Biaya Admin Bank | Auto |
| `PAYROLL` / `TRANSAKSI PAYROLL BMI` | Honorarium Marbot/Petugas | Auto |
| `BMICMS01` | — | Review |
| `TRANSFER DARI...MUABIDJA...KE...IDJA` | — | Review |
| `A IMRON ROSADI` + `DBT TRF PRIMA` | — | Review |
| `A IMRON ROSADI` + `DBT TRF CHARGE` | Biaya Admin Bank | Auto |

### Nomor Rekening

Rekening Bank Muamalat di SKM: **3200028199**

---

## Interface Reference

```typescript
interface BankTemplate {
  bankId: string;
  bankName: string;
  headerRowsToSkip: number;
  rekeningId: string;
  parseRow: (row: string[]) => ParsedBankRow | null;
  categorize: (row: ParsedBankRow) => CategorizedRow;
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
}
```
