# API Reference — SKM v2.1

## Base URL

- **Development**: `http://localhost:3000/api`
- **Production**: `https://[your-domain].vercel.app/api`

## Response Format

Semua API mengembalikan format JSON yang konsisten. **Dua format berdampingan
selama Sprint F01 transition:**

**Pre-F01 envelope (Sprint 0–9)** — masih dipakai semua endpoint legacy
(transaksi, kategori, rekening, dst.):

```typescript
// Success
{ "success": true, "data": T, "meta"?: { ... } }

// Error
{ "success": false, "error": "Pesan", "details"?: [...] }
```

**Sprint F01 envelope** — untuk endpoint baru (auth A1–A4, anggota U1–U9):

```typescript
// Success
{ "ok": true, "data": T, "meta"?: { ... } }

// Error — error.code adalah enum yang stable; error.message Bahasa untuk display.
{ "ok": false, "error": { "code": "AUTH_INVALID", "message": "...", "details"?: { ... } } }
```

F02+ endpoints juga akan pakai envelope F01. Migrasi endpoint legacy ke envelope
F01 di-defer (out of F01 scope) untuk hindari breaking pages yang masih konsumsi
shape lama.

## Authentication

Semua endpoint kecuali public allow-list (`/api/auth/login`, `/api/auth/logout`,
`/api/health`, `/api/publik/*`, `/mockup`) memerlukan session cookie `skm_session`
yang valid. Middleware `src/middleware.ts` enforces session check di request entry
ditambah role gate untuk path `/pengaturan/anggota/**` dan `/api/pengaturan/
anggota/**` (SUPER_ADMIN only) sebagai defense-in-depth.

**Session cookie** (di-set saat login, di-clear saat logout):

| Attribute | Value |
|---|---|
| Name | `skm_session` |
| HttpOnly | ✅ |
| Secure | ✅ (production) |
| SameSite | `Lax` |
| Max-Age | 43200 (12 jam) |
| Payload | JWT HS256 `{ user_id, peran, role, masjidName }` |

`role` + `masjidName` adalah backwards-compat fields untuk callsite legacy
yang baca `session.role`. Code baru pakai `user_id` + `peran` (5 nilai:
SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI).

**PIN policy** (diterapkan di A4 change-pin, U2 create, U5 reset-pin):

- 4–6 digit numerik
- Tidak boleh semua digit sama (`0000`, `1111`)
- Tidak boleh berurutan ascending/descending (`1234`, `4321`)
- Tidak boleh dalam blocklist umum (`8686`, `2580`, `1234`, `12345`, `123456`, `0000`, `1111`, `9999`)

Pelanggaran → `400 VALIDATION_PIN_POLICY` dengan `error.details.violation` =
`format` | `all_same` | `sequential` | `weak`.

---

## Auth Endpoints (Sprint F01 — refactored from Sprint 1)

### `POST /api/auth/login`

Login multi-user dengan telepon + PIN. Refactored di Sprint F01; legacy
single-PIN form dipindah ke fallback path saat env
`QURBAN_LEGACY_LOGIN_ENABLED=true`.

**Auth:** Public (no session required).

**Request Body:**

```json
{
  "telepon": "08123456789",
  "pin": "5839"
}
```

- `telepon` — string, di-normalize server-side ke `628xxx` (accepts `08xxx`, `8xxx`, `+628xxx`)
- `pin` — string, regex `^\d{4,6}$`

**Response (200):**

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "ANG-20260515-0003",
      "nama": "Hopy Familianto",
      "telepon": "628111882151",
      "peran": "SUPER_ADMIN",
      "is_active": true,
      "last_login_at": "2026-05-18T10:23:45.123Z",
      "created_at": "2026-05-15T...",
      "created_by": "SYSTEM_BOOTSTRAP",
      "updated_at": "2026-05-18T10:23:45.123Z",
      "failed_attempts": 0,
      "locked_until": ""
    },
    "landing_url": "/",
    "edisi_aktif": null,
    "warnings": []
  }
}
```

Sets `skm_session` cookie (see Authentication overview above).

**Error Responses:**

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | telepon/pin missing or wrong format |
| 401 | `AUTH_INVALID` | wrong PIN, or telepon not found (generic — no oracle) |
| 423 | `AUTH_LOCKED` | 5+ failed attempts; `error.details.locked_until` ISO 8601 |
| 429 | `RATE_LIMITED` | 10+ login attempts/minute per IP; `error.details.retry_after_sec` |
| 500 | `INTERNAL_ERROR` | upstream failure |

**Lockout behavior:**

- Failed attempts increment `anggota.failed_attempts` (per-account, persistent in sheet)
- 5× failed → `anggota.locked_until = now + 15 min`, audit `auth.locked`
- Successful login resets `failed_attempts=0`, `locked_until=''`
- Distinct from IP-level rate limit (10/min) which protects pre-auth surface

**Parallel legacy login** (Opsi B per Tahap 4 §3.3): when
`QURBAN_LEGACY_LOGIN_ENABLED=true`, mismatched telepon + bcrypt match against
`master.pin_hash` returns 200 with synthetic LEGACY session
(`user_id='LEGACY'`, `peran='SUPER_ADMIN'`). Window planned 1–2 day post-deploy,
then `QURBAN_LEGACY_LOGIN_ENABLED=false`.

**Audit events:** `auth.login_success`, `auth.login_failed`, `auth.locked`.

---

### `POST /api/auth/logout`

Idempotent logout — clears `skm_session` cookie. Returns 200 whether or not a
valid session was present.

**Auth:** Public (so users with expired/invalid cookies can still clear them).

**Request:** no body.

**Response (200):**

```json
{ "ok": true, "data": { "logged_out": true } }
```

**Audit events:** `auth.logout` (only when a valid session was present).

---

### `GET /api/auth/me`

Returns the current authenticated user with computed permissions and landing
URL. Replaces the pre-F01 `/api/auth/session` for richer UI gating
(`/api/auth/session` left untouched for backwards compat).

**Auth:** Required (any valid session).

**Response (200):**

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "ANG-20260515-0003",
      "nama": "Hopy Familianto",
      "telepon": "628111882151",
      "email": "",
      "peran": "SUPER_ADMIN",
      "is_active": true,
      "last_login_at": "2026-05-18T10:23:45.123Z",
      "created_at": "2026-05-15T...",
      "created_by": "SYSTEM_BOOTSTRAP",
      "updated_at": "...",
      "failed_attempts": 0,
      "locked_until": ""
    },
    "permissions": {
      "can_access": ["**"],
      "qurban_edisi_locked_to_aktif": false,
      "can_manage_anggota": true
    },
    "current_edisi": null,
    "landing_url": "/",
    "session": { "expires_at": "2026-05-18T22:23:45.000Z" }
  }
}
```

- `permissions.can_access` — array of path patterns (glob-ish) per peran
  (per Tahap 3 §3.7). UI uses for menu visibility. F1 enforces strict gate
  only on `/pengaturan/anggota/**`; F2 extends to `/qurban/**`.
- `permissions.qurban_edisi_locked_to_aktif` — `true` for PENDAFTARAN /
  DISTRIBUSI (can only see active edisi).
- `permissions.can_manage_anggota` — `true` for SUPER_ADMIN only.
- `current_edisi` — `null` in F1; populated in F2+.
- `landing_url` — `'/'` for all roles in F1. F2 flips Qurban roles → `/qurban`.

**Error Responses:**

| Status | Code | Cause |
|---|---|---|
| 401 | `AUTH_REQUIRED` | no session cookie |
| 401 | `AUTH_INVALID` | anggota row not found (deleted post-login) |
| 401 | `AUTH_INACTIVE` | anggota `is_active=FALSE` |

---

### `POST /api/auth/change-pin`

Self-change PIN for the authenticated anggota. Session is preserved (no
auto-logout) per Tahap 3.E §3.5.

**Auth:** Required (any valid session). LEGACY sessions (parallel-login
fallback) cannot use this endpoint — they have no anggota row to update.

**Request Body:**

```json
{
  "old_pin": "5839",
  "new_pin": "7351"
}
```

**Response (200):**

```json
{ "ok": true, "data": { "pin_changed": true } }
```

**Error Responses:**

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | missing field, regex mismatch, or `new_pin === old_pin` |
| 400 | `VALIDATION_PIN_POLICY` | new_pin violates PIN policy; `error.details.violation` |
| 401 | `AUTH_REQUIRED` | no session |
| 401 | `AUTH_INVALID` | wrong `old_pin` (does NOT increment `failed_attempts` — that counter is login-only) |
| 401 | `AUTH_INACTIVE` | account deactivated |
| 422 | `VALIDATION_FAILED` | LEGACY session attempted change-pin |

**Audit events:** `auth.pin_changed` (with `notes: "self-change via /api/auth/change-pin"`).

---

### `GET /api/auth/session` (legacy — Sprint 1)

Pre-F01 session check. **Kept untouched** for backwards-compat with pages that
still consume `{success, data: {role, masjidName}}` shape. New code should use
`GET /api/auth/me` instead.

**Response (200):**

```json
{ "success": true, "data": { "role": "SUPER_ADMIN", "masjidName": "..." } }
```

---

## Anggota Management Endpoints (Sprint F01)

SUPER_ADMIN-only CRUD untuk multi-user accounts. All endpoints gated by
middleware (`STRICT_PATH_RULES` allow only `SUPER_ADMIN`) plus per-endpoint
`requireSuperAdmin()` guard as defense-in-depth.

**Common error responses across this group:**

| Status | Code | Cause |
|---|---|---|
| 401 | `AUTH_REQUIRED` | no session |
| 403 | `FORBIDDEN_ROLE` | session present but peran ≠ SUPER_ADMIN |
| 404 | `NOT_FOUND` | `[id]` doesn't match any anggota |
| 500 | `INTERNAL_ERROR` | upstream failure |

### `GET /api/pengaturan/anggota`

List anggota with pagination + filter + search + sort.

**Query parameters:**

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-based |
| `page_size` | `50` | Max `200` |
| `search` | — | Substring match on `nama` OR `telepon` |
| `peran` | — | Exact match enum filter |
| `is_active` | — | `'true'` or `'false'` |
| `sort` | `nama:asc` | Whitelist: `nama` \| `created_at` \| `last_login_at` \| `peran`; `:asc` or `:desc` |

**Response (200):**

```json
{
  "ok": true,
  "data": [
    {
      "id": "ANG-20260515-0003",
      "nama": "Hopy Familianto",
      "telepon": "628111882151",
      "email": "",
      "peran": "SUPER_ADMIN",
      "is_active": true,
      "created_at": "...",
      "created_by": "SYSTEM_BOOTSTRAP",
      "updated_at": "...",
      "last_login_at": "...",
      "failed_attempts": 0,
      "locked_until": ""
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "page_size": 50,
    "has_more": false,
    "filters_applied": { "search": "hopy" }
  }
}
```

`pin_hash` is stripped from every list item (via `publicAnggota()` helper).

---

### `POST /api/pengaturan/anggota`

Create a new anggota with an initial PIN.

**Request Body:**

```json
{
  "nama": "Bendahara Baru",
  "telepon": "08123456789",
  "email": "optional@example.com",
  "peran": "BENDAHARA",
  "initial_pin": "5839"
}
```

