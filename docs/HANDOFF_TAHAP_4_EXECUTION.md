# HANDOFF — Tahap 4 (Rencana Eksekusi Migrasi & Implementasi) Modul Qurban di SKM

**Versi:** 1.0
**Tanggal:** 14 Mei 2026
**Status:** Sub-tahap 4.A–4.E LOCK. Ready untuk Tahap 5 (Implementasi Bertahap via Claude Code).
**Scope:** Pre-implementation checklist, production coordination, phase sequencing, schema migration per fase, rollback strategy, prompt file templates.
**Prerequisite:**
- HANDOFF Tahap 2 v1.0 (Schema & Architecture)
- HANDOFF Tahap 3 v1.0 (Information Architecture)
- HANDOFF Tahap 3.E v1.0 (API Endpoint Inventory)

---

## TL;DR

Tahap 4 mengkoordinasikan eksekusi ~110 endpoint, 11 sheet schema, dan 16 prompt files menjadi rencana deploy yang aman untuk SKM production live (skm-pi.vercel.app dengan 3,208 transaksi finansial real).

**Konstrain utama:** Demo H+7 Idul Adha 1447H (3 Juni 2026) untuk pelaporan qurban → realistic target F1+F2 mandatory, F3 stretch.

**Output utama:**
- 4-level rollback hierarchy (flag → Vercel → git revert → schema)
- Re-sequenced phase order: F1 → F2 → F3 → **F5a** → F4a → F4b → F4c → F5b → F6abc → F7 → F8 → F9 → F10
- F1 schema migration plan dengan bootstrap Hopy sebagai SUPER_ADMIN
- Choice B audit_log strategy (minimal extension, +user_id +ip_address)
- Universal prompt file template (12 section)
- PROMPT_F01_AuthMultiUser.md siap pakai

---

## 1. Konteks & Referensi

### 1.1 Posisi Tahap 4 dalam Roadmap

```
✅ Tahap 1   — Konsep & 5 dimensi awal
✅ Tahap 2   — Schema, Architecture, Reconciliation, Migration
✅ Tahap 3   — Information Architecture
✅ Tahap 3.E — API Endpoint Inventory
✅ Tahap 4   — Rencana Eksekusi (DOKUMEN INI)
🔜 Tahap 5+  — Implementasi Bertahap (F1–F10)
```

### 1.2 Critical Constraint: Deadline H+7 Idul Adha 1447H

- Idul Adha 1447H = Rabu, 27 Mei 2026
- Cuti bersama 28–29 Mei
- H+7 deadline demo = Rabu, 3 Juni 2026
- Runway efektif dari 14 Mei: ~14–16 hari kerja (mode pagi+malam+weekend)

**Realistic scope demo:**

| Fase | Effort | Status H+7 |
|---|---|---|
| F1 — Auth & Anggota | 6–8 hari | ✅ MUST HAVE |
| F2 — Edisi Setup | 4–5 hari | ✅ MUST HAVE |
| F3 — Master Muqorib | 4–5 hari | 🟡 STRETCH |
| F4+ | — | ❌ POST-DEMO |

---

## 2. Pre-Implementation Checklist (Section A)

Action items yang harus selesai **sebelum F1 prompt dijalankan ke Claude Code**.

### 2.1 Environment Variables (Vercel)

| Variable | Source | Catatan |
|---|---|---|
| `SESSION_SECRET` | Generate sekarang | `openssl rand -hex 32` |
| `FONNTE_API_TOKEN` | Existing | Untuk WA reminder |
| `FONNTE_WA_PHONE` | Existing | Nomor WA panitia |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Existing | skm-sheets-access@... |
| `QURBAN_DRIVE_FOLDER_ID` | NEW | Drive folder "SKM Bukti Qurban" |
| `QURBAN_BOOTSTRAP_ENABLED` | `true` di F1 deploy | Flag bootstrap, set `false` setelah seed |
| `QURBAN_MODULE_ENABLED` | `true` | Module kill switch |

