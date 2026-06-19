# HANDOFF — Tahap 3.E (API Endpoint Inventory) Modul Qurban di SKM

**Versi:** 1.0
**Tanggal:** 14 Mei 2026
**Status:** 3.E.1–3.E.6 LOCK. Ready untuk Tahap 4 (Rencana Eksekusi Migrasi & Implementasi).
**Scope:** API endpoint inventory lengkap untuk Modul Qurban di SKM — konvensi umum, auth & user management, master entities, pendaftaran & pemetaan, pembayaran & reconciliation, distribusi & laporan.
**Prerequisite:**
- HANDOFF Tahap 2 v1.0 (Schema & Architecture)
- HANDOFF Tahap 3 v1.0 (Information Architecture)

---

## TL;DR

Tahap 3.E menghasilkan spesifikasi API endpoint komprehensif untuk Modul Qurban:

- **~110 endpoint** spesifik (~20 cross-cutting helpers + 90 resource endpoints) terpetakan dalam 6 grup
- **Konvensi seragam:** signed JWT cookie session, response envelope `{ok, data, meta}`, 30+ error codes, ID generation `XXX-YYYYMMDD-NNNN` (date prefix WIB), pagination/filter/sort konvensi
- **5 role × matriks akses:** SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI dengan defense-in-depth (middleware + API guard)
- **4-layer reconciliation lengkap:** kode_bayar regex auto-match → smart-matching score → manual queue → cash bridging
- **State machines** ter-spec untuk Edisi (DRAFT→AKTIF→SELESAI), Hewan (DRAFT→AKTIF→TERPOTONG/BATAL), Distribusi (DRAFT→DALAM_PROSES→TERKIRIM/GAGAL→re-attempt chain)
- **Privacy-aware publik endpoints:** strict-match lookup, per-word masking (`Ho** Fa********`), captcha/honeypot, rate-limit cascading
- **Fonnte WA enabled dari F4:** template pendaftaran & pembayaran-terkonfirmasi
- **Schema delta minimal:** 2 boolean config flags untuk WA toggle, semua lainnya non-breaking annotations

🟡 **Distribusi (Section 7)** spec minimum-viable — detail final akan di-revisit pasca-observasi Hari H 1447H.

---

## 1. Konteks & Referensi

### 1.1 Posisi Tahap 3.E dalam Roadmap

```
✅ Tahap 1  — Konsep & 5 dimensi awal
✅ Tahap 2  — Schema, Architecture, Reconciliation, Migration
✅ Tahap 3  — Information Architecture
   3.A ✅ Sitemap
   3.B ✅ Navigasi & Role-based Routing
   3.C ✅ User Flow per Persona
   3.D ✅ Wireframe High-Level
   3.E ✅ API Endpoint Inventory (DOKUMEN INI)
🔜 Tahap 4  — Rencana Eksekusi Migrasi & Implementasi
🔜 Tahap 5+ — Implementasi Bertahap (F1–F10)
```

### 1.2 Sub-Tahap Konsolidasi

Dokumen ini mengkonsolidasi 6 sub-tahap yang di-review dan locked secara iteratif:

| Sub-tahap | Section di sini | Scope |
|---|---|---|
| 3.E.1 | §2 | Konvensi umum (auth, response envelope, error codes, ID generation, pagination, file upload, rate limiting, audit log, timestamp) |
| 3.E.2 | §3 | Auth & User Management endpoints |
| 3.E.3 | §4 | Edisi, Konfigurasi, Panitia, Muqorib, Master Hewan, Daftar Hewan |
| 3.E.4 | §5 | Peserta, Pemetaan, Publik Daftar & Cek Status |
| 3.E.5 | §6 | Pembayaran & 4-Layer Reconciliation |
| 3.E.6 | §7 | Distribusi, Urutan Pemotongan, Cetak Label, Laporan, Audit Log Read |

### 1.3 Out of Scope

Tahap 3.E TIDAK mencakup:
- Implementasi code (akan dilakukan di Tahap 5+ via Claude Code)
- Visual design detail (warna, font, spacing)
- Database migration script (akan disiapkan di Tahap 4 per fase)
- Performance benchmarking (defer ke phase implementasi)

---

## 2. Konvensi Umum

### 2.1 Authentication & Session

**Mekanisme:** Signed JWT di HTTP-only cookie (stateless, Vercel-friendly).

| Aspek | Spec |
|---|---|
| Cookie name | `skm_session` |
| Attributes | `HttpOnly; Secure; SameSite=Lax; Path=/` |
| Payload | `{ user_id, peran, iat, exp }` |
| TTL | 12 jam (fixed, no sliding refresh) |
| Algoritma | HS256 (HMAC-SHA256) |
| Secret | Env var `SESSION_SECRET` di Vercel |

**Middleware sequence (defense-in-depth):**

```
1. Public route check → skip auth
2. Session cookie valid (signature, exp)? → 401 AUTH_REQUIRED/AUTH_EXPIRED
3. anggota.is_active = TRUE? → 401 AUTH_INACTIVE
4. anggota.locked_until > now()? → 423 AUTH_LOCKED
5. Role allow-list match (path pattern)? → 403 FORBIDDEN_ROLE
6. Edisi access (kalau path butuh edisi)? → 403 FORBIDDEN_EDISI
7. → next() ke handler
```

**Login flow** (POST `/api/auth/login`):

```
1. Normalize telepon (08xxx → 628xxx)
2. Query anggota WHERE telepon + is_active=TRUE
3. Cek locked_until: kalau > now() → 423 AUTH_LOCKED
4. bcrypt.compare(pin, anggota.pin_hash)
   ↳ False: increment failed_attempts; ≥5 dalam 5 menit → lock 15 menit
   ↳ True: reset failed_attempts, update last_login_at, issue JWT, set cookie
5. Audit log auth.login_success / auth.login_failed / auth.locked
6. Return user info + landing_url
```

### 2.2 Response Envelope

**Success:**
```json
{
  "ok": true,
  "data": <payload>,
  "meta": {  // optional, untuk paginated list
    "total": 123,
    "page": 1,
    "page_size": 50,
    "has_more": true
  }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human readable message",
    "details": {  // optional
      "field": "pin",
      "violation": "sequential"
    }
  }
}
```

**HTTP Status Code:**

| Status | Kategori | Penggunaan |
|---|---|---|
| 200 | — | GET/POST/PUT/PATCH success |
| 201 | — | Resource creation success |
| 400 | `VALIDATION_*` | Input invalid, malformed |
| 401 | `AUTH_*` | Session invalid/expired |
| 403 | `FORBIDDEN_*` | Role/edisi mismatch |
| 404 | `NOT_FOUND` | Resource tidak ada |
| 409 | `CONFLICT`, `DUPLICATE_*` | Business state conflict |
| 422 | `BUSINESS_*` | Business rule violation |
| 423 | `AUTH_LOCKED` | Account locked |
| 429 | `RATE_LIMITED` | Rate limit terlampaui |
| 500 | `INTERNAL_ERROR` | Bug |
| 503 | `DEPENDENCY_*` | Google Sheets/Drive/Fonnte down |

### 2.3 Error Code Catalog

**Authentication & Authorization:**
- `AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_EXPIRED`, `AUTH_LOCKED`, `AUTH_INACTIVE`
- `FORBIDDEN_ROLE`, `FORBIDDEN_EDISI`

**Validation:**
- `VALIDATION_FAILED`, `VALIDATION_REQUIRED`, `VALIDATION_FORMAT`, `VALIDATION_RANGE`, `VALIDATION_ENUM`, `VALIDATION_PIN_POLICY`

**Resource State:**
- `NOT_FOUND`, `CONFLICT`
- `DUPLICATE_PESERTA`, `DUPLICATE_TELEPON`, `DUPLICATE_KODE_BAYAR`, `DUPLICATE_NOMOR_URUT`, `DUPLICATE_PANITIA`, `DUPLICATE_TRANSAKSI_LINK`, `DUPLICATE_TAHUN_HIJRIAH`, `DUPLICATE_MASTER_HEWAN`, `DUPLICATE_NOMOR_URUT_PEMOTONGAN`, `DUPLICATE_PESERTA_IN_SPLITS`

**Business Rules:**
- `BUSINESS_EDISI_NOT_AKTIF`, `BUSINESS_EDISI_LOCKED`, `BUSINESS_HEWAN_SLOT_FULL`, `BUSINESS_HEWAN_NOT_AVAILABLE`, `BUSINESS_PESERTA_INVALID`, `BUSINESS_PESERTA_SUDAH_BAYAR_PENUH`, `BUSINESS_EDISI_TUTUP_BLOCKED`, `BUSINESS_PEMETAAN_INVALID`
- `BUSINESS_INVALID_STATE_TRANSITION`, `BUSINESS_PREFLIGHT_FAILED`, `BUSINESS_LAST_SUPER_ADMIN`, `BUSINESS_CANNOT_DEACTIVATE_SELF`
- `BUSINESS_OVERPAYMENT`, `BUSINESS_OVERPAYMENT_AFTER_REFRESH`, `BUSINESS_SPLIT_TOTAL_EXCEEDS_TRANSAKSI`, `BUSINESS_TIPE_MISMATCH`, `BUSINESS_KAPASITAS_CONFLICT`, `BUSINESS_MASTER_HEWAN_IN_USE`, `BUSINESS_HEWAN_HAS_PESERTA`
- `BUSINESS_INITIAL_STATUS`, `BUSINESS_REATTEMPT_ALREADY_EXISTS`, `BUSINESS_HEWAN_SCOPE_MISMATCH`, `BUSINESS_INCOMPLETE_ORDER`, `BUSINESS_NON_SEQUENTIAL_ORDER`, `BUSINESS_ORDERING_RULE_VIOLATED`, `BUSINESS_INVALID_PERAN_FOR_PANITIA`, `BUSINESS_PENDAFTARAN_TUTUP`