- `nama` — 1–100 chars
- `telepon` — normalized to `628xxx`, must match `^628\d{8,12}$` post-normalize
- `email` — optional, 0–255 chars
- `peran` — one of `SUPER_ADMIN | BENDAHARA | ADMIN_QURBAN | PENDAFTARAN | DISTRIBUSI`
- `initial_pin` — 4–6 digit, must satisfy PIN policy

**Response (200):** newly created anggota (same shape as U3 detail, `pin_hash` stripped).

**Error Responses (in addition to common):**

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | missing required, regex mismatch |
| 400 | `VALIDATION_FORMAT` | telepon doesn't match `^628\d{8,12}$` after normalize |
| 400 | `VALIDATION_PIN_POLICY` | `initial_pin` violates PIN policy |
| 409 | `DUPLICATE_TELEPON` | telepon already used by another **active** anggota |

**Audit events:** `anggota.created` with `after: {nama, telepon, peran, email}`.

---

### `GET /api/pengaturan/anggota/[id]`

Detail of a single anggota by id.

**Response (200):** same shape as a single item in U1 list.

---

### `PATCH /api/pengaturan/anggota/[id]`

Partial update — any combination of `nama`, `telepon`, `email`, `peran`.

**Note:** PIN changes go through U5 reset-pin (admin) or A4 change-pin (self).
`is_active` changes go through U7 deactivate / U8 reactivate. No-op update
(all fields equal current values) returns 200 without writing or auditing.

**Request Body (at least one field required):**

```json
{
  "nama": "...",
  "telepon": "...",
  "email": "...",
  "peran": "BENDAHARA"
}
```

**Response (200):** updated anggota.

**Error Responses (in addition to common):**

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | empty body or invalid field |
| 400 | `VALIDATION_FORMAT` | telepon regex mismatch |
| 409 | `DUPLICATE_TELEPON` | new telepon taken by another active anggota |
| 422 | `BUSINESS_LAST_SUPER_ADMIN` | peran change away from SUPER_ADMIN would leave zero active SAs |

**Audit events:** `anggota.updated` (with before/after diff of changed fields).
Additionally `anggota.peran_changed` is emitted when `peran` changes
(easier filter for F8 reporting; Decision #9).

---

### `POST /api/pengaturan/anggota/[id]/reset-pin`

SUPER_ADMIN-initiated PIN reset for another user. Side-effect: clears
`failed_attempts=0` and `locked_until=''` so the user can log in immediately.

**Request Body:**

```json
{ "new_pin": "5839" }
```

**Response (200):**

```json
{ "ok": true, "data": { "pin_reset": true } }
```

**Error Responses (in addition to common):**

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_PIN_POLICY` | new_pin violates policy |

**Audit events:** `auth.pin_reset_by_admin` (notes include the actor's user_id).

---

### `POST /api/pengaturan/anggota/[id]/unlock`

Idempotent — always clears `failed_attempts=0` and `locked_until=''`. Returns
200 whether or not the account was locked.

**Request:** no body.

**Response (200):**

```json
{ "ok": true, "data": { "unlocked": true, "was_locked": true } }
```

**Audit events:** `auth.unlocked_manual` with `notes` distinguishing
`"unlocked"` (was locked), `"cleared counter (was not locked)"`, or
`"idempotent (no state change)"`.

---

### `POST /api/pengaturan/anggota/[id]/deactivate`

Soft-delete via `is_active=FALSE`. The row remains in the sheet so historical
references resolve.

**Request Body (optional, per Decision #20):**

```json
{ "notes": "Mis. tidak aktif di kepengurusan, pensiun" }
```

`notes` cap 200 chars (server trims + slices), persisted in `audit_log.notes`
column for the `anggota.deactivated` event. Missing / empty body is OK — the
route remains backward-compatible with the Milestone-C no-body contract.

**Response (200):** updated anggota with `is_active: false`.

**Error Responses (in addition to common):**

| Status | Code | Cause |
|---|---|---|
| 422 | `BUSINESS_CANNOT_DEACTIVATE_SELF` | target id === session.user_id |
| 422 | `BUSINESS_LAST_SUPER_ADMIN` | target is SUPER_ADMIN and removing leaves zero active SAs |

Idempotent on already-inactive: returns 200 without re-writing or auditing.

**Audit events:** `anggota.deactivated` (with optional `notes` from body).

---

### `POST /api/pengaturan/anggota/[id]/reactivate`

Toggle `is_active=TRUE`. Re-checks telepon uniqueness in case another active
anggota grabbed the telepon during inactivity.

**Request:** no body.

**Response (200):** updated anggota with `is_active: true`.

**Error Responses (in addition to common):**

| Status | Code | Cause |
|---|---|---|
| 409 | `DUPLICATE_TELEPON` | telepon now owned by another active anggota; user must change telepon (via U4) before reactivation |

Idempotent on already-active.

**Audit events:** `anggota.reactivated`.

---

### `GET /api/pengaturan/anggota/roles`

Returns the valid peran enum with display labels for dropdown rendering.

**Response (200):**

```json
{
  "ok": true,
  "data": [
    { "value": "SUPER_ADMIN", "label": "Super Admin", "description": "Akses penuh termasuk manajemen anggota." },
    { "value": "BENDAHARA", "label": "Bendahara", "description": "Pengelola penuh keuangan SKM. Akses Qurban read-only." },
    { "value": "ADMIN_QURBAN", "label": "Admin Qurban", "description": "Ketua panitia Qurban. Akses penuh modul Qurban." },
    { "value": "PENDAFTARAN", "label": "Pendaftaran", "description": "Panitia pendaftaran muqorib, pemetaan, dan pembayaran." },
    { "value": "DISTRIBUSI", "label": "Distribusi", "description": "Panitia distribusi: cetak label, tracking pengiriman." }
  ]
}
```

Used by E3 create form and E5 edit form. Silent fallback to hardcoded list
on failure.

---

## Master Endpoints (Sprint 1)

### `GET /api/master`

Ambil data konfigurasi masjid.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "MST-20260101-0001",
    "nama_masjid": "Masjid Al-Ikhlas",
    "alamat": "Jl. Merdeka No. 1",
    "kota": "Jakarta",
    "provinsi": "DKI Jakarta",
    "telepon": "021-1234567",
    "email": "masjid@email.com",
    "logo_url": "https://...",
    "tahun_buku_aktif": "2026",
    "mata_uang": "IDR"
  }
}
```

### `PUT /api/master`

Update konfigurasi masjid.

**Request Body** (partial update):
```json
{
  "nama_masjid": "Masjid Al-Ikhlas Baru",
  "telepon": "021-9876543"
}
```

---

## Transaksi Endpoints (Sprint 2)

### `GET /api/transaksi`

Ambil daftar transaksi. Filtering dilakukan di client-side (semua data dikirim).

**Query Parameters:**
| Param | Type | Default | Deskripsi |
|---|---|---|---|
| `tahun` | string | current year | Filter tahun |
| `bulan` | string | - | Filter bulan (1-12) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "TRX-20260323-0001",
      "tanggal": "2026-03-23",
      "jenis": "MASUK",
      "kategori_id": "KAT-20260101-0001",
      "deskripsi": "Infaq Jumat",
      "jumlah": 1500000,
      "rekening_id": "REK-20260101-0001",
      "bukti_url": "",
      "status": "AKTIF",
      "void_reason": "",
      "void_date": "",
      "koreksi_dari_id": "",
      "created_by": "Bendahara",
      "created_at": "2026-03-23T08:00:00Z",
      "updated_at": "2026-03-23T08:00:00Z"
    }
  ],
  "meta": {
    "total": 150
  }
}
```

### `POST /api/transaksi`

Buat transaksi baru.

**Request Body:**
```json
{
  "tanggal": "2026-03-23",
  "jenis": "MASUK",
  "kategori_id": "KAT-20260101-0001",
  "deskripsi": "Infaq Jumat minggu ke-3",
  "jumlah": 1500000,
  "rekening_id": "REK-20260101-0001"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "TRX-20260323-0001"
  }
}
```

**Variant: MUTASI (pemindahan dana antar rekening) — Sprint 8**

Saat `jenis` = `MUTASI`, endpoint ini membuat **2 baris transaksi sekaligus** (KELUAR di rekening asal + MASUK di rekening tujuan) yang dihubungkan dengan kolom `mutasi_ref` (format `MUT-YYYYMMDD-NNNN`). Kategori "Mutasi Internal" dengan jenis `MUTASI` dibuat otomatis bila belum ada.

**Request Body (mutasi):**
```json
{
  "jenis": "MUTASI",
  "tanggal": "2026-03-07",
  "deskripsi": "Tambah petty cash",
  "jumlah": 2000000,
  "dari_rekening_id": "REK-20260101-0001",
  "ke_rekening_id": "REK-20260101-0002"
}
```

**Validasi:**
- `dari_rekening_id` ≠ `ke_rekening_id`

**Response (201):** mengembalikan baris KELUAR (rekening asal). Field `mutasi_ref` berisi ID mutasi yang sama untuk kedua baris.

**Side Effects:**
- Append 2 baris ke sheet `transaksi` dalam 1 batch call
- Auto-create kategori "Mutasi Internal" (jenis `MUTASI`) jika belum ada
- Audit log `CREATE` dengan entitas_id = `mutasi_ref` dan detail berisi kedua transaksi ID
- **Mutasi tidak dihitung sebagai pemasukan/pengeluaran** di Dashboard, Laporan, Export, dan Publik (filter `!mutasi_ref`), tapi **tetap mempengaruhi Saldo per Rekening**.

**Catatan untuk PUT/Void mutasi:**
- `PUT /api/transaksi/[id]`: jika baris memiliki `mutasi_ref`, perubahan `tanggal`, `deskripsi`, `jumlah` di-mirror ke baris pasangan. Field `rekening_id` tetap per-baris.
- `POST /api/transaksi/[id]/void`: jika baris memiliki `mutasi_ref`, baris pasangan ikut di-void dengan alasan yang sama.

### `GET /api/transaksi/[id]`

Ambil detail satu transaksi.

### `PUT /api/transaksi/[id]`

Update transaksi (hanya jika status AKTIF).

### `POST /api/transaksi/[id]/void`

Void transaksi.

**Request Body:**
```json
{
  "reason": "Salah input nominal"
}
```

**Side Effects:**
- Set status → `VOID`
- Set `void_reason` dan `void_date`
- Tulis audit log (`VOID`)

### `POST /api/transaksi/[id]/koreksi`

Buat transaksi koreksi.

**Request Body:**
```json
{
  "tanggal": "2026-03-24",
  "jenis": "MASUK",
  "kategori_id": "KAT-20260101-0001",
  "deskripsi": "Koreksi: Infaq Jumat (semula salah nominal)",
  "jumlah": 2000000,
  "rekening_id": "REK-20260101-0001"
}
```

**Side Effects:**
- Buat transaksi baru dengan `koreksi_dari_id` menunjuk ke transaksi asli
- Tulis audit log (`KOREKSI`)

### `POST /api/transaksi/import`

Batch import transaksi dari CSV rekening koran bank.

**Request Body:**
```json
{
  "items": [
    {
      "tanggal": "2026-03-28",
      "jenis": "MASUK",
      "kategori_id": "KAT-20260406-0002",
      "deskripsi": "PURCHASE QRIS ACQ ...",
      "jumlah": 150000,
      "rekening_id": "REK-20260101-0001",
      "bank_ref": "320CHDP260060511"
    }
  ]
}
```

**Validation:**
- `items`: Array of 1-500 transaksi
- Each item follows the same schema as `POST /api/transaksi`
- `bank_ref` (optional, max 200 chars): Nomor Referensi CSV bank. Untuk
  import dari template bank **wajib** di-isi supaya deteksi duplikat
  pada import berikutnya bisa bekerja.
  - CSV biasa: `<ref>`
  - Split-child: `<ref>_split_<N>` (1-based)
  - "Tidak Split" (split-status → review): `<ref>` tanpa suffix

**Response (201):**
```json
{
  "success": true,
  "data": {
    "imported": 25,
    "ids": ["TRX-20260328-0001", "TRX-20260328-0002", "..."]
  }
}
```

**Side Effects:**
- Memanggil `ensureColumnHeader('transaksi', 'bank_ref')` — idempotent,
  menambah kolom kalau belum ada.
- Append rows ke sheet transaksi (satu per item) dengan `bank_ref`
  tersimpan di kolom ke-17.
- Tulis audit log (`CREATE`, entitas_id: `BATCH_IMPORT`)
- Setiap transaksi mendapat ID unik `TRX-YYYYMMDD-XXXX`

### `POST /api/transaksi/check-duplicates`

Cek duplikat sebelum batch import dari CSV. Dipakai UI Import CSV untuk
menampilkan SummaryDialog pre-confirmation. Deteksi hybrid dua lapis:

- **Layer 1 (pasti duplikat)**: exact match atau split prefix match
  pada kolom `bank_ref` di sheet transaksi.
- **Layer 2 (mungkin duplikat)**: untuk baris yang tidak match Layer 1,
  cari row existing dengan `bank_ref` kosong (input manual) dan
  tanggal + jumlah + jenis sama.

Row dengan status `VOID` diabaikan di kedua layer.

**Request Body:**
```json
{
  "items": [
    {
      "bank_ref": "320CHDP260060511",
      "tanggal": "2026-03-28",
      "jumlah": 150000,
      "jenis": "MASUK"
    }
  ]
}
```

**Validation:**
- `items`: Array of 1-2000 cek items.
- `bank_ref`: string, min 1 (untuk split-children kirim `<ref>_split_<N>`).
- `tanggal`: `YYYY-MM-DD`.
- `jumlah`: integer positif.
- `jenis`: `MASUK` atau `KELUAR`.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "duplicates": {
      "320CHDP260060511": {
        "type": "exact",
        "transactionId": "TRX-20260328-0001"
      },
      "320CHDP260060612_split_1": {
        "type": "split",
        "transactionIds": ["TRX-20260328-0005", "TRX-20260328-0006"]
      }
    },
    "possibleDuplicates": [
      {
        "tanggal": "2026-03-28",
        "jumlah": 150000,
        "jenis": "MASUK",
        "bank_ref": "320CHDP260060711",
        "existingTransactionId": "TRX-20260327-0002",
        "existingDescription": "Infaq Jumat manual"
      }
    ]
  }
}
```

