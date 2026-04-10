# HANDOFF_SPRINT09.md — Bulk Edit, Proteksi Hapus, Dialog Konfirmasi & Toast

**Tanggal**: 10 April 2026
**Branch**: `claude/sprint-9-bulk-edit-AUJrm`
**Statistik**: 11 files changed, ~560 lines added

---

## Deliverable per Task

### Task 1: Bulk Edit Kategori Transaksi

**File utama**: `src/app/(dashboard)/transaksi/page.tsx`

- **Checkbox per baris**: Kolom baru paling kiri, disabled untuk transaksi VOID atau MUTASI (`isSelectable()` helper)
- **Select All checkbox di header**: Hanya memilih transaksi selectable di halaman aktif. State: unchecked / checked / indeterminate (via `ref` callback + `el.indeterminate`)
- **Sticky toolbar bawah**: Fixed bottom center, slide-up/slide-down animasi via CSS transition (`opacity` + `translate-y`). Menampilkan "X transaksi dipilih" + tombol "Batal Pilih" (ghost) + "Ubah Kategori" (primary)
- **Dialog konfirmasi**: Menggunakan `Modal` component. Berisi:
  - Summary box: jumlah terpilih, daftar kategori asal + count, total nominal
  - Error jika jenis campuran (MASUK + KELUAR)
  - Dropdown kategori baru (filtered by jenis)
  - Preview: "[Kategori Lama] → [Kategori Baru]"
- **API endpoint**: `POST /api/transaksi/bulk-update-kategori`
  - File: `src/app/api/transaksi/bulk-update-kategori/route.ts`
  - Validasi: Zod schema, session required, verifikasi kategori baru exists
  - Chunking: 50 transaksi per batch
  - Audit log per transaksi (non-blocking `void logAudit(...)`) dengan shared `batch_id`
  - `batch_id` format: `BULK-YYYYMMDD-<base36timestamp>`
- **URL query param**: `?kategori=ID` sekarang pre-set filter kategori (untuk navigasi dari proteksi hapus)

### Task 2: Proteksi Hapus Kategori & Rekening

**API endpoints baru**:
- `GET /api/kategori/[id]/usage-count` → `{ count: number }` (file: `src/app/api/kategori/[id]/usage-count/route.ts`)
- `GET /api/rekening/[id]/usage-count` → `{ count: number }` (file: `src/app/api/rekening/[id]/usage-count/route.ts`)
- Hitung transaksi non-VOID yang menggunakan kategori/rekening tersebut

**UI — Kategori** (`src/app/(dashboard)/kategori/page.tsx`):
- Tombol "Hapus" sekarang memanggil `handleDeleteClick()` yang fetch usage-count dulu
- Jika count > 0: Modal proteksi "Tidak dapat menghapus" — warning amber box + link navigasi ke `/transaksi?kategori=ID`
- Jika count = 0: ConfirmDialog variant danger

**UI — Rekening** (`src/app/(dashboard)/rekening/page.tsx`):
- Pattern identik: fetch usage-count → proteksi dialog atau confirm dialog
- Link navigasi ke `/transaksi?rekening=ID`

### Task 3: Dialog Konfirmasi Hapus

- Reuse `ConfirmDialog` component (sudah ada dari Kelompok Anggaran)
- Props: `variant="danger"`, `confirmLabel="Ya, hapus"`, `title="Hapus kategori"` / `"Hapus rekening"`
- Loading state saat proses hapus (tombol disabled + "Memproses...")

### Task 4: Toast Notification

Toast sudah ada di halaman-halaman ini (menggunakan `useToast()` dari `ToastProvider`):
- Kategori: "Kategori berhasil diupdate", "Kategori berhasil dihapus"
- Rekening: "Rekening berhasil diupdate", "Rekening berhasil dihapus"
- Bulk edit: "X transaksi berhasil diubah kategorinya" (success), error message (error)

---

## Keputusan Teknis

| Keputusan | Alasan |
|---|---|
| Checkbox disabled untuk VOID/MUTASI | Kategori VOID tidak relevan diubah; MUTASI selalu "Mutasi Internal" (readonly) |
| Sticky toolbar pakai `fixed bottom` bukan `sticky bottom` | `sticky bottom` tidak bekerja di semua browser tanpa parent yang scroll; `fixed` lebih reliable |
| Batch ID format `BULK-YYYYMMDD-<base36>` | Simpel, unik, mudah di-query di audit log |
| Usage-count hitung non-VOID saja | Transaksi VOID sudah tidak aktif, tidak seharusnya memblokir hapus |
| Kategori/Rekening tetap soft-delete | Konsisten dengan pattern existing (is_active=FALSE) |
| Tidak ada chunking di usage-count | Hanya 1 API call (getRows), count in-memory — acceptable untuk < 5000 transaksi |

---

## Komponen & Pattern yang Di-reuse

- `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) — dari Sprint A3 (Kelompok Anggaran)
- `Modal` (`src/components/ui/modal.tsx`) — untuk bulk edit dialog dan proteksi dialog
- `useToast()` / `ToastProvider` (`src/components/ui/toast.tsx`) — toast notification
- `logAudit()` (`src/lib/audit.ts`) — audit logging
- `getSession()` (`src/lib/auth.ts`) — session verification pada bulk edit API
- `sheetsService.updateRow()` — per-row update (tidak ada batch update di Google Sheets API)

---

## File Baru

| File | Deskripsi |
|---|---|
| `src/app/api/transaksi/bulk-update-kategori/route.ts` | POST endpoint bulk edit kategori |
| `src/app/api/kategori/[id]/usage-count/route.ts` | GET usage count per kategori |
| `src/app/api/rekening/[id]/usage-count/route.ts` | GET usage count per rekening |

## File Dimodifikasi

| File | Perubahan |
|---|---|
| `src/app/(dashboard)/transaksi/page.tsx` | Checkbox, bulk toolbar, bulk dialog, `?kategori=ID` support |
| `src/app/(dashboard)/kategori/page.tsx` | Proteksi hapus, ConfirmDialog, toast |
| `src/app/(dashboard)/rekening/page.tsx` | Proteksi hapus, ConfirmDialog, toast |
| `CLAUDE.md` | Sprint status, key patterns |
| `README.md` | Fitur baru, sprint table |
| `docs/API_REFERENCE.md` | 3 endpoint baru |
| `docs/PROJECT_BRIEF.md` | Fitur 5.12-5.13, sprint table, changelog v2.4 |
| `docs/SPRINT_PLAN.md` | Sprint 7-9 status, progress tracking |

---

## Known Issues / Tech Debt

- **Bulk edit sequential updates**: Setiap transaksi di-update satu per satu (`updateRow`) karena Google Sheets API tidak mendukung batch update pada range berbeda. Untuk 50+ transaksi bisa lambat (~1 detik per update). Future: bisa explore `batchUpdate` dengan multiple UpdateCellsRequest.
- **Usage-count re-fetches semua transaksi**: Setiap klik "Hapus" memicu fetch seluruh sheet transaksi. Acceptable untuk < 5000 rows, tapi bisa di-cache atau pakai lighter endpoint di masa depan.

---

## Konteks untuk Sprint Selanjutnya

- Halaman Transaksi sekarang mendukung `?kategori=ID` dan `?rekening=ID` query params. Pattern ini bisa diextend untuk filter lain.
- Proteksi hapus pattern (usage-count → dialog) bisa di-reuse untuk entitas lain (misal donatur, kelompok).
- Bulk edit pattern bisa diextend untuk bulk void, bulk delete, atau bulk change rekening.