**System & Dependency:**
- `RATE_LIMITED`, `CAPTCHA_FAILED`, `INTERNAL_ERROR`
- `DEPENDENCY_SHEETS`, `DEPENDENCY_DRIVE`, `DEPENDENCY_FONNTE`
- `BUKTI_EXISTS`

### 2.4 ID Generation

**Pattern:** `XXX-YYYYMMDD-NNNN`

- `XXX` = 3-letter prefix per resource
- `YYYYMMDD` = tanggal **WIB (UTC+7)** saat record dibuat
- `NNNN` = sequential 4-digit per (prefix, date)

**Prefix inventory:**

| Prefix | Resource | Sheet | Lintas-edisi? |
|---|---|---|---|
| `ANG` | Anggota | `anggota` (SKM) | Y |
| `EDS` | Edisi Qurban | `qurban_edisi` | — |
| `MQR` | Muqorib | `qurban_muqorib` | Y |
| `MHW` | Master Hewan | `qurban_master_hewan` | N |
| `KFG` | Konfigurasi Edisi | `qurban_konfigurasi_edisi` | N |
| `PNT` | Panitia | `qurban_panitia` | N |
| `HWN` | Daftar Hewan | `qurban_daftar_hewan` | N |
| `PST` | Peserta | `qurban_peserta` | N |
| `BYR` | Pembayaran | `qurban_pembayaran` | N |
| `VND` | Vendor (deferred) | `qurban_vendor` | Y |
| `DST` | Distribusi | `qurban_distribusi` | N |
| `KAT` | Kategori (SKM) | `kategori` | Y |
| `REK` | Rekening (SKM) | `rekening` | Y |
| `TRX` | Transaksi (SKM) | `transaksi` | — |
| `LOG` | Audit Log (SKM) | `audit_log` | — |

**Algorithm:**

```
1. today = format(now() in WIB, "YYYYMMDD")
2. Query sheet WHERE id LIKE "{prefix}-{today}-%" ORDER BY id DESC LIMIT 1
3. Kalau ada: parse NNNN, increment
   Kalau tidak: NNNN = "0001"
4. new_id = "{prefix}-{today}-{NNNN padded 4 digit}"
5. Concurrency: optimistic retry kalau duplicate-key error
```

### 2.5 Edisi Context Resolution

**Resolution order untuk endpoint yang butuh edisi context:**

```
1. Query param ?edisi=EDS-... 
   → Validate user can access → set + update cookie qurban_edisi
2. Else cookie qurban_edisi → Validate ulang
3. Else AKTIF edisi default → set cookie
4. Kalau tidak ada AKTIF & peran panitia: 422 BUSINESS_EDISI_NOT_AKTIF
```

**Endpoint kategori:**

| Kategori | Edisi handling |
|---|---|
| Per-edisi mandatory | `/api/qurban/peserta/*`, `/pembayaran/*`, `/hewan/*`, `/pemetaan/*`, `/distribusi/*` |
| Lintas-edisi | `/api/qurban/muqorib/*`, `/api/auth/*`, `/api/pengaturan/anggota/*` |
| Manages edisi | `/api/qurban/edisi/*` |
| Optional filter | `/api/qurban/laporan/*` (default current) |

**Validation:**
- SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN: semua status edisi
- PENDAFTARAN, DISTRIBUSI: hanya AKTIF

### 2.6 Pagination, Filter, Sort

**Query convention:**
```
?page=1&page_size=50      // default 50, max 200
&search=ahmad              // free text, scope per resource
&sort=field:asc|desc       // whitelist per resource
&status=...&jenis=...      // filter params per resource
```

**Response meta:**
```json
"meta": {
  "total": 234, "page": 1, "page_size": 50, "has_more": true,
  "filters_applied": { ... }  // optional echo
}
```

### 2.7 File Upload Pattern

**Generic upload endpoint:**

```
POST /api/qurban/upload
Content-Type: multipart/form-data

Fields:
  file: <binary>
  context: "pembayaran" | "distribusi" | "peserta"
  entity_id: BYR-... | DST-... | PST-...
  jenis: "SCREENSHOT_WA" | "SLIP_BANKING" | "FOTO_BUKTI" | "LAINNYA"
```

**Drive folder structure:**
```
SKM Bukti Qurban/{edisi_id}/{context}/{entity_id}/{timestamp}_{filename}
```

**Constraints:**
- Max 5 MB per file
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Max 10 files per entity

**Storage di field:**
- `qurban_pembayaran.bukti_url`: JSON array dengan metadata per upload
- `qurban_distribusi.bukti_url`: single URL string (replace pattern)

### 2.8 Rate Limiting

**Storage MVP:** in-memory dengan cold-start tolerance. Phase 2: Upstash Redis kalau ada abuse.

**Public endpoints:**

| Endpoint | Per-IP limit |
|---|---|
| `POST /api/publik/qurban/daftar` | 5/menit, 20/jam, 50/hari |
| `GET /api/publik/qurban/cek-status` | 30/menit |
| `POST /api/publik/qurban/daftar/lookup` | 20/menit |
| `GET /api/publik/qurban/options` | 30/menit |
| `POST /api/auth/login` | 10/menit |

**Response 429:**
```
Headers: Retry-After: 60, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

### 2.9 Audit Log Schema

Sheet `audit_log` (existing SKM, di-extend):

| Kolom | Tipe |
|---|---|
| `id` | `LOG-YYYYMMDD-NNNN` |
| `entity_type` | enum (ANGGOTA, EDISI, MUQORIB, MASTER_HEWAN, HEWAN, KONFIGURASI, PANITIA, PESERTA, PEMBAYARAN, DISTRIBUSI, TRANSAKSI, KATEGORI, REKENING, AUTH, RECONCILIATION, PUBLIK_DAFTAR, PUBLIK_PEMBAYARAN, PEMETAAN, LAPORAN) |
| `entity_id` | string FK (atau "—" untuk system events) |
| `event_type` | snake_case `entity.action` |
| `before_value` | JSON, optional |
| `after_value` | JSON, optional |
| `notes` | string, optional |
| `user_id` | FK ke anggota.id (atau "SYSTEM"/"SYSTEM_PUBLIK") |
| `ip_address` | string, optional (untuk auth & publik events) |
| `created_at` | ISO 8601 + Z |

**Write contract:** semua mutation endpoint WAJIB call `withAuditLog()` helper.

**Sensitive data:** JANGAN simpan PIN apapun di audit log.

### 2.10 Timestamp & Timezone

| Field tipe | Format | Contoh |
|---|---|---|
| Timestamp | ISO 8601 + ms + Z (UTC) | `2026-05-14T10:08:48.614Z` |
| Date-only | ISO 8601 date | `2026-06-15` |
| Storage | UTC selalu |
| ID prefix date | **WIB (UTC+7)** untuk human readability |
| Client display | WIB (convert di frontend) |

**Date range query:** server interpret `from`/`to` sebagai WIB boundary, convert ke UTC untuk query.

---

## 3. Auth & User Management

### 3.1 Auth Endpoints

| # | Method | Path | Auth | Role | Deskripsi |
|---|---|---|---|---|---|
| A1 | POST | `/api/auth/login` | Public | — | Login dengan telepon + PIN |
| A2 | POST | `/api/auth/logout` | Required | All | Clear session |
| A3 | GET | `/api/auth/me` | Required | All | Current user + permissions |
| A4 | POST | `/api/auth/change-pin` | Required | All | Self-change PIN |

#### A1: POST `/api/auth/login`

**Request:** `{ telepon, pin }`

**Validation:**
- `telepon`: required, normalize, match `^628\d{8,12}$`
- `pin`: required, match `^\d{4,6}$`

**Response 200:** `{ user, landing_url, edisi_aktif, warnings[] }`

**Errors:** 400 `VALIDATION_*`, 401 `AUTH_INVALID`, 423 `AUTH_LOCKED`, 429 `RATE_LIMITED`

#### A2: POST `/api/auth/logout`

Clear cookies, audit `auth.logout`, return `{ logged_out: true }`. Idempotent.

#### A3: GET `/api/auth/me`

Return `{ user, permissions: { can_access, qurban_edisi_locked_to_aktif }, current_edisi, session }`.

#### A4: POST `/api/auth/change-pin`

**Request:** `{ old_pin, new_pin }`

**Logic:**
1. Validate session, validate new_pin per PIN policy
2. bcrypt.compare(old_pin) → 401 kalau gagal (jangan increment failed_attempts)
3. Cek new_pin ≠ old_pin
4. Update pin_hash, updated_at
5. Audit `auth.pin_changed`
6. Session lama tetap valid

### 3.2 Anggota (User Management) Endpoints

| # | Method | Path | Role | Deskripsi |
|---|---|---|---|---|
| U1 | GET | `/api/pengaturan/anggota` | SUPER_ADMIN | List anggota |
| U2 | POST | `/api/pengaturan/anggota` | SUPER_ADMIN | Create + initial PIN |
| U3 | GET | `/api/pengaturan/anggota/[id]` | SUPER_ADMIN | Detail |
| U4 | PATCH | `/api/pengaturan/anggota/[id]` | SUPER_ADMIN | Update profile |
| U5 | POST | `/api/pengaturan/anggota/[id]/reset-pin` | SUPER_ADMIN | Reset PIN |
| U6 | POST | `/api/pengaturan/anggota/[id]/unlock` | SUPER_ADMIN | Unlock account |
| U7 | POST | `/api/pengaturan/anggota/[id]/deactivate` | SUPER_ADMIN | Soft delete |
| U8 | POST | `/api/pengaturan/anggota/[id]/reactivate` | SUPER_ADMIN | Reactivate |
| U9 | GET | `/api/pengaturan/anggota/roles` | SUPER_ADMIN | Roles dropdown |

**Key business rules:**

- **Last SUPER_ADMIN protection (U4, U7):** Tolak action kalau setelahnya tidak ada SUPER_ADMIN aktif. Error: `BUSINESS_LAST_SUPER_ADMIN`.
- **Self-deactivate protection (U7):** Cannot deactivate session.user_id. Error: `BUSINESS_CANNOT_DEACTIVATE_SELF`.
- **Telepon uniqueness:** hanya `is_active=TRUE`. Inactive user tidak block reuse.
- **PIN reset (U5) clears lockout:** failed_attempts=0, locked_until=NULL.

### 3.3 PIN Policy

| Rule | Spec |
|---|---|
| Length | 4–6 digit numerik |
| Not all same | `0000`, `1111` ditolak |
| Not sequential | `1234`, `4321`, `01234` ditolak (ascending/descending konsekutif) |
| Common weak blocklist | `1234`, `12345`, `123456`, `0000`, `1111`, `9999`, `2580`, `8686` |
| Unique antar user | bcrypt comparison saat create/change |

**Error response:**
```json
{
  "code": "VALIDATION_PIN_POLICY",
  "details": { "field": "pin", "violation": "sequential", "constraint": "..." }
}
```

### 3.4 Phone Number Normalization

**Accepted formats:** `08xxx`, `8xxx`, `+628xxx`, `628xxx`, dengan spasi/hyphen/parens.

**Algorithm:**
```typescript
function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('08')) return '62' + digits.substring(1)
  if (digits.startsWith('8')) return '62' + digits
  if (digits.startsWith('0')) return '62' + digits.substring(1)
  return digits
}
```

**Post-normalize validation:** `^628\d{8,12}$`.

### 3.5 Session Invalidation Scenarios

| Skenario | Behavior |
|---|---|
| Anggota deactivated (U7) | Middleware step 3 catches `is_active=FALSE`, 401 next request |
| Peran changed (U4) | Session lama tetap valid (JWT carry old peran), 403 di route baru |
| PIN reset (U5) | Session existing tetap valid; PIN baru hanya untuk login next |
| Cookie expired | 401 `AUTH_EXPIRED`, frontend redirect ke `/login?redirect=...` |
| Account locked saat session aktif | Session existing tetap valid (lock hanya block login) |

### 3.6 Bootstrap (First-Time Setup)

F1 deployment include migration script yang seed satu SUPER_ADMIN dari `master.pin_hash` existing SKM:

```
1. Read sheet master.pin_hash (legacy single-PIN)
2. Create anggota dengan:
   - id = ANG-{deploy-date}-0001
   - telepon = Hopy's phone
   - peran = SUPER_ADMIN
   - pin_hash = (copy from master)
   - created_by = "SYSTEM_BOOTSTRAP"