### 2.2 External Services

**Google Drive folder:** Create "SKM Bukti Qurban" di root, share dengan service account sebagai Editor, capture folder ID → env var.

**Fonnte:** Defer ke F4. Pre-implementation: cukup pastikan akun aktif.

### 2.3 Audit Log Schema (Existing Verified)

Existing 7 kolom: `id`, `timestamp`, `aksi`, `entitas`, `entitas_id`, `detail`, `user_info`.

**F1 akan tambah 2 kolom (Choice B Minimal Extension):**
- `user_id` (FK ke anggota.id)
- `ip_address`

### 2.4 Bootstrap Data

- `master.pin_hash` verified valid bcrypt (`$2b$10$...`) ✅
- F1 migration akan create row baru ANG-{deploy-date}-0003 untuk Hopy sebagai SUPER_ADMIN
- Existing 2 rows `anggota` di-preserve dengan:
  - ANG-20260101-0001 Bendahara Masjid: BENDAHARA (unchanged), telepon normalized `628123456789`, pin_hash empty
  - ANG-20260101-0002 Ketua DKM: PENGURUS → ADMIN_QURBAN, telepon normalized `628198765432`, pin_hash empty

---

## 3. Production Coordination Strategy

### 3.1 Git Branching

| Branch type | Naming | Lifecycle |
|---|---|---|
| Feature per fase | `qurban/fXX-{slug}` | Per fase |
| Hotfix | `hotfix/qurban-{issue}` | Per bug |
| Schema-only | `schema/qurban-fXX` (opsional) | Optional separation |

**PR pattern:** Title `[FXX] Title`, squash + merge, conflict resolution = "Accept both changes" + regenerate package-lock.json.

### 3.2 Vercel Deployment

- `main` → production (skm-pi.vercel.app)
- Feature branches → preview URL otomatis
- Workflow: branch push → preview test → PR → merge → production

**Rollback:** Vercel Dashboard → previous deployment → Promote to Production (1-klik).

### 3.3 Coexistence Rules (Critical)

🔴 **Modul Qurban TIDAK boleh break existing SKM functionality.**

1. **Login backwards-compatible (Opsi B — Parallel Login 1-2 hari):**
   - Bootstrap migrate `master.pin_hash` → `anggota` SUPER_ADMIN entry untuk Hopy
   - Login flow check `anggota` table first; fallback ke `master.pin_hash` selama transition window
   - Setelah Hopy confirmed multi-user works → disable old flow via env var

2. **Schema additions only.** No DROP COLUMN, no rename, no DELETE row.

3. **CSV import safe.** F6 hook MUST non-blocking (skip-able via env flag).

4. **Fonnte safe.** Share Fonnte infra dengan WA Reminder existing, respect 1000 msg/month quota.

5. **Audit log non-destructive.** Extension only, existing rows tetap valid.

### 3.4 Deployment Window

**🟢 Optimal:** Pagi/siang weekday (10:00–15:00 WIB).

**🔴 Avoid:**
- Jumat sore
- Sabtu/Minggu (kecuali emergency)
- 26 Mei (H-1 Idul Adha)
- 27 Mei (Hari H)
- 28–29 Mei (libur nasional)

---

## 4. Feature Flag Strategy

### 4.1 Module-Level Kill Switch

```
QURBAN_MODULE_ENABLED = "true" | "false"
```

- `false` → semua `/qurban/*` redirect, API return 503, sidebar hide

### 4.2 Phase-Level Flags

- `QURBAN_FEATURE_PUBLIK_DAFTAR` (F4b)
- `QURBAN_FEATURE_DISTRIBUSI` (F7)

### 4.3 Schema-Level Flags (Per-Edisi)

