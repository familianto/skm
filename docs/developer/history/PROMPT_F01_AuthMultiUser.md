# PROMPT — Fase 01: Auth Multi-User + Anggota CRUD

**Tujuan:** Implement multi-user authentication system dengan PIN per user + role-based access control + Anggota CRUD untuk SUPER_ADMIN.
**Prasyarat:** Pre-implementation checklist Tahap 4 §10.1 selesai. SKM existing production stable.
**Estimasi:** 6–8 hari kerja
**Output:**
- Schema extended (anggota +6 kolom, audit_log +2 kolom)
- 13 API endpoints (A1–A4 auth, U1–U9 anggota)
- Refactored `/login` UI dengan multi-user flow
- New `/pengaturan/anggota/*` CRUD pages
- Middleware defense-in-depth
- Helpers reusable untuk fase berikutnya
- Bootstrap Hopy sebagai SUPER_ADMIN
- Parallel login window 1-2 hari untuk safety

---

## 1. Konteks

**SEBELUM MULAI, BACA dokumen-dokumen berikut:**

- `/mnt/project/HANDOFF_TAHAP_2_ARCHITECTURE.md` — Schema architecture, 5 role, PIN policy
- `/mnt/project/HANDOFF_TAHAP_3_INFORMATION_ARCHITECTURE.md` — Navigation, login flow, sidebar structure, middleware allow-list
- `/mnt/project/HANDOFF_TAHAP_3E_API_ENDPOINTS.md` — §2 Konvensi Umum (CRITICAL), §3 Auth & User Management endpoints
- `/mnt/project/HANDOFF_TAHAP_4_EXECUTION.md` — Migration plan, rollback strategy

**Kunci pemahaman:**
- SKM existing pakai single-PIN login (di `master.pin_hash`). F1 migrate ke multi-user via `anggota` table.
- 5 role: SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI
- Defense-in-depth: middleware + UI menu + API guard
- Parallel login window: old single-PIN tetap works selama 1-2 hari setelah deploy, lalu disable

---

## 2. Branch Strategy

```bash
git checkout main
git pull
git checkout -b qurban/f01-auth-multi-user
```

PR title: `[F01] Auth Multi-User + Anggota CRUD`
Squash + merge. JANGAN push direct ke main.

---

## 3. Pre-Implementation Verification

Sebelum coding:

- [ ] Backup Sheet: File > Make a copy → "SKM Backup pre-F01 YYYY-MM-DD"
- [ ] Env vars di Vercel sudah set:
  - `SESSION_SECRET` (generated via `openssl rand -hex 32`)
  - `QURBAN_MODULE_ENABLED=true`
  - `QURBAN_BOOTSTRAP_ENABLED=true` (akan di-set `false` setelah bootstrap)
  - `QURBAN_LEGACY_LOGIN_ENABLED=true` (parallel login flag, akan di-set `false` setelah verify)
- [ ] Existing SKM tests pass (kalau ada)
- [ ] Hopy provide nomor telepon untuk bootstrap SUPER_ADMIN

---

## 4. Schema Migration

### 4.1 Apps Script Function

Run **SEKALI** di Apps Script editor sebelum deploy code.

