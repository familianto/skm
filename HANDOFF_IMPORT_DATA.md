# HANDOFF — Fitur CSV Import Rekening Koran

**Tanggal**: 2026-04-06
**Branch**: `claude/csv-import-bank-muamalat-2LcQx`
**Status**: Selesai

---

## Agenda

| # | Item | Status |
|---|---|---|
| 1 | Fitur CSV Import di SKM | Done |
| 2 | Bank template: Bank Muamalat | Done |
| 3 | Auto-kategorisasi dengan pattern rules | Done |
| 4 | Split handler untuk Setor Tunai | Done |
| 5 | Batch import API endpoint | Done |
| 6 | Duplikat detection | Done |
| 7 | Dokumentasi bank template guide | Done |
| 8 | Filter tanggal (date range) di preview | Done |

---

## Keputusan Teknis

### Arsitektur Bank Template
- Template disimpan di `src/lib/bank-templates/` sebagai modul TypeScript terpisah per bank.
- Interface `BankTemplate` mendefinisikan kontrak: `parseRow()` untuk parsing CSV dan `categorize()` untuk auto-kategorisasi.
- Registry di `index.ts` — menambah bank baru cukup buat file template + daftarkan.
- Dokumentasi cara tambah bank baru: `docs/BANK_TEMPLATES.md`.

### CSV Parsing
- Menggunakan **papaparse** (client-side) untuk parsing CSV di browser.
- Tidak ada upload ke server — file di-parse langsung di client.
- Header rows di-skip berdasarkan konfigurasi template (Bank Muamalat: 8 baris).

### Auto-Kategorisasi
- Pattern rules didefinisikan sebagai array ordered (first match wins).
- Setiap rule berisi: `match()` function, `kategori_id`, `kategoriLabel`, dan `status`.
- Status: `auto` (matched), `review` (perlu manual), `split` (perlu dipecah).
- Transaksi yang tidak cocok pattern apapun → status `review`, kategori kosong.

### Pattern Rules Bank Muamalat
Implementasi lengkap di `src/lib/bank-templates/muamalat.ts`:
- **9 rules MASUK**: QRIS, BIFAST transfer, Internal Transfer, keyword match (karpet/wakaf/zakat/TPQ), SETOR TUNAI (split), ATMOFFUS, Fliptech.
- **6 rules KELUAR**: DBT TRF CHARGE, BIFAST fee (2500), PAYROLL, BMICMS01 (review), BiFast out (review), specific name patterns.
- Khusus rule `A IMRON ROSADI` dibedakan: `DBT TRF CHARGE` → Biaya Admin (auto), `DBT TRF PRIMA` → Review.

### Split Handler
- Untuk transaksi `SETOR TUNAI`, user bisa klik "+ Split" untuk pecah 1 baris jadi beberapa sub-baris.
- Setiap sub-baris punya kategori dan jumlah sendiri.
- Validasi: total split harus sama dengan jumlah original (ditampilkan real-time).
- Saat import, setiap split jadi transaksi terpisah dengan deskripsi `[Split: NamaKategori]`.

### Filter Tanggal (Date Range)
- 2 input date: "Dari Tanggal" dan "Sampai Tanggal", diletakkan antara ringkasan dan tabel preview.
- Default: seluruh rentang data CSV (tanggal terkecil s.d. terbesar).
- Filter hanya mengubah tampilan preview dan data yang akan diimport, tidak mengubah data CSV yang sudah di-parse.
- Ringkasan (Total, Auto-mapped, Review, Split, Duplikat) ikut berubah sesuai filter.
- Tombol konfirmasi menampilkan jumlah transaksi yang terfilter.
- Use case: CSV berisi Jan–Mar, tapi Jan–Feb sudah diimport sebelumnya — user bisa filter hanya Maret.

### Duplikat Detection
- Client-side check: tanggal + jumlah + keterangan dibandingkan dengan transaksi existing.
- Ditampilkan sebagai badge "Duplikat" di preview tabel (warna merah).
- **Tidak di-block** — user tetap bisa import (warning only).

### Batch Import API
- `POST /api/transaksi/import` — menerima array 1-500 items.
- Setiap item di-validate dengan Zod schema.
- Insert satu per satu (sequential) karena Google Sheets API tidak support true batch append.
- Audit log: satu entry `BATCH_IMPORT` dengan daftar semua ID yang dibuat.

### Rekening Resolution
- Rekening Bank Muamalat (nomor: 3200028199) di-resolve otomatis dari data rekening SKM.
- Match by `nomor_rekening` atau `nama_bank` yang mengandung "muamalat".

---

## File Baru

```
src/
  lib/
    bank-templates/
      types.ts                  # Interface BankTemplate, ParsedBankRow, CategorizedRow, dll
      index.ts                  # Registry & getAvailableBanks()
      muamalat.ts               # Template Bank Muamalat (parse + 15 pattern rules)
  app/
    (dashboard)/
      import/
        page.tsx                # Halaman Import CSV (upload, preview, split, confirm)
    api/
      transaksi/
        import/
          route.ts              # POST batch import endpoint
docs/
  BANK_TEMPLATES.md             # Panduan tambah template bank baru
```

## File Diubah

```
src/components/layout/sidebar.tsx   # + link "Import CSV"
docs/PROJECT_BRIEF.md               # + section 5.8 Import CSV
docs/API_REFERENCE.md               # + POST /api/transaksi/import
```

---

## Known Issues / Tech Debt

1. **Sequential insert** — Batch import insert satu per satu ke Google Sheets. Untuk 100+ transaksi bisa lambat. Bisa dioptimasi dengan `batchUpdate` API nanti.
2. **Kategori ID hardcoded** — Pattern rules menggunakan ID kategori spesifik (misal `KAT-20260406-0002`). Jika ID berbeda di environment lain, rules tidak akan match. Solusi: lookup by nama kategori saat import.
3. **Hanya Bank Muamalat** — Template bank lain (BSI, BRI, Mandiri) belum ada. Arsitektur sudah extensible.
4. **Duplikat check basic** — Hanya cek tanggal + jumlah + keterangan. Bisa false positive jika ada transaksi berbeda dengan kombinasi yang sama.
5. **No undo** — Setelah import, tidak ada fitur batch undo. Harus void satu per satu.

---

## UI/UX Updates (Sprint 7 — 6 April 2026)

- Kolom Aksi di tabel preview diubah ke `text-center` untuk konsistensi
- Badge status (Auto, Review, Perlu Split, Duplikat) menggunakan style subtle/muted baru
- Format Rupiah sekarang menggunakan spasi: "Rp 1.234.567"