- `qurban_konfigurasi_edisi.wa_send_on_pendaftaran` (default TRUE)
- `qurban_konfigurasi_edisi.wa_send_on_pembayaran_confirmed` (default TRUE)

---

## 5. Phase Sequencing & Dependencies (Section B)

### 5.1 Final Order (Re-sequenced)

```
F1 (Auth) → F2 (Edisi) → F3 (Muqorib) → F5a (Master Hewan + Inventory)
         → F4a (Pendaftaran Backend) → F4b (Publik) → F4c (UI Polish)
         → F5b (Pemetaan) → F6a (Pembayaran) → F6b (Reconciliation L1+L2)
         → F6c (Reconciliation L3+L4) → F7 (Distribusi) 🟡
         → F8 (Laporan) → F9 (Migration 1447H) → F10 (Polish)
```

**Rationale F5a sebelum F4:** F4 publik daftar butuh slot real → butuh inventory hewan dulu.

### 5.2 Pre-Demo Timeline (14 Mei – 3 Juni 2026)

```
Week 1: 14–21 Mei (8 hari)
  ├── 14–15 Mei: Pre-implementation setup (env vars, Drive folder)
  ├── 16–21 Mei: F1 implementation + deploy + verify
  └── F1 LIVE ✅

Week 2: 22–28 Mei (Idul Adha period)
  ├── 22–25 Mei: F2 implementation + deploy
  ├── 26 Mei (H-1): Final test + persiapan qurban 1447H
  ├── 27 Mei: HARI H — NO WORK
  ├── 28–29 Mei: Libur nasional — NO WORK
  └── F2 LIVE ✅ (Minimum demo target)

Week 3: 30 Mei – 3 Juni
  ├── 30–31 Mei: Buffer + finalize demo deck
  ├── 1–2 Juni: F3 STRETCH attempt
  └── 3 Juni (H+7): DEMO PELAPORAN QURBAN
```

### 5.3 Detail per Fase (Effort + Acceptance)

| Fase | Effort | Acceptance Criteria |
|---|---|---|
| F1 | 6–8 hari | Multi-user login works, parallel old PIN OK, bootstrap Hopy entry visible, audit log entries |
| F2 | 4–5 hari | Edisi 1448H DRAFT bisa dibuat, konfigurasi set, panitia assigned, activate works |
| F3 | 4–5 hari | Muqorib CRUD, smart-lookup return scored candidates |
| F5a | 5–6 hari | Master tipe input, daftar hewan auto-number, reorder, batch status |
| F4a | 5–7 hari | Pendaftaran panitia, auto-slot, duplicate detection, multi-slot |
| F4b | 4–5 hari | Publik daftar online, WA template kirim, cek-status masked |
| F4c | 3–4 hari | UI polish panitia + publik |
| F5b | 6–8 hari | Drag-drop pemetaan, harga decision modal, atomic save |
| F6a | 4–5 hari | Pembayaran CRUD, bukti multi-file, link/unlink, split |
| F6b | 5–6 hari | Layer 1 hook works, Layer 2 candidates scored |
| F6c | 4–5 hari | Layer 3 queue, Layer 4 cash bridge, Fonnte pembayaran |
| F7 🟡 | 7–10 hari | (Pending observasi 1447H) Distribusi tracking, urutan, label |
| F8 | 5–7 hari | LP1-LP6 reports, dashboard, export Excel, audit log read |
| F9 | 3–5 hari | Migration 1447H data via dry-run + staged import |
| F10 | 3–5 hari | Cloning UI polish, edge cases |

---

## 6. Schema Migration per Fase (Section C)

### 6.1 Universal Principles

1. **Additive only** — no DROP, no rename, no DELETE
2. **Idempotent** — script safe to rerun
3. **Backwards compatible** — existing code keeps working
4. **Pre-deploy backup** — Sheet copy via File > Make a copy
5. **Apps Script execution** — run sekali, verify Logger output

### 6.2 F1 Schema Migration