```javascript
function migrate_F01() {
  const SHEET_ID = '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const log = [];
  const TIMESTAMP = new Date().toISOString();
  const TODAY_WIB = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');

  log.push(`[${TIMESTAMP}] Starting migration F01`);
  log.push('⚠️ ENSURE BACKUP DONE: "SKM Backup pre-F01"');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Helper: ensureColumn (idempotent)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function ensureColumn(sheetName, columnName, defaultValue) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      log.push(`❌ Sheet not found: ${sheetName}`);
      return false;
    }
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.includes(columnName)) {
      log.push(`ℹ️ Column exists: ${sheetName}.${columnName}`);
      return true;
    }
    const newCol = lastCol + 1;
    sheet.getRange(1, newCol).setValue(columnName);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const values = Array(lastRow - 1).fill([defaultValue]);
      sheet.getRange(2, newCol, lastRow - 1, 1).setValues(values);
    }
    log.push(`✅ Added column: ${sheetName}.${columnName} (default: ${defaultValue})`);
    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: Extend anggota sheet (+6 kolom)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ensureColumn('anggota', 'pin_hash', '');
  ensureColumn('anggota', 'created_by', 'SYSTEM_BOOTSTRAP');
  ensureColumn('anggota', 'updated_at', '');
  ensureColumn('anggota', 'last_login_at', '');
  ensureColumn('anggota', 'failed_attempts', 0);
  ensureColumn('anggota', 'locked_until', '');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: Backfill updated_at = created_at for existing rows
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const anggotaSheet = ss.getSheetByName('anggota');
  const aHeaders = anggotaSheet.getRange(1, 1, 1, anggotaSheet.getLastColumn()).getValues()[0];
  const createdAtIdx = aHeaders.indexOf('created_at');
  const updatedAtIdx = aHeaders.indexOf('updated_at');
  const teleponIdx = aHeaders.indexOf('telepon');
  const peranIdx = aHeaders.indexOf('peran');
  const aLastRow = anggotaSheet.getLastRow();

  if (aLastRow > 1) {
    const aData = anggotaSheet.getRange(2, 1, aLastRow - 1, anggotaSheet.getLastColumn()).getValues();
    for (let i = 0; i < aData.length; i++) {
      const row = aData[i];

      // Backfill updated_at if empty
      if (!row[updatedAtIdx] && row[createdAtIdx]) {
        anggotaSheet.getRange(i + 2, updatedAtIdx + 1).setValue(row[createdAtIdx]);
        log.push(`✅ Backfilled updated_at row ${i + 2}`);
      }

      // Normalize telepon: 8xxx → 628xxx
      const telepon = String(row[teleponIdx] || '').trim();
      if (telepon && !telepon.startsWith('62')) {
        let normalized = telepon.replace(/\D/g, '');
        if (normalized.startsWith('0')) normalized = normalized.substring(1);
        if (!normalized.startsWith('62')) normalized = '62' + normalized;
        anggotaSheet.getRange(i + 2, teleponIdx + 1).setValue(normalized);
        log.push(`✅ Normalized telepon row ${i + 2}: ${telepon} → ${normalized}`);
      }

      // Map PENGURUS → ADMIN_QURBAN
      if (row[peranIdx] === 'PENGURUS') {
        anggotaSheet.getRange(i + 2, peranIdx + 1).setValue('ADMIN_QURBAN');
        log.push(`✅ Mapped peran row ${i + 2}: PENGURUS → ADMIN_QURBAN`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: Bootstrap Hopy as SUPER_ADMIN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ⚠️ HOPY: Replace HOPY_PHONE_PLACEHOLDER dengan nomor telepon Hopy sebelum run script.
  // Format input: bebas (08xxx, +628xxx, 628xxx), akan di-normalize.
  const HOPY_PHONE_RAW = 'HOPY_PHONE_PLACEHOLDER';  // ⚠️ REPLACE THIS

  if (HOPY_PHONE_RAW === 'HOPY_PHONE_PLACEHOLDER') {
    log.push('❌ HOPY_PHONE_PLACEHOLDER not replaced! Bootstrap SKIPPED.');
    log.push('   Edit script and replace HOPY_PHONE_PLACEHOLDER with actual phone, then rerun.');
  } else {
    // Normalize phone
    let phone = HOPY_PHONE_RAW.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);
    else if (phone.startsWith('8')) phone = '62' + phone;
    else if (!phone.startsWith('62')) phone = '62' + phone;

    // Check if Hopy already exists
    const existingData = anggotaSheet.getRange(2, 1, anggotaSheet.getLastRow() - 1, anggotaSheet.getLastColumn()).getValues();
    let hopyExists = false;
    for (const row of existingData) {
      if (row[teleponIdx] === phone) {
        hopyExists = true;
        log.push(`ℹ️ Hopy entry already exists with telepon ${phone}`);
        break;
      }
    }

    if (!hopyExists) {
      // Read master.pin_hash
      const masterSheet = ss.getSheetByName('master');
      const masterData = masterSheet.getRange(2, 1, 1, masterSheet.getLastColumn()).getValues()[0];
      const masterHeaders = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
      const pinHashIdx = masterHeaders.indexOf('pin_hash');
      const masterPinHash = masterData[pinHashIdx];

      if (!masterPinHash) {
        log.push('❌ master.pin_hash empty! Cannot bootstrap.');
      } else {
        // Generate new anggota ID
        const newId = `ANG-${TODAY_WIB}-0003`;
        const newRow = aHeaders.map(h => {
          switch (h) {
            case 'id': return newId;
            case 'nama': return 'Hopy Familianto';  // Admin name
            case 'telepon': return phone;
            case 'email': return '';
            case 'peran': return 'SUPER_ADMIN';
            case 'is_active': return 'TRUE';
            case 'created_at': return TIMESTAMP;
            case 'pin_hash': return masterPinHash;
            case 'created_by': return 'SYSTEM_BOOTSTRAP';
            case 'updated_at': return TIMESTAMP;
            case 'last_login_at': return '';
            case 'failed_attempts': return 0;
            case 'locked_until': return '';
            default: return '';
          }
        });
        anggotaSheet.appendRow(newRow);
        log.push(`✅ Bootstrapped Hopy: ${newId} (SUPER_ADMIN, telepon ${phone})`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: Extend audit_log sheet (+2 kolom)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ensureColumn('audit_log', 'user_id', '');
  ensureColumn('audit_log', 'ip_address', '');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: Migration audit log entry
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const auditSheet = ss.getSheetByName('audit_log');
  const auditHeaders = auditSheet.getRange(1, 1, 1, auditSheet.getLastColumn()).getValues()[0];
  const auditLogId = `LOG-${TODAY_WIB}-MIG01`;
  const auditRow = auditHeaders.map(h => {
    switch (h) {
      case 'id': return auditLogId;
      case 'timestamp': return TIMESTAMP;
      case 'aksi': return 'MIGRATION';
      case 'entitas': return 'system';
      case 'entitas_id': return 'F01';
      case 'detail': return JSON.stringify({
        migration: 'F01',
        anggota_cols_added: 6,
        audit_log_cols_added: 2,
        telepon_normalized: true,
        bootstrap_hopy: HOPY_PHONE_RAW !== 'HOPY_PHONE_PLACEHOLDER'
      });
      case 'user_info': return 'SYSTEM_BOOTSTRAP';
      case 'user_id': return 'SYSTEM_BOOTSTRAP';
      case 'ip_address': return '';
      default: return '';
    }
  });
  auditSheet.appendRow(auditRow);
  log.push(`✅ Audit log entry: ${auditLogId}`);

  Logger.log(log.join('\n'));
  return log;
}

function validate_F01() {
  const SHEET_ID = '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const checks = [];

  // Check anggota has 13 columns
  const anggotaSheet = ss.getSheetByName('anggota');
  const aHeaders = anggotaSheet.getRange(1, 1, 1, anggotaSheet.getLastColumn()).getValues()[0];
  const expectedCols = ['id', 'nama', 'telepon', 'email', 'peran', 'is_active', 'created_at',
                        'pin_hash', 'created_by', 'updated_at', 'last_login_at', 'failed_attempts', 'locked_until'];
  for (const col of expectedCols) {
    checks.push(`[${aHeaders.includes(col) ? '✅' : '❌'}] anggota has column: ${col}`);
  }

  // Check at least 1 SUPER_ADMIN with pin_hash
  const peranIdx = aHeaders.indexOf('peran');
  const pinHashIdx = aHeaders.indexOf('pin_hash');
  const aData = anggotaSheet.getRange(2, 1, anggotaSheet.getLastRow() - 1, anggotaSheet.getLastColumn()).getValues();
  const superAdmins = aData.filter(row => row[peranIdx] === 'SUPER_ADMIN' && row[pinHashIdx]);
  checks.push(`[${superAdmins.length > 0 ? '✅' : '❌'}] ≥1 SUPER_ADMIN with pin_hash (count: ${superAdmins.length})`);

  // Check no invalid peran enum
  const validPeran = ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'];
  const invalidPeran = aData.filter(row => row[peranIdx] && !validPeran.includes(row[peranIdx]));
  checks.push(`[${invalidPeran.length === 0 ? '✅' : '❌'}] No invalid peran (invalid count: ${invalidPeran.length})`);

  // Check telepon format
  const teleponIdx = aHeaders.indexOf('telepon');
  const invalidPhones = aData.filter(row => {
    const t = String(row[teleponIdx] || '').trim();
    return t && !t.match(/^628\d{8,12}$/);
  });
  checks.push(`[${invalidPhones.length === 0 ? '✅' : '❌'}] All telepon valid format 628xxx (invalid: ${invalidPhones.length})`);

  // Check audit_log has 9 columns
  const auditSheet = ss.getSheetByName('audit_log');
  const auditHeaders = auditSheet.getRange(1, 1, 1, auditSheet.getLastColumn()).getValues()[0];
  checks.push(`[${auditHeaders.includes('user_id') ? '✅' : '❌'}] audit_log has user_id`);
  checks.push(`[${auditHeaders.includes('ip_address') ? '✅' : '❌'}] audit_log has ip_address`);

  Logger.log(checks.join('\n'));
  return checks;
}
```

