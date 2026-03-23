# Sprint 1: Foundation

**Durasi**: 2 minggu
**Tujuan**: Bangun fondasi aplikasi — TypeScript types, PIN authentication, CRUD master data (kategori, rekening, anggota), audit logging, dan layout components.

## Prasyarat

- Sprint 0 selesai (project bisa di-run, Google Sheets connected)

## Deliverables

### 1. TypeScript Interfaces & Enums

- [ ] Definisikan semua interfaces di `types/index.ts`:
  - `Master` — data konfigurasi masjid
  - `Transaksi` — transaksi keuangan
  - `Kategori` — kategori transaksi
  - `RekeningBank` — rekening bank
  - `AuditLog` — log audit
  - `Anggota` — anggota/pengurus
  - `Rekonsiliasi` — rekonsiliasi bank
  - `ApiResponse<T>` — standard API response
- [ ] Definisikan enums:
  - `TransaksiJenis` — MASUK, KELUAR
  - `TransaksiStatus` — AKTIF, VOID
  - `UserPeran` — BENDAHARA, PENGURUS, VIEWER
  - `AuditAksi` — CREATE, UPDATE, DELETE, VOID, KOREKSI, LOGIN, LOGOUT, EXPORT
  - `RekonsiliasiStatus` — SESUAI, TIDAK_SESUAI

### 2. Authentication (PIN-based)

- [ ] Buat `lib/auth.ts`:
  - `hashPin(pin: string)`: hash PIN dengan bcrypt
  - `verifyPin(pin: string, hash: string)`: verifikasi PIN
  - `createSession(data)`: buat encrypted session cookie
  - `getSession(request)`: baca session dari cookie
  - `deleteSession()`: hapus session cookie
- [ ] Buat `middleware.ts` (root level):
  - Check session cookie di setiap request
  - Redirect ke `/login` jika belum authenticated
  - Skip untuk `/login`, `/api/auth/login`, `/api/health`
- [ ] Buat API routes:
  - `POST /api/auth/login` — validasi PIN, set cookie
  - `POST /api/auth/logout` — hapus cookie
  - `GET /api/auth/session` — cek session validity
- [ ] Buat `app/(auth)/login/page.tsx`:
  - Form input PIN (4-6 digit)
  - Submit → call login API
  - Redirect ke dashboard jika sukses
  - Error message jika PIN salah

### 3. Audit Log Helper

- [ ] Buat `lib/audit.ts`:
  - `logAudit(aksi, entitas, entitasId, detail, userInfo?)`: append row ke `audit_log`
- [ ] Integrate audit logging ke semua write operations

### 4. CRUD Kategori

- [ ] API Routes:
  - `GET /api/kategori` — list semua kategori aktif
  - `POST /api/kategori` — buat kategori baru
  - `PUT /api/kategori/[id]` — update kategori
  - `DELETE /api/kategori/[id]` — soft delete (is_active → FALSE)
- [ ] Zod validation schemas di `lib/validators.ts`
- [ ] Halaman `app/(dashboard)/kategori/page.tsx`:
  - Tabel daftar kategori
  - Tombol tambah kategori (buka modal)
  - Edit & delete per row
  - Filter: MASUK / KELUAR / Semua

### 5. CRUD Rekening Bank

- [ ] API Routes:
  - `GET /api/rekening` — list semua rekening aktif
  - `POST /api/rekening` — buat rekening baru
  - `PUT /api/rekening/[id]` — update rekening
  - `DELETE /api/rekening/[id]` — soft delete
- [ ] Zod validation schemas
- [ ] Halaman `app/(dashboard)/rekening/page.tsx`:
  - Tabel daftar rekening
  - Tombol tambah rekening
  - Edit & delete per row

### 6. CRUD Anggota

- [ ] API Routes:
  - `GET /api/anggota` — list semua anggota aktif
  - `POST /api/anggota` — buat anggota baru
  - `PUT /api/anggota/[id]` — update anggota
  - `DELETE /api/anggota/[id]` — soft delete
- [ ] Halaman (bisa digabung ke halaman Pengaturan di Sprint 6)