3. Hopy login → can manage users via U1-U9
```

---

## 4. Edisi & Master Endpoints

### 4.1 Endpoint Inventory

| # | Method | Path | Role | Deskripsi |
|---|---|---|---|---|
| E1 | GET | `/api/qurban/edisi` | SA, BD, AQ, PD†, DS† | List |
| E2 | POST | `/api/qurban/edisi` | SA, AQ | Create (with optional clone) |
| E3 | GET | `/api/qurban/edisi/[id]` | SA, BD, AQ, PD†, DS† | Detail |
| E4 | PATCH | `/api/qurban/edisi/[id]` | SA, AQ | Update (status-dependent fields) |
| E5 | POST | `/api/qurban/edisi/[id]/activate` | SA, AQ | DRAFT → AKTIF |
| E6 | POST | `/api/qurban/edisi/[id]/close` | SA, AQ | AKTIF → SELESAI |
| K1 | GET | `/api/qurban/konfigurasi` | All | Get konfigurasi current |
| K2 | PUT | `/api/qurban/konfigurasi` | SA, AQ | Upsert |
| P1 | GET | `/api/qurban/panitia` | All | List per edisi |
| P2 | POST | `/api/qurban/panitia` | SA, AQ | Assign anggota |
| P3 | DELETE | `/api/qurban/panitia/[id]` | SA, AQ | Remove (soft) |
| M1 | GET | `/api/qurban/muqorib` | SA, BD, AQ, PD | List lintas-edisi |
| M2 | POST | `/api/qurban/muqorib` | SA, AQ, PD | Create |
| M3 | GET | `/api/qurban/muqorib/[id]` | SA, BD, AQ, PD | Detail + history |
| M4 | PATCH | `/api/qurban/muqorib/[id]` | SA, AQ, PD | Update |
| M5 | POST | `/api/qurban/muqorib/[id]/deactivate` | SA, AQ | Soft delete |
| M6 | POST | `/api/qurban/muqorib/[id]/reactivate` | SA, AQ | Reactivate |
| M7 | GET | `/api/qurban/muqorib/lookup` | SA, AQ, PD | Smart-lookup (autocomplete) |
| MH1 | GET | `/api/qurban/master-hewan` | All | List tipe per edisi |
| MH2 | POST | `/api/qurban/master-hewan` | SA, AQ | Create tipe |
| MH3 | PATCH | `/api/qurban/master-hewan/[id]` | SA, AQ | Update harga/kapasitas |
| MH4 | POST | `/api/qurban/master-hewan/[id]/deactivate` | SA, AQ | Soft delete |
| MH5 | POST | `/api/qurban/master-hewan/bulk-upsert` | SA, AQ | Batch untuk setup awal |
| H1 | GET | `/api/qurban/hewan` | All | List inventory |
| H2 | POST | `/api/qurban/hewan` | SA, AQ, PD | Create dengan auto-numbering |
| H3 | GET | `/api/qurban/hewan/[id]` | All | Detail + slot occupants |
| H4 | PATCH | `/api/qurban/hewan/[id]` | SA, AQ, PD | Update non-numbering fields |
| H5 | POST | `/api/qurban/hewan/reorder` | SA, AQ, PD | Batch reorder dalam (jenis, kelas) |
| H6 | POST | `/api/qurban/hewan/batch-status` | SA, AQ | Batch status update |
| H7 | POST | `/api/qurban/hewan/[id]/cancel` | SA, AQ | Status → BATAL |

† PD/DS = read-only akses untuk lihat detail, bukan modify

### 4.2 Edisi State Machine

```
       create
         ↓
      [DRAFT] ──(E5 activate)──▶ [AKTIF] ──(E6 close)──▶ [SELESAI] (terminal)
         │                          │
         │ E4 update OK             │ E4 update (date fields only)
```

**E5 Activate pre-flight:**
1. status == DRAFT
2. ≥1 master_hewan aktif
3. konfigurasi exists
4. ≥1 panitia aktif
5. ≥1 hewan dengan status AKTIF
6. Tidak ada edisi lain AKTIF (atau `force_close_existing_aktif=true`)

**E6 Close pre-flight (BLOCKING):**
- Cek peserta TERDAFTAR + belum lunas: kalau ada → 422 `BUSINESS_EDISI_TUTUP_BLOCKED` dengan deep-link ke peserta list

**E6 Close warnings (non-blocking):**
- Distribusi GAGAL tanpa re-attempt

### 4.3 Hewan State Machine

```
       create (default AKTIF)
         ↓
       [DRAFT] ──▶ [AKTIF] ──(H6 batch)──▶ [TERPOTONG] (terminal)
                     │
                     └──(H6 atau H7)──▶ [BATAL] (terminal)
```

**H6 Batch transitions:**
- AKTIF → TERPOTONG: butuh `tanggal_pemotongan`
- AKTIF → BATAL: blocked kalau ada peserta TERDAFTAR

**H7 Cancel:** single hewan → BATAL, blocked kalau ada peserta aktif.

### 4.4 Hewan Auto-Numbering (H2)

Per Tahap 3 F1.5: BAWA_SENDIRI selalu lebih awal dari BELI dalam (jenis, kelas).

```
Saat tambah hewan baru:
  Jika tipe_pembelian = BAWA_SENDIRI:
    new_nomor_urut = max(BAWA_SENDIRI di group) + 1
    Jika ada BELI dengan nomor_urut >= new_nomor_urut → SHIFT BELI += 1
  Jika tipe_pembelian = BELI:
    new_nomor_urut = max(nomor_urut di group) + 1