### 4.2 Eksekusi

1. Open Sheet `SKM-AL-JABAR`
2. **Backup first:** File → Make a copy → name "SKM Backup pre-F01 YYYY-MM-DD"
3. Extensions → Apps Script
4. Paste `migrate_F01()` dan `validate_F01()` ke editor
5. **EDIT:** Replace `HOPY_PHONE_PLACEHOLDER` dengan nomor telepon Hopy (format apapun, akan di-normalize)
6. Save script
7. Run `migrate_F01()` (Run dropdown → migrate_F01 → Run)
8. Authorize akses kalau diminta
9. Check Logger (View → Logs atau Ctrl+Enter) — pastikan tidak ada `❌`
10. Run `validate_F01()` — pastikan semua check `✅`
11. **Tutup Apps Script editor** sebelum deploy code

---

## 5. API Implementation

Implement endpoints per `HANDOFF_TAHAP_3E_API_ENDPOINTS.md §3`:

### 5.1 Helpers Reusable (FOUNDATION untuk Fase Berikutnya)

Buat di `/lib/api/`:

#### `/lib/api/response.ts` — Response Envelope

```typescript
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    page_size?: number;
    has_more?: boolean;
    filters_applied?: Record<string, any>;
  };
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function success<T>(data: T, meta?: ApiSuccess<T>['meta']): Response {
  return Response.json({ ok: true, data, meta });
}

export function error(code: string, message: string, status: number, details?: any): Response {
  return Response.json({ ok: false, error: { code, message, details } }, { status });
}
```

