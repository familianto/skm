# HANDOFF — Sprint 6: TV Display, Settings & Polish

**Tanggal**: 2026-03-23
**Sprint**: 6 — TV Display, Settings & Polish
**Branch**: `claude/sprint-6-tv-display-ibNW9`
**Statistik**: 11 files changed, +1224 lines
**Status Build**: PASS (type-check, build — zero errors/warnings)

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Public TV display page `/publik` (dark gradient theme, auto-refresh 5 menit, fullscreen-ready) | Done |
| 2 | Public layout `/publik/layout.tsx` (tanpa sidebar, standalone layout) | Done |
| 3 | API GET /api/publik/ringkasan (ringkasan publik tanpa auth, Cache-Control headers) | Done |
| 4 | API POST /api/auth/change-pin (validasi PIN lama, hash PIN baru, destroy session) | Done |
| 5 | API POST /api/upload/logo (upload logo JPG/PNG max 500KB ke Google Drive) | Done |
| 6 | Pengaturan page — Tab Profil Masjid (edit nama, alamat, kota, provinsi, telepon, email, tahun buku, upload logo) | Done |
| 7 | Pengaturan page — Tab Keamanan (ganti PIN dengan auto-redirect ke login) | Done |
| 8 | Pengaturan page — Tab Anggota (daftar pengurus dengan role badges) | Done |
| 9 | Pengaturan page — Tab Data (shortcut ke kategori/rekening/donatur, TV Display link, info sistem) | Done |
| 10 | Middleware update — `/publik` dan `/api/publik/*` ditambahkan ke PUBLIC_PATHS | Done |
| 11 | Sidebar update — tampilkan logo masjid, tambah link "TV Display" (external) | Done |
| 12 | DashboardShell component — fetch master data untuk logo/nama di sidebar | Done |
| 13 | PublicTrendChart component — bar chart Recharts dengan dark theme untuk TV display | Done |

---

## Keputusan Teknis

### Public Paths Tanpa Auth
- Middleware di-update: `/publik` dan `/api/publik` ditambahkan ke array `PUBLIC_PATHS`.
- Pattern matching menggunakan `startsWith()` — semua sub-path otomatis public.
- Halaman `/publik` ditempatkan di luar route group `(dashboard)` sehingga tidak menggunakan dashboard layout (tanpa sidebar).

### Auto-Refresh 5 Menit untuk TV Display
- Menggunakan native `setInterval` dengan `REFRESH_INTERVAL = 5 * 60 * 1000`.
- Tidak menggunakan SWR karena halaman publik standalone (tidak ada hook infrastructure).
- State `lastUpdated` ditampilkan di footer untuk monitoring.
- Cleanup interval di `useEffect` return untuk mencegah memory leak.

### Dark Gradient Theme untuk TV Display
- Background: `bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900`.
- Cards menggunakan `bg-white/10 backdrop-blur-sm border border-white/10` — glassmorphism effect.
- Teks putih dan emerald shades untuk kontras tinggi di TV/monitor.
- Chart menggunakan warna yang lebih terang (`#6ee7b7` untuk masuk, `#fca5a5` untuk keluar) agar terlihat jelas di dark background.
- Font size lebih besar (`text-3xl lg:text-5xl` untuk nama masjid, `text-2xl lg:text-4xl` untuk angka) — optimal untuk dilihat dari jarak jauh.

### Cache-Control Headers pada API Publik
- Response `/api/publik/ringkasan` menyertakan `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`.
- `s-maxage=300` — Vercel edge cache selama 5 menit.
- `stale-while-revalidate=60` — Serve stale content selama 1 menit saat revalidating.
- Ini mengurangi beban Google Sheets API karena multiple TV/monitor bisa share cache yang sama.

### Logo Upload 500KB Max
- Logo menggunakan limit lebih kecil dari bukti transaksi (500KB vs 1MB) karena logo tidak perlu resolusi tinggi.
- Pattern upload sama dengan upload bukti: validasi tipe/ukuran → Buffer → `driveService.uploadFile()` → simpan URL di sheet master.
- Nama file: `logo_masjid_{timestamp}.{ext}`.
- Logo ditampilkan di sidebar (40x40, rounded), halaman publik (80x80 / 96x96 di lg), dan halaman pengaturan.

### Ganti PIN dengan Session Destroy
- Flow: validasi PIN lama → hash PIN baru → update sheet master → audit log → `deleteSession()`.
- `deleteSession()` menghapus cookie `skm_session`, memaksa user login ulang.
- Frontend menampilkan pesan sukses + auto-redirect ke `/login` setelah 2 detik.
- Validasi: PIN harus 4-6 digit angka, PIN baru harus cocok dengan konfirmasi.

### DashboardShell Pattern
- Sebelumnya, `Sidebar` menerima `masjidName` prop tapi selalu default ke 'SKM'.
- DashboardShell component baru fetch `/api/master` di `useEffect` dan pass `masjidName` + `logoUrl` ke Sidebar.
- Fetch sekali saat mount — data master jarang berubah.
- Graceful: jika fetch gagal, tetap menampilkan 'SKM' sebagai default.