**Side Effects:**
- Memanggil `ensureColumnHeader('transaksi', 'bank_ref')` (idempotent).
- Read-only — tidak menulis ke sheet.

---

## Kategori Endpoints (Sprint 1)

### `GET /api/kategori`

Ambil semua kategori.

### `POST /api/kategori`

Buat kategori baru.

**Request Body:**
```json
{
  "nama": "Infaq Tarawih",
  "jenis": "MASUK",
  "deskripsi": "Infaq saat Tarawih Ramadhan"
}
```

### `PUT /api/kategori/[id]`

Update kategori.

### `DELETE /api/kategori/[id]`

Soft delete kategori (`is_active` → `FALSE`).

---

## Rekening Endpoints (Sprint 1)

### `GET /api/rekening`

Ambil semua rekening bank (termasuk saldo terhitung).

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "REK-20260101-0001",
      "nama_bank": "Bank Syariah Indonesia",
      "nomor_rekening": "7123456789",
      "atas_nama": "Masjid Al-Ikhlas",
      "saldo_awal": 5000000,
      "saldo_saat_ini": 15000000,
      "is_active": true
    }
  ]
}
```

### `POST /api/rekening`

Buat rekening baru.

### `PUT /api/rekening/[id]`

Update rekening.

### `DELETE /api/rekening/[id]`

Soft delete rekening (`is_active` → `FALSE`).

---

## Rekonsiliasi Endpoints (Sprint 4)

### `GET /api/rekonsiliasi`

Ambil riwayat rekonsiliasi.

### `POST /api/rekonsiliasi`

Buat catatan rekonsiliasi baru.

**Request Body:**
```json
{
  "rekening_id": "REK-20260101-0001",
  "tanggal": "2026-03-23",
  "saldo_bank": 15000000
}
```

**Side Effects:**
- Hitung `saldo_sistem` dari sheet transaksi
- Hitung `selisih`
- Set `status` (SESUAI/TIDAK_SESUAI)
- Tulis audit log

---

## Upload Endpoints (Sprint 4)

### `POST /api/upload/bukti`

Upload bukti transaksi sebagai base64 data URL.

**Request**: `application/json`
| Field | Type | Deskripsi |
|---|---|---|
| `transaksiId` | string | ID transaksi terkait |
| `buktiDataUrl` | string | Base64 data URL gambar (di-resize client-side max 600px, JPEG 70%) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "bukti_url": "data:image/jpeg;base64,..."
  }
}
```

**Validasi:**
- Data URL harus dimulai dengan `data:image/`
- Panjang maksimal 50.000 karakter (limit cell Google Sheets)

**Side Effects:**
- Update `bukti_url` di sheet transaksi dengan base64 data URL
- Audit log: UPDATE

### `POST /api/upload/logo`

Upload logo masjid sebagai base64 data URL.

**Request**: `application/json`
| Field | Type | Deskripsi |
|---|---|---|
| `logoDataUrl` | string | Base64 data URL gambar (di-resize client-side max 200px, JPEG 80%) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logo_url": "data:image/jpeg;base64,..."
  }
}
```

**Validasi:**
- Data URL harus dimulai dengan `data:image/`
- Panjang maksimal 50.000 karakter (limit cell Google Sheets)

**Side Effects:**
- Update `logo_url` di sheet master dengan base64 data URL
- Audit log: UPDATE

---

## Dashboard Endpoints (Sprint 3)

### `GET /api/dashboard/summary`

Ambil ringkasan keuangan.

**Query Parameters:**
| Param | Type | Default | Deskripsi |
|---|---|---|---|
| `tahun` | string | current year | Tahun buku. Gunakan `all` untuk semua tahun. |
| `bulan` | string | - | Bulan spesifik (opsional). Jika tahun=all, filter bulan diterapkan lintas tahun. |
| `kategori` | string | - | Comma-separated kategori IDs (opsional). Filter transaksi berdasarkan kategori. |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_masuk": 50000000,
    "total_keluar": 30000000,
    "saldo": 20000000,
    "jumlah_transaksi": 150,
    "periode": {
      "tahun": "2026",
      "bulan": null
    }
  }
}
```

### `GET /api/dashboard/cumulative`

Ambil data kumulatif all-time (lintas tahun) beserta tren tahunan.

**Query Parameters:** Tidak ada.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalMasuk": 150000000,
    "totalKeluar": 100000000,
    "saldo": 50000000,
    "jumlahTransaksi": 3208,
    "jumlahMasuk": 1500,
    "jumlahKeluar": 1708,
    "yearlyTrend": [
      { "tahun": "2025", "masuk": 80000000, "keluar": 55000000 },
      { "tahun": "2026", "masuk": 50000000, "keluar": 30000000 }
    ],
    "categoryBreakdown": {
      "masuk": [
        { "kategori_id": "KAT-001", "nama": "Infaq", "jumlah": 80000000, "persentase": 53.33 }
      ],
      "keluar": [
        { "kategori_id": "KAT-002", "nama": "Listrik", "jumlah": 30000000, "persentase": 30 }
      ]
    }
  }
}
```

**Catatan:**
- Semua transaksi aktif (status `AKTIF`) dihitung, tanpa filter periode.
- `yearlyTrend` diurutkan berdasarkan tahun ascending, mulai dari 2025 (exclude data parsial sebelumnya).
- `jumlahMasuk` dan `jumlahKeluar` menunjukkan jumlah transaksi per jenis.
- `categoryBreakdown` menampilkan top 10 kategori + "Lainnya" per jenis, diurutkan by jumlah descending.

### `GET /api/dashboard/chart-data`

Ambil data untuk grafik.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `type` | enum | `monthly-trend` atau `category-breakdown` |
| `tahun` | string | Tahun buku |

**Response (200) — monthly-trend:**
```json
{
  "success": true,
  "data": {
    "labels": ["Jan", "Feb", "Mar", ...],
    "masuk": [5000000, 6000000, 7000000, ...],
    "keluar": [3000000, 4000000, 3500000, ...]
  }
}
```

---

## Kelompok Endpoints (v2.2)

### `GET /api/kelompok`

Ambil daftar semua kelompok anggaran.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "KEL-20260407-0001",
      "nama": "Qurban 1447H",
      "deskripsi": "Pelaksanaan qurban tahun 1447H",
      "warna": "#059669",
      "kategori_masuk": ["KAT-20260406-0009", "KAT-20260406-0008"],
      "kategori_keluar": ["KAT-20260406-0028"],
      "created_at": "2026-04-07T00:00:00Z",
      "updated_at": "2026-04-07T00:00:00Z"
    }
  ],
  "meta": { "total": 1 }
}
```

### `POST /api/kelompok`

Buat kelompok baru.

**Request Body:**
```json
{
  "nama": "Qurban 1447H",
  "deskripsi": "Opsional",
  "warna": "#059669",
  "kategori_masuk": ["KAT-001", "KAT-002"],
  "kategori_keluar": ["KAT-010"]
}
```

**Validasi:**
- `nama`: wajib, tidak boleh kosong
- Minimal salah satu dari `kategori_masuk` atau `kategori_keluar` harus terisi

**Response (201):** Kelompok object.

### `PUT /api/kelompok/[id]`

Update kelompok.

**Request Body:** Sama dengan POST.

**Response (200):** Updated Kelompok object.

### `DELETE /api/kelompok/[id]`

Hapus kelompok (hard delete — row dikosongkan).

**Response (200):** `{ "success": true }`

### `GET /api/dashboard/kelompok`