**Sheet `anggota` extend (6 kolom baru):**

| Kolom | Tipe | Default |
|---|---|---|
| `pin_hash` | string (bcrypt) | empty untuk existing rows |
| `created_by` | string FK | `"SYSTEM_BOOTSTRAP"` untuk existing |
| `updated_at` | ISO 8601 + Z | = created_at value |
| `last_login_at` | ISO 8601 + Z | empty |
| `failed_attempts` | number | `0` |
| `locked_until` | ISO 8601 + Z | empty |

**Existing data updates:**
- Normalize telepon: `8xxx` → `628xxx`
- ANG-20260101-0002 peran: PENGURUS → ADMIN_QURBAN
- Bootstrap new row: ANG-{deploy-date}-0003 Hopy, SUPER_ADMIN, pin_hash = master.pin_hash

**Sheet `audit_log` extend (2 kolom baru):**

| Kolom | Default |
|---|---|
| `user_id` | empty untuk existing, mandatory post-F1 |
| `ip_address` | empty untuk existing, required di auth/publik |

### 6.3 F2 Schema Migration

3 sheet baru: `qurban_edisi` (12 kolom), `qurban_konfigurasi_edisi` (15 kolom termasuk 2 WA flags), `qurban_panitia` (7 kolom).

### 6.4 F3 Schema Migration

1 sheet baru: `qurban_muqorib` (11 kolom, lintas-edisi).

### 6.5 Outline F5a–F10

| Fase | Sheet baru |
|---|---|
| F5a | `qurban_master_hewan` (10), `qurban_daftar_hewan` (13 termasuk `nomor_urut_pemotongan`) |
| F4a | `qurban_peserta` (~20) |
| F4b/c | — |
| F5b | — |
| F6a | `qurban_pembayaran` (~15) |
| F6b/c | — (extend F6a) |
| F7 | `qurban_distribusi` (~12) |
| F8 | — |
| F9 | — (data migration only) |
| F10 | Optional: drop master.pin_hash |

### 6.6 Apps Script Migration Template

```javascript
function migrate_FXX() {
  const SHEET_ID = '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const log = [];
  const TIMESTAMP = new Date().toISOString();

  log.push(`[${TIMESTAMP}] Starting migration F{XX}`);
  log.push('⚠️  ENSURE BACKUP: File > Make a copy → "SKM Backup pre-F{XX}"');

  // Idempotent helpers
  function ensureSheet(name, headers) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      log.push(`✅ Created sheet: ${name}`);
    } else {
      log.push(`ℹ️ Sheet exists: ${name}`);
    }
    return sheet;
  }

  function ensureColumn(sheetName, columnName, defaultValue) {
    const sheet = ss.getSheetByName(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.includes(columnName)) {
      log.push(`ℹ️ Column exists: ${sheetName}.${columnName}`);
      return;
    }
    const newCol = headers.length + 1;
    sheet.getRange(1, newCol).setValue(columnName);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const values = Array(lastRow - 1).fill([defaultValue]);
      sheet.getRange(2, newCol, lastRow - 1, 1).setValues(values);
    }
    log.push(`✅ Added column: ${sheetName}.${columnName}`);
  }

  // ... fase-specific calls ...

  // Audit log
  const auditLog = ss.getSheetByName('audit_log');
  const newLogId = `LOG-${TIMESTAMP.substring(0,10).replace(/-/g,'')}-MIG`;
  auditLog.appendRow([
    newLogId, TIMESTAMP, 'MIGRATION', 'system', 'F{XX}',
    JSON.stringify({ migration: 'F{XX}' }),
    'SYSTEM_BOOTSTRAP',
    'SYSTEM_BOOTSTRAP',  // user_id (post-F1)
    ''  // ip_address
  ]);

  Logger.log(log.join('\n'));
  return log;
}

function validate_FXX() {
  // Per-fase validation queries
}
```

### 6.7 Execution Workflow per Fase