### Pengaturan Page dengan Tab Navigation
- 4 tab: Profil Masjid, Keamanan, Anggota, Data.
- Tab navigation menggunakan CSS border-bottom pattern (bukan library tab).
- Setiap tab adalah komponen terpisah untuk separation of concerns.
- Tab Data berisi shortcut links ke halaman yang sudah ada (kategori, rekening, donatur) plus link TV Display dan info sistem.

---

## File Baru Sprint 6

```
src/
  app/
    publik/
      layout.tsx                    # Layout publik (dark gradient, tanpa sidebar)
      page.tsx                      # TV display page (auto-refresh, dark theme)
    (dashboard)/
      pengaturan/
        page.tsx                    # Halaman pengaturan (4 tab)
      layout.tsx                    # Updated — menggunakan DashboardShell
    api/
      publik/
        ringkasan/
          route.ts                  # GET ringkasan publik (tanpa auth)
      auth/
        change-pin/
          route.ts                  # POST ganti PIN
      upload/
        logo/
          route.ts                  # POST upload logo
  components/
    publik/
      public-chart.tsx              # Bar chart dark theme untuk TV display
    layout/
      dashboard-shell.tsx           # Wrapper yang fetch master data untuk sidebar
      sidebar.tsx                   # Updated — logo display + TV Display link
  middleware.ts                     # Updated — tambah /publik ke PUBLIC_PATHS
```

---

## Known Issues / Tech Debt (Keseluruhan Project)

### Dari Sprint 5 (masih berlaku)
1. **No client-side image compression** — Upload bukti dan logo tanpa compression. Validasi ukuran file saja. Untuk MVP cukup.
2. **No upload progress bar** — Upload menampilkan "Mengupload..." tanpa persentase.
3. **Google Drive files di root** — Tidak ada folder organization (bukti/ dan logo/ terpisah). Semua file di root Drive service account.
4. **ImagePreview menggunakan external URL** — `<img>` tag langsung ke Google Drive URL. Tidak menggunakan Next.js `<Image>` karena perlu konfigurasi domain.
5. **rowToEntity() duplicated** — Fungsi konversi row-to-object diduplikasi di banyak route files. Bisa di-extract ke shared utility.

### Dari Sprint 6
6. **No unit tests** — Seluruh project tidak memiliki unit tests. Semua testing dilakukan manual.
7. **No E2E tests** — Tidak ada automated end-to-end test suite.
8. **Adopter Guide belum di-finalize** — `docs/ADOPTER_GUIDE.md` belum di-review dan ditest end-to-end (fork → setup → deploy → first login).
9. **No pagination di halaman publik** — Transaksi terakhir di TV display menampilkan 10 item tanpa pagination. Cukup untuk display.
10. **Logo tidak di-resize server-side** — Logo diupload as-is (max 500KB). Tidak ada server-side resize. Browser handles scaling.
11. **No CSRF protection** — API routes menggunakan cookie-based auth tanpa CSRF token. Mitigasi: SameSite=lax cookie.
12. **No input sanitization** — Input ditampilkan as-is. XSS risk rendah karena React auto-escapes, tapi custom sanitization belum diterapkan.
13. **Sidebar fetch master setiap page load** — DashboardShell fetch `/api/master` di setiap mount. Bisa di-cache dengan SWR atau React Context.
14. **Mobile sidebar bisa di-improve** — Sidebar collapsible via toggle button sudah ada, tapi transisi bisa lebih smooth dan gesture support belum ada.
15. **No offline support** — Aplikasi fully online, tidak ada service worker atau offline caching.

### Catatan untuk Deployment
- Pastikan semua env vars sudah di-set di Vercel: `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `AUTH_SECRET`, `PIN_SALT`.
- `GOOGLE_PRIVATE_KEY` di Vercel harus menggunakan actual newlines (bukan escaped `\n`).
- Jalankan seed script (`npm run seed`) untuk inisialisasi data default (kategori, master).
- Halaman `/publik` bisa langsung diakses tanpa login — cocok untuk bookmark di browser TV masjid.

---

## Environment Variables

### Tidak ada env vars baru di Sprint 6

Semua fitur Sprint 6 menggunakan env vars existing.

### Existing (Sprint 0-5)

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

## Summary: Semua Sprint Selesai

| Sprint | Nama | Files | Lines | Highlight |
|---|---|---|---|---|
| 0 | Setup Wizard | 16 | +1050 | Project init, Google Sheets connection, seed script |
| 1 | Foundation | 22 | +1800 | Auth PIN, CRUD master/kategori/rekening/anggota, sidebar layout |
| 2 | Core Transactions | 12 | +1400 | CRUD transaksi, filter, pagination, form validation |
| 3 | Donatur & Reminder WA | 14 | +1500 | CRUD donatur, Fonnte WA integration, bulk send |
| 4 | Dashboard & Export | 13 | +1600 | Charts (Recharts), summary cards, PDF/Excel export |
| 5 | Rekonsiliasi Bank | 15 | +1264 | Void/koreksi, upload bukti, rekonsiliasi bank |
| 6 | TV Display, Settings & Polish | 11 | +1224 | TV display, pengaturan, ganti PIN, upload logo |

**Total**: ~103 files, ~9838 lines of application code.

**SKM v2.1 siap untuk deployment ke Vercel dan demo ke pengurus masjid.**