```

### 4.5 Muqorib Smart Lookup (M7)

**Query:** `?q=ahmad&limit=10&min_score=0.6`

**Algorithm:**
1. Exact name match: score 1.0
2. Substring name match: score 0.85
3. Fuzzy (Jaro-Winkler): score = jw(q, nama_lengkap)
4. Phone last-4 match: +0.2 (cap 1.0)
5. RT/alamat substring: small boost
6. Filter ≥ min_score, sort desc, tie-break has_history

**Privacy:** no_hp masked di response (`628****6789`).

### 4.6 Edisi Lock Levels

| Status | Edisi | Master Hewan | Hewan | Konfig | Panitia | Peserta | Pembayaran | Distribusi |
|---|---|---|---|---|---|---|---|---|
| DRAFT | Edit | Edit | Edit | Edit | Edit | — | — | — |
| AKTIF | Date-only | Edit | Edit | Edit | Edit | Edit | Edit | Edit |
| SELESAI | Read-only | Read-only | Read-only | Read-only | Read-only | Read-only | Read-only | Read-only |

### 4.7 Clone Edisi (E2 with clone_from)

**Request includes:**
```json
{
  "clone_from": "EDS-...",
  "clone_options": {
    "master_hewan": true,    // default true
    "konfigurasi": true,     // default true
    "panitia": false         // default false (berganti tahunan)
  }
}
```

**Logic:**
1. Insert new edisi (DRAFT)
2. Copy per clone_options: regenerate IDs, set edisi_id baru
3. Set new.parent_edisi_id + cloned_at

---

## 5. Pendaftaran, Pemetaan & Publik Endpoints

### 5.1 Endpoint Inventory

| # | Method | Path | Role | Deskripsi |
|---|---|---|---|---|
| PS1 | GET | `/api/qurban/peserta` | SA, BD, AQ, PD | List dengan filter |
| PS2 | POST | `/api/qurban/peserta` | SA, AQ, PD | Create (multi-slot support) |
| PS3 | GET | `/api/qurban/peserta/[id]` | SA, BD, AQ, PD | Detail |
| PS4 | PATCH | `/api/qurban/peserta/[id]` | SA, AQ, PD | Update non-slot |
| PS5 | POST | `/api/qurban/peserta/[id]/cancel` | SA, AQ | TERDAFTAR → BATAL |
| PS6 | POST | `/api/qurban/peserta/check-duplicate` | SA, AQ, PD | Pre-submit Layer 1 check |
| PS7 | POST | `/api/qurban/peserta/[id]/refresh-harga` | SA, AQ | Apply harga master |
| PS8 | GET | `/api/qurban/peserta/available-slots` | SA, AQ, PD | Slot tersedia |
| PM1 | POST | `/api/qurban/pemetaan/batch-save` | SA, AQ, PD | Apply drag-drop ops |
| PM2 | GET | `/api/qurban/pemetaan/state` | SA, AQ, PD, DS† | Snapshot state |
| PB1 | GET | `/api/publik/qurban/options` | Public | Available hewan tipe |
| PB2 | POST | `/api/publik/qurban/daftar/lookup` | Public | Strict-match muqorib |
| PB3 | POST | `/api/publik/qurban/daftar` | Public | Submit pendaftaran |
| PB4 | GET | `/api/publik/qurban/cek-status` | Public | Cek by kode_bayar/no_hp |

### 5.2 Peserta Create (PS2) — Multi-Slot Pattern

**Request:**
```json
{
  "muqorib_id": "MQR-...",
  "master_hewan_id": "MHW-...",
  "tipe_qurban": "BELI",
  "jumlah_slot": 3,
  "nama_atas_nama_per_slot": [null, "Almarhumah Ibu", "Almarhum Bapak"],
  "keterangan_bagian": "Daging+Jeroan",
  "allow_additional_qurban": false
}
```

**Logic:**
1. Validate, duplicate detection Layer 1
2. Auto-assign hewan + slot per slot:
   - Query hewan WHERE matching tipe + status=AKTIF + has_kosong_slot
   - ORDER BY nomor_urut ASC LIMIT 1
   - Slot kosong terkecil dulu
   - Auto-split ke hewan berikutnya kalau perlu
3. Generate kode_bayar per slot: `QRB-{tahun_hijriah_short}-{NNN}` (sequence per edisi)
4. Freeze harga_disepakati dari master saat ini
5. Insert N peserta records dengan sumber_pendaftaran=PANITIA
6. Audit log per peserta `peserta.created`

### 5.3 Peserta Cancel (PS5)

**Request:** `{ alasan, refund_handling }`

**Logic:**
1. Validate status=TERDAFTAR
2. Update status_pendaftaran=BATAL
3. Slot otomatis kosong (computed)
4. Pembayaran existing TIDAK auto-deactivate (preserve audit)
5. Refund out-of-band, response include warning kalau ada pembayaran

### 5.4 Duplicate Detection (Layer 1)

**Query:**
```sql
SELECT * FROM qurban_peserta 
WHERE muqorib_id = :muqorib_id
  AND edisi_id = :current_edisi
  AND status_pendaftaran = 'TERDAFTAR'
```

**Response patterns:**
- 0 result: silent, lanjut normal
- 1+ result, allow_additional_qurban=false: 409 `DUPLICATE_PESERTA` dengan options menu
- 1+ result, allow=true: lanjut, log flag is_additional_qurban=true

### 5.5 Pemetaan Batch Save (PM1)

**Request:**
```json
{
  "edisi_id": "EDS-...",
  "expected_version": "2026-05-14T10:08:48.614Z",
  "operations": [
    {
      "type": "move_peserta",
      "peserta_id": "PST-...",
      "target_hewan_id": "HWN-...",
      "target_slot_number": 2,
      "harga_decision": "use_old"  // use_old | use_new | use_custom | use_existing_target
    },
    {
      "type": "swap_peserta",
      "peserta_id_a": "PST-...",
      "peserta_id_b": "PST-..."
    },
    {
      "type": "renumber_hewan",
      "hewan_id": "HWN-...",
      "new_nomor_urut": 3
    }
  ],
  "audit_notes": "..."
}
```

**Harga Decision Matrix (cross-class move):**

| Decision | Behavior |
|---|---|
| `use_old` | Pertahankan harga_disepakati lama |
| `use_new` | Update ke harga target hewan |
| `use_custom` | Pakai `harga_override` |
| `use_existing_target` | (swap) Tukar dengan harga peserta sebelumnya di posisi itu |

**Atomic apply:**
1. Validate `expected_version` == current
2. Per operation: validate (cross-op too)
3. Compute final state, validate business rules
4. Atomic write batch ke Sheets
5. Audit per operation, update version timestamp

**Conflict response:** 409 dengan version mismatch info.

### 5.6 Publik Daftar Flow (PB1 → PB2 → PB3)

**PB1 — Options (step 1):**

Returns available hewan tipe + harga + slot tersedia + rekening pembayaran. Empty kalau pendaftaran TUTUP atau no AKTIF edisi.

**PB2 — Strict Lookup (step 2):**

Request: `{ nama_lengkap, no_hp }`. Strict match (exact nama lowercase trim + exact normalized no_hp). Return single muqorib + history, atau null. Tidak fuzzy — privacy.

**PB3 — Submit (step 3):**

Request includes muqorib_id (matched) OR muqorib_data (new). Captcha required.

**Logic:**
1. Rate limit + captcha
2. Edisi pendaftaran open?
3. Resolve atau create muqorib:
   - muqorib_id: fetch
   - muqorib_data: cek no_hp existing
     - Match: use existing (audit log kalau nama/alamat conflict, keep old data)
     - No match: create new
4. Duplicate detection (Layer 1)
5. Auto-assign hewan + slot
6. Generate kode_bayar
7. Insert peserta dengan sumber_pendaftaran=PUBLIK
8. **Trigger Fonnte WA `pendaftaran_publik` async**
9. Return peserta + instruksi pembayaran

### 5.7 Cek Status (PB4) — Privacy

**Query:** `?kode_bayar=QRB-...` OR `?no_hp=08...`

**Response includes masked nama:**

**Masking algorithm (per-word, 2 chars first + asterisks):**
```typescript
function maskNama(nama: string): string {
  return nama.trim().split(/\s+/).map(word => {
    if (word.length <= 2) return word
    return word.substring(0, 2) + '*'.repeat(word.length - 2)
  }).join(' ')
}
```

**Contoh:**
- `Hopy Familianto` → `Ho** Fa********`
- `Ahmad Fauzi` → `Ah*** Fa***`
- `Pak Budi` → `Pak Bu**`
- `Al-Hafiz Rahman` → `Al-***** Ra*****`

**Response field:** `muqorib_nama_masked`.

### 5.8 PII Exposure Matrix

| Field | Panitia (PS1) | Publik (PB4) | Strict Lookup (PB2) |
|---|---|---|---|
| nama_lengkap | Full | Per-word masked | Full (user own data) |
| no_hp | Full | Tidak return | Full |
| alamat | Full | Tidak return | Full |
| kode_bayar | Full | Full | — |
| harga_disepakati | Full | Full | — |

### 5.9 Anti-Bot Measures

| Endpoint | Measure |
|---|---|
| PB1 (read) | Rate limit |
| PB2 (lookup) | Rate limit + nama+HP both required |
| PB3 (submit) | Rate limit + honeypot field + captcha |
| PB4 (cek-status) | Rate limit + masked nama |

**Captcha:** honeypot field untuk MVP (zero dependency).

### 5.10 Slot Assignment Priority

```sql
SELECT hewan FROM qurban_daftar_hewan 
WHERE edisi_id = :edisi
  AND matching (jenis, kelas, tipe_pembelian)
  AND status = 'AKTIF'
  AND slot_terisi < kapasitas_slot
ORDER BY nomor_urut ASC
LIMIT 1
```

Slot dalam hewan: kosong terkecil dulu (1, 2, 3, ...).
Multi-slot: split ke hewan berikutnya kalau slot kosong di hewan terpilih < jumlah_slot.

### 5.11 Fonnte WA Confirmation (Enabled di F4)

**Trigger points (pendaftaran):**
- PB3 sukses: template `pendaftaran_publik`
- PS2 sukses: template `pendaftaran_panitia`

**Template `pendaftaran_publik`:**
```
Assalamu'alaikum {nama_muqorib},