#### `/lib/api/errors.ts` — Error Code Catalog

Per Tahap 3.E §2.3, define semua error codes. F1 minimal:

```typescript
export const ErrorCodes = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_LOCKED: 'AUTH_LOCKED',
  AUTH_INACTIVE: 'AUTH_INACTIVE',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_FORMAT: 'VALIDATION_FORMAT',
  VALIDATION_PIN_POLICY: 'VALIDATION_PIN_POLICY',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_TELEPON: 'DUPLICATE_TELEPON',
  BUSINESS_LAST_SUPER_ADMIN: 'BUSINESS_LAST_SUPER_ADMIN',
  BUSINESS_CANNOT_DEACTIVATE_SELF: 'BUSINESS_CANNOT_DEACTIVATE_SELF',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
```

#### `/lib/api/id-gen.ts` — ID Generator

```typescript
// Format: XXX-YYYYMMDD-NNNN dengan tanggal WIB
export async function generateId(prefix: string, sheetName: string, sheets: any): Promise<string> {
  const todayWIB = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).replace(/-/g, '');

  // Query latest ID for today
  const range = `${sheetName}!A:A`;
  const response = await sheets.spreadsheets.values.get({ /* ... */ range });
  const ids: string[] = response.data.values?.flat() || [];
  const todayIds = ids.filter(id => id?.startsWith(`${prefix}-${todayWIB}-`));

  let nextSeq = 1;
  if (todayIds.length > 0) {
    const seqs = todayIds.map(id => parseInt(id.split('-')[2])).filter(n => !isNaN(n));
    nextSeq = Math.max(...seqs) + 1;
  }

  return `${prefix}-${todayWIB}-${String(nextSeq).padStart(4, '0')}`;
}
```

#### `/lib/api/auth.ts` — JWT Session Helpers

```typescript
import { SignJWT, jwtVerify } from 'jose';

const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);
const SESSION_TTL = 12 * 60 * 60; // 12 jam

export async function createSession(payload: { user_id: string; peran: string }): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(SESSION_SECRET);
}

export async function verifySession(token: string): Promise<{ user_id: string; peran: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return { user_id: payload.user_id as string, peran: payload.peran as string };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: Response, token: string): void {
  response.headers.set('Set-Cookie',
    `skm_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`);
}

export function clearSessionCookie(response: Response): void {
  response.headers.set('Set-Cookie', 'skm_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}
```

