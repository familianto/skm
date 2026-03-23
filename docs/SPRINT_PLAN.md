# Sprint Plan — SKM v2.1

## Overview

Total estimasi: 10-12 minggu (7 sprint)

| Sprint | Nama | Durasi | Dependensi | Status |
|---|---|---|---|---|
| 0 | Setup Wizard | 1 minggu | — | Belum dimulai |
| 1 | Foundation | 2 minggu | Sprint 0 | Belum dimulai |
| 2 | Core Transactions | 2 minggu | Sprint 1 | Belum dimulai |
| 3 | Dashboard & Export | 2 minggu | Sprint 2 | Belum dimulai |
| 4 | Reconciliation & Additional | 2 minggu | Sprint 2 | Belum dimulai |
| 5 | Communication & Display | 1-2 minggu | Sprint 3 | Belum dimulai |
| 6 | Settings, Polish & Reusability | 1-2 minggu | Sprint 4, 5 | Belum dimulai |

## Dependency Graph

```
Sprint 0 (Setup)
    │
    ▼
Sprint 1 (Foundation)
    │
    ▼
Sprint 2 (Transactions)
    │
    ├──────────────┐
    ▼              ▼
Sprint 3        Sprint 4
(Dashboard)     (Reconciliation)
    │              │
    ▼              │
Sprint 5        │
(Communication) │
    │              │
    └──────┬───────┘
           ▼
       Sprint 6
    (Polish & Reuse)
```

> Sprint 3 dan Sprint 4 bisa dikerjakan paralel setelah Sprint 2 selesai.

## Cross-Sprint Shared Concerns

Berikut komponen yang dibangun di satu sprint dan digunakan oleh sprint-sprint berikutnya:

### 1. Google Sheets Service Layer (`lib/google-sheets.ts`)
- **Dibangun**: Sprint 0 (skeleton) → Sprint 1 (full implementation)
- **Digunakan oleh**: Semua sprint setelahnya
- **Catatan**: Jangan tambah method baru tanpa update service interface

### 2. TypeScript Interfaces (`types/index.ts`)
- **Dibangun**: Sprint 1 (core types)
- **Diperluas**: Setiap sprint menambah types baru
- **Catatan**: Selalu cek types existing sebelum buat baru

### 3. Authentication Middleware
- **Dibangun**: Sprint 1
- **Digunakan oleh**: Sprint 2+ (semua protected routes)
- **Catatan**: Middleware harus ringan (cek cookie saja, jangan query sheets per request)

### 4. Audit Log Helper (`lib/audit.ts`)
- **Dibangun**: Sprint 1
- **Digunakan oleh**: Sprint 2+ (setiap write operation)
- **Catatan**: Audit log WAJIB untuk setiap create, update, delete, void, koreksi

### 5. UI Component Library (`components/ui/`)
- **Dibangun**: Incremental setiap sprint
- **Komponen dasar Sprint 1**: Button, Input, Card, Modal, Table, Badge
- **Ditambah Sprint 2**: Select, DatePicker, FileUpload
- **Ditambah Sprint 3**: Chart wrapper, Export button

### 6. Layout Components (`components/layout/`)
- **Dibangun**: Sprint 1 (Sidebar, Header, PageTitle)
- **Digunakan oleh**: Semua halaman dashboard

### 7. Utility Functions (`lib/utils.ts`)
- **Dibangun**: Sprint 1 (formatRupiah, formatTanggal, generateId)
- **Diperluas**: Sesuai kebutuhan

### 8. Zod Validators (`lib/validators.ts`)
- **Dibangun**: Sprint 1 (base schemas)
- **Diperluas**: Setiap sprint menambah schema baru

## Definition of Done (per Sprint)

Setiap sprint dianggap selesai jika:

- [ ] Semua task di sprint file sudah di-checklist
- [ ] Tidak ada TypeScript errors (`npm run type-check`)
- [ ] Linting pass (`npm run lint`)
- [ ] Unit tests pass (`npm run test`)
- [ ] Build berhasil (`npm run build`)
- [ ] Manual testing di localhost berhasil
- [ ] API routes yang baru sudah didokumentasikan di `API_REFERENCE.md`
- [ ] Schema changes sudah di-update di `DATABASE_SCHEMA.md`
- [ ] `CLAUDE.md` sudah di-update (current sprint, jika ada perubahan konvensi)
- [ ] Code sudah di-commit dan push

## Risk Register

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Google Sheets API rate limit (100 req/100s) | Lambat saat banyak data | Batch reads, SWR caching, minimize API calls |
| File upload limit Vercel (4.5MB) | Gagal upload bukti besar | Client-side image compression |
| Concurrent writes ke sheet | Data corrupt/overwrite | Assume single writer per masjid, audit log sebagai safety net |
| Google Sheets row limit (~5M rows) | Sheet penuh | Arsip tahunan (buat sheet baru per tahun buku) |
| Private key exposure | Security breach | Never commit credentials, gunakan env vars |
| SWR stale data | UI tidak up-to-date | Revalidate on focus, mutate after write operations |

## Sprint Progress Tracking

Update bagian ini setiap sprint selesai:

```
Sprint 0: [ ] Belum dimulai
Sprint 1: [ ] Belum dimulai
Sprint 2: [ ] Belum dimulai
Sprint 3: [ ] Belum dimulai
Sprint 4: [ ] Belum dimulai
Sprint 5: [ ] Belum dimulai
Sprint 6: [ ] Belum dimulai
```

## Detail Sprint

Lihat file individual untuk detail setiap sprint:

- [`docs/sprints/SPRINT_0.md`](sprints/SPRINT_0.md) — Setup Wizard
- [`docs/sprints/SPRINT_1.md`](sprints/SPRINT_1.md) — Foundation
- [`docs/sprints/SPRINT_2.md`](sprints/SPRINT_2.md) — Core Transactions
- [`docs/sprints/SPRINT_3.md`](sprints/SPRINT_3.md) — Dashboard & Export
- [`docs/sprints/SPRINT_4.md`](sprints/SPRINT_4.md) — Reconciliation & Additional
- [`docs/sprints/SPRINT_5.md`](sprints/SPRINT_5.md) — Communication & Display
- [`docs/sprints/SPRINT_6.md`](sprints/SPRINT_6.md) — Settings, Polish & Reusability
