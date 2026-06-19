# SKM untuk Adopter — Overview & Indeks

Panduan untuk **masjid yang ingin memasang & memakai SKM** (Sistem Keuangan
Masjid) dari nol. Ditujukan untuk pengurus masjid yang cakap teknologi — tidak
harus seorang developer.

## Apa itu SKM

Sistem manajemen keuangan masjid berbasis web yang **transparan, akuntabel, dan
gratis diadopsi**. Data disimpan di **Google Sheets milik masjid Anda sendiri**
(satu workbook), aplikasi di-host gratis di Vercel.

- **Stack:** Next.js 16 + TypeScript, Google Sheets sebagai database, hosting Vercel.
- **Login:** berbasis **PIN + nomor telepon** per pengurus (di-hash bcrypt, sesi
  JWT di cookie) — **bukan** Google/OAuth login.
- **Satu workbook:** seluruh tab (inti + modul Qurban) berada di **satu**
  spreadsheet Google Sheets (`GOOGLE_SHEETS_ID`).

## Fitur ringkas

- Pencatatan transaksi (pemasukan/pengeluaran) dengan kategori & rekening bank.
- Dashboard ringkasan keuangan + grafik tren.
- Rekonsiliasi bank & import CSV mutasi bank (lihat [BANK_TEMPLATES.md](BANK_TEMPLATES.md)).
- Void & koreksi dengan audit trail; upload bukti transaksi.
- Export laporan PDF/Excel.
- Halaman publik read-only `/publik` untuk ditampilkan di TV/monitor masjid.
- Reminder WhatsApp (via Fonnte) untuk donatur — opsional.
- Modul Qurban: edisi, master muqorib/hewan, pendaftaran, pemetaan, pembayaran &
  rekonsiliasi, pelaporan — opsional (kill-switch `QURBAN_MODULE_ENABLED`).
- Multi-user dengan peran (SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI).

## Estimasi biaya

| Komponen | Biaya |
|---|---|
| Google Sheets | Gratis |
| Vercel Hosting (Free tier) | Gratis |
| GitHub (Free tier) | Gratis |
| Fonnte WhatsApp (opsional) | sesuai paket Fonnte; tanpa token → mode mock (gratis, tidak kirim nyata) |
| Domain (opsional) | Rp 12.000 – Rp 150.000/tahun |
| **Total** | **Rp 0 – ~Rp 12.500/bulan** |

## Langkah memasang (indeks)

Ikuti **[SETUP_GUIDE.md](SETUP_GUIDE.md)** secara berurutan:

1. Prasyarat & akun (Google, Google Cloud + service account, Vercel, GitHub; opsional Fonnte).
2. Setup Google Cloud Project + Service Account.
3. Buat workbook Google Sheets + share ke email service account.
4. Fork/clone repo & konfigurasi environment variables (`.env.local`).
5. Deploy ke Vercel + set environment variables di Vercel.
6. Install & jalankan (lokal) / verifikasi build.
7. **First-run**: `npm run seed`, lalu admin pertama & login.
8. Verifikasi berjalan (login, dashboard, transaksi uji).
9. (Opsional) Aktifkan WhatsApp via Fonnte.

> ⚠️ Pembuatan **admin pertama** belum punya skrip resmi di repo — lihat catatan
> ber-FLAG di [SETUP_GUIDE.md](SETUP_GUIDE.md) Langkah 7.

## Kustomisasi (opsional)

- **Logo masjid** — upload di halaman Pengaturan.
- **Kategori** — tambah/edit dari halaman Kategori (tanpa coding).
- **Tema/warna** — sesuaikan di konfigurasi Tailwind, commit & push (auto-deploy Vercel).
- **Custom domain** — hubungkan di Vercel → Settings → Domains.

## FAQ

**Apakah data aman?** Data disimpan di Google Sheets milik akun Google Anda
sendiri. Hanya Anda dan service account yang punya akses.

**Berapa kapasitas?** Google Sheets mendukung ~10 juta cell per spreadsheet —
cukup untuk ratusan ribu transaksi (puluhan tahun untuk satu masjid).

**Vercel free tier cukup?** Untuk satu masjid, penggunaan normal jauh di bawah
batas free tier.

**Bisa dari HP?** Ya, antarmuka responsif via browser — tanpa instalasi aplikasi.

**Butuh bantuan?** Buka issue di repository GitHub, dan baca dokumentasi di
[`docs/`](../README.md).

## Checklist adopsi

- [ ] Fork repository ke GitHub Anda
- [ ] Buat Google Cloud Project + aktifkan Google Sheets API
- [ ] Buat Service Account + download credentials JSON
- [ ] Buat workbook Google Sheets + share ke email service account
- [ ] Konfigurasi `.env.local` (atau env di Vercel)
- [ ] Deploy ke Vercel
- [ ] Jalankan `npm run seed` (header + kategori default)
- [ ] Siapkan admin pertama & login (lihat FLAG di SETUP_GUIDE Langkah 7)
- [ ] Isi data masjid, tambah rekening bank
- [ ] (Opsional) Konfigurasi Fonnte untuk reminder WhatsApp
- [ ] Mulai catat transaksi!

---

> **Panduan pakai per-modul** (keuangan harian, import CSV, reminder WA, Qurban,
> TV display) akan ditambahkan pada tahap dokumentasi berikutnya (B2b-ii).
> Referensi developer (arsitektur, skema, API) ada di [`../developer/`](../developer/).