Ringkasan saldo per kelompok (dihitung dari transaksi aktif).

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "KEL-20260407-0001",
      "nama": "Qurban 1447H",
      "warna": "#059669",
      "totalMasuk": 50000000,
      "totalKeluar": 30000000,
      "saldo": 20000000,
      "jumlahKategoriMasuk": 2,
      "jumlahKategoriKeluar": 1,
      "jumlahTransaksi": 45
    }
  ]
}
```

**Catatan:**
- Total dihitung dari transaksi aktif (status AKTIF) yang `kategori_id` termasuk dalam `kategori_masuk` atau `kategori_keluar` kelompok
- 1 kategori bisa masuk ke banyak kelompok — total per kelompok independen
- Tidak ada filter periode (ringkasan all-time)

---

## Export Endpoints (Sprint 3)

### `GET /api/export/pdf`

Generate laporan PDF.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `tahun` | string | Tahun buku. Gunakan `all` untuk semua tahun. |
| `bulan` | string | Bulan (opsional). Jika tahun=all, filter bulan diterapkan lintas tahun. |
| `type` | enum | `ringkasan` atau `detail` |
| `kategori` | string | Comma-separated kategori IDs (opsional). Jika diisi, hanya transaksi dari kategori tersebut yang dimasukkan. Judul PDF mencantumkan nama kategori yang difilter, dikelompokkan berdasarkan jenis (Kategori Masuk / Kategori Keluar). Teks kategori mengikuti margin tabel dan otomatis wrap jika terlalu panjang. |

**Response**: PDF file (application/pdf)

### `GET /api/export/excel`

Export data transaksi ke Excel.

**Query Parameters:**
| Param | Type | Deskripsi |
|---|---|---|
| `tahun` | string | Tahun buku. Gunakan `all` untuk semua tahun. |
| `bulan` | string | Bulan (opsional). Jika tahun=all, filter bulan diterapkan lintas tahun. |
| `kategori` | string | Comma-separated kategori IDs (opsional). Jika diisi, hanya transaksi dari kategori tersebut yang dimasukkan. Header Excel akan mencantumkan nama kategori yang difilter. |

**Response**: Excel file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

---

## Bulk Edit Endpoints (Sprint 9)

### `POST /api/transaksi/bulk-update-kategori`

Ubah kategori untuk banyak transaksi sekaligus.

**Request Body:**
```json
{
  "transactionIds": ["TRX-20260323-0001", "TRX-20260323-0002"],
  "newKategoriId": "KAT-20260101-0003"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "updatedCount": 2,
    "batchId": "BULK-20260410-LK3XY"
  }
}
```

**Side Effects:**
- Update kolom `kategori_id` dan `updated_at` pada setiap transaksi
- Tulis audit log per transaksi (`UPDATE`, detail berisi `BULK_EDIT_KATEGORI` + `batch_id`)
- Chunking: 50 transaksi per batch

**Validasi:**
- Requires authenticated session
- `newKategoriId` harus merujuk ke kategori yang ada
- Transaksi VOID dan MUTASI tidak boleh diubah (difilter di frontend)

---

## Usage Count Endpoints (Sprint 9)

### `GET /api/kategori/[id]/usage-count`

Hitung jumlah transaksi aktif (non-VOID) yang menggunakan kategori ini.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "count": 15
  }
}
```

### `GET /api/rekening/[id]/usage-count`

Hitung jumlah transaksi aktif (non-VOID) yang menggunakan rekening ini.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "count": 42
  }
}
```

---

## Health Check

### `GET /api/health`

Cek koneksi ke Google Sheets.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "sheets_connected": true,
    "timestamp": "2026-03-23T10:00:00Z"
  }
}
```

---

## Error Codes

| HTTP Status | Keterangan |
|---|---|
| 200 | OK |
| 201 | Created (setelah buat data baru) |
| 400 | Bad Request (validasi gagal) |
| 401 | Unauthorized (belum login / session expired) |
| 404 | Not Found (data tidak ditemukan) |
| 500 | Internal Server Error (error server / Google API) |

---

## Qurban Edisi Endpoints (Sprint F02 — Milestone B)

Endpoint untuk manajemen edisi penyelenggaraan Qurban (container per tahun
hijriah). State: `DRAFT → AKTIF → SELESAI`. Maksimal satu edisi `AKTIF`
pada satu waktu. Edisi adalah state cookie-backed, bukan path — semua
endpoint di sini menggunakan `id` eksplisit.

**Akses peran:**

| # | Method | Path | Peran |
|---|---|---|---|
| E1 | GET | `/api/qurban/edisi` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN†, DISTRIBUSI† |
| E2 | POST | `/api/qurban/edisi` | SUPER_ADMIN, ADMIN_QURBAN |
| E3 | GET | `/api/qurban/edisi/[id]` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN†, DISTRIBUSI† |
| E4 | PATCH | `/api/qurban/edisi/[id]` | SUPER_ADMIN, ADMIN_QURBAN |
| E5 | POST | `/api/qurban/edisi/[id]/activate` | SUPER_ADMIN, ADMIN_QURBAN |
| E6 | POST | `/api/qurban/edisi/[id]/close` | SUPER_ADMIN, ADMIN_QURBAN |

`†` = read-only; PENDAFTARAN/DISTRIBUSI hanya melihat edisi berstatus
`AKTIF` (E1 otomatis ter-filter, E3 untuk edisi non-AKTIF → `403
FORBIDDEN_EDISI`).

### E1 — `GET /api/qurban/edisi`

Daftar edisi diurutkan dari `tahun_masehi` desc.

**Query params:**
- `status` (opsional) — filter `DRAFT` | `AKTIF` | `SELESAI`

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "EDS-20270101-0001",
      "tahun_hijriah": "1448H",
      "tahun_masehi": 2027,
      "tanggal_idul_adha": "2027-05-17",
      "tanggal_pendaftaran_buka": "2027-02-01",
      "tanggal_pendaftaran_tutup": "2027-04-30",
      "status": "DRAFT",
      "parent_edisi_id": "",
      "cloned_at": "",
      "created_at": "2027-01-01T03:00:00.000Z",
      "updated_at": "2027-01-01T03:00:00.000Z",
      "created_by": "ANG-..."
    }
  ],
  "meta": { "total": 1, "page": 1, "page_size": 1, "has_more": false, "filters_applied": {} }
}
```

### E2 — `POST /api/qurban/edisi`

**Body:**
```json
{
  "tahun_hijriah": "1448H",
  "tahun_masehi": 2027,
  "tanggal_idul_adha": "2027-05-17",
  "tanggal_pendaftaran_buka": "2027-02-01",
  "tanggal_pendaftaran_tutup": "2027-04-30",
  "clone_from": "EDS-...",
  "clone_options": { "konfigurasi": true, "panitia": false }
}
```

`clone_from` opsional. Saat di-set, `clone_options.konfigurasi` default
`true`, `clone_options.panitia` default `false`. Master hewan tidak
di-clone di F02 (ditangani F3).

**Validasi:**
- `tahun_hijriah` & `tahun_masehi` wajib.
- 3 tanggal wajib (format `YYYY-MM-DD`).
- `tanggal_pendaftaran_buka` ≤ `tanggal_pendaftaran_tutup`.
- `tahun_hijriah` unik (case-insensitive) → 409 `DUPLICATE_TAHUN_HIJRIAH`.

**Response 201:** edisi baru (status `DRAFT`).

### E3 — `GET /api/qurban/edisi/[id]`

Detail satu edisi. PENDAFTARAN/DISTRIBUSI yang membuka edisi non-AKTIF →
`403 FORBIDDEN_EDISI`.

### E4 — `PATCH /api/qurban/edisi/[id]`

**Body (semua optional):** `tahun_hijriah`, `tahun_masehi`,
`tanggal_idul_adha`, `tanggal_pendaftaran_buka`,
`tanggal_pendaftaran_tutup`. Minimal satu wajib.

**Lock per status:**
- `DRAFT` — semua field editable.
- `AKTIF` — hanya 3 field tanggal. Field lain → `422
  BUSINESS_EDISI_LOCKED`.
- `SELESAI` — read-only total → `422 BUSINESS_EDISI_LOCKED`.

Mengubah `tahun_hijriah` ke nilai yang sudah dipakai → `409
DUPLICATE_TAHUN_HIJRIAH`.

### E5 — `POST /api/qurban/edisi/[id]/activate`

Transisi `DRAFT → AKTIF`.

**Body (opsional):** `{ "force_close_existing_aktif": false }`.

**Pre-flight (F02):**
1. `status == DRAFT` → bila bukan, `422 BUSINESS_INVALID_STATE_TRANSITION`.
2. Konfigurasi edisi ada → bila tidak, `422 BUSINESS_PREFLIGHT_FAILED`
   (`details.check = "konfigurasi"`).
3. ≥1 panitia aktif → bila tidak, `422 BUSINESS_PREFLIGHT_FAILED`
   (`details.check = "panitia_active"`).
4. Tidak ada edisi lain berstatus `AKTIF`:
   - `force_close_existing_aktif=false` → `422 BUSINESS_PREFLIGHT_FAILED`
     (`details.check = "single_aktif"`, `details.existing_aktif = {id, tahun_hijriah}`).
   - `force_close_existing_aktif=true` → tutup edisi lama (`edisi.closed`,
     notes "auto-closed by activation of …"), lalu aktivasi.

> TODO(F3): pre-flight tambahan — `≥1 master_hewan` aktif.
> TODO(F4): pre-flight tambahan — `≥1 hewan` berstatus AKTIF.

### E6 — `POST /api/qurban/edisi/[id]/close`

Transisi `AKTIF → SELESAI`. Pre-flight F02 hanya memeriksa state. Bukan
`AKTIF` → `422 BUSINESS_INVALID_STATE_TRANSITION`.

> TODO(F4+): pre-flight tambahan — blok bila ada peserta TERDAFTAR belum
> lunas (`BUSINESS_EDISI_TUTUP_BLOCKED`).

### Error Codes (Qurban Edisi)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Body validation gagal (mis. format tanggal, urutan tanggal). |
| `FORBIDDEN_ROLE` | 403 | Peran tidak diizinkan untuk method ini (mis. PD/DS POST E2). |
| `FORBIDDEN_EDISI` | 403 | E3 — PD/DS membuka edisi non-AKTIF. |
| `NOT_FOUND` | 404 | Edisi tidak ditemukan. |
| `DUPLICATE_TAHUN_HIJRIAH` | 409 | E2/E4 — `tahun_hijriah` sudah dipakai edisi lain. |
| `BUSINESS_EDISI_LOCKED` | 422 | E4 — field tidak editable pada status saat ini. |
| `BUSINESS_INVALID_STATE_TRANSITION` | 422 | E5/E6 — status saat ini tidak mendukung transisi. |
| `BUSINESS_PREFLIGHT_FAILED` | 422 | E5 — pre-flight gagal (konfigurasi/panitia/single AKTIF). |

### Audit Events (Qurban Edisi)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `edisi.created` | `CREATE` | E2 |
| `edisi.updated` | `UPDATE` | E4 |
| `edisi.activated` | `UPDATE` | E5 |
| `edisi.closed` | `UPDATE` | E6 (atau E5 saat `force_close_existing_aktif=true`) |

---

## Qurban Konfigurasi Endpoints (Sprint F02 — Milestone C)

Konfigurasi adalah **satu baris per edisi** (1:1 dengan `qurban_edisi`)
yang menyimpan parameter operasional: BOP per hewan, target distribusi,
payment suffix, flag notifikasi WhatsApp.

`edisi_id` SELALU dikirim eksplisit sebagai query param — endpoint ini
tidak meresolusi edisi via cookie/AKTIF default.

| # | Method | Path | Peran |
|---|---|---|---|
| K1 | GET | `/api/qurban/konfigurasi?edisi_id=EDS-...` | semua peran terautentikasi |
| K2 | PUT | `/api/qurban/konfigurasi?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |

PENDAFTARAN/DISTRIBUSI hanya boleh K1 untuk edisi `AKTIF`; edisi non-AKTIF
→ `403 FORBIDDEN_EDISI`.

### K1 — `GET /api/qurban/konfigurasi?edisi_id=EDS-...`

**Response 200 (konfigurasi ada):**
```json
{
  "ok": true,
  "data": {
    "id": "KFG-20270101-0001",
    "edisi_id": "EDS-20270101-0001",
    "bop_per_ekor_sapi": 300000,
    "bop_per_ekor_kambing": 100000,
    "target_bungkus_total": 500,
    "berat_target_per_bungkus": 500,
    "tanggal_distribusi_mulai": "2027-04-20",
    "tanggal_distribusi_selesai": "2027-04-22",
    "payment_suffix": 3,
    "wa_send_on_pendaftaran": true,
    "wa_send_on_pembayaran_confirmed": true,
    "notes": "",
    "created_at": "2027-01-01T03:00:00.000Z",
    "updated_at": "2027-01-01T03:00:00.000Z",
    "created_by": "ANG-..."
  }
}
```

**Response 200 (belum diisi):** `{ "ok": true, "data": null }` — UI render
form dengan nilai default.

**Errors:** `400 VALIDATION_REQUIRED` (`edisi_id` kosong); `404 NOT_FOUND`
(edisi tidak ada); `403 FORBIDDEN_EDISI` (PD/DS pada non-AKTIF).

### K2 — `PUT /api/qurban/konfigurasi?edisi_id=EDS-...`

Upsert (single row per edisi):
- row ada → **UPDATE** baris yang sama, `updated_at` di-refresh.
- row belum ada → **INSERT** baru dengan `id = KFG-YYYYMMDD-NNNN`,
  `created_at`, `created_by` di-set. HTTP 201.

**Body (semua optional):**
```json
{
  "bop_per_ekor_sapi": 300000,
  "bop_per_ekor_kambing": 100000,
  "target_bungkus_total": 500,
  "berat_target_per_bungkus": 500,
  "tanggal_distribusi_mulai": "2027-04-20",
  "tanggal_distribusi_selesai": "2027-04-22",
  "payment_suffix": 3,
  "wa_send_on_pendaftaran": true,
  "wa_send_on_pembayaran_confirmed": true,
  "notes": "..."
}
```

**Validasi:**
- Numeric fields (`bop_per_ekor_sapi`, `bop_per_ekor_kambing`,
  `target_bungkus_total`, `berat_target_per_bungkus`): integer ≥ 0.
- `payment_suffix`: integer 0–9.
- `tanggal_distribusi_mulai` ≤ `tanggal_distribusi_selesai` (cross-field;
  dicek pada hasil merge sehingga patch yang hanya mengubah salah satu
  ujung range tetap tervalidasi).
- `notes`: maksimum 500 karakter.

**Defaults pada INSERT pertama** (saat field di-omit):
- `payment_suffix = 3`
- `wa_send_on_pendaftaran = true`
- `wa_send_on_pembayaran_confirmed = true`

**Lock per status edisi:**
- `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.
- `DRAFT` / `AKTIF` → diizinkan.

Validasi pelanggaran → `422 VALIDATION_FAILED` dengan `details.field`.

### Error Codes (Konfigurasi)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_REQUIRED` | 400 | `edisi_id` kosong. |
| `VALIDATION_FAILED` | 422 | Body validation gagal (mis. range, order). |
| `FORBIDDEN_EDISI` | 403 | K1 — PD/DS pada konfigurasi edisi non-AKTIF. |
| `NOT_FOUND` | 404 | `edisi_id` tidak ditemukan di `qurban_edisi`. |
| `BUSINESS_EDISI_LOCKED` | 422 | K2 — edisi SELESAI. |

### Audit Events (Konfigurasi)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `konfigurasi.created` | `CREATE` | K2 INSERT (pertama kali). |
| `konfigurasi.updated` | `UPDATE` | K2 UPDATE (revisi). |

---

## Qurban Panitia Endpoints (Sprint F02 — Milestone D)

Panitia adalah daftar anggota yang ditugaskan di sebuah edisi — **catatan
penugasan, bukan permission gate**. Akses ditentukan oleh `anggota.peran`;
panitia hanya mencatat siapa kerja di edisi mana. Pre-flight aktivasi
edisi (E5) mensyaratkan ≥1 panitia aktif.

`edisi_id` SELALU dikirim eksplisit sebagai query param (sama seperti K1/K2).

| # | Method | Path | Peran |
|---|---|---|---|
| P1 | GET | `/api/qurban/panitia?edisi_id=EDS-...` | semua peran terautentikasi |
| P2 | POST | `/api/qurban/panitia?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| P3 | DELETE | `/api/qurban/panitia/[id]` | SUPER_ADMIN, ADMIN_QURBAN |
| — | GET | `/api/qurban/panitia/candidates?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN (helper untuk dropdown UI) |

PENDAFTARAN/DISTRIBUSI hanya boleh P1 untuk edisi `AKTIF`; non-AKTIF →
`403 FORBIDDEN_EDISI`.

### P1 — `GET /api/qurban/panitia?edisi_id=EDS-...`

Default mengembalikan hanya panitia `is_active=true`. Tambahkan
`&include_inactive=true` untuk menampilkan baris yang sudah di-soft-remove
(jejak audit).

Setiap baris di-enrich dengan field tampilan dari sheet `anggota`:
`anggota_nama`, `anggota_peran`, `assigned_by_nama`. Diurutkan
`assigned_at` desc.

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "PNT-20270101-0001",
      "edisi_id": "EDS-20270101-0001",
      "anggota_id": "ANG-20260101-0002",
      "is_active": true,
      "assigned_at": "2027-01-01T03:00:00.000Z",
      "assigned_by": "ANG-20260515-0003",
      "notes": "",
      "anggota_nama": "Ketua DKM",
      "anggota_peran": "ADMIN_QURBAN",
      "assigned_by_nama": "Hopy Familianto"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "page_size": 1,
    "has_more": false,
    "filters_applied": { "edisi_id": "EDS-...", "include_inactive": false }
  }
}
```

### P2 — `POST /api/qurban/panitia?edisi_id=EDS-...`

**Body:**
```json
{ "anggota_id": "ANG-...", "notes": "..." }
```

`notes` opsional (maks 500 char).

**Validasi:**
- Edisi harus ada; `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.
- Anggota harus ada dan `is_active=true` → `422 VALIDATION_FAILED`.
- `anggota.peran` ∈ `{SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI}`.
  `BENDAHARA` → `422 BUSINESS_INVALID_PERAN_FOR_PANITIA`.
- Tidak ada panitia aktif lain dengan `(edisi_id, anggota_id)` sama →
  `409 DUPLICATE_PANITIA` (`details.existing_panitia_id`).

**Response 201:** baris panitia baru (`PNT-…`).

### P3 — `DELETE /api/qurban/panitia/[id]`

**Soft-remove**: baris tetap di sheet, hanya `is_active` di-flip ke
`FALSE`. Tetap meninggalkan jejak audit.

- Edisi `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.
- Baris sudah `is_active=false` → **`200` no-op idempotent** (tidak error,
  tidak nulis ulang ke sheet, tidak audit).
- Baris tidak ditemukan → `404 NOT_FOUND`.

**Response 200:** baris panitia (dengan `is_active=false`).

### Helper — `GET /api/qurban/panitia/candidates?edisi_id=EDS-...`

Daftar minimal anggota yang berhak ditugaskan untuk edisi tsb. Filter:
`is_active=true`, `peran` ∈ allowed (`BENDAHARA` dikecualikan), dan
belum jadi panitia aktif di edisi tsb. Tujuan: men-feed dropdown UI tanpa
membuka endpoint `/api/pengaturan/anggota` (SA-only) ke ADMIN_QURBAN.

**Response 200:**
```json
{
  "ok": true,
  "data": [
    { "id": "ANG-20260101-0002", "nama": "Ketua DKM", "peran": "ADMIN_QURBAN" }
  ],
  "meta": { "total": 1, ... }
}
```

### Error Codes (Panitia)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_REQUIRED` | 400 | `edisi_id` query kosong. |
| `VALIDATION_FAILED` | 422 | `anggota_id` invalid / anggota non-aktif / notes terlalu panjang. |
| `BUSINESS_INVALID_PERAN_FOR_PANITIA` | 422 | Anggota ber-peran `BENDAHARA`. |
| `BUSINESS_EDISI_LOCKED` | 422 | Edisi `SELESAI`. |
| `FORBIDDEN_EDISI` | 403 | P1 — PD/DS pada edisi non-AKTIF. |
| `NOT_FOUND` | 404 | Edisi / panitia tidak ditemukan. |
| `DUPLICATE_PANITIA` | 409 | Sudah ada panitia aktif dengan kombinasi (edisi, anggota) yang sama. |

### Audit Events (Panitia)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `panitia.assigned` | `CREATE` | P2 |
| `panitia.removed` | `UPDATE` | P3 (soft-remove). Skip audit kalau idempotent no-op. |

---

## Qurban Muqorib Endpoints (Sprint F03 — Milestone B/C)

Muqorib adalah **master jamaah qurban LINTAS-EDISI** — tidak ada `edisi_id`,
tidak meresolusi edisi via cookie/AKTIF. Soft-delete via `is_active`.

| # | Method | Path | Peran |
|---|---|---|---|
| M1 | GET | `/api/qurban/muqorib` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN |
| M2 | POST | `/api/qurban/muqorib` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| M3 | GET | `/api/qurban/muqorib/[id]` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN |
| M4 | PATCH | `/api/qurban/muqorib/[id]` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| M5 | POST | `/api/qurban/muqorib/[id]/deactivate` | SUPER_ADMIN, ADMIN_QURBAN |
| M6 | POST | `/api/qurban/muqorib/[id]/reactivate` | SUPER_ADMIN, ADMIN_QURBAN |
| M7 | GET | `/api/qurban/muqorib/lookup` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |

**Schema `qurban_muqorib` (11 kolom):** `id` (prefix `MQR-`), `nama_lengkap`,
`alamat`, `rt` (`001`–`006` | `Lainnya`), `no_hp` (ternormalisasi `628…`),
`is_active`, `data_induk_ref_1447h`, `notes`, `created_at`, `created_by`,
`updated_at`.

### M1 — `GET /api/qurban/muqorib`

**Query params:** `page`, `page_size` (maks 200, default 50), `search` (nama /
no_hp / alamat), `status` (`active` | `inactive` | `all`, default `active`),
`sort` (`nama_lengkap:asc|desc`, `created_at:asc|desc`, default
`nama_lengkap:asc`).