```
1. Backup Sheet: File > Make a copy → "SKM Backup pre-FXX YYYY-MM-DD"
2. Extensions > Apps Script
3. Paste migrate_FXX() function
4. Run → review Logger output
5. Run validate_FXX() → confirm OK
6. Deploy Next.js code via Vercel
7. Smoke test production
```

---

## 7. Rollback Strategy (Section D)

### 7.1 4-Level Hierarchy

| Level | Action | Recovery time |
|---|---|---|
| Level 1 | Feature flag OFF | ~30 detik |
| Level 2 | Vercel promote previous | ~1 menit |
| Level 3 | Git revert + redeploy | ~5–10 menit |
| Level 4 | Schema rollback manual | ~30–120 menit (RARE) |

**Default flow:** Try Level 1 → Level 2 → Level 3. Level 4 ekstrem.

### 7.2 Per-Fase Risk Profile

| Fase | Risk | Pre-emptive safety |
|---|---|---|
| F1 | 🔴 Highest | Parallel login (Opsi B) = built-in rollback |
| F2 | 🟢 Low | Standard |
| F3 | 🟢 Low | Standard |
| F5a | 🟢 Low | Standard |
| F4a | 🟡 Medium | Duplicate detection, soft-delete |
| F4b | 🔴 High public | Feature flag, captcha, rate limit |
| F4c | 🟢 Low | Standard |
| F5b | 🟢 Low | Version check atomicity |
| F6a | 🔴 High financial | Immutability, soft-delete |
| F6b/c | 🔴 High financial | Non-blocking hook, env flag |
| F7 | 🟡 Medium | Feature flag, re-attempt chain |
| F8 | 🟢 Low | Read-only |
| F9 | 🔴 High data | Dry-run, staged, IMPORT_1447H flag |
| F10 | 🟢 Low | Standard |

### 7.3 Recovery Playbooks (5 Scenarios)

**Playbook 1: Tidak bisa login setelah F1 deploy**

1. Try old single-PIN login (parallel window)
2. Vercel promote previous (Level 2)
3. Inspect anggota sheet bootstrap
4. Fix → redeploy

**Playbook 2: CSV import existing SKM broken setelah F6 deploy**

1. Set `QURBAN_CSV_HOOK_ENABLED=false` (Level 1)
2. Try CSV import lagi → confirm hook is issue
3. Fix hook code → re-enable

**Playbook 3: Publik daftar di-abuse / spam**

1. Set `QURBAN_FEATURE_PUBLIK_DAFTAR=false` (Level 1, ~30 detik)
2. Audit log review untuk IP pattern
3. Fix (IP block, stronger captcha)
4. Re-enable

**Playbook 4: Salah migrate data 1447H**

1. STOP migration script
2. Pilihan: targeted fix (filter IMPORT_1447H flag), full rollback (delete + rerun), atau sheet restore
3. Verify, re-run

**Playbook 5: Schema migration partial fail**

1. Cek Logger output
2. Fix issue
3. Re-run (idempotent, skip done steps)
4. Validate

### 7.4 Backup Strategy

- Pre-deploy per fase: Sheet copy ke "SKM Backup pre-FXX"
- F09 backup permanent (critical milestone)
- Vercel preserves 10+ recent deployments

### 7.5 Lightweight Monitoring

Per-deploy smoke test (5 menit Hopy):
- [ ] Login works
- [ ] Dashboard load
- [ ] 2-3 fitur existing tidak break
- [ ] Modul Qurban load
- [ ] Audit log baru tercatat

Per-week health check (15 menit):
- [ ] Fonnte quota
- [ ] Sheet size growth
- [ ] Audit log error events
- [ ] Vercel deployment history

### 7.6 Communication Templates

