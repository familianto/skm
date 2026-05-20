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