Pendaftaran qurban Anda untuk edisi {tahun_hijriah} di Masjid Al Jabar telah TERCATAT.

📋 Detail:
- {jenis} Kelas {kelas} — {jumlah_slot} slot
- Kode Pembayaran: {kode_bayar}
- Total: Rp {total_harga_formatted}
- Disarankan transfer: Rp {nominal_with_suffix_formatted}

💳 Rekening:
{rekening_list}

Cara konfirmasi:
1. Transfer ke rekening di atas dengan nominal +3
2. Berita transfer: tulis {kode_bayar}
3. Kirim bukti transfer ke nomor ini (WA)

Jazakallahu khairan.
— Panitia Qurban Masjid Al Jabar
```

**Error handling:** Async fire-and-forget. Fail → audit `publik.wa_sent_failed`, response warning. TIDAK fail keseluruhan flow.

**Config flags di `qurban_konfigurasi_edisi` (schema delta):**
- `wa_send_on_pendaftaran` (default TRUE)
- `wa_send_on_pembayaran_confirmed` (default TRUE)

---

## 6. Pembayaran & Reconciliation

### 6.1 Endpoint Inventory

| # | Method | Path | Role | Deskripsi |
|---|---|---|---|---|
| BY1 | GET | `/api/qurban/pembayaran` | SA, BD, AQ, PD | List dengan filter |
| BY2 | POST | `/api/qurban/pembayaran` | SA, BD, AQ, PD | Manual create |
| BY3 | GET | `/api/qurban/pembayaran/[id]` | SA, BD, AQ, PD | Detail |
| BY4 | PATCH | `/api/qurban/pembayaran/[id]` | SA, BD, AQ, PD | Update notes only |
| BY5 | POST | `/api/qurban/pembayaran/[id]/deactivate` | SA, BD | Soft delete |
| BY6 | POST | `/api/qurban/pembayaran/[id]/bukti` | All | Upload + append bukti |
| BY7 | DELETE | `/api/qurban/pembayaran/[id]/bukti` | SA, BD | Remove bukti |
| BY8 | POST | `/api/qurban/pembayaran/[id]/link-transaksi` | SA, BD | Link manual |
| BY9 | POST | `/api/qurban/pembayaran/[id]/unlink-transaksi` | SA, BD | Unlink |
| BY10 | POST | `/api/qurban/pembayaran/split-from-transaksi` | SA, BD | 1 trx → N pembayaran |
| RC1 | POST | `/api/qurban/reconciliation/auto-match-csv` | SA, BD | Rerun Layer 1 |
| RC2 | GET | `/api/qurban/reconciliation/candidates-for-transaksi/[id]` | SA, BD | L2 scored candidates |
| RC3 | POST | `/api/qurban/reconciliation/confirm-match` | SA, BD | Confirm L2/L3 |
| RC4 | GET | `/api/qurban/reconciliation/unmatched-queue` | SA, BD | Trx belum ter-link |
| RC5 | GET | `/api/qurban/reconciliation/unmatched-peserta` | SA, BD, AQ | Peserta belum lunas |
| RC6 | GET | `/api/qurban/reconciliation/cash-bridge-summary` | SA, BD | Cash bridge summary |
| ST1 | POST | `/api/qurban/pembayaran/refresh-status` | SA, BD | Re-compute status |

### 6.2 Pembayaran Create (BY2)

**Request (cash):**
```json
{
  "peserta_id": "PST-...",
  "tanggal_bayar": "2026-04-16",
  "jumlah": 4000000,
  "metode": "TUNAI",
  "panitia_terima_id": "ANG-...",   // wajib kalau TUNAI
  "bukti_url": [],
  "notes": null
}
```

**Logic:**
1. Validate (overpayment = warning only, not block)
2. Generate id BYR-...
3. Insert dengan:
   - `match_metadata.layer = 4` kalau TUNAI
   - `bank_ref = null` (auto-fill saat CSV match nanti)
4. Audit `pembayaran.added`
5. Trigger Fonnte `pembayaran_lunas` kalau make peserta LUNAS (async)
6. Return + peserta_status_update

### 6.3 Pembayaran Immutability (BY4)

Hanya `notes` editable. Field finansial (`jumlah`, `tanggal_bayar`, `metode`, `peserta_id`) immutable — kalau salah, BY5 deactivate + BY2 re-create.

**Rationale:** Audit integrity untuk financial record.

### 6.4 4-Layer Reconciliation

#### Layer 1 — Auto-Match dari CSV

**Internal hook di `/api/import-csv` existing flow:**
```
After CSV import success:
  Per new transaksi:
    1. Regex check description: /QRB-\d{4}-\d{3}/
    2. Found: lookup peserta WHERE kode_bayar matches
    3. Create pembayaran with layer=1, score=100, signal="kode_bayar_exact"
    4. Link skm_transaksi_id, auto-fill bank_ref
```

**RC1: Manual trigger rerun:**

```json
{
  "transaksi_ids": null,         // null = scan all unmatched
  "tanggal_from": "2026-04-01",
  "tanggal_to": "2026-05-14",
  "dry_run": false
}
```

#### Layer 2 — Smart Matching (RC2)

**Score per Tahap 2 §5.2:**

| Signal | Bobot |
|---|---|
| Nominal suffix `3` | +30 |
| Keyword QRB/QURBAN/KURBAN di description | +30 |
| Nominal match harga peserta (±1%) | +25 |
| Tanggal dalam 14 hari sejak tanggal_daftar | +15 |
| Fuzzy match nama (Jaro-Winkler ≥ 0.8) | +20 |
| Phone match (last 4 atau full) | +10 |

**Threshold suggest:** ≥ 50.

**Response:** scored candidates + breakdown per signal + match_indicators.

#### Layer 3 — Manual Queue (RC4, RC5)

**RC4: Unmatched transaksi queue:**
- Filter: nominal Rp 1jt – 30jt (configurable)
- Belum ter-link ke qurban_pembayaran
- Sort by tanggal_desc, age_days tracking

**RC5: Unmatched peserta (belum lunas):**
- Untuk follow-up by panitia
- Sort by tanggal_daftar asc (tertua dulu)

#### Layer 4 — Cash Bridging

```
1. Panitia terima cash → BY2 create (metode=TUNAI, no skm_transaksi_id)
2. Cash dikumpul → setor tunai ke bank
3. Setor tunai muncul di CSV → SKM existing logic: SETOR TUNAI = SPLIT mandatory
4. Bendahara split: alokasi Qurban portion via SKM UI
5. Cash pembayaran TIDAK auto-link 1-to-1 (banyak-ke-satu pattern)
```

**RC6: Cash bridge summary** — helper untuk bendahara saat split setor tunai.

### 6.5 Confirm Match (RC3)

Endpoint terpadu untuk Layer 2 (suggested) atau Layer 3 (manual).

**Request:**
```json
{
  "transaksi_id": "TRX-...",
  "peserta_id": "PST-...",
  "match_method": "layer_2_suggest",  // atau "layer_3_manual"
  "score_at_confirm": 95,
  "signals_used": ["nominal_exact", "suffix_3", "qrb_keyword"],
  "notes": null
}
```

**Logic:**
1. Validate trx belum ter-link
2. Generate BYR-...
3. Insert dengan match_metadata layer, score, signals, confirmed_by
4. Audit `pembayaran.linked`
5. Trigger Fonnte kalau lunas

### 6.6 Split Workflow (BY10)

**Request:**
```json
{
  "skm_transaksi_id": "TRX-...",
  "splits": [
    { "peserta_id": "PST-...", "jumlah": 4000000, "notes": "..." },
    { "peserta_id": "PST-...", "jumlah": 4000003 }
  ],
  "audit_notes": "..."
}
```

**Validation:** Sum splits.jumlah ≤ trx.nominal (sisa boleh masuk non-Qurban kategori SKM).

**Logic:** Per split insert pembayaran (semua share trx_id). Audit `pembayaran.split_workflow_executed`.

### 6.7 Status Bayar Computation

```typescript
function computeStatusBayar(total_dibayar: number, harga_disepakati: number) {
  if (total_dibayar === 0) return 'belum'
  if (total_dibayar < harga_disepakati) return 'sebagian'
  if (total_dibayar === harga_disepakati) return 'lunas'
  if (total_dibayar - harga_disepakati <= 10) return 'lunas'  // suffix +3 tolerance
  return 'overpaid'
}
```

**Suffix tolerance:** ≤ Rp 10 di-treated sebagai 'lunas' untuk avoid false overpaid (pembayaran +3 suffix biasa).

### 6.8 Fonnte WA Pembayaran

**Templates:**
- `pembayaran_lunas` — peserta jadi LUNAS dari pembayaran ini
- `pembayaran_diterima` — partial payment received

**Anti-spam:** Max 1 WA per peserta per hari per template type.

### 6.9 Bukti Workflow

**BY6 Upload + Append:**
- multipart/form-data dengan `file`, `jenis`, `notes`
- Upload to Drive: `SKM Bukti Qurban/{edisi_id}/pembayaran/{BYR-id}/`
- Append metadata object ke `bukti_url` JSON array
- Validate max 10 files per pembayaran

**BY7 Delete:**
- DELETE dengan `drive_file_id` query
- Move Drive file ke trash (bukan hard delete)
- Remove dari array

---

## 7. Distribusi, Laporan & Audit Log 🟡

🟡 **Pending validation 1447H** — sub-flow distribusi spec minimum-viable, detail final menunggu observasi.

### 7.1 Endpoint Inventory

| # | Method | Path | Role | Deskripsi |
|---|---|---|---|---|
| DS1 | GET | `/api/qurban/distribusi` | SA, BD†, AQ, DS | List |
| DS2 | POST | `/api/qurban/distribusi` | SA, AQ, DS | Create |
| DS3 | GET | `/api/qurban/distribusi/[id]` | SA, BD†, AQ, DS | Detail |
| DS4 | PATCH | `/api/qurban/distribusi/[id]` | SA, AQ, DS | Update non-status |
| DS5 | POST | `/api/qurban/distribusi/[id]/status` | SA, AQ, DS | Status → DALAM_PROSES/TERKIRIM |
| DS6 | POST | `/api/qurban/distribusi/[id]/bukti` | SA, AQ, DS | Upload bukti (single, replace) |
| DS7 | POST | `/api/qurban/distribusi/[id]/mark-gagal` | SA, AQ, DS | Status → GAGAL |
| DS8 | POST | `/api/qurban/distribusi/[id]/reattempt` | SA, AQ, DS | New record dari GAGAL |
| DS9 | POST | `/api/qurban/distribusi/batch-create` | SA, AQ, DS | Bulk create dari peserta |
| UP1 | POST | `/api/qurban/urutan-pemotongan/generate` | SA, AQ | Auto-generate per jenis |
| UP2 | GET | `/api/qurban/urutan-pemotongan` | All | Read state |
| UP3 | POST | `/api/qurban/urutan-pemotongan/reorder` | SA, AQ | Manual reorder |
| UP4 | POST | `/api/qurban/urutan-pemotongan/reset` | SA, AQ | Clear semua |
| UP5 | GET | `/api/qurban/urutan-pemotongan/print` | SA, AQ, DS, PD | Daftar Pemotongan |
| LB1 | GET | `/api/qurban/distribusi/labels` | SA, AQ, DS | Data label cetak |
| LP1 | GET | `/api/qurban/laporan/peserta` | SA, BD, AQ, PD†, DS† | Laporan peserta |
| LP2 | GET | `/api/qurban/laporan/hewan` | SA, BD, AQ, PD†, DS† | Laporan hewan |
| LP3 | GET | `/api/qurban/laporan/distribusi` | SA, BD†, AQ, DS, PD† | Laporan distribusi |
| LP4 | GET | `/api/qurban/laporan/keuangan` | SA, BD, AQ | Saldo Qurban + korelasi |
| LP5 | GET | `/api/qurban/laporan/dashboard` | All | Dashboard widget |
| LP6 | GET | `/api/qurban/laporan/export` | SA, BD, AQ | Export PDF/Excel |
| AL1 | GET | `/api/qurban/audit-log` | Per scope | Read audit timeline |

### 7.2 Distribusi State Machine

```
       create
         ↓
      [DRAFT] ──(DS5)──▶ [DALAM_PROSES] ──(DS5)──▶ [TERKIRIM] (terminal)
         │                    │
         │                    │ (DS7 mark-gagal)
         │                    ▼
         │                 [GAGAL] ──(DS8 reattempt)──▶ new DRAFT/DALAM_PROSES
         │                    │
         └─(DS7)──────────────┘