#### `/lib/api/pin-policy.ts` — PIN Validation

Per Tahap 3.E §3.3:

```typescript
const WEAK_BLOCKLIST = ['1234', '12345', '123456', '0000', '1111', '9999', '2580', '8686'];

export function validatePin(pin: string): { valid: boolean; error?: { violation: string; constraint: string } } {
  if (!/^\d{4,6}$/.test(pin)) {
    return { valid: false, error: { violation: 'format', constraint: '4-6 digit numerik' } };
  }
  if (/^(\d)\1+$/.test(pin)) {
    return { valid: false, error: { violation: 'all_same', constraint: 'tidak boleh semua digit sama' } };
  }
  // Sequential ascending
  let isAsc = true, isDesc = true;
  for (let i = 1; i < pin.length; i++) {
    if (parseInt(pin[i]) !== parseInt(pin[i-1]) + 1) isAsc = false;
    if (parseInt(pin[i]) !== parseInt(pin[i-1]) - 1) isDesc = false;
  }
  if (isAsc || isDesc) {
    return { valid: false, error: { violation: 'sequential', constraint: 'tidak boleh berurutan' } };
  }
  if (WEAK_BLOCKLIST.includes(pin)) {
    return { valid: false, error: { violation: 'weak', constraint: 'PIN terlalu umum' } };
  }
  return { valid: true };
}
```

#### `/lib/api/phone.ts` — Phone Normalization

Per Tahap 3.E §3.4:

```typescript
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('08')) return '62' + digits.substring(1);
  if (digits.startsWith('8')) return '62' + digits;
  if (digits.startsWith('0')) return '62' + digits.substring(1);
  return digits;
}

export function validatePhone(phone: string): boolean {
  return /^628\d{8,12}$/.test(phone);
}
```

#### `/lib/api/rate-limit.ts` — In-Memory Rate Limiter

Per Tahap 3.E §2.8. MVP in-memory dengan cold-start tolerance:

```typescript
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}
```

#### `/lib/api/audit.ts` — Audit Log Writer

Per Tahap 3.E §2.9 + 4 schema delta (Choice B):

```typescript
export async function writeAuditLog(params: {
  aksi: string;                 // UPPERCASE verb (untuk backwards compat)
  entitas: string;              // snake_case
  entitas_id: string;
  event_type?: string;          // snake_case `entity.action` — di-embed dalam detail JSON
  before_value?: any;
  after_value?: any;
  notes?: string;
  user_id: string;              // FK anggota.id atau "SYSTEM"
  user_info?: string;           // Display name backwards compat
  ip_address?: string;
}, sheets: any): Promise<void> {
  const id = await generateId('LOG', 'audit_log', sheets);
  const timestamp = new Date().toISOString();
  const detail = JSON.stringify({
    ...(params.event_type && { event_type: params.event_type }),
    ...(params.before_value !== undefined && { before: params.before_value }),
    ...(params.after_value !== undefined && { after: params.after_value }),
    ...(params.notes && { notes: params.notes }),
  });

  // Append row to audit_log with all 9 columns
  // ...
}

// Wrapper helper untuk mutation endpoints
export function withAuditLog<T>(fn: () => Promise<T>, auditParams: ...): Promise<T> {
  return fn().then(async (result) => {
    await writeAuditLog(auditParams, sheets);
    return result;
  });
}
```

### 5.2 Auth Endpoints (A1–A4)

Per Tahap 3.E §3.1. Implement di `/app/api/auth/`:

**A1: `POST /api/auth/login`**

- Validate `telepon`, `pin` per regex
- Rate limit: 10/menit per IP
- Normalize telepon
- Query `anggota` WHERE telepon AND is_active=TRUE
- Check `locked_until` → 423 AUTH_LOCKED kalau aktif
- **Parallel login (Opsi B):** Kalau env `QURBAN_LEGACY_LOGIN_ENABLED=true` dan tidak match anggota, fallback bcrypt compare dengan `master.pin_hash`. Kalau match: create temp session dengan `user_id="LEGACY"`, `peran="SUPER_ADMIN"`.
- Normal flow: bcrypt.compare(pin, pin_hash)
  - False: increment failed_attempts; ≥5 dalam 5 menit → set locked_until = now+15min
  - True: reset failed_attempts, update last_login_at, generate JWT, set cookie