**To panitia (WA Group):**
```
Assalamu'alaikum panitia,

Sistem Qurban [feature] sedang pemeliharaan teknis. Estimasi: [X menit].

Sementara: [workaround atau tunggu]
Data aman, tidak hilang.

Update saat selesai. Jazakallahu khairan.
— Admin Sistem
```

**Banner publik (F4b broken):**
```
🔧 Sedang Pemeliharaan
Pendaftaran online sedang pemeliharaan.
Coba lagi dalam [X menit] atau hubungi panitia [WA].
```

---

## 8. Prompt File Templates (Section E)

### 8.1 Universal Sections (Wajib)

Setiap PROMPT_FXX_*.md punya 12 section:

1. Header (title, prasyarat, estimasi, output)
2. Konteks (link handoffs)
3. Branch Strategy
4. Pre-Implementation Verification
5. Schema Migration (Apps Script function + how to run)
6. API Implementation (endpoints + helpers + notes)
7. UI Implementation (pages + patterns)
8. Middleware (jika perlu)
9. Testing Checklist
10. Documentation Updates
11. Deploy & Verify
12. Rollback Notes + Audit Log Events Expected

### 8.2 Master Skeleton Template

Lihat HANDOFF Tahap 4 doc atau PROMPT_F01_AuthMultiUser.md untuk format final.

### 8.3 Per-Fase Outline (16 Files)

| Prompt File | Effort | Critical Focus |
|---|---|---|
| PROMPT_F01_AuthMultiUser.md | 6–8 hari | Auth helpers, A1-A4, U1-U9, middleware, bootstrap |
| PROMPT_F02_EdisiSetup.md | 4–5 hari | Edisi state machine, konfigurasi, panitia, switcher |
| PROMPT_F03_MasterMuqorib.md | 4–5 hari | CRUD lintas-edisi, smart-lookup, phone normalize |
| PROMPT_F05a_MasterHewanInventory.md | 5–6 hari | Master + inventory + auto-numbering |
| PROMPT_F04a_PendaftaranBackend.md | 5–7 hari | Peserta multi-slot, auto-assign, duplicate Layer 1 |
| PROMPT_F04b_PublikDaftar.md | 4–5 hari | PB endpoints, captcha, masking, Fonnte pendaftaran |
| PROMPT_F04c_PendaftaranUI.md | 3–4 hari | Form polish |
| PROMPT_F05b_PemetaanDragDrop.md | 6–8 hari | Drag-drop, harga modal, atomic save |
| PROMPT_F06a_PembayaranCore.md | 4–5 hari | CRUD immutability, bukti multi, link, split |
| PROMPT_F06b_ReconciliationL1L2.md | 5–6 hari | CSV hook, smart matching |
| PROMPT_F06c_ReconciliationL3L4.md | 4–5 hari | Manual queue, cash bridge, Fonnte pembayaran |
| PROMPT_F07_Distribusi.md 🟡 | 7–10 hari | (Pending 1447H) DS endpoints, urutan, label |
| PROMPT_F08a_LaporanPeserta.md | 3–4 hari | LP1-LP3 aggregation |
| PROMPT_F08b_LaporanKeuangan.md | 3–4 hari | LP4-LP6, audit log read |
| PROMPT_F09_Migration1447H.md | 3–5 hari | Bulk import, dry-run, staged |
| PROMPT_F10_PolishCloning.md | 3–5 hari | Cloning polish, optional cleanup |

### 8.4 Delivery Schedule

- **Sekarang (Tahap 4 lock):** PROMPT_F01_AuthMultiUser.md (siap pakai)
- **Saat F1 sukses deploy:** PROMPT_F02_EdisiSetup.md
- **Saat F2 sukses deploy:** PROMPT_F03_MasterMuqorib.md
- **Seterusnya:** on-demand per fase mau dimulai (avoid context overload)

---

## 9. Decision Log Tahap 4

Semua decisions yang locked selama Tahap 4:

| # | Decision | Final |
|---|---|---|
| A.1.1 | Demo H+7 target | F1+F2 mandatory, F3 stretch |
| A.2.1 | SESSION_SECRET | Generate pre-F1 |
| A.2.2 | Drive folder | Setup pre-F1 |
| A.2.2 | Fonnte | Defer ke F4 |
| A.2.3 | Audit log strategy | Choice B (Minimal Extension: +user_id +ip_address) |
| A.2.4 | master.pin_hash | Valid bcrypt, dipakai bootstrap |
| A.3.1 | Branch naming | `qurban/fXX-{slug}` |
| A.3.3 | Login transition | Opsi B (Parallel login 1-2 hari) |
| A.4 | Feature flags | Module kill (F1), publik (F4b), distribusi (F7) |
| A.5 | Rollback | 4-level hierarchy |
| B.1 | Phase order | F1 → F2 → F3 → **F5a** → F4abc → F5b → F6abc → F7 → F8 → F9 → F10 |
| B.2 | Demo target | Realistic (F1+F2+F3) |
| B.6 | Workflow | Sequential per fase (token-aware) |
| C.2 Q6 | PENGURUS → | ADMIN_QURBAN |
| C.2 Q7 | Bootstrap Hopy | Add row baru, keep existing 2 rows |
| C.2 Q8 | Hopy telepon | Runtime input (placeholder di PROMPT_F01) |
| D.1 | Default rollback | Try Level 1 dulu |
| E.1 | Prompt structure | 12 universal sections |
| E.4 | Prompt delivery | On-demand per fase |

---

## 10. Open Items untuk Tahap 5

### 10.1 Immediate Action (Pre-F1)

- [ ] Hopy: Generate `SESSION_SECRET` via `openssl rand -hex 32`
- [ ] Hopy: Set `SESSION_SECRET` di Vercel env vars (Production + Preview)
- [ ] Hopy: Create Drive folder "SKM Bukti Qurban", share dengan service account, capture folder ID, set env var
- [ ] Hopy: Backup Sheet "SKM Backup pre-F01 14-Mei-2026"
- [ ] Hopy: Provide nomor telepon untuk SUPER_ADMIN bootstrap (saat run F1 migration)
- [ ] Hopy: Read PROMPT_F01_AuthMultiUser.md
- [ ] Hopy: Start Claude Code session dengan PROMPT_F01 as input

### 10.2 Per-Fase Prompts (Akan Di-Generate On-Demand)

- PROMPT_F02 — saat F1 sukses deploy
- PROMPT_F03 — saat F2 sukses deploy
- PROMPT_F04a/b/c, F05a/b, F06a/b/c, F07, F08a/b, F09, F10 — saat fase masing-masing dimulai

### 10.3 Distribution Adaptation Plan (Pasca-1447H)

Observasi Hari H 1447H untuk reshape F7 (per Tahap 3.E §11.3):
- Pengiriman per peserta atau per paket gabungan?
- Pengantar: panitia distribusi atau koordinator RT?
- Recall workflow kalau penerima tidak ada?
- Format label fisik practical
- Estimasi durasi total
- Tracking timestamp per tahap?
- Sisa daging tidak terbagikan?

### 10.4 Future Enhancement Backlog

- Automated daily Sheet backup via Apps Script trigger
- Upstash Redis untuk rate limiting (kalau abuse)
- WA bot otomatis untuk pembayaran confirmation (replace manual)
- ISAK 35 compliance (per memory)

---

## Status Akhir

**Tahap 4 LOCK ✅** — semua 5 sub-tahap selesai. Dokumen self-contained sebagai input untuk **Tahap 5 (Implementasi Bertahap via Claude Code)**.

Selanjutnya:
- Hopy execute pre-implementation checklist (§10.1)
- Hopy mulai F1 via PROMPT_F01_AuthMultiUser.md di Claude Code session
- Iterasi: deploy → test → confirm → request prompt fase berikutnya

Bismillah.