```

**Re-attempt chain:** GAGAL → new DST dengan `reattempt_of_id`. Source updated dengan `reattempted_by_id`. Bisa berlanjut (gagal lagi → re-attempt lagi).

### 7.3 Distribusi Pre-flight Warnings

| Kondisi | Warning vs Block |
|---|---|
| peserta.status_bayar = 'belum' | Warning |
| peserta.status_bayar = 'sebagian' | Warning |
| hewan.status ≠ 'TERPOTONG' | Warning |
| peserta.status_pendaftaran = 'BATAL' | BLOCK (422) |

### 7.4 Batch Create Distribusi (DS9)

**Scope modes:**
- `all_terdaftar_lunas`: semua peserta lunas
- `by_rt`: filter by muqorib.rt
- `by_peserta_ids`: explicit list
- `by_hewan_ids`: semua peserta di hewan tertentu

**Skip logic:** kalau `skip_if_exists=true`, skip peserta yang sudah ada DST aktif.

### 7.5 Urutan Pemotongan (UP1 Auto-Generate)

**Algorithm (per Tahap 3 F4.1):**

```
Resolve target hewan (edisi + jenis filter + status != BATAL)
Sort:
  Primary: tipe_pembelian ASC (BAWA_SENDIRI < BELI)
  Secondary: id ASC (urutan input ke sistem)
Assign nomor_urut_pemotongan per hewan dalam jenis grup (1, 2, 3, ...)
```

**Pre-flight:** warning kalau slot belum penuh (tidak block).

**Force overwrite:** default false (preserve manual override dari UP3).

### 7.6 Cetak Label (LB1)

**Query:**
```
?mode=per_hewan|per_rt|custom
&hewan_id=... | &rt=... | &peserta_ids=...
&include_slot=true&include_qr=true
&copies_per_label=2
&format=json|html|pdf
```

**Response:** array of label data (nama, alamat, rt, kode_bayar, hewan_display, slot, keterangan, qr_data, copies).

🟡 Layout finalize pasca-1447H. MVP: data structure + basic template.

### 7.7 Laporan Endpoints (LP1–LP4)

**LP1 Peserta:** group_by ∈ {rt, jenis, kelas, tipe, status_bayar, status_pendaftaran}

**LP2 Hewan:** group_by ∈ {jenis, kelas, tipe_pembelian, status, vendor}, include biaya pembelian

**LP3 Distribusi:** group_by ∈ {status, metode_kirim, rt, petugas}, include gagal breakdown

**LP4 Keuangan — Saldo Qurban (per Tahap 3 §6.5):**

```
Dana Terhimpun       : Rp 168.003.000  
  • TRANSFER         : Rp 145.000.000
  • VA               : Rp 14.003.000
  • TUNAI            : Rp 9.000.000

Biaya                : Rp 120.100.000
  • Pembelian hewan  : Rp 110.600.000
  • BOP operasional  : Rp 5.000.000
  • Jasa titip & pakan: Rp 4.500.000

Saldo Qurban         : Rp 47.903.000