**Response 200:**
```json
{
  "ok": true,
  "data": [ { "id": "MQR-...", "nama_lengkap": "...", "alamat": "...", "rt": "001", "no_hp": "628...", "is_active": true, "data_induk_ref_1447h": "", "notes": "", "created_at": "...", "created_by": "ANG-...", "updated_at": "..." } ],
  "meta": { "total": 1, "page": 1, "page_size": 50, "has_more": false, "filters_applied": { "status": "active", "sort": "nama_lengkap:asc" } }
}
```

### M2 — `POST /api/qurban/muqorib`

**Body:** `{ nama_lengkap, alamat, rt, no_hp, notes? }`. `no_hp` dinormalisasi
server-side ke `628…`; uniqueness **tidak** di-enforce. **Response 201:** record baru.

### M3 — `GET /api/qurban/muqorib/[id]`

**Response 200:** `{ ok: true, data: { muqorib, history: [] } }`. `history`
selalu `[]` sampai F04 (`qurban_peserta`). 404 → `NOT_FOUND`.

### M4 — `PATCH /api/qurban/muqorib/[id]`

**Body (subset):** `nama_lengkap`, `alamat`, `rt`, `no_hp`, `notes`. Minimal
satu field. Idempotent — no-op mengembalikan record apa adanya.

### M5 — `POST /api/qurban/muqorib/[id]/deactivate`

**Body opsional:** `{ notes? }` (maks 200 char, disimpan di audit). Idempotent.

### M6 — `POST /api/qurban/muqorib/[id]/reactivate`

Inverse M5. Tanpa body. Idempotent.

### M7 — `GET /api/qurban/muqorib/lookup`

Smart autocomplete atas muqorib AKTIF (Jaro-Winkler + boost telepon/alamat).

**Query params:** `q` (wajib), `limit` (default 10, maks 25), `min_score`
(default 0.6, rentang 0–1).

**Response 200:** kandidat ter-skor; `no_hp` di-mask (`628****7890`);
`has_history` stub `false` sampai F04. `meta: { q, limit, min_score, count }`.

### Error Codes (Muqorib)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_FAILED` | 400/422 | Body/query validation gagal. `details.errors[]` = error per-field. |
| `FORBIDDEN_ROLE` | 403 | Peran tidak diizinkan untuk method ini. |
| `NOT_FOUND` | 404 | Muqorib tidak ditemukan. |

### Audit Events (Muqorib)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `muqorib.created` | `CREATE` | M2 |
| `muqorib.updated` | `UPDATE` | M4 (skip kalau no-op) |
| `muqorib.deactivated` | `UPDATE` | M5 (skip kalau sudah nonaktif) |
| `muqorib.reactivated` | `UPDATE` | M6 (skip kalau sudah aktif) |

---

## Qurban Master Hewan Endpoints (Sprint F03 — Milestone C)

Master Hewan adalah **katalog tipe hewan qurban PER-EDISI**. `edisi_id` SELALU
dikirim eksplisit sebagai query param. Natural key `(edisi_id, jenis, kelas)`
unik. Soft-delete via `is_active`; MH4 (deactivate) + MH6 (reactivate)
berpasangan.

| # | Method | Path | Peran |
|---|---|---|---|
| MH1 | GET | `/api/qurban/master-hewan?edisi_id=EDS-...` | semua peran terautentikasi† |
| MH2 | POST | `/api/qurban/master-hewan?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| MH3 | PATCH | `/api/qurban/master-hewan/[id]?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| MH4 | POST | `/api/qurban/master-hewan/[id]/deactivate?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| MH5 | POST | `/api/qurban/master-hewan/bulk-upsert?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| MH6 | POST | `/api/qurban/master-hewan/[id]/reactivate?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |

`†` = PENDAFTARAN/DISTRIBUSI hanya boleh MH1 untuk edisi `AKTIF`; edisi
non-AKTIF → `403 FORBIDDEN_EDISI`. Catatan: ini akses **lapisan API**; akses
**halaman** `/qurban/hewan` di-gate terpisah oleh `path-rules.ts` (SA/BD/AQ/PD).

**Schema `qurban_master_hewan` (11 kolom):** `id` (prefix `MHW-`), `edisi_id`,
`jenis` (`SAPI` | `KAMBING`), `kelas` (`A`–`D`), `kapasitas_slot` (int > 0),
`harga_beli` (≥ 0), `harga_bawa_sendiri` (≥ 0), `is_active`, `created_at`,
`updated_at`, `created_by`.

### MH1 — `GET /api/qurban/master-hewan?edisi_id=EDS-...`

**Query params:** `edisi_id` (wajib), `status` (`active` | `inactive` | `all`,
default `active`). Diurutkan `jenis` asc lalu `kelas` asc. `meta: { edisi_id, count }`.

### MH2 — `POST /api/qurban/master-hewan?edisi_id=EDS-...`

**Body:** `{ jenis, kelas, kapasitas_slot, harga_beli, harga_bawa_sendiri }`.
Diizinkan saat edisi `DRAFT`/`AKTIF`; `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.
Duplikat `(edisi_id, jenis, kelas)` → `422 DUPLICATE_MASTER_HEWAN`. **Response 201.**

### MH3 — `PATCH /api/qurban/master-hewan/[id]?edisi_id=EDS-...`

**Body (subset):** `kapasitas_slot`, `harga_beli`, `harga_bawa_sendiri`.
`jenis` & `kelas` immutable (kirim → `422 VALIDATION_FAILED`). Idempotent no-op.

### MH4 — `POST /api/qurban/master-hewan/[id]/deactivate?edisi_id=EDS-...`

Soft-delete. `SELESAI` → `422 BUSINESS_EDISI_LOCKED`. Idempotent.

### MH5 — `POST /api/qurban/master-hewan/bulk-upsert?edisi_id=EDS-...`

Bulk create/update tipe dalam satu request (dipakai untuk setup awal /
clone antar-edisi). **Tidak ada UI di Milestone E** — CRUD per-baris saja.

### MH6 — `POST /api/qurban/master-hewan/[id]/reactivate?edisi_id=EDS-...`

Inverse MH4 — set `is_active` → `TRUE`. `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.
Idempotent (sudah aktif → no-op sukses). Karena cek duplikat MH2 mencakup baris
nonaktif, reactivate adalah jalan benar untuk menghidupkan kembali tipe yang
sempat dinonaktifkan (bukan membuat baris baru).

### Error Codes (Master Hewan)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_REQUIRED` | 400 | `edisi_id` query param kosong. |
| `VALIDATION_FAILED` | 400/422 | Body validation gagal. `details.errors[]` = error per-field. |
| `FORBIDDEN_ROLE` | 403 | Peran tidak diizinkan untuk method tulis. |
| `FORBIDDEN_EDISI` | 403 | PD/DS mengakses MH1 untuk edisi non-AKTIF. |
| `NOT_FOUND` | 404 | Edisi atau master hewan tidak ditemukan. |
| `DUPLICATE_MASTER_HEWAN` | 422 | MH2 — `(edisi_id, jenis, kelas)` sudah ada. `details = { existing_id, jenis, kelas }`. |
| `BUSINESS_EDISI_LOCKED` | 422 | Edisi `SELESAI` — tipe tidak dapat diubah. |

### Audit Events (Master Hewan)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `master_hewan.created` | `CREATE` | MH2 |
| `master_hewan.updated` | `UPDATE` | MH3 (split harga/kapasitas; skip kalau no-op) |
| `master_hewan.deactivated` | `UPDATE` | MH4 (skip kalau sudah nonaktif) |
| `master_hewan.reactivated` | `UPDATE` | MH6 (skip kalau sudah aktif) |

---

## Qurban Daftar Hewan (Inventaris Fisik) Endpoints (Sprint F5a)

Daftar Hewan adalah **inventaris fisik per-ekor** — 1 baris = 1 ekor hewan
nyata, melengkapi katalog tipe (`qurban_master_hewan`, F03). **PER-EDISI**:
`edisi_id` SELALU dikirim eksplisit sebagai query param (`?edisi_id=EDS-...`),
sama seperti Master Hewan F03.