- Audit log `auth.login_success` / `auth.login_failed` / `auth.locked`
- Response per Tahap 3.E §3.1 A1

**A2: `POST /api/auth/logout`**

- Verify session valid (kalau ada)
- Clear cookie
- Audit `auth.logout`
- Idempotent (200 baik ada session atau tidak)

**A3: `GET /api/auth/me`**

- Verify session
- Fetch anggota by user_id
- Compute permissions per Tahap 3.E §3.7 allow-list
- Return user info, permissions, current_edisi (null untuk F1), session expiry

**A4: `POST /api/auth/change-pin`**

- Validate session
- Validate new_pin per PIN policy
- bcrypt.compare old_pin → 401 kalau salah (JANGAN increment failed_attempts)
- new_pin ≠ old_pin
- Update pin_hash, updated_at
- Audit `auth.pin_changed`

### 5.3 Anggota Endpoints (U1–U9)

Per Tahap 3.E §3.2. SUPER_ADMIN only. Implement di `/app/api/pengaturan/anggota/`:

**Implementation order recommendation:**

1. U1 GET list (with pagination)
2. U2 POST create
3. U3 GET detail
4. U4 PATCH update (dengan last SUPER_ADMIN protection per §3.2)
5. U5 POST reset-pin
6. U6 POST unlock
7. U7 POST deactivate (dengan last SUPER_ADMIN + self-deactivate protection)
8. U8 POST reactivate
9. U9 GET roles (dropdown helper)

**Key business rules:**
- Telepon uniqueness hanya untuk `is_active=TRUE` rows
- Last SUPER_ADMIN protection di U4 (peran change), U7 (deactivate)
- Self-deactivate protection di U7
- PIN reset (U5) clears `failed_attempts=0`, `locked_until=NULL`
- Per Tahap 3.E §3.5, session existing tetap valid setelah role change

---

## 6. UI Implementation

### 6.1 Login Refactor

`/app/login/page.tsx`:
- Form: telepon + PIN
- Submit → POST /api/auth/login
- Success → redirect ke `landing_url` dari response
- Error 423 AUTH_LOCKED → message dengan estimasi unlock time
- Error 429 RATE_LIMITED → "Coba lagi dalam X detik"

Mobile-first design (Hopy admin via mobile primary).

### 6.2 Pengaturan > Anggota

`/app/pengaturan/anggota/page.tsx` — List page:
- Table: nama, telepon, peran badge, is_active badge, last_login_at, actions
- Search bar
- Filter: peran, is_active
- Pagination
- Button "Tambah Anggota" → /pengaturan/anggota/baru

`/app/pengaturan/anggota/baru/page.tsx` — Create form:
- nama, telepon, email (optional), peran (dropdown from U9), initial PIN
- PIN validation realtime (PIN policy)
- Submit → POST /api/pengaturan/anggota
- Success → redirect ke list dengan toast notification

`/app/pengaturan/anggota/[id]/page.tsx` — Detail:
- Display anggota info
- Action buttons:
  - Edit (→ /[id]/edit)
  - Reset PIN (modal)
  - Unlock (kalau locked)
  - Deactivate (kalau active) / Reactivate (kalau inactive)
- Audit log timeline (last 10 events untuk anggota ini) — optional MVP, bisa defer

`/app/pengaturan/anggota/[id]/edit/page.tsx` — Edit form

**UI Patterns:**
- Tailwind CSS
- Reuse existing component patterns dari SKM existing
- Mobile-responsive
- Toast notifications via existing pattern

---

## 7. Middleware Defense-in-Depth

`/middleware.ts` (Next.js root middleware):

Per Tahap 3.E §2.1 sequence:

```typescript
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Public routes skip
  const publicRoutes = ['/login', '/publik', '/api/auth/login', '/api/publik'];
  if (publicRoutes.some(r => pathname.startsWith(r))) return NextResponse.next();

  // 2. Module kill switch
  if (pathname.startsWith('/qurban') || pathname.startsWith('/api/qurban')) {
    if (process.env.QURBAN_MODULE_ENABLED !== 'true') {
      return apiOrRedirect(pathname, 'MODULE_DISABLED', '/');
    }
  }

  // 3. Session check
  const token = request.cookies.get('skm_session')?.value;
  if (!token) return apiOrRedirect(pathname, 'AUTH_REQUIRED', '/login');

  const session = await verifySession(token);
  if (!session) return apiOrRedirect(pathname, 'AUTH_EXPIRED', '/login');

  // 4. Check anggota active (fetch from sheets — cache 1 menit untuk performance)
  // (defer fetch to API guard kalau performance issue; middleware ringan dulu)

  // 5. Role allow-list per Tahap 3.E §3.7
  if (!isPathAllowedForRole(pathname, session.peran)) {
    return apiOrRedirect(pathname, 'FORBIDDEN_ROLE', '/');
  }

  // 6. Add user context to request headers
  const response = NextResponse.next();
  response.headers.set('x-user-id', session.user_id);
  response.headers.set('x-user-peran', session.peran);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**API-level guard (defense in depth):** setiap endpoint juga validate role:

```typescript
// In each API handler:
const userId = request.headers.get('x-user-id');
const userPeran = request.headers.get('x-user-peran');
if (!ROLE_ALLOWED.includes(userPeran)) {
  return error('FORBIDDEN_ROLE', 'Akses ditolak', 403);
}
```

---

## 8. Testing Checklist

### 8.1 Login Flow Tests

- [ ] Login dengan telepon Hopy + PIN current → success, redirect ke `/`
- [ ] Login dengan PIN salah → 401 AUTH_INVALID, increment counter
- [ ] Login 5× gagal dalam 5 menit → locked 15 menit (423)
- [ ] Wait 15 menit → login works lagi
- [ ] Login dengan telepon yang tidak ada di anggota → 401 (jangan leak existence)
- [ ] **Parallel login:** Login via old single-PIN flow → masih works (legacy_enabled=true)
- [ ] Session cookie set dengan HttpOnly, Secure, SameSite=Lax
- [ ] Session expire setelah 12 jam → 401 AUTH_EXPIRED, redirect ke `/login?redirect=...`

### 8.2 Anggota CRUD Tests

- [ ] SUPER_ADMIN bisa create anggota baru dengan peran BENDAHARA
- [ ] PIN policy reject: `1234`, `0000`, `8686`, `1111`, sequential
- [ ] Telepon duplicate (di antara is_active=TRUE) → 409 DUPLICATE_TELEPON
- [ ] Update peran dari SUPER_ADMIN (kalau cuma 1) → 422 BUSINESS_LAST_SUPER_ADMIN
- [ ] Deactivate diri sendiri → 422 BUSINESS_CANNOT_DEACTIVATE_SELF
- [ ] Reset PIN → failed_attempts=0, locked_until=NULL
- [ ] Reactivate user yang inactive → works
- [ ] Non-SUPER_ADMIN access `/pengaturan/anggota` → 403 FORBIDDEN_ROLE

### 8.3 Audit Log Tests

- [ ] Login sukses → entry `auth.login_success` (aksi=LOGIN, entitas=auth, user_id set)
- [ ] Login fail → entry `auth.login_failed`
- [ ] Login locked → entry `auth.locked`
- [ ] Create anggota → entry `anggota.created`
- [ ] All audit entries punya user_id valid atau "SYSTEM"
- [ ] ip_address terisi untuk auth events

### 8.4 Middleware Tests

- [ ] Akses `/dashboard` tanpa session → redirect `/login?redirect=/dashboard`
- [ ] PENDAFTARAN user akses `/transaksi` → redirect ke `/qurban` atau 403
- [ ] SUPER_ADMIN access semua route OK
- [ ] Public routes `/publik/*` tidak butuh login

### 8.5 Smoke Test Post-Deploy

- [ ] Hopy login dengan PIN current works
- [ ] Dashboard SKM load
- [ ] Transaksi list load (existing fitur tidak break)
- [ ] CSV import works (existing fitur tidak break)
- [ ] Bisa create dummy user dengan peran BENDAHARA, login dengan dummy user
- [ ] Audit log entries baru tercatat dengan user_id

---

## 9. Documentation Updates

Sebelum PR merge, update file-file ini:

- [ ] `PROJECT_BRIEF.md` — Tambah section "Fase 01 — Auth Multi-User" dengan status, endpoint list, schema delta
- [ ] `API_REFERENCE.md` — Tambah endpoints A1-A4 + U1-U9 dengan request/response shape
- [ ] `HANDOFF_SPRINT_F01.md` — Implementation notes, decisions made during coding, follow-ups untuk fase berikutnya

---

## 10. Deploy & Verify

### 10.1 Sequence

1. Local dev (kalau ada) atau push branch → Vercel preview
2. Test preview URL extensively (semua test §8 di atas)
3. Update documentation files
4. Create PR with checklist filled
5. Merge PR → main → Vercel auto-deploy production
6. **Smoke test production** (Hopy 5 menit) per §8.5
7. Audit log production confirm migration entry visible
8. **Wait 1-2 hari** monitor untuk issues
9. Set `QURBAN_LEGACY_LOGIN_ENABLED=false` di Vercel (disable parallel login)
10. Set `QURBAN_BOOTSTRAP_ENABLED=false` (disable bootstrap re-run)
11. Redeploy → verify multi-user-only flow works
12. F1 LIVE confirmed ✅

### 10.2 Post-Deploy

- Hopy login dengan SUPER_ADMIN account
- Create user accounts untuk panitia lain (BENDAHARA, ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI sesuai kebutuhan)
- Komunikasikan PIN initial out-of-band (WA personal, bukan group)
- Each user login first time → optional change PIN via A4

---

## 11. Rollback Notes

Reference `HANDOFF_TAHAP_4_EXECUTION.md §7.3 Playbook 1`.

**Quick rollback hierarchy:**

| Level | Action | Use case |
|---|---|---|
| 1 | `QURBAN_LEGACY_LOGIN_ENABLED=true` (jika sudah disable) | Hopy tidak bisa login multi-user, fallback ke old |
| 2 | Vercel promote previous deployment | Code-level bug |
| 3 | Git revert PR + redeploy | Permanent rollback |
| 4 | Schema rollback (manual delete kolom) | Almost never needed |

**Critical: master.pin_hash JANGAN dihapus selama F1 transition.** Keep untuk emergency access.

---

## 12. Audit Log Events Expected

Post-deploy, audit_log entries muncul:

- `auth.login_success` (aksi=LOGIN, entitas=auth)
- `auth.login_failed` (aksi=LOGIN, entitas=auth)
- `auth.locked` (aksi=LOGIN, entitas=auth)
- `auth.unlocked_manual` (aksi=UPDATE, entitas=anggota)
- `auth.logout` (aksi=LOGOUT, entitas=auth)
- `auth.pin_changed` (aksi=UPDATE, entitas=anggota)
- `auth.pin_reset_by_admin` (aksi=UPDATE, entitas=anggota)
- `anggota.created` (aksi=CREATE, entitas=anggota)
- `anggota.updated` (aksi=UPDATE, entitas=anggota)
- `anggota.peran_changed` (aksi=UPDATE, entitas=anggota)
- `anggota.deactivated` (aksi=UPDATE, entitas=anggota)
- `anggota.reactivated` (aksi=UPDATE, entitas=anggota)

Format detail JSON:
```json
{
  "event_type": "anggota.peran_changed",
  "before": { "peran": "BENDAHARA" },
  "after": { "peran": "ADMIN_QURBAN" },
  "notes": "Optional context"
}
```

---

## 13. Catatan untuk Claude Code

1. **Prioritize backwards compatibility.** Existing SKM features TIDAK BOLEH break. CSV import, transaksi, laporan, donatur, dll harus tetap works.

2. **Test parallel login carefully.** Old single-PIN login MUST work selama transition window. Kalau ada doubt, retain old login path explicit.

3. **Helpers reusable.** Foundation helpers di `/lib/api/` akan dipakai semua fase berikutnya. Quality of these helpers = quality of next 9 fases. Spend time getting them right.

4. **Mobile-first.** Hopy admin via mobile primary. Test login + anggota CRUD di mobile breakpoint.

5. **Audit log richness.** Setiap mutation HARUS write audit log. Pattern `withAuditLog()` wrapper bisa dibuat untuk DRY.

6. **No browser storage di artifacts.** N/A untuk Next.js app, just FYI.

7. **Sequential development.** Hopy review-and-confirm di setiap milestone. Quick wins → schema migration first, then helpers, then endpoints, then UI, then middleware (sebenarnya middleware bisa di-bangun in parallel dengan helpers).

8. **Estimasi 6-8 hari realistic.** Kalau ke arah >8 hari, flag ke Hopy untuk discuss scope cut.

---

**Bismillah, mulai F1.**
