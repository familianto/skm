# HANDOFF — Thousand Separator untuk Input Nominal

**Tanggal**: 2026-05-05
**Branch**: `claude/currency-input-separator-AYnG2`
**Status**: Selesai

---

## Ringkasan

Form input nominal Rupiah sekarang menampilkan thousand separator titik
(format Indonesia, mis. `9876543` → `9.876.543`) lewat satu component
reusable `CurrencyInput`. Raw integer tetap dipakai di state dan API.

---

## Scope

| Menu | Field |
|---|---|
| Rekonsiliasi | Saldo Bank Aktual (Rp) |
| Rekening — Tambah | Saldo Awal (Rp) |
| Rekening — Edit | Saldo Awal (Rp) |
| Donatur — Tambah | Komitmen Donasi/Bulan (Rp) |
| Donatur — Edit | Komitmen Donasi/Bulan (Rp) |

**Out of scope** (akan dilakukan di sprint terpisah): Transaksi form input
nominal, Kategori, CSV Import preview.

---

## File Baru

| File | Deskripsi |
|---|---|
| `src/components/ui/currency-input.tsx` | Reusable component `CurrencyInput` |

## File Dimodifikasi

| File | Perubahan |
|---|---|
| `src/app/(dashboard)/rekonsiliasi/page.tsx` | `saldoBank` → `number \| null`, pakai `CurrencyInput` |
| `src/app/(dashboard)/rekening/page.tsx` | `form.saldo_awal` → `number \| null`, pakai `CurrencyInput`, kirim `?? 0` ke API |
| `src/app/(dashboard)/donatur/page.tsx` | `form.jumlah_komitmen` → `number \| null`, pakai `CurrencyInput`, kirim `?? 0` ke API |
| `docs/PROJECT_BRIEF.md` | Tambahkan deskripsi `CurrencyInput` di Komponen UI + changelog v2.4.1 |

---

## CurrencyInput — Spec Singkat

**Path**: `src/components/ui/currency-input.tsx`

**Props**:

```ts
interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label?: string;
  error?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}
```

**Behavior**:

- Display: `value.toLocaleString('id-ID')` (titik sebagai thousand separator)
- `inputMode="numeric"` (mobile-friendly) dengan `type="text"` (supaya browser tidak strip titik)
- Karakter non-digit otomatis di-strip
- Paste `Rp 1.000.000` / `1,000,000` / `1000000` semua jadi `1000000`
- Empty input → `onChange(null)`
- `useEffect` sync ketika prop `value` berubah dari parent (mis. saat Edit modal pre-fill)
- Forward `ref`, label, error styling konsisten dengan `Input` component

---

## Catatan Teknis

- **API contract tidak berubah** — backend tetap menerima/mengirim integer
- **Default 0**: untuk Rekening dan Donatur, form yang sebelumnya pakai `saldo_awal: 0` / `jumlah_komitmen: 0` sekarang pakai `null`. Submit handler mengkonversi `?? 0` agar match Zod schema (`int().min(0)`)
- **Locale**: hardcoded `'id-ID'`, sesuai konvensi project (semua nominal Rupiah)
- **No decimals**: semua nominal SKM integer, component tidak support decimal

---

## Verifikasi

- ✅ `npm run type-check` — pass
- ✅ `npm run lint` — pass
- ✅ `npm run build` — success

Manual testing menunggu deploy ke Vercel preview (lihat checklist di task brief).

---

## Future

Component `CurrencyInput` siap dipakai untuk form lain yang butuh nominal
Rupiah (Transaksi, Kategori budget, dll). Tinggal import dari
`@/components/ui/currency-input`.