| # | Method | Path | Peran |
|---|---|---|---|
| H1 | GET | `/api/qurban/hewan?edisi_id=EDS-...` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN |
| H2 | POST | `/api/qurban/hewan?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| H3 | GET | `/api/qurban/hewan/[id]?edisi_id=EDS-...` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN |
| H4 | PATCH | `/api/qurban/hewan/[id]?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| H5 | POST | `/api/qurban/hewan/reorder?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| H6 | POST | `/api/qurban/hewan/batch-status?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| H7 | POST | `/api/qurban/hewan/[id]/cancel?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |

Akses **halaman** `/qurban/hewan` di-gate `path-rules.ts` ke SA/BD/AQ/PD
(DISTRIBUSI dikecualikan). PENDAFTARAN (panitia) hanya boleh edisi `AKTIF`
(edisi lain → `403 FORBIDDEN_EDISI`). Semua endpoint tulis (H2/H4/H5/H6/H7)
menolak edisi `SELESAI` → `422 BUSINESS_EDISI_LOCKED`.

**Schema `qurban_daftar_hewan` (17 kolom):** `id` (prefix `HWN-`), `edisi_id`,
`master_hewan_id`, `jenis` (`SAPI`|`KAMBING`), `kelas` (`A`–`D`), `nomor_urut`
(int), `kapasitas_slot` (int), `tipe_pembelian` (`BELI`|`BAWA_SENDIRI`),
`vendor_nama`, `harga_beli_aktual` (≥ 0), `tanggal_pembelian` (`YYYY-MM-DD`),
`status` (`DRAFT`|`AKTIF`|`TERPOTONG`|`BATAL`), `notes`, `nomor_urut_pemotongan`
(**milik F7 — selalu kosong di F5a**), `created_at`, `updated_at`, `created_by`.

`jenis`, `kelas`, `kapasitas_slot` **didenormalisasi** dari `master_hewan_id`.

**State machine status:** `DRAFT→AKTIF`, `DRAFT→BATAL`, `AKTIF→TERPOTONG`
(butuh `tanggal_pemotongan`), `AKTIF→BATAL`. `TERPOTONG` & `BATAL` terminal.

### H1 — `GET /api/qurban/hewan?edisi_id=EDS-...`

**Query:** `edisi_id` (wajib), filter opsional `jenis`, `kelas`, `status`.
Diurutkan `jenis`, `kelas`, `nomor_urut`. Tiap item diperkaya: `nama_display`
(`"Sapi-A-01"`), `slot_terisi`, `kapasitas_slot`. `slot_terisi = 0` selama
sheet `qurban_peserta` belum ada (F4a). `meta: { total, filters_applied }`.

### H2 — `POST /api/qurban/hewan?edisi_id=EDS-...`

**Body:** `{ master_hewan_id, tipe_pembelian, vendor_nama?, harga_beli_aktual?,
tanggal_pembelian?, notes?, status? }` (`status` default `AKTIF`, hanya
`DRAFT`/`AKTIF`). `master_hewan_id` harus ada, `is_active`, & se-edisi. Untuk
`BAWA_SENDIRI`, `harga_beli_aktual` dipaksa `0`. **Auto-numbering** grup
`(edisi, jenis, kelas)`: `BELI` → `max+1`; `BAWA_SENDIRI` → slot BAWA berikutnya
lalu geser tiap `BELI` ≥ slot itu +1 (invariant: BAWA_SENDIRI selalu di depan
BELI). **Response 201** (+ `nama_display`).

### H3 — `GET /api/qurban/hewan/[id]?edisi_id=EDS-...`

Detail satu hewan + `nama_display` + ringkasan slot: `kapasitas_slot`,
`slot_terisi`, `occupants[]` (kosong selama `qurban_peserta` belum ada).
`404` bila id tidak ditemukan / beda edisi.

### H4 — `PATCH /api/qurban/hewan/[id]?edisi_id=EDS-...`

**Body (subset):** `vendor_nama`, `harga_beli_aktual`, `tanggal_pembelian`,
`notes`. Field lain (penomoran, denormalisasi, `tipe_pembelian`, `status`)
immutable di sini. `BAWA_SENDIRI` → `harga_beli_aktual` harus `0`. Status
terminal → `422 BUSINESS_HEWAN_TERMINAL`. Idempotent no-op bila tak ada
perubahan.

### H5 — `POST /api/qurban/hewan/reorder?edisi_id=EDS-...`

**Body:** `{ jenis, kelas, ordered_hewan_ids }`. `ordered_hewan_ids` WAJIB
**permutasi lengkap** grup `(edisi, jenis, kelas)` — kurang/lebih/duplikat →
`422 VALIDATION_FAILED`. Assign `nomor_urut = 1..N` sesuai urutan; baris yang
nomornya tak berubah dilewati. Tidak menegakkan invariant BAWA_SENDIRI/BELI
(reorder manual).

### H6 — `POST /api/qurban/hewan/batch-status?edisi_id=EDS-...`

**Body:** `{ hewan_ids, target_status, tanggal_pemotongan?, notes? }`.
`target_status` ∈ `AKTIF`|`TERPOTONG`|`BATAL`. **Validasi atomik** — bila ada
satu hewan dengan transisi tidak sah / (untuk `BATAL`) masih punya peserta
`TERDAFTAR`, **seluruh batch ditolak** (tanpa perubahan). `TERPOTONG` wajib
`tanggal_pemotongan` (`YYYY-MM-DD`) — **tidak disimpan sebagai kolom**, hanya
direkam di audit (Opsi A).

### H7 — `POST /api/qurban/hewan/[id]/cancel?edisi_id=EDS-...`

**Body:** `{ notes? }`. Set `status → BATAL`. Hanya `DRAFT`/`AKTIF` (terminal →
`422 BUSINESS_HEWAN_TERMINAL`); hewan dengan peserta `TERDAFTAR` →
`422 BUSINESS_HEWAN_HAS_PESERTA`.

### Error Codes (Daftar Hewan)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_REQUIRED` | 400 | `edisi_id` query param kosong. |
| `VALIDATION_FAILED` | 400/422 | Body validation gagal / reorder bukan permutasi. |
| `FORBIDDEN_ROLE` | 403 | Peran tidak diizinkan untuk endpoint. |
| `FORBIDDEN_EDISI` | 403 | PENDAFTARAN mengakses edisi non-AKTIF. |
| `NOT_FOUND` | 404 | Edisi / hewan tidak ditemukan. |
| `BUSINESS_EDISI_LOCKED` | 422 | Edisi `SELESAI` — inventaris tidak dapat diubah. |
| `BUSINESS_INVALID_STATE_TRANSITION` | 422 | H6 — transisi status tidak sah. |
| `BUSINESS_HEWAN_TERMINAL` | 422 | H4/H7 — hewan berstatus terminal. |
| `BUSINESS_HEWAN_HAS_PESERTA` | 422 | H6/H7 BATAL — hewan masih punya peserta `TERDAFTAR`. |

### Audit Events (Daftar Hewan)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `hewan.created` | `CREATE` | H2 |
| `hewan.nomor_urut_changed` | `UPDATE` | H2 (geseran auto-number), H5 (reorder) |
| `hewan.updated` | `UPDATE` | H4 (skip kalau no-op) |
| `hewan.status_changed` | `UPDATE` | H6 (transisi non-TERPOTONG) |
| `hewan.batch_terpotong` | `UPDATE` | H6 `→ TERPOTONG` (metadata `tanggal_pemotongan`) |
| `hewan.cancelled` | `UPDATE` | H7 |

---

## Qurban Peserta (Pendaftaran) — PS1–PS8 (Sprint F4a)

Pendaftaran peserta qurban, pendekatan **"1 baris = 1 slot"** (1 muqorib ambil
3 slot Sapi → 3 baris `qurban_peserta`). **PER-EDISI**: `edisi_id` dikirim
sebagai query param (`?edisi_id=EDS-...`) — kecuali PS6 yang menerimanya di
body (lihat di bawah). Backend-only (F4a); UI menyusul di F4c, pendaftaran
publik di F4b.

| # | Method | Path | Peran |
|---|---|---|---|
| PS1 | GET | `/api/qurban/peserta?edisi_id=EDS-...` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN |
| PS2 | POST | `/api/qurban/peserta?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| PS3 | GET | `/api/qurban/peserta/[id]?edisi_id=EDS-...` | SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN |
| PS4 | PATCH | `/api/qurban/peserta/[id]?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| PS5 | POST | `/api/qurban/peserta/[id]/cancel?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| PS6 | POST | `/api/qurban/peserta/check-duplicate` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |
| PS7 | POST | `/api/qurban/peserta/[id]/refresh-harga?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN |
| PS8 | GET | `/api/qurban/peserta/available-slots?edisi_id=EDS-...` | SUPER_ADMIN, ADMIN_QURBAN, PENDAFTARAN |

PENDAFTARAN (panitia) hanya boleh edisi `AKTIF` (edisi lain → `403
FORBIDDEN_EDISI`). **PS2 mewajibkan edisi `AKTIF` untuk SEMUA peran** (DRAFT/
SELESAI → `422 BUSINESS_EDISI_NOT_AKTIF`). PS4/PS5/PS7 menolak edisi `SELESAI`
→ `422 BUSINESS_EDISI_LOCKED`. Tidak ada konsep "pendaftaran dibuka/ditutup"
terpisah dari status edisi (kolom `tanggal_pendaftaran_*` belum dipakai untuk
gating).

**Schema `qurban_peserta` (17 kolom):** `id` (prefix `PST-`), `edisi_id`,
`muqorib_id` (FK lintas-edisi), `hewan_id` (FK — **mutable**, Pemetaan F5b),
`slot_number` (1..`kapasitas_slot` — **mutable**), `tipe_qurban`
(`BELI`|`BAWA_SENDIRI`, snapshot dari hewan), `nama_atas_nama` (opsional; kosong
→ pakai nama muqorib), `keterangan_bagian`, `harga_disepakati` (**frozen** saat
daftar), `kode_bayar` (`QRB-{tahun}-{NNN}`, unik per edisi, **immutable**),
`sumber_pendaftaran` (`PUBLIK`|`PANITIA`|`IMPORT_1447H`), `status_pendaftaran`
(`TERDAFTAR`|`BATAL`), `tanggal_daftar`, `notes`, `created_at`, `updated_at`,
`created_by`. **Tidak ada kolom `is_active`** — soft-delete via
`status_pendaftaran = BATAL`. **Tidak ada kolom `nama`** — label via
`nama_atas_nama` lalu `muqorib.nama_lengkap`.

**Harga per slot (frozen):** `harga_disepakati = master ÷ kapasitas_slot` —
`BELI` pakai `harga_beli`, `BAWA_SENDIRI` pakai `harga_bawa_sendiri` (keduanya
nilai per-ekor). Dibulatkan ke Rupiah integer (`Math.round`).

### PS1 — `GET /api/qurban/peserta?edisi_id=EDS-...`

**Query:** `edisi_id` (wajib), filter opsional `status_pendaftaran`, `hewan_id`,
`muqorib_id`, `tipe_qurban`, `sumber_pendaftaran`. Diurutkan `tanggal_daftar`
ASC (tiebreak `id`). `meta: { total, filters_applied }`.

### PS2 — `POST /api/qurban/peserta?edisi_id=EDS-...`

**Body:** `{ muqorib_id, master_hewan_id, tipe_qurban, jumlah_slot,
nama_atas_nama_per_slot?, keterangan_bagian?, allow_additional_qurban? }`.
`nama_atas_nama_per_slot` (kalau diisi) panjangnya harus = `jumlah_slot`.

**Alur:** (1) validasi + `muqorib_id` harus ada & **aktif** (`is_active`);
(2) deteksi duplikat Layer 1 — bila muqorib sudah punya peserta `TERDAFTAR` di
edisi & `allow_additional_qurban=false` → `409 DUPLICATE_PESERTA` (body memuat
`existing[]`); (3) bekukan `harga_disepakati` dari master; (4) **auto-assign
slot** (hewan `AKTIF` cocok `master_hewan_id`+`tipe`, urut `nomor_urut` ASC,
slot kosong terkecil dulu, auto-split antar hewan) — kurang dari diminta →
`409 BUSINESS_INSUFFICIENT_SLOTS` (`{available, needed}`); (5) generate
`kode_bayar` berurutan per slot; (6) insert N baris (batch) dengan
`sumber_pendaftaran=PANITIA`, `status_pendaftaran=TERDAFTAR`. **Response 201**
(array N peserta). Audit `peserta.created` per baris (flag
`is_additional_qurban` bila berlaku).

### PS3 — `GET /api/qurban/peserta/[id]?edisi_id=EDS-...`

Detail satu peserta. `404` bila id tidak ditemukan / beda edisi.

### PS4 — `PATCH /api/qurban/peserta/[id]?edisi_id=EDS-...`

**Body (subset):** `nama_atas_nama`, `keterangan_bagian`, `notes`. Field lain
(`hewan_id`/`slot_number` → Pemetaan F5b, `status_pendaftaran` → PS5,
`harga_disepakati` → PS7, `kode_bayar` immutable) ditolak. Peserta `BATAL` →
`422 BUSINESS_PESERTA_NOT_TERDAFTAR` (catatan historis, tidak boleh diubah).
Idempotent no-op bila tak ada perubahan.

### PS5 — `POST /api/qurban/peserta/[id]/cancel?edisi_id=EDS-...`

**Body:** `{ alasan?, refund_handling? }`. `TERDAFTAR → BATAL` (sudah `BATAL` →
`422 BUSINESS_PESERTA_NOT_TERDAFTAR`). Slot otomatis kosong (computed via
okupansi). Pembayaran existing TIDAK dinonaktifkan; bila sheet `qurban_pembayaran`
(F6) ada & peserta punya pembayaran, response menyertakan `meta.warning`.
Audit `peserta.status_changed`.

### PS6 — `POST /api/qurban/peserta/check-duplicate`

**Body:** `{ muqorib_id, edisi_id }` (keduanya di body). Bungkus
`findDuplikatTerdaftar`. Response `{ has_duplicate, existing[] }`.
**Informasional** — tidak memblokir (pemblokiran sebenarnya di PS2). Dipakai UI
F4c pra-submit.

### PS7 — `POST /api/qurban/peserta/[id]/refresh-harga?edisi_id=EDS-...`