Korelasi SKM         : match ✅
Rekonsiliasi tunai   : selisih Rp 0 ✅
```

**Korelasi SKM:** Cross-check qurban_dana_terhimpun vs SKM MASUK kategori Qurban. Diff tracking + suggestion link ke RC4.

**Rekonsiliasi tunai:** Sum cash pembayaran vs Qurban portion di SETOR TUNAI split entries.

### 7.8 Dashboard (LP5)

4 ringkasan cards (per Tahap 3 §6.5):
- Peserta Terdaftar (count + trend)
- Dana Terhimpun (Rp + percentage estimasi)
- Hewan Siap (terpotong/total)
- Status Edisi (phase: preparation/pendaftaran/hari_h/distribusi/finalisasi)

Plus: actionable alerts, recent activity (last 5 audit events).

### 7.9 Export (LP6)

Wrapper untuk export ke PDF atau Excel:
- `type=peserta|hewan|distribusi|keuangan|semua_summary`
- `format=pdf|excel`
- Mirror query params dari LP1-LP4

**MVP:** Excel only (via openpyxl). PDF deferred.

### 7.10 Audit Log Read (AL1)

**Query:**
```
?entity_type=PESERTA&entity_id=PST-...
&event_type=peserta.slot_moved   // optional filter
&user_id=ANG-...                  // optional actor
&from=2026-04-01&to=2026-05-14    // date range
&page=1&page_size=50
```

**Role-based access:**

| Role | Akses entity_type |
|---|---|
| SUPER_ADMIN | All |
| BENDAHARA | All read |
| ADMIN_QURBAN | All Qurban-related |
| PENDAFTARAN | PESERTA, MUQORIB, PEMBAYARAN (own scope) |
| DISTRIBUSI | DISTRIBUSI, HEWAN status changes |

**Display hints** (server-computed untuk timeline UI):
```json
{
  "display_hints": {
    "title": "Slot Dipindah",
    "subtitle": "Sapi-A-03 → Sapi-B-01",
    "color": "yellow",
    "icon": "arrow-right",
    "details": [
      { "label": "Dari", "value": "Sapi-A-03 slot 3" },
      { "label": "Ke", "value": "Sapi-B-01 slot 1" }
    ]
  }
}
```

### 7.11 RT Resolution untuk Laporan/Filter

Untuk filter/group by RT di distribusi/laporan:

```
1. Kalau distribusi.metode_kirim = VIA_RT: pakai distribusi.rt_pengiriman
2. Kalau metode_kirim = LANGSUNG_KE_MUQORIB: pakai muqorib.rt
3. Kalau metode_kirim = AMBIL_DI_MASJID: skip RT grouping (atau "—")
```

### 7.12 Saldo Discrepancies Handling (LP4)

| Skenario | Reason umum |
|---|---|
| `qurban_dana_terhimpun > skm_masuk_qurban` | Manual entry pembayaran sebelum CSV |
| `qurban_dana_terhimpun < skm_masuk_qurban` | SKM punya MASUK Qurban belum di-link ke peserta (queue di L3) |
| Cash vs setor tunai mismatch | Cash collection vs setor tunai split mismatch — reconciliation manual |

UI render suggestion link ke RC4 atau RC6.

---

## 8. Decisions Log (Tahap 3.E)

Semua decisions yang di-lock selama 3.E, terkonsolidasi:

### 3.E.1 — Konvensi Umum

| # | Decision | Pilihan |
|---|---|---|
| D1.1 | Session mechanism | Signed JWT di HTTP-only cookie |
| D1.2 | ID prefix date | WIB (untuk human readability) |
| D1.3 | Rate limit storage MVP | In-memory dengan cold-start tolerance |

### 3.E.2 — Auth & User Management

| # | Decision | Pilihan |
|---|---|---|
| D2.1 | Bootstrap method | Migration script di F1 seed SUPER_ADMIN dari master.pin_hash existing |
| D2.2 | Self-update profile by user | NO — semua profile update via SUPER_ADMIN (U4) |
| D2.3 | Forced PIN change first login | NO |
| D2.4 | Login rate limit storage | In-memory (per D1.3) |

### 3.E.3 — Edisi & Master

| # | Decision | Pilihan |
|---|---|---|
| D3.1 | force_close_existing_aktif di E5 | Allow dengan eksplisit flag |
| D3.2 | Smart-lookup no_hp masking | Middle 4 digit masked (`628****6789`) |
| D3.3 | Bulk-upsert MH5 | Hanya saat DRAFT |
| D3.4 | MH4 deactivate cascade | Block kalau ada daftar_hewan AKTIF reference |
| D3.5 | H6 batch-status BATAL by filter | Tidak allowed (BATAL hanya by_ids) |
| D3.6 | E4 PATCH edisi AKTIF fields | Date-only |

### 3.E.4 — Pendaftaran, Pemetaan, Publik

| # | Decision | Pilihan |
|---|---|---|
| D4.1 | Multi-slot di single request | Allowed dengan `jumlah_slot` param |
| D4.2 | Cross-tipe move (BELI↔BAWA_SENDIRI) di PM1 | Allowed dengan modal harga |
| D4.3 | Captcha PB3 | Honeypot field untuk MVP |
| D4.4 | Fonnte WA confirmation | **ENABLED dari F4** (override default) |
| D4.5 | Refund automation saat cancel | No automation |
| D4.6 | PB4 cek-status masking | **Per-word, 2 char first + asterisks** (override default) |
| D4.7 | Auto-create muqorib dari publik | Allowed kalau no_hp tidak match existing |

### 3.E.5 — Pembayaran & Reconciliation

| # | Decision | Pilihan |
|---|---|---|
| D5.1 | Overpayment tolerance suffix +3 | ≤ Rp 10 treated sebagai 'lunas' |
| D5.2 | Pembayaran immutability | Strict — soft-delete + re-create pattern |
| D5.3 | Layer 2 threshold default | 50 |
| D5.4 | Auto-trigger L1 saat CSV import | Yes — internal hook |
| D5.5 | Split sum vs trx.nominal | ≤ allowed (sisa non-Qurban di SKM) |
| D5.6 | Cancelled peserta refund | No automation |
| D5.7 | Fonnte per-template flag | Granular di konfigurasi |
| D5.8 | RC4 unmatched-queue nominal range | Configurable di konfigurasi edisi |

### 3.E.6 — Distribusi & Laporan

| # | Decision | Pilihan |
|---|---|---|
| D6.1 | Bukti distribusi multiple files | Single file replace untuk MVP |
| D6.2 | Re-attempt chain | Yes — unlimited cycles |
| D6.3 | Batch-create skip belum lunas | Skip dengan warning |
| D6.4 | Urutan force_overwrite | Default false (preserve manual) |
| D6.5 | Cetak label format MVP | HTML |
| D6.6 | LP4 selisih korelasi threshold | 0 tolerance |
| D6.7 | LP6 export format MVP | Excel only |
| D6.8 | Dashboard recent activity | Last 5 events |

---

## 9. Audit Log Event Catalog (Konsolidasi)

Semua event types yang di-track di sistem, dikategorikan per entity:

### 9.1 AUTH & ANGGOTA

- `auth.login_success`, `auth.login_failed`, `auth.locked`, `auth.unlocked_manual`, `auth.logout`, `auth.pin_changed`, `auth.pin_reset_by_admin`
- `anggota.created`, `anggota.updated`, `anggota.peran_changed`, `anggota.deactivated`, `anggota.reactivated`

### 9.2 EDISI & MASTER

- `edisi.created`, `edisi.cloned_from`, `edisi.updated`, `edisi.status_changed`, `edisi.activate_failed_preflight`
- `konfigurasi.created`, `konfigurasi.updated`
- `panitia.assigned`, `panitia.removed`
- `muqorib.created`, `muqorib.updated`, `muqorib.deactivated`, `muqorib.reactivated`, `muqorib.auto_created_from_publik`, `muqorib.data_conflict_detected`
- `master_hewan.created`, `master_hewan.harga_updated`, `master_hewan.kapasitas_updated`, `master_hewan.deactivated`

### 9.3 HEWAN

- `hewan.created`, `hewan.updated`, `hewan.nomor_urut_changed`, `hewan.status_changed`, `hewan.batch_terpotong`, `hewan.cancelled`
- `hewan.urutan_pemotongan_assigned`, `hewan.urutan_pemotongan_changed`, `hewan.urutan_pemotongan_reset`

### 9.4 PESERTA & PEMETAAN

- `peserta.created` (dengan `is_additional_qurban` flag, `sumber_pendaftaran`)
- `peserta.updated`, `peserta.slot_moved`, `peserta.harga_changed`, `peserta.tipe_changed`, `peserta.status_changed`, `peserta.batal`
- `pemetaan.batch_save` (single event untuk batch op dengan operations array)

### 9.5 PEMBAYARAN & RECONCILIATION

- `pembayaran.added`, `pembayaran.deactivated`, `pembayaran.notes_updated`
- `pembayaran.bukti_added`, `pembayaran.bukti_removed`
- `pembayaran.linked` (dengan trx_id + layer), `pembayaran.unlinked`
- `pembayaran.split_workflow_executed`
- `reconciliation.auto_match_csv_run`, `reconciliation.layer_2_confirmed`, `reconciliation.layer_3_confirmed`, `reconciliation.refresh_status_run`

### 9.6 DISTRIBUSI

- `distribusi.created`, `distribusi.updated`, `distribusi.status_changed`, `distribusi.marked_gagal`
- `distribusi.reattempted_from`, `distribusi.reattempted_by_spawned`
- `distribusi.bukti_uploaded`, `distribusi.bukti_replaced`
- `distribusi.batch_created`

### 9.7 PUBLIK & SISTEM

- `publik.daftar_attempted`, `publik.daftar_succeeded`, `publik.daftar_duplicate_detected`, `publik.daftar_captcha_failed`, `publik.daftar_rate_limited`
- `publik.wa_sent_success`, `publik.wa_sent_failed`
- `publik.wa_pembayaran_lunas_sent`, `publik.wa_pembayaran_lunas_failed`, `publik.wa_pembayaran_diterima_sent`
- `laporan.exported`

---

## 10. Schema Delta dari 3.E

Schema additions selama 3.E (di luar yang sudah di Tahap 2 + Tahap 3):

### 10.1 Sheet `qurban_konfigurasi_edisi` — 2 Boolean Flags

| Kolom | Tipe | Default | Catatan |
|---|---|---|---|
| `wa_send_on_pendaftaran` | boolean | `TRUE` | Toggle Fonnte WA saat pendaftaran sukses |
| `wa_send_on_pembayaran_confirmed` | boolean | `TRUE` | Toggle Fonnte WA saat pembayaran lunas/diterima |

🟡 **Implementation note:** Non-breaking additions. Default TRUE supaya feature aktif by default.

### 10.2 Audit Log Schema Extension

Sheet `audit_log` (existing SKM) perlu memastikan struktur:
- `entity_type` (enum diperluas, lihat §2.9)
- `event_type` (snake_case `entity.action`)
- `before_value`, `after_value` (JSON)
- `notes`, `ip_address` (untuk auth/publik events)

Kalau existing schema belum lengkap, F1 prompt include migration untuk extend.

### 10.3 Recap Schema Delta dari Tahap 3 (sudah documented sebelumnya)

- `qurban_daftar_hewan.nomor_urut_pemotongan` (NEW number field, NULL default)
- `qurban_pembayaran.bukti_url` (annotation: JSON array dengan metadata per file)

---

## 11. Open Items untuk Tahap 4

### 11.1 Mapping Sub-Tahap 3.E → Fase Implementasi

| Section 3.E | Akan diimplementasi di Fase |
|---|---|
| §2.1 Auth & Session | **F1** (full implementation) |
| §2.2 Response Envelope | **F1** (helper functions) |
| §2.3 Error Code Catalog | **F1** (base) + tiap fase tambah |
| §2.4 ID Generation | **F1** (helper utility) |
| §2.5 Edisi Context Resolution | **F2** + middleware di **F1** |
| §2.6 Pagination/Filter/Sort | **F1** (helper) |
| §2.7 File Upload | **F4** atau **F6** (saat pertama butuh) |
| §2.8 Rate Limiting | **F1** (login) + publik di **F4** |
| §2.9 Audit Log | **F1** (extend sheet + helper) |
| §3 Auth & User Management | **F1** |
| §4 Edisi & Master | **F2**, **F3**, **F5** |
| §5 Peserta + Publik | **F4** |
| §5 Pemetaan | **F5** |
| §6 Pembayaran & Reconciliation | **F6** |
| §7 Distribusi + Urutan + Label | **F7** (🟡 pending observasi 1447H) |
| §7 Laporan | **F8** |
| §7 Audit Log Read | **F8** atau integrated |

### 11.2 Prompt Files yang Perlu Disiapkan (Tahap 4)

Per pattern Hopy di SKM existing (Claude Code handoff):

| Prompt File | Fase | Scope |
|---|---|---|
| `PROMPT_F01_AuthMultiUser.md` | F1 | Auth + Anggota CRUD + helpers (ID gen, response envelope, error codes, audit log, rate limit) |
| `PROMPT_F02_EdisiSetup.md` | F2 | Edisi + Konfigurasi + Panitia CRUD |
| `PROMPT_F03_MasterMuqorib.md` | F3 | Muqorib CRUD + smart-lookup foundation |
| `PROMPT_F04a_PendaftaranBackend.md` | F4 split 1 | Peserta + Available Slots + Duplicate Check |
| `PROMPT_F04b_PublikDaftar.md` | F4 split 2 | Publik endpoints + Fonnte integration |
| `PROMPT_F04c_PendaftaranUI.md` | F4 split 3 | UI form (panitia + publik) |
| `PROMPT_F05a_MasterHewanInventory.md` | F5 split 1 | Master Hewan + Daftar Hewan CRUD + auto-numbering |
| `PROMPT_F05b_PemetaanDragDrop.md` | F5 split 2 | Pemetaan endpoint + UI drag-drop |
| `PROMPT_F06a_PembayaranCore.md` | F6 split 1 | Pembayaran CRUD + Bukti + Link |
| `PROMPT_F06b_ReconciliationL1L2.md` | F6 split 2 | Layer 1 hook + Layer 2 smart matching |
| `PROMPT_F06c_ReconciliationL3L4.md` | F6 split 3 | Layer 3 queue + Layer 4 cash bridge + Split + Fonnte |
| `PROMPT_F07_Distribusi.md` 🟡 | F7 | Distribusi + Urutan Pemotongan + Cetak Label (minimum-viable) |
| `PROMPT_F08a_LaporanPeserta.md` | F8 split 1 | LP1, LP2, LP3 |
| `PROMPT_F08b_LaporanKeuangan.md` | F8 split 2 | LP4 Saldo Qurban + LP5 Dashboard + LP6 Export |
| `PROMPT_F09_Migration1447H.md` | F9 | Data migration script (post-Hari H 1447H) |
| `PROMPT_F10_PolishCloning.md` | F10 | Cloning UI polish + edge cases |

### 11.3 Distribution Adaptation Plan Checklist 🟡

Observasi Hari H 1447H untuk reshape F7:
- [ ] Pengiriman per peserta atau per paket gabungan?
- [ ] Pengantar fisik: panitia distribusi langsung atau via koordinator RT?
- [ ] Workflow recall kalau penerima tidak ada?
- [ ] Format label fisik practical (size, font, layout)
- [ ] Estimasi durasi total distribusi
- [ ] Perlu tracking timestamp per tahap (potong → kemas → label → kirim)?
- [ ] Handle daging tidak terbagikan (sisa)?

### 11.4 Pre-Implementation Items

Sebelum F1 mulai, perlu konfirmasi:
- Env var `SESSION_SECRET` di-generate dan di-set di Vercel
- Drive folder "SKM Bukti Qurban" exists dengan permission service account
- Fonnte account credentials siap untuk template send
- `audit_log` sheet existing schema di-cek (kalau perlu extension)
- `master.pin_hash` legacy value siap untuk bootstrap SUPER_ADMIN

---

## 12. Status Tahap 3.E

| Sub-tahap | Status | Catatan |
|---|---|---|
| 3.E.1 Cross-Cutting Conventions | ✅ Lock | 10 sections |
| 3.E.2 Auth & User Management | ✅ Lock | A1-A4 + U1-U9 |
| 3.E.3 Edisi & Master | ✅ Lock | E1-E6, K1-K2, P1-P3, M1-M7, MH1-MH5, H1-H7 |
| 3.E.4 Pendaftaran, Pemetaan, Publik | ✅ Lock | PS1-PS8, PM1-PM2, PB1-PB4 + masking + Fonnte F4 |
| 3.E.5 Pembayaran & Reconciliation | ✅ Lock | BY1-BY10, RC1-RC6, ST1 |
| 3.E.6 Distribusi, Laporan, Audit Log | ✅ Lock | DS1-DS9, UP1-UP5, LB1, LP1-LP6, AL1 |

**Total endpoint:** ~110 endpoints terinventaris dan terspesifikasi.

**Total audit events:** ~50 distinct event types ter-catalog.

**Schema delta selama 3.E:** 2 boolean config flags + audit_log struktur validation.

---

## 13. Appendix

### 13.1 Endpoint Quick Reference (Master Table)

Untuk navigasi cepat, semua endpoint dalam satu tabel by section:

| Section | Endpoints |
|---|---|
| §3.1 Auth | A1 login, A2 logout, A3 me, A4 change-pin |
| §3.2 Anggota | U1 list, U2 create, U3 detail, U4 patch, U5 reset-pin, U6 unlock, U7 deactivate, U8 reactivate, U9 roles |
| §4 Edisi | E1 list, E2 create+clone, E3 detail, E4 patch, E5 activate, E6 close |
| §4 Konfigurasi | K1 get, K2 upsert |
| §4 Panitia | P1 list, P2 assign, P3 remove |
| §4 Muqorib | M1 list, M2 create, M3 detail, M4 patch, M5 deactivate, M6 reactivate, M7 lookup |
| §4 Master Hewan | MH1 list, MH2 create, MH3 patch, MH4 deactivate, MH5 bulk-upsert |
| §4 Hewan | H1 list, H2 create, H3 detail, H4 patch, H5 reorder, H6 batch-status, H7 cancel |
| §5 Peserta | PS1 list, PS2 create, PS3 detail, PS4 patch, PS5 cancel, PS6 check-duplicate, PS7 refresh-harga, PS8 available-slots |
| §5 Pemetaan | PM1 batch-save, PM2 state |
| §5 Publik | PB1 options, PB2 daftar/lookup, PB3 daftar, PB4 cek-status |
| §6 Pembayaran | BY1 list, BY2 create, BY3 detail, BY4 patch, BY5 deactivate, BY6 bukti+, BY7 bukti-, BY8 link, BY9 unlink, BY10 split |
| §6 Reconciliation | RC1 auto-match, RC2 candidates, RC3 confirm, RC4 unmatched-queue, RC5 unmatched-peserta, RC6 cash-bridge |
| §6 Status | ST1 refresh-status |
| §7 Distribusi | DS1 list, DS2 create, DS3 detail, DS4 patch, DS5 status, DS6 bukti, DS7 mark-gagal, DS8 reattempt, DS9 batch-create |
| §7 Urutan Pemotongan | UP1 generate, UP2 state, UP3 reorder, UP4 reset, UP5 print |
| §7 Label | LB1 labels |
| §7 Laporan | LP1 peserta, LP2 hewan, LP3 distribusi, LP4 keuangan, LP5 dashboard, LP6 export |
| §7 Audit Log | AL1 audit-log |

### 13.2 Naming Conventions Recap

**ID Format:** `XXX-YYYYMMDD-NNNN` (date = WIB)

**Boolean storage:** `TRUE`/`FALSE` (UPPERCASE string)

**Datetime storage:** ISO 8601 + ms + Z (UTC)

**Date storage:** ISO 8601 (`YYYY-MM-DD`)

**Phone format:** `628xxxxxxxxxx`

**Enum values:** UPPERCASE, snake_case untuk compound (e.g., `BAWA_SENDIRI`)

**Column naming:** snake_case (`is_active`, `peran`, `created_at`)

**Event type naming:** `entity.action` snake_case

**Error code naming:** `KATEGORI_SUB_KATEGORI` UPPERCASE snake_case

### 13.3 Critical Cross-References

- **Schema lengkap (11 sheet):** HANDOFF Tahap 2 §4
- **Role matriks akses:** HANDOFF Tahap 2 §3.2 + HANDOFF Tahap 3 §3.3
- **4-layer reconciliation conceptual:** HANDOFF Tahap 2 §5
- **Migration plan 1447H:** HANDOFF Tahap 2 §6
- **Sitemap & URL structure:** HANDOFF Tahap 3 §2
- **Wireframe high-level:** HANDOFF Tahap 3 §6
- **Duplicate detection spec:** HANDOFF Tahap 3 §5

### 13.4 Acknowledgments untuk Iteration

Tahap 3.E dikembangkan iteratif via 6 sub-tahap review-and-lock cycle dengan Hopy sebagai single reviewer (administrator Masjid Al Jabar Jatinegara Baru). Setiap sub-tahap di-confirm sebelum lanjut, dengan beberapa override default (D4.4 Fonnte enabled F4, D4.6 masking pattern).

---

## Status Akhir

**Tahap 3.E LOCK ✅** — semua 6 sub-tahap selesai. Dokumen self-contained, ready sebagai input utama untuk **Tahap 4 (Rencana Eksekusi Migrasi & Implementasi)** di chat baru.

Selanjutnya:
- **Tahap 4** — Rencana Eksekusi: urutan deploy F1–F10, prompt-prompt Claude Code per fase, migration plan, rollback strategy
- **Tahap 5+** — Implementasi bertahap via Claude Code (per fase) dengan iterative deploy-test-confirm pattern existing SKM