### 7. Layout Components

- [ ] `components/layout/sidebar.tsx`:
  - Logo/nama masjid
  - Navigation links (Dashboard, Transaksi, Kategori, Rekening, Laporan, Pengaturan)
  - Tombol logout
  - Responsive (collapsible di mobile)
- [ ] `components/layout/header.tsx`:
  - Page title
  - Breadcrumb (opsional)
  - Mobile menu toggle
- [ ] `components/layout/page-title.tsx`:
  - Title + optional action button
- [ ] `app/(dashboard)/layout.tsx`:
  - Sidebar + Header + main content area

### 8. Reusable UI Components

- [ ] `components/ui/button.tsx` — Button dengan variants (primary, secondary, danger, ghost)
- [ ] `components/ui/input.tsx` — Text input dengan label dan error state
- [ ] `components/ui/card.tsx` — Card container
- [ ] `components/ui/modal.tsx` — Modal dialog
- [ ] `components/ui/table.tsx` — Data table
- [ ] `components/ui/badge.tsx` — Status badge (AKTIF, VOID, MASUK, KELUAR)
- [ ] `components/ui/loading.tsx` — Loading spinner/skeleton
- [ ] `components/ui/toast.tsx` — Toast notification

### 9. Utility Functions

- [ ] `lib/utils.ts`:
  - `formatRupiah(amount: number)`: format currency
  - `formatTanggal(date: string)`: format date
  - `cn(...classes)`: className merger (clsx + twMerge)

## File Baru

```
src/
  app/
    (auth)/
      login/
        page.tsx
    (dashboard)/
      layout.tsx
      kategori/
        page.tsx
      rekening/
        page.tsx
    api/
      auth/
        login/route.ts
        logout/route.ts
        session/route.ts
      kategori/
        route.ts
        [id]/route.ts
      rekening/
        route.ts
        [id]/route.ts
      anggota/
        route.ts
        [id]/route.ts
      master/
        route.ts
  components/
    layout/
      sidebar.tsx
      header.tsx
      page-title.tsx
    ui/
      button.tsx
      input.tsx
      card.tsx
      modal.tsx
      table.tsx
      badge.tsx
      loading.tsx
      toast.tsx
  lib/
    auth.ts
    audit.ts
    utils.ts
    validators.ts
  hooks/
    use-auth.ts
  middleware.ts
```

## API Routes

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login PIN |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/session` | Check session |
| GET | `/api/master` | Get masjid config |
| PUT | `/api/master` | Update masjid config |
| GET | `/api/kategori` | List kategori |
| POST | `/api/kategori` | Create kategori |
| PUT | `/api/kategori/[id]` | Update kategori |
| DELETE | `/api/kategori/[id]` | Delete kategori |
| GET | `/api/rekening` | List rekening |
| POST | `/api/rekening` | Create rekening |
| PUT | `/api/rekening/[id]` | Update rekening |
| DELETE | `/api/rekening/[id]` | Delete rekening |
| GET | `/api/anggota` | List anggota |
| POST | `/api/anggota` | Create anggota |
| PUT | `/api/anggota/[id]` | Update anggota |
| DELETE | `/api/anggota/[id]` | Delete anggota |

## Testing

- [ ] Auth: login dengan PIN benar → sukses, PIN salah → 401
- [ ] Auth: middleware redirect ke login jika belum auth
- [ ] CRUD Kategori: create, read, update, soft delete
- [ ] CRUD Rekening: create, read, update, soft delete
- [ ] Audit log: setiap write operation tercatat
- [ ] UI: sidebar responsive di mobile
- [ ] UI: form validation error messages

## Definition of Done

- [ ] Login/logout flow berfungsi end-to-end
- [ ] Middleware proteksi halaman berfungsi
- [ ] CRUD Kategori berfungsi (termasuk audit log)
- [ ] CRUD Rekening berfungsi (termasuk audit log)
- [ ] Layout (sidebar + header) responsive
- [ ] Semua UI components tersedia dan reusable
- [ ] TypeScript: no errors
- [ ] Tests pass
- [ ] Build pass