Terapkan harga master saat ini ke `harga_disepakati` (master diturunkan dari
`hewan_id` → `master_hewan_id`). Hanya `TERDAFTAR` (`BATAL` →
`422 BUSINESS_PESERTA_NOT_TERDAFTAR`). `kode_bayar` tidak disentuh. Harga sama →
no-op sukses tanpa audit; berubah → audit `peserta.harga_changed` + bump
`updated_at`. Response `{ peserta, harga_lama, harga_baru }`.

### PS8 — `GET /api/qurban/peserta/available-slots?edisi_id=EDS-...`

**Query:** `edisi_id` (wajib), `master_hewan_id` & `tipe_qurban` (opsional —
batasi ke kombinasi itu; tanpa keduanya = seluruh edisi). Response `{ total,
slots[] }`, tiap slot `{ hewan_id, nomor_urut, slot_number }` (hanya hewan
`AKTIF`, slot belum ditempati peserta `TERDAFTAR`).

### Error Codes (Peserta)

| Code | HTTP | Kapan |
|---|---|---|
| `VALIDATION_REQUIRED` | 400 | `edisi_id` (query/body) atau `muqorib_id` (PS6) kosong. |
| `VALIDATION_FAILED` | 400/422 | Body validation gagal / master/muqorib tidak valid / muqorib nonaktif. |
| `FORBIDDEN_ROLE` | 403 | Peran tidak diizinkan untuk endpoint. |
| `FORBIDDEN_EDISI` | 403 | PENDAFTARAN mengakses edisi non-AKTIF. |
| `NOT_FOUND` | 404 | Edisi / peserta tidak ditemukan. |
| `DUPLICATE_PESERTA` | 409 | PS2 — muqorib sudah `TERDAFTAR` & `allow_additional_qurban=false`. |
| `BUSINESS_INSUFFICIENT_SLOTS` | 409 | PS2 — slot tersedia < `jumlah_slot`. |
| `BUSINESS_EDISI_NOT_AKTIF` | 422 | PS2 — edisi bukan `AKTIF`. |
| `BUSINESS_EDISI_LOCKED` | 422 | PS4/PS5/PS7 — edisi `SELESAI`. |
| `BUSINESS_PESERTA_NOT_TERDAFTAR` | 422 | PS4/PS5/PS7 — peserta tidak berstatus `TERDAFTAR`. |

### Audit Events (Peserta)

| `event_type` | Aksi | Sumber |
|---|---|---|
| `peserta.created` | `CREATE` | PS2 (per baris; flag `is_additional_qurban`) |
| `peserta.updated` | `UPDATE` | PS4 (skip kalau no-op) |
| `peserta.status_changed` | `UPDATE` | PS5 (`TERDAFTAR → BATAL`) |
| `peserta.harga_changed` | `UPDATE` | PS7 (skip kalau harga sama) |
| `peserta.wa_sent_success` | `CREATE` | PS2 (retrofit Fonnte F4b-C; gated `wa_send_on_pendaftaran`) |
| `peserta.wa_sent_failed` | `CREATE` | PS2 (kirim WA gagal; tidak menggagalkan response) |

---

## Qurban Public Pendaftaran Endpoints (Sprint F4b) — PB1–PB4

Endpoint **publik tanpa-auth** untuk pendaftaran qurban dari sisi jamaah.
Lolos middleware lewat allow-list `/api/publik/*`; ikut mati saat kill-switch
`QURBAN_MODULE_ENABLED='false'` (mencakup `/api/publik/qurban/*` sejak F4b-C).
Format envelope sama (`{ ok, data | error }`). Semua menarget **edisi AKTIF**
(`findActiveEdisi`); PB1–PB3 di-gate window pendaftaran, **PB4 tidak**.

| # | Method | Path | Rate limit (per-IP) |
|---|---|---|---|
| PB1 | GET | `/api/publik/qurban/options` | 30/menit |
| PB2 | POST | `/api/publik/qurban/daftar/lookup` | 20/menit |
| PB3 | POST | `/api/publik/qurban/daftar` | 5/menit · 20/jam · 50/hari |
| PB4 | GET | `/api/publik/qurban/cek-status` | 30/menit |

**Pengaman publik (Milestone A):** rate-limit *cascading* per-IP per-endpoint
(harus lolos SEMUA window; di atas `checkRateLimit` F1), honeypot (field `email`
— wajib kosong; terisi = bot, ditolak generik), masking (`maskNama`, `maskNoHp`).
Lampaui limit → `429 RATE_LIMITED` + header `Retry-After`.

**Status pendaftaran (3-keadaan, `getPendaftaranStatus`):** `BELUM_BUKA` (sebelum
`tanggal_pendaftaran_buka`), `BUKA` (dalam window **dan** edisi `AKTIF`), `TUTUP`
(setelah `tanggal_pendaftaran_tutup`, atau edisi non-AKTIF). Tanggal dibanding
sebagai `YYYY-MM-DD` WIB.

### PB1 — `GET /api/publik/qurban/options`

Info edisi + `status_pendaftaran`. Saat `BUKA`: `options` memuat `tipe_hewan`
(kombinasi master×tipe yang `slot_tersedia > 0`, `harga_per_slot`) + `rekening`
(bank aktif). Selain `BUKA` atau tanpa edisi AKTIF → `options: null`.

### PB2 — `POST /api/publik/qurban/daftar/lookup`

Body `{ nama_lengkap, no_hp }` (keduanya wajib, `422` bila kurang). **Exact match**
(bukan fuzzy) ke `qurban_muqorib` pada nama (lower+trim) + `no_hp` (ternormalisasi
`628…`), hanya record `is_active`. Hanya dilayani saat `BUKA`. Response:
`{ matched: true, muqorib: { id, nama_lengkap, alamat, rt, no_hp (di-mask) } }`
atau `{ matched: false }`.

### PB3 — `POST /api/publik/qurban/daftar`

Body: `muqorib_id` (dari PB2) **atau** `muqorib_data {nama_lengkap, alamat, rt,
no_hp}`; `master_hewan_id`, `tipe_qurban`, `jumlah_slot` (≤ 50), `nama_atas_nama?`,
`keterangan_bagian?`, + field honeypot `email`.

Alur: rate-limit → honeypot → audit `attempted` → validasi + gate `BUKA` →
resolusi muqorib (id aktif / match `no_hp` / **auto-create**; **muqorib nonaktif
ditolak**, konsisten PS2) → duplikat Layer 1 (`409 DUPLICATE_PESERTA`, arahkan ke
cek-status) → freeze harga → auto-assign slot (`409 BUSINESS_INSUFFICIENT_SLOTS`)
→ generate `kode_bayar` → insert batch (`sumber_pendaftaran=PUBLIK`) → audit per
peserta + `succeeded` → **WA Fonnte** (gated `wa_send_on_pendaftaran`). Response
`201`: `{ edisi, muqorib, peserta[], pembayaran{ total_harga, payment_suffix,
nominal_transfer, rekening[] } }`. **Nominal-ber-suffix** dihitung **sekali pada
total** (`total + payment_suffix`); pencocokan peserta lewat `kode_bayar` di berita.

### PB4 — `GET /api/publik/qurban/cek-status?kode_bayar=… | ?no_hp=…`

Salah satu query wajib (`kode_bayar` diprioritaskan). **Tidak di-gate window**.
Pencarian lintas-edisi. Response: array entri `{ kode_bayar, nama (di-mask),
tipe_qurban, hewan_id, slot_number, harga_disepakati, status_pendaftaran }`.
**`no_hp` tidak pernah dikembalikan.**

### Error Codes (Publik)

| Code | HTTP | Kapan |
|---|---|---|
| `RATE_LIMITED` | 429 | Window rate-limit terlampaui (detail `limit`). |
| `VALIDATION_FAILED` | 422/400 | Payload/lookup invalid; honeypot terpicu (generik); muqorib nonaktif. |
| `BUSINESS_EDISI_NOT_AKTIF` | 422 | Pendaftaran tidak `BUKA` / tak ada edisi AKTIF (PB2/PB3). |
| `DUPLICATE_PESERTA` | 409 | Muqorib sudah `TERDAFTAR` di edisi (PB3). |
| `BUSINESS_INSUFFICIENT_SLOTS` | 409 | Slot tersedia < diminta (PB3). |

### Audit Events (Publik)

| `event_type` | Sumber |
|---|---|
| `publik.daftar_attempted` / `_succeeded` | PB3 |
| `publik.daftar_duplicate_detected` | PB3 (duplikat) |
| `publik.daftar_captcha_failed` | PB3 (honeypot) |
| `publik.daftar_rate_limited` | PB3 (429) |
| `publik.daftar_muqorib_inactive` | PB3 (tolak muqorib nonaktif) |
| `publik.wa_sent_success` / `_failed` | PB3 (Fonnte) |
| `muqorib.auto_created_from_publik` | PB3 (auto-create) |
| `muqorib.data_conflict_detected` | PB3 (data form ≠ record; record dipertahankan) |

> **Keterbatasan rate-limit:** counter `Map` in-memory **per-proses** (serverless
> per-instance, bukan global) — memadai sebagai friksi-abuse MVP; pengerasan keras
> = ganti store ke Upstash Redis (item masa depan).

---

## Qurban Public Endpoints

### `GET /api/publik/qurban`

Ambil data publik Qurban 1447H dari Google Sheets terpisah (Qurban master data).

**Auth:** Tidak perlu (public endpoint).

**Caching:** In-memory TTL 5 menit + `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`.

**Data Source:** Google Sheets ID dari env var `GOOGLE_SHEETS_QURBAN_ID`, sheets: `master_hewan`, `daftar_hewan`, `peserta`.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "updated_at": "2026-06-05T14:30:00.000Z",
    "summary": {
      "total_sapi": 6,
      "total_kambing": 4,
      "sapi_breakdown": { "A": 2, "B": 2, "C": 1, "D": 1 },
      "kambing_breakdown": { "A": 2, "B": 1, "C": 1 },
      "sapi_penitipan": 1,
      "kambing_penitipan": 1,
      "total_muqorib": 10,
      "total_lunas": 9,
      "total_belum": 1
    },
    "hewan": [
      {
        "id_hewan": "SP-A01",
        "jenis": "Sapi",
        "tipe": "A",
        "berat_rata2": "±325 Kg",
        "kuota": 7,
        "terisi": 7,
        "is_penitipan": false,
        "harga_per_orang": 3500000,
        "harga_qurban": 24500000,
        "bop_per_ekor": 1750000,
        "peserta": [
          { "slot": 1, "nama": "HOPY FAMILIANTO", "status_bayar": "Lunas", "tipe_qurban": "Beli" }
        ]
      }
    ],
    "payment": {
      "bank_name": "BSI",
      "account_number": "7171234567",
      "account_holder": "Masjid Al Jabar Jatinegara Baru",
      "panitia_hp": "0821-xxxx-xxxx"
    }
  }
}
```

**Catatan:**
- `is_penitipan` ditentukan dari `peserta.tipe_qurban === "Penitipan"`, bukan dari `daftar_hewan.pengadaan`
- Peserta dengan `nama` kosong di-filter (skip template rows)
- Slot number di-parse dari `kode_muqorib` format `{id_hewan}-{slot_number}`
- Payment info diambil dari env vars `QURBAN_PAYMENT_*`
