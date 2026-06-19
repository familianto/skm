# HANDOFF — Tahap 3 (Information Architecture) Modul Qurban di SKM

**Versi:** 1.0
**Tanggal:** 14 Mei 2026
**Status:** 3.A–3.D.3 lock. Ready untuk Tahap 3.E (API Endpoint Inventory) di chat baru.
**Scope:** Information architecture, navigasi role-based, user flow per persona, wireframe high-level Modul Qurban
**Prerequisite:** HANDOFF — Modul Qurban di SKM (Architecture) v1.0 [Tahap 2 — Schema & Architecture]

---

## TL;DR

Tahap 3 menghasilkan blueprint UI/UX & flow untuk Modul Qurban yang akan dibangun di SKM:

- **Sitemap:** 26 halaman terpetakan, dikelompokkan dalam 4 grup fungsional (Dashboard, Master, Operasional, Distribusi, Laporan) + 2 halaman publik
- **Navigasi:** Sidebar 5-section mengikuti pola SKM existing (UTAMA, LAPORAN, **QURBAN baru**, PENGATURAN, LAINNYA). Section QURBAN punya 9 items flat dengan tabs di dalamnya
- **User flow:** 20 flow ter-spec untuk 5 role internal + muqorib publik, dikelompokkan dalam 6 lifecycle phase (Setup → Pendaftaran → Pembayaran → Hari H → Laporan → Admin)
- **Wireframe:** 26 halaman ter-wireframe dengan audit log timeline pattern konsisten, modal patterns untuk konfirmasi/swap/kesepakatan harga/batch action
- **Duplicate detection:** Layer 1 strong match by muqorib_id, dengan inline banner + submit confirmation modal
- **Terminologi:** business-flavor (Revenue, Margin, KPI) dihindari, diganti dengan istilah konteks-Qurban (Dana Terhimpun, Saldo Qurban, Penerimaan)
- **Schema additions (delta ke Tahap 2):** `qurban_daftar_hewan.nomor_urut_pemotongan` + annotation `qurban_pembayaran.bukti_url` sebagai JSON array

🟡 **Marker pending validation 1447H:** semua sub-flow Distribusi (#17–#20) sengaja di-spec minimum-viable. Detail final menunggu observasi Hari H 1447H.

---

## 1. Konteks & Referensi

### 1.1 Prerequisite Reading

Dokumen ini melanjutkan dari **HANDOFF — Modul Qurban di SKM (Architecture) v1.0**. Sebelum baca dokumen ini, pastikan paham:
- 11 sheet schema (Section 4 di Tahap 2)
- 5 role + matriks akses (Section 3 di Tahap 2)
- 4-layer reconciliation (Section 5 di Tahap 2)
- Migration plan 1447H (Section 6 di Tahap 2)
- Naming conventions (Section 7 di Tahap 2)
- 4 insights + 2 notes (Section 8 di Tahap 2)

### 1.2 Scope Tahap 3

Tahap 3 fokus pada **blueprint UI/UX**:
- Peta halaman & URL structure (3.A)
- Navigasi sidebar, header, middleware (3.B)
- User flow end-to-end per persona (3.C)
- Wireframe high-level per halaman (3.D)

Tidak masuk scope Tahap 3: detail visual design (warna, font, spacing), API contract (akan di Tahap 3.E), implementation code (akan di tahap implementasi).

### 1.3 Roadmap Posisi

```
✅ Tahap 1  — Konsep & 5 dimensi awal
✅ Tahap 2  — Schema, Architecture, Reconciliation, Migration
✅ Tahap 3  — Information Architecture (DOKUMEN INI)
   3.A ✅ Sitemap
   3.B ✅ Navigasi & Role-based Routing
   3.C ✅ User Flow per Persona
   3.D ✅ Wireframe High-Level (3.D.1, 3.D.2, 3.D.3)
   3.E ⏳ API Endpoint Inventory (TODO di chat baru)
🔜 Tahap 4  — Rencana Eksekusi Migrasi
🔜 Tahap 5+ — Implementasi Bertahap
```

---

## 2. Sitemap & URL Structure (3.A)

### 2.1 Prinsip URL Structure (5 Konvensi)

1. **Edisi sebagai state, bukan path** — `/qurban/peserta` defaultnya edisi AKTIF (state via cookie session). Deep-link pakai query param `?edisi=EDS-...`. Tidak pakai nested path `/qurban/edisi/[id]/peserta`.
2. **Resource-based, bukan function-based** — `/qurban/peserta/[id]/edit`, bukan `/qurban/edit-peserta?id=...`.
3. **Konsistensi suffix** — `/baru` untuk create, `/[id]` untuk detail, `/[id]/edit` untuk edit.
4. **Action vs Resource** — operasi work-queue (rekonsiliasi, cetak label) jadi resource sendiri.
5. **Flat path, grouping di sidebar** — `/qurban/muqorib` bukan `/qurban/master/muqorib`. Grouping cuma di UI sidebar.

### 2.2 Top-Level Routes (Konteks SKM Lengkap)

| Path | Status | Catatan |
|---|---|---|
| `/` | Existing | Dashboard SKM |
| `/transaksi`, `/kategori`, `/rekening`, `/donatur` | Existing | Operasional SKM |
| `/laporan` | Existing | Laporan keuangan SKM |
| `/import-csv` | Existing | CSV import workflow |
| `/rekonsiliasi` | Existing | Rekonsiliasi SKM |
| `/pengaturan` | Existing → di-extend | Sub-route `/pengaturan/anggota` di-extend untuk multi-user |
| **`/qurban`** | **NEW** | Modul Qurban (semua sub-route di bawah) |
| `/publik/qurban` | Existing — biarkan as-is | Read dari GSheet 1447H sampai 1447H selesai |
| `/publik/qurban/tv` | Existing — biarkan as-is | TV display |
| `/publik/qurban/daftar` | **NEW** | Form pendaftaran publik |
| `/publik/qurban/cek-status` | **NEW** | Cek status by kode_bayar/HP |

### 2.3 Page Inventory `/qurban/*`

| Group | Path | Tipe | Deskripsi |
|---|---|---|---|
| Dashboard | `/qurban` | Page | Dashboard edisi terpilih |
| Edisi | `/qurban/edisi` | List | Tabel edisi 1447H, 1448H, ... |
| | `/qurban/edisi/baru` | Form | Create (dengan opsi clone) |
| | `/qurban/edisi/[id]` | Detail (3 tabs: Detail, Konfigurasi, Panitia) | |
| | `/qurban/edisi/[id]/edit` | Form | |
| Muqorib | `/qurban/muqorib` | List | Master jamaah lintas-edisi |
| | `/qurban/muqorib/baru` | Form | |
| | `/qurban/muqorib/[id]` | Detail | History partisipasi per edisi |
| | `/qurban/muqorib/[id]/edit` | Form | |
| Master Hewan | `/qurban/hewan` (default tab) | List | Master tipe jenis × kelas |
| Inventory Hewan | `/qurban/hewan` (tab 2) | List | Daftar fisik hewan |
| | `/qurban/hewan/baru` | Form | |
| | `/qurban/hewan/[id]` | Detail | Slot occupants, urutan pemotongan |
| | `/qurban/hewan/[id]/edit` | Form | |
| Konfigurasi | `/qurban/konfigurasi` (via Edisi tab) | Form | BOP, target, payment_suffix |
| Panitia | `/qurban/panitia` (via Edisi tab) | List | Panitia per edisi (informational, bukan permission gating) |
| Peserta | `/qurban/peserta` | List | List peserta edisi terpilih |
| | `/qurban/peserta/baru` | Form | Pendaftaran panitia channel |
| | `/qurban/peserta/[id]` | Detail | |
| | `/qurban/peserta/[id]/edit` | Form | |
| Pemetaan | `/qurban/pemetaan` | Tool | Drag-drop UI (desktop only) |
| Pembayaran | `/qurban/pembayaran` (default tab) | List | List pembayaran |
| Konfirmasi Bayar | `/qurban/pembayaran/konfirmasi` (tab 2) | Tool | Quick action panitia |
| Rekonsiliasi | `/qurban/pembayaran/rekonsiliasi` (tab 3) | Tool | Queue Layer 3 manual matching |
| | `/qurban/pembayaran/[id]` | Detail | |
| | `/qurban/pembayaran/baru` | Form | Manual entry edge case |
| Distribusi Tracking | `/qurban/distribusi` (default tab) | Tool | Status pengiriman |
| Urutan Pemotongan | `/qurban/distribusi/urutan-pemotongan` (tab 2) | Tool | Generate & manage |
| Cetak Label | `/qurban/distribusi/cetak-label` (tab 3) | Tool | Per hewan / per RT |
| | `/qurban/distribusi/baru` | Form | Input pengiriman |
| | `/qurban/distribusi/[id]` | Detail | |
| | `/qurban/distribusi/[id]/edit` | Form | |
| Laporan | `/qurban/laporan` (default tab) | Dashboard | |
| | `/qurban/laporan/peserta` (tab 1) | Report | Group by RT/jenis/kelas/tipe/status_bayar |
| | `/qurban/laporan/hewan` (tab 2) | Report | Inventory + biaya pembelian |
| | `/qurban/laporan/distribusi` (tab 3) | Report | Status pengiriman + flag gagal |
| | `/qurban/laporan/keuangan` (tab 4) | Report | Korelasi dengan SKM, Saldo Qurban |

### 2.4 Phasing Implementasi

| Fase | Halaman MVP |
|---|---|
| **F1 — Auth multi-user** | `/pengaturan/anggota/*` (extend), refactor `/login` |
| **F2 — Setup edisi** | `/qurban/edisi/*`, `/qurban/konfigurasi`, `/qurban/panitia/*` |
| **F3 — Master Muqorib** | `/qurban/muqorib/*` (smart-lookup foundation) |
| **F4 — Pendaftaran** | `/qurban/peserta/*`, `/publik/qurban/daftar`, `/publik/qurban/cek-status` |
| **F5 — Master Hewan + Pemetaan** | `/qurban/hewan/*`, `/qurban/pemetaan` |
| **F6 — Pembayaran + Reconciliation** | `/qurban/pembayaran/*` |
| **F7 — Distribusi** 🟡 | `/qurban/distribusi/*` (tunggu observasi 1447H untuk detail) |
| **F8 — Laporan + Dashboard** | `/qurban` (dashboard), `/qurban/laporan/*` |
| **F9 — Migration 1447H** | No new UI; backend job (pasca-Idul Adha 1447H) |
| **F10 — Cloning UI polish** | `/qurban/edisi/baru` (clone option finalization) |

---

## 3. Navigasi & Role-based Routing (3.B)

### 3.1 Login Flow & Default Landing per Role

| Role | Landing default |
|---|---|
| `SUPER_ADMIN` | `/` (Dashboard SKM) |
| `BENDAHARA` | `/` (Dashboard SKM) |
| `ADMIN_QURBAN` | `/qurban` (Dashboard Qurban) |
| `PENDAFTARAN` | `/qurban` (Dashboard Qurban) |
| `DISTRIBUSI` | `/qurban` (Dashboard Qurban) |

Panitia Qurban (PENDAFTARAN, DISTRIBUSI, ADMIN_QURBAN) auto-redirect ke `/qurban` saat login. Bendahara & Super Admin landing di SKM dashboard (akses lebih luas).

### 3.2 Sidebar Structure

SKM existing punya **4 section** (UTAMA, LAPORAN, PENGATURAN, LAINNYA). Tahap 3 menambah **section QURBAN baru** + extend PENGATURAN dengan `Anggota` (user management).

```
┌─ Logo: Masjid Al Jabar J... + Sistem Keuangan Masjid ───────────┐
├─ User widget: [Avatar] Nama User · [ROLE BADGE] ────────────────┤
├─ UTAMA ─────────────────────────────────────────────────────────┤
│   Dashboard, Transaksi, Kelompok Anggaran, Import CSV           │
├─ LAPORAN ───────────────────────────────────────────────────────┤
│   Laporan, Rekonsiliasi                                         │
├─ QURBAN (NEW) ──────────────────────────────────────────────────┤
│   Dashboard, Peserta, Pembayaran, Pemetaan, Muqorib,            │
│   Hewan, Distribusi, Laporan, Edisi                             │
├─ PENGATURAN ────────────────────────────────────────────────────┤
│   Kategori, Rekening, Donatur, Reminder WA, Anggota (NEW),      │
│   Pengaturan                                                    │
├─ LAINNYA ───────────────────────────────────────────────────────┤
│   TV Display, Keluar                                            │
└─────────────────────────────────────────────────────────────────┘
```

**Section QURBAN (Option B — Balanced Merge, 9 items flat):**

| # | Menu | URL utama | Tabs di dalam (kalau ada) |
|---|---|---|---|
| 1 | Dashboard | `/qurban` | — |
| 2 | Peserta | `/qurban/peserta` | — |
| 3 | Pembayaran | `/qurban/pembayaran` | List · Konfirmasi · Rekonsiliasi |
| 4 | Pemetaan | `/qurban/pemetaan` | — (standalone — Insight 3 visibility) |
| 5 | Muqorib | `/qurban/muqorib` | — |
| 6 | Hewan | `/qurban/hewan` | Master Tipe · Daftar Inventory |
| 7 | Distribusi | `/qurban/distribusi` | Tracking · Urutan Pemotongan · Cetak Label |
| 8 | Laporan | `/qurban/laporan` | Peserta · Hewan · Distribusi · Keuangan |
| 9 | Edisi | `/qurban/edisi` | (detail page: Detail · Konfigurasi · Panitia) |

**Konvensi merge:** sidebar tetap 9 items. Multi-aspek pages (Pembayaran, Hewan, Distribusi, Laporan, Edisi detail) pakai tabs internal. URL deep-linkable per tab (preserve dari 3.A page inventory).

### 3.3 Visibility Matrix per Role (Opsi A — Jujur, Grayed Out)

| Section | Item | Super Admin | Bendahara | Admin Qurban | Pendaftaran | Distribusi |
|---|---|---|---|---|---|---|
| **UTAMA** | Dashboard | ✅ | ✅ | 👁 | 👁 | 👁 |
| | Transaksi, Kelompok Anggaran, Import CSV | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| **LAPORAN** | Laporan | ✅ | ✅ | 👁 | 🔒 | 🔒 |
| | Rekonsiliasi | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| **QURBAN** | Dashboard | ✅ | 👁 | ✅ | ✅ | ✅ |
| | Peserta | ✅ | 👁 | ✅ | ✅ | 🔒 |
| | Pembayaran | ✅ | 👁 | ✅ | ✅ | 🔒 |
| | Pemetaan | ✅ | 👁 | ✅ | ✅ | 🔒 |
| | Muqorib | ✅ | 👁 | ✅ | ✅ | 🔒 |
| | Hewan | ✅ | 👁 | ✅ | ✅* | 🔒 |
| | Distribusi | ✅ | 🔒 | ✅ | 🔒 | ✅ |
| | Laporan | ✅ | ✅** | ✅ | 👁 | 👁 |
| | Edisi | ✅ | 👁 | ✅ | 👁 | 🔒 |
| **PENGATURAN** | Kategori, Rekening, Donatur, Reminder WA, Pengaturan | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| | Anggota | ✅ | 🔒 | 🔒 | 🔒 | 🔒 |
| **LAINNYA** | TV Display, Keluar | ✅ | ✅ | ✅ | ✅ | ✅ |

*Pendaftaran: tab "Daftar Inventory" 👁 (read-only — cek slot tersedia), tab "Master Tipe" 👁 (referensi harga). 
**Bendahara dapat ✅ untuk Laporan Qurban karena di dalamnya ada `Laporan Keuangan` (tab 4) yang merupakan domain mereka. Sub-page Peserta/Hewan/Distribusi tetap 👁.

**Default collapsed sections per role:**

| Role | Default collapsed |
|---|---|
| SUPER_ADMIN | — |
| BENDAHARA | QURBAN (sebagian), LAINNYA |
| ADMIN_QURBAN | UTAMA (sebagian 🔒), PENGATURAN |
| PENDAFTARAN | **UTAMA, LAPORAN, PENGATURAN** (semua 🔒/👁) |
| DISTRIBUSI | **UTAMA, LAPORAN, PENGATURAN** |

### 3.4 Header & Edition Switcher

**Tidak ada top app bar global** (preserve SKM existing pattern). Pengganti:

**A. User widget di top sidebar** (di bawah header masjid):
```
[Avatar] Nama User
         [ROLE]
```

**B. Qurban context strip** — in-page, di top content area pada `/qurban/*`:
```
┌─ Edisi: 1448H ▼ | Status: AKTIF | Pendaftaran: BUKA ────────────┐
```

Hanya muncul di route `/qurban/*`, tidak di `/transaksi`, `/laporan`, dll.

### 3.5 Edition Switcher Mechanics

| Aspek | Spec |
|---|---|
| Visibility | Aktif untuk SUPER_ADMIN, BENDAHARA, ADMIN_QURBAN. Disabled (label statis) untuk PENDAFTARAN, DISTRIBUSI |
| Default state | Edisi `AKTIF` |
| Persistence | Per-session HTTP-only cookie `qurban_edisi` (server-readable) |
| Deep-link | Query param `?edisi=EDS-...` override + update cookie |
| Panitia + non-AKTIF deep-link | Middleware reject, redirect ke `/qurban` |

### 3.6 Breadcrumb Convention

Format: `Section › Sub-section › Page › [Detail Identifier]`. Edisi **tidak** masuk breadcrumb (sudah di context strip).

Contoh:
- `/qurban/peserta/PST-...0001/edit` → `Qurban › Peserta › Ahmad Fauzi › Edit`

### 3.7 Middleware Defense-in-Depth (Request Layer)

```
Request → check public route → check session → check account locked
       → check role allow-list → check edisi access (panitia)
       → next()
```

**Allow-list per role (pattern match):**

| Role | Full access | Read-only access |
|---|---|---|
| `SUPER_ADMIN` | `**` | — |
| `BENDAHARA` | `/`, `/transaksi/**`, `/kategori/**`, `/rekening/**`, `/donatur/**`, `/laporan/**`, `/import-csv`, `/rekonsiliasi`, `/pengaturan` (kec. anggota), `/qurban/laporan/keuangan/**` | `/qurban`, semua `/qurban/**` kec. `/qurban/distribusi/**` |
| `ADMIN_QURBAN` | `/qurban/**` (kec. `keuangan` 👁) | `/`, `/laporan/**`, `/qurban/laporan/keuangan/**` |
| `PENDAFTARAN` | `/qurban`, `/qurban/peserta/**`, `/qurban/muqorib/**`, `/qurban/hewan/**`, `/qurban/pemetaan`, `/qurban/pembayaran/**` | `/`, `/qurban/edisi/**`, `/qurban/master-hewan/**`, `/qurban/konfigurasi`, `/qurban/panitia/**`, `/qurban/laporan/**` |
| `DISTRIBUSI` | `/qurban`, `/qurban/distribusi/**` | `/`, `/qurban/laporan/**` |

Distinction write vs read enforced di route handler (API guard, dibahas di 3.E).

### 3.8 Edge Cases & Recovery

- **Role berubah saat session aktif:** session lama tetap valid, redirect saat akses route yang tidak diizinkan baru
- **Edisi yang dilihat berubah status:** untuk lintas-edisi → flash + tombol switch; untuk panitia → auto-redirect ke AKTIF baru
- **Account locked:** session existing tetap valid, hanya login attempt baru yang di-block
- **Session timeout:** 12 jam, no refresh on activity, fail soft → `?redirect=` ke originalPath
- **Mobile:** sidebar via hamburger drawer, edition switcher compact ("1448H ▼"), Pemetaan redirect ke peserta form

---

## 4. User Flow per Persona (3.C)

20 flow ter-spec dalam 6 lifecycle phase + admin cross-cutting.

### 4.1 Phase 1 — Setup Edisi

| Flow | Persona | Ringkasan |
|---|---|---|
| **F1.1 — Buat edisi baru (clone)** | ADMIN_QURBAN | `/qurban/edisi/baru` → form dengan opsi clone Master Hewan + Konfigurasi (default ya), Panitia (default tidak). Status awal: DRAFT. |
| **F1.2 — Set master hewan & harga** | ADMIN_QURBAN | `/qurban/hewan` tab Master Tipe → inline edit harga `harga_beli`, `harga_bawa_sendiri`, `kapasitas_slot` per jenis-kelas. |
| **F1.3 — Set konfigurasi edisi** | ADMIN_QURBAN | `/qurban/konfigurasi` (via tab Edisi detail) → form single-row: BOP, target bungkus, tanggal distribusi, payment_suffix. |
| **F1.4 — Assign panitia** | ADMIN_QURBAN | `/qurban/edisi/[id]` tab Panitia → assign anggota existing. Bersifat informational (audit), bukan permission gating. |
| **F1.5 — Input inventory hewan fisik** | PENDAFTARAN/ADMIN_QURBAN | `/qurban/hewan` tab Daftar Inventory → form input per ekor. **Auto-suggest `nomor_urut` dengan rule: BAWA_SENDIRI selalu lebih awal** dari BELI dalam (jenis, kelas). Auto-shift BELI kalau BAWA_SENDIRI ditambah belakangan. |
| **F1.6 — Aktifkan edisi (DRAFT → AKTIF)** | ADMIN_QURBAN | Tombol di edisi detail. Pre-flight check: ada master hewan, konfigurasi, panitia, minimal 1 hewan AKTIF. Warning kalau ada edisi lain AKTIF (max 1 AKTIF). |

**Aturan auto-numbering hewan (F1.5):**
```
Saat tambah hewan baru:
  Jika tipe_pembelian = BAWA_SENDIRI:
    nomor_urut_baru = max(BAWA_SENDIRI di group) + 1
    Jika ada BELI ≥ nomor_urut_baru → SHIFT semua BELI += 1
  Jika tipe_pembelian = BELI:
    nomor_urut_baru = max(nomor_urut di group) + 1
```

### 4.2 Phase 2 — Pendaftaran Buka

| Flow | Persona | Ringkasan |
|---|---|---|
| **F2.1 — Muqorib daftar via publik** | Muqorib (no auth) | Multi-step: pilih hewan → smart-lookup nama → konfirmasi. Auto-assign hewan & slot (per tipe matching), generate `kode_bayar` `QRB-{tahun}-{NNN}`. Halaman sukses dengan instruksi transfer +3 suffix. |
| **F2.2 — Panitia daftar on-behalf** | PENDAFTARAN | `/qurban/peserta/baru` — flow serupa F2.1 tapi internal. Tombol "Refresh Harga" untuk apply harga master baru. `sumber_pendaftaran = PANITIA`. |
| **F2.3 — Pemetaan slot (drag-drop)** | PENDAFTARAN | `/qurban/pemetaan` (desktop only). Drag-drop dalam grup (jenis+kelas+tipe sama) silent. Swap slot terisi dengan modal konfirmasi. **Cross-class / cross-tipe / cross-jenis dengan mode lintas-grup aktif** trigger modal kesepakatan harga (sesuaikan baru / pertahankan lama / custom). Renumber hewan via drag header `[↔]` (Insight 4). **Batch save** (footer sticky). |
| **F2.4 — Muqorib cek status** | Muqorib (no auth) | `/publik/qurban/cek-status` → search kode_bayar atau no_hp. Read-only view: harga, pembayaran, status distribusi. |

**Algoritma slot auto-assign (F2.1 & F2.2):**
```
Cari qurban_daftar_hewan WHERE:
  edisi_id = current
  jenis = pilih
  kelas = pilih
  tipe_pembelian = pilih
  status = AKTIF
  count(qurban_peserta WHERE hewan_id=X) < kapasitas_slot
ORDER BY nomor_urut ASC
LIMIT 1

→ Assign ke hewan tsb, slot kosong pertama
→ Jika tidak ada: reject dengan suggestion kelas alternatif
```

**Modal Kesepakatan Harga (F2.3 cross-class):** 3 opsi — Sesuaikan baru / Pertahankan lama / Custom. Catatan untuk audit log **wajib**. Overpayment handling out-of-band MVP (flag di laporan, refund tidak otomatis).

### 4.3 Phase 3 — Pembayaran & Reconciliation

| Flow | Persona | Ringkasan |
|---|---|---|
| **F3.1 — Auto-match CSV (L1/L2)** | BENDAHARA + sistem | CSV import existing SKM. Regex `QRB-\d{4}-\d{3}` → L1 match (score 100). Smart matching `payment_suffix +3`, fuzzy nama, dll → L2 score (≥50 suggested). Insert `qurban_pembayaran` dengan `skm_transaksi_id` link + `match_metadata`. |
| **F3.2 — Konfirmasi via WA bukti** | PENDAFTARAN | `/qurban/pembayaran` tab Konfirmasi. Search peserta. **Branching A** (sudah auto-matched): tampil status + opsi tambah bukti backup (opsional). **Branching B** (belum): form input baru, `skm_transaksi_id=NULL` (auto-link saat CSV berikutnya). Bukti opsional, multi-jenis (Screenshot WA / Slip Banking / Lainnya). |
| **F3.3 — Pembayaran tunai + bridging (L4)** | PENDAFTARAN → BENDAHARA | Cash: panitia input `metode=TUNAI`, `panitia_terima_id` auto. Setor tunai → CSV → split mandatory SKM → kategori Qurban. Banyak-ke-satu (banyak cash record ↔ satu split entry). |
| **F3.4 — Rekonsiliasi manual queue (L3)** | BENDAHARA | `/qurban/pembayaran` tab Rekonsiliasi. Queue: transaksi SKM belum ter-link, nominal range Qurban. Modal link dengan smart search peserta. Support **split** untuk transaksi gabungan multi-peserta. |

### 4.4 Phase 4 — Hari H & Distribusi 🟡

🟡 **PENDING REAL-WORLD VALIDATION 1447H** — detail flow di phase ini bisa berubah berdasarkan observasi 1447H.

| Flow | Persona | Ringkasan |
|---|---|---|
| **F4.1 — Generate urutan pemotongan** | ADMIN_QURBAN | `/qurban/distribusi` tab Urutan Pemotongan. Auto-generate per jenis (Sapi & Kambing terpisah). **Algoritma: BAWA_SENDIRI dulu, lalu BELI; secondary sort by `id` ascending (= urutan input ke sistem)**. Pre-flight: warning kalau slot belum penuh (tidak strict block). Override manual via ↑↓ atau edit nomor. Cetak Daftar Pemotongan untuk pegangan panitia (tidak ada label fisik per hewan). |
| **F4.2 — Cetak label distribusi** | DISTRIBUSI | `/qurban/distribusi` tab Cetak Label. Mode: per hewan, per RT, atau custom (multi-select). Layout label paritas Apps Script v2.2. Opsi: nomor slot, QR code, jumlah copy. |
| **F4.3 — Input pengiriman + bukti** | DISTRIBUSI | Modal/form: tanggal, petugas, metode (LANGSUNG_KE_MUQORIB / VIA_RT / AMBIL_DI_MASJID), penerima, bukti foto. Status: DRAFT / DALAM_PROSES / TERKIRIM / GAGAL. |
| **F4.4 — Edge: gagal kirim** | DISTRIBUSI | Modal tandai gagal: alasan (penerima tidak ada / alamat tidak ditemukan / pindah / menolak / lainnya), tindak lanjut (re-attempt / WA / via RT). Re-attempt = record baru dengan reference ke GAGAL sebelumnya. |

**Batch action di F4.1 — Tandai Semua AKTIF → TERPOTONG:**
Saat hari H, ADMIN_QURBAN bisa klik tombol di `/qurban/hewan` untuk batch update semua hewan AKTIF jadi TERPOTONG. Pilih tanggal pemotongan (default hari ini, support Tasyrik). Catatan opsional. Audit log per hewan. **Tidak auto-transition by date** — tetap eksplisit oleh panitia.

### 4.5 Phase 5 — Laporan & Penutupan

| Flow | Persona | Ringkasan |
|---|---|---|
| **F5.1 — Laporan akhir edisi** | ADMIN_QURBAN, BENDAHARA | `/qurban/laporan` 4 tabs: Peserta, Hewan, Distribusi, Keuangan. Group flexible (RT/jenis/kelas/tipe/status_bayar). Export PDF / Excel. |
| **F5.2 — Tutup edisi (AKTIF → SELESAI)** | ADMIN_QURBAN | Modal tutup dengan **pre-flight block:** kalau ada peserta `TERDAFTAR` + belum lunas → tampil count + tombol "Lihat Daftar Peserta Belum Lunas" (deep-link ke `/qurban/peserta?status_bayar=belum_lunas`). Resolusi: lunaskan atau ubah `status_pendaftaran=BATAL`. Distribusi GAGAL tanpa re-attempt = **warning only, tidak block** (flag di laporan). |

### 4.6 Phase 6 — Admin & Maintenance

| Flow | Persona | Ringkasan |
|---|---|---|
| **F6.1 — Tambah user + assign role** | SUPER_ADMIN | `/pengaturan/anggota/baru` → nama, telepon, peran, PIN initial (validasi tidak berurutan/repeat). Komunikasi PIN out-of-band. |
| **F6.2 — Reset PIN user** | SUPER_ADMIN | `/pengaturan/anggota/[id]` → tombol Reset PIN → modal input baru. Update `pin_hash`, reset `failed_attempts` & `locked_until`. |
| **F6.3 — Recover account locked** | User → SUPER_ADMIN | Opsi A: tunggu 15 menit (`locked_until` lewat). Opsi B: SUPER_ADMIN unlock manual via Anggota detail. |

### 4.7 Daily Routine per Role

**ADMIN_QURBAN:**
- H–90 to H–60: Setup edisi (F1.1–F1.6)
- H–60 to H–14: Monitoring pendaftaran, intervene
- H–14 to H–0: Finalisasi pemetaan, generate urutan pemotongan (F4.1)
- Hari H: Coordinator, batch TERPOTONG action
- H+1 to H+7: Laporan (F5.1), tutup edisi (F5.2)

**PENDAFTARAN (selama pendaftaran buka):**
- Login → `/qurban` cek dashboard alerts
- Handle WA → F3.2 konfirmasi bayar
- Handle muqorib datang → F2.2 daftar on-behalf atau F3.3 cash
- Periodic: F2.3 pemetaan

**DISTRIBUSI (Hari H ± 2 hari):**
- Cek progress di dashboard
- F4.2 cetak label
- Eksekusi pengiriman → F4.3 input + bukti
- Handle gagal → F4.4

**BENDAHARA (rutin sepanjang edisi):**
- Pendaftaran open: F3.1 import CSV
- Mingguan: F3.4 rekonsiliasi manual
- Bulanan: cek `/qurban/laporan/keuangan` reconciliation
- Pasca distribusi: F5.1 laporan akhir

**SUPER_ADMIN:** event-based (F6.1 awal edisi, F6.2/F6.3 saat request).

---

## 5. Duplicate Detection Spec (Phase 2 Update)

Concern handling untuk muqorib/panitia mendaftar ulang ketika sudah terdaftar.

### 5.1 Case Mapping

| Case | Skenario | Penanganan |
|---|---|---|
| A — Tambahan qurban legitimate | Sudah daftar 1 Sapi, mau tambah 1 Kambing | ✅ Allow, konfirmasi intent |
| B — Tambah slot di hewan sama | Sudah 1 slot Sapi A, mau tambah 1 slot lagi | ✅ Allow, konfirmasi |
| C — Accidental duplicate | Muqorib lupa, daftar ulang | ❌ Cegah dengan eksplisit confirm |
| D — Cross-channel collision | Anak daftar via publik untuk ayah; ayah juga daftar sendiri | ❌ Cegah, redirect ke cek-status |
| E — Existing BATAL, daftar ulang | Sebelumnya batal, sekarang serius | ✅ Allow, info-only banner |
| F — Cross-edisi (1447H sudah ikut) | Wajar, beda tahun | ✅ No warning |

### 5.2 Detection Logic (Layer 1 — MVP)

Setelah smart-lookup confirms existing muqorib (atau sebelum final submit):

```sql
SELECT * FROM qurban_peserta 
WHERE muqorib_id = :selected_muqorib_id
  AND edisi_id = :current_edisi
  AND status_pendaftaran = 'TERDAFTAR'
```

- 0 result: silent, lanjut normal
- 1+ result: trigger UX flow

Layer 2 (fuzzy match by nama+HP atau nama+RT) **deferred ke Phase 2**.

### 5.3 UX Flow

**Saat Smart-Lookup Match Selesai (Step 2):**

Inline banner non-blocking di Step 3:
```
ℹ Pendaftaran Existing untuk Ahmad Fauzi
   Muqorib ini sudah punya pendaftaran di edisi 1448H:
   • QRB-1448-007 — Sapi-A-01 slot 3 (Rp 4.000.000, 🟢 Lunas)
   [Lihat detail pendaftaran existing →]
```

**Saat Klik Submit (Step 3):**

Modal blocking dengan 3-4 opsi:

Untuk publik channel (`/publik/qurban/daftar`):
```
⚠ Anda sudah daftar sebelumnya di edisi 1448H
   Pendaftaran sebelumnya: QRB-1448-007 — Sapi-A-01 slot 3 (Lunas)
   Pendaftaran baru: Kambing-A-02 slot 1 (Rp 3.500.000)

   ○ Ya, lanjutkan — ini qurban tambahan (kode baru QRB-1448-XXX)
   ○ Batalkan — saya mau cek pendaftaran existing [→ Cek Status]
   ○ Batalkan total
```

Untuk panitia channel (`/qurban/peserta/baru`), tambah opsi:
```
   ○ Pindah slot di pendaftaran existing (bukan buat baru)
     → akan navigate ke /qurban/pemetaan
```

### 5.4 Special Cases

**Existing BATAL (Layer 1 zero result, tapi ada BATAL):**
```
ℹ Catatan: Muqorib ini sebelumnya punya pendaftaran yang dibatalkan
   • QRB-1448-005 — Sapi-A-02 slot 2 (BATAL pada 12/05)
   Tidak masalah, lanjutkan pendaftaran baru.
```
Info-only, non-blocking.

**Cross-edisi:** Tidak trigger warning. Smart-lookup hanya cek edisi current.

### 5.5 Channel Differences

**Publik:**
- Safety net: link prominent ke `/publik/qurban/cek-status` di header pendaftaran
- Copy modal lebih ramah ("Anda sudah daftar" vs "Muqorib ini sudah...")

**Panitia:**
- Detail lengkap pendaftaran existing
- Opsi keempat: navigate ke pemetaan

### 5.6 Conflict Data Handling

Saat fuzzy/eksplisit confirm "muqorib yang sama" tapi ada data berbeda (alamat/HP):
- **Default:** keep data lama (existing muqorib)
- **Channel panitia:** tampil modal sekunder "Update data muqorib dengan data baru?" → yes/no
- **Channel publik:** silent keep, tidak tanya muqorib

### 5.7 Schema Impact

**Tidak ada schema change.** Hanya:
- Audit log event type baru: `peserta.created` dengan optional flag `is_additional_qurban=true`
- (Optional) `qurban_peserta.notes` auto-prefill "Qurban tambahan untuk muqorib QRB-1448-007"

### 5.8 Integration ke Flow F2.1 & F2.2

Tambah **Step 2.5** di antara smart-lookup match dan Step 3 konfirmasi:
- Query Layer 1
- Jika existing: tampil inline banner di Step 3
- Saat submit: modal konfirmasi kalau belum ada explicit "lanjutkan" flag

---

## 6. Wireframe High-Level (3.D)

26 halaman ter-wireframe, dibagi 3 sub-tahap. Konvensi audit log timeline pattern konsisten di setiap entity utama.

### 6.1 Index 26 Halaman

| # | Halaman | URL | Bagian |
|---|---|---|---|
| 1 | Dashboard Qurban | `/qurban` | 3.D.1 |
| 2 | Peserta List | `/qurban/peserta` | 3.D.1 |
| 3 | Peserta Form Pendaftaran | `/qurban/peserta/baru` | 3.D.1 |
| 4 | Peserta Detail | `/qurban/peserta/[id]` | 3.D.1 |
| 5 | Muqorib List | `/qurban/muqorib` | 3.D.1 |
| 6 | Muqorib Detail | `/qurban/muqorib/[id]` | 3.D.1 |
| 7 | Edisi List | `/qurban/edisi` | 3.D.1 |
| 8 | Edisi Detail (3 tabs) | `/qurban/edisi/[id]` | 3.D.1 |
| 9 | Hewan Tab Master Tipe | `/qurban/hewan` (default) | 3.D.2 |
| 10 | Hewan Tab Daftar Inventory | `/qurban/hewan` (tab 2) | 3.D.2 |
| 11 | Hewan Detail | `/qurban/hewan/[id]` | 3.D.2 |
| 12 | Pemetaan (drag-drop) | `/qurban/pemetaan` | 3.D.2 |
| 13 | Pembayaran Tab List | `/qurban/pembayaran` (default) | 3.D.2 |
| 14 | Pembayaran Tab Konfirmasi | `/qurban/pembayaran/konfirmasi` | 3.D.2 |
| 15 | Pembayaran Tab Rekonsiliasi | `/qurban/pembayaran/rekonsiliasi` | 3.D.2 |
| 16 | Pembayaran Detail | `/qurban/pembayaran/[id]` | 3.D.2 |
| 17 🟡 | Distribusi Tab Tracking | `/qurban/distribusi` (default) | 3.D.3 |
| 18 🟡 | Distribusi Tab Urutan Pemotongan | `/qurban/distribusi/urutan-pemotongan` | 3.D.3 |
| 19 🟡 | Distribusi Tab Cetak Label | `/qurban/distribusi/cetak-label` | 3.D.3 |
| 20 🟡 | Distribusi Detail | `/qurban/distribusi/[id]` | 3.D.3 |
| 21 | Laporan Tab Peserta | `/qurban/laporan` (default) | 3.D.3 |
| 22 | Laporan Tab Hewan | `/qurban/laporan/hewan` | 3.D.3 |
| 23 | Laporan Tab Distribusi | `/qurban/laporan/distribusi` | 3.D.3 |
| 24 | Laporan Tab Keuangan | `/qurban/laporan/keuangan` | 3.D.3 |
| 25 | Publik Daftar (multi-step) | `/publik/qurban/daftar` | 3.D.3 |
| 26 | Publik Cek Status | `/publik/qurban/cek-status` | 3.D.3 |

### 6.2 Audit Log Timeline Pattern (Universal)

Section yang muncul di setiap entity detail page (Peserta #4, Muqorib #6, Hewan #11, Pembayaran #16, Distribusi #20, Edisi #8). Format:

```
┌─ Riwayat Perubahan ─────────────────────────────── N entri ▼ ─┐
│  ●─ [timestamp] — [event title]                               │
│  │   ▸ [field details]                                        │
│  │   ▸ Oleh: [user] ([role])                                  │
│  ●─ ...                                                        │
│                                              [Tampilkan semua] │
└────────────────────────────────────────────────────────────────┘
```

**Properties:**
- Default tampil 5 entri terbaru, expandable
- Color coding subtle: hijau (positif), merah (negative event), kuning (modification)
- Bukti/Ref links clickable (conditional pada role)
- Vertical timeline dengan ● dan garis connector

**Event types yang di-track per entity:**

| Entity | Events |
|---|---|
| Peserta | `created`, `updated`, `slot_moved`, `harga_changed`, `status_changed`, `pembayaran_added/removed/linked`, `distribusi_created/status_changed` |
| Muqorib | `created`, `updated`, `deactivated` |
| Hewan | `created`, `nomor_urut_changed`, `status_changed`, `urutan_pemotongan_assigned`, slot occupant changes |
| Pembayaran | `added`, `linked`, `bukti_added`, `deactivated` |
| Distribusi | `created`, `status_changed`, `bukti_uploaded`, `reattempted` |
| Edisi | `created`, `cloned_from`, `status_changed`, `konfigurasi_updated`, `panitia_added/removed` |

### 6.3 Modal Patterns (Universal)

| Modal | Trigger | Halaman |
|---|---|---|
| **Konfirmasi destructive action** | Tandai BATAL, hapus, deactivate | Peserta, Pembayaran, Muqorib, Hewan |
| **Swap slot** | Drag peserta ke slot terisi | Pemetaan |
| **Kesepakatan harga** | Drag cross-class/tipe/jenis | Pemetaan |
| **Tambah pembayaran** | Quick action di peserta detail | Peserta Detail |
| **Tutup edisi dengan block** | Klik Tutup Edisi + ada belum lunas | Edisi Detail |
| **Batch TERPOTONG** | Klik di header Inventory Hewan | Hewan Inventory |
| **Generate urutan pemotongan** | Klik Generate | Distribusi tab |
| **Re-generate urutan** | Klik Generate Ulang | Distribusi tab |
| **Input pengiriman** | Quick action atau row action | Distribusi Tracking |
| **Tandai gagal** | Row action saat status BELUM/DALAM_PROSES | Distribusi Tracking |
| **Re-attempt** | Row action saat status GAGAL | Distribusi Tracking |
| **Link manual rekonsiliasi** | Klik baris di queue | Pembayaran Rekonsiliasi |
| **Split transaksi gabungan** | Opsi di modal link | Pembayaran Rekonsiliasi |
| **Duplicate confirmation** | Submit dengan existing muqorib | Publik Daftar, Peserta Form |
| **Ubah status hewan** | Row action di inventory | Hewan Inventory |

### 6.4 Terminologi Convention (Non-Business)

| ❌ Hindari | ✅ Gunakan |
|---|---|
| Revenue, Total Revenue | Dana Terhimpun, Penerimaan Qurban |
| Margin, Profit | Saldo Qurban (Dana Terhimpun − Biaya) |
| Target Revenue | (hindari; pakai "Estimasi" kalau memang ada) |
| Customer, User | Peserta / Muqorib / Anggota |
| KPI Cards | Ringkasan / Statistik (sebagai user-facing label) |

### 6.5 Key Wireframes (Referensi Pattern)

**Dashboard Qurban (#1) — 4 Ringkasan Cards:**

```
┌──────────┬──────────┬──────────┬──────────┐
│ Peserta  │ Dana     │ Hewan    │ Status   │
│ Terdaftar│ Terhimpun│ Siap     │ Edisi    │
│   42     │ 168 jt   │ 5 / 17   │  ⏳      │
│ +3 hari  │ 84% dari │ Sapi/Kbg │ Persiapan│
│ terakhir │ peserta  │ AKTIF    │ Hari H   │
└──────────┴──────────┴──────────┴──────────┘
```

**Peserta Form Pendaftaran (#3) — 4 Section single-page:**
1. Pilih Hewan (jenis, tipe, kelas, jumlah slot, ringkasan harga)
2. Data Muqorib (smart-lookup, autocomplete)
3. Detail Pendaftaran (atas nama, bagian, catatan)
4. Konfirmasi & Submit (preview + checkbox + tombol)

**Pemetaan (#12) — Drag-Drop dengan Modal:**
- Hewan cards horizontal dengan slot rows
- Drag handle `[↔]` di header untuk renumber
- Drag peserta antar slot, modal konfirmasi kalau cross-class/swap
- Footer sticky "X perubahan belum disimpan" + Reset/Simpan

**Pembayaran Tab Konfirmasi (#14) — Branching A/B:**
- Search box atas
- Branching A: sudah auto-matched → tampil status + form upload bukti backup opsional
- Branching B: belum bayar → form input baru (`bank_ref` auto-fill nanti, `skm_transaksi_id` null)

**Laporan Tab Keuangan (#24) — Saldo Qurban:**
```
Dana Terhimpun       : Rp 168.003.000  
  • TRANSFER         : Rp 145.000.000
  • VA               : Rp 14.003.000
  • TUNAI            : Rp 9.000.000

Biaya                : Rp 120.100.000
  • Pembelian hewan  : Rp 110.600.000
  • BOP operasional  : Rp 5.000.000
  • Jasa titip & pakan: Rp 4.500.000

Saldo Qurban         : Rp 47.903.000  (Penerimaan − Biaya)

Korelasi SKM         : ... (per kategori)
Rekonsiliasi tunai   : selisih Rp 0 ✅
```

### 6.6 Mobile Considerations

- Sidebar via hamburger drawer
- Tables → card lists (responsive)
- Pemetaan drag-drop → **redirect ke peserta form** (flash warning), drag-drop desktop only
- Cetak Label & Cetak Daftar Pemotongan tetap accessible (kirim ke PDF / share)
- Edition switcher compact ("1448H ▼")
- Smart-lookup kandidat full-width cards

---

## 7. Schema Delta (untuk Update Tahap 2 Handoff Doc)

### 7.1 Tambah Kolom

**Sheet `qurban_daftar_hewan`:**

| Kolom | Tipe | Catatan |
|---|---|---|
| `nomor_urut_pemotongan` | number | Default NULL (sebelum generate). Diisi via F4.1. Unique per (edisi, jenis). |

### 7.2 Update Annotation

**Sheet `qurban_pembayaran`:**

| Kolom | Tipe | Catatan (UPDATED) |
|---|---|---|
| `bukti_url` | string (JSON array) | Optional, format: `'[{"url":"...","jenis":"SCREENSHOT_WA/SLIP_BANKING/LAINNYA","uploaded_at":"ISO","uploaded_by":"ANG-..."}]'`. Kosong = `'[]'`. Support multiple bukti dengan metadata. |

### 7.3 Audit Log Schema (Validasi/Extend)

Cek apakah `audit_log` SKM existing punya struktur:
- `entity_type` (e.g., `PESERTA`, `MUQORIB`, `HEWAN`, `PEMBAYARAN`, `DISTRIBUSI`, `EDISI`)
- `entity_id`
- `event_type` (snake_case, e.g., `peserta.created`, `pembayaran.linked`)
- `before_value` (JSON, optional)
- `after_value` (JSON, optional)
- `notes` (string, optional)
- `user_id` (FK ke `anggota`)
- `created_at`

Kalau belum, perlu extend di Phase implementasi (non-breaking — schema additions).

### 7.4 Tambah Field di Anggota (Reminder dari Tahap 2)

Sudah ter-spec di Tahap 2 Section 4.1:
- `pin_hash` (bcrypt)
- `created_by`, `updated_at`, `last_login_at`
- `failed_attempts`, `locked_until`
- `peran` enum diperluas

---

## 8. Open Items untuk Tahap 3.E

### 8.1 API Endpoint Inventory

Per resource, RESTful endpoints dengan:
- HTTP method, path
- Auth requirement (role allowed)
- Request body shape (key fields)
- Response shape (high-level)
- Error responses

Cakupan:
- `/api/qurban/edisi/*` (CRUD edisi)
- `/api/qurban/muqorib/*` (CRUD muqorib + smart-lookup endpoint)
- `/api/qurban/master-hewan/*` (CRUD master tipe)
- `/api/qurban/hewan/*` (CRUD inventory + renumber + batch status)
- `/api/qurban/konfigurasi` (single-row update)
- `/api/qurban/panitia/*` (assign/remove)
- `/api/qurban/peserta/*` (CRUD + duplicate-check endpoint)
- `/api/qurban/pemetaan/*` (move slot, swap, renumber, batch save)
- `/api/qurban/pembayaran/*` (CRUD + Layer 1/2/3 endpoints + split)
- `/api/qurban/distribusi/*` (CRUD + status change + re-attempt)
- `/api/qurban/distribusi/urutan-pemotongan/*` (generate, edit)
- `/api/qurban/laporan/*` (aggregation endpoints)
- `/api/publik/qurban/daftar` (no auth)
- `/api/publik/qurban/cek-status` (no auth)
- `/api/qurban/audit-log/[entity_type]/[entity_id]` (timeline data)

### 8.2 Auth Middleware Mapping

- Mapping role × API path × method → allow/deny
- Cookie session, JWT atau session ID (decision di 3.E)
- Rate limiting (terutama untuk publik endpoints)

### 8.3 Distribution Adaptation Plan Checklist (1447H)

Daftar pertanyaan untuk observasi Hari H 1447H sebelum F7 dimulai:
- Apakah pengiriman dilakukan per peserta atau per paket gabungan?
- Siapa pengantar fisiknya — panitia distribusi langsung atau via koordinator RT?
- Apakah ada workflow recall kalau penerima tidak ada?
- Format label fisik yang practical (size, font, layout)
- Berapa lama estimasi distribusi total dari potong sampai semua terkirim?
- Apakah perlu tracking timestamp per tahap (potong → kemas → label → kirim)?
- Bagaimana handle daging yang tidak sempat dibagikan (sisa)?

### 8.4 Persistent Storage di Modul Qurban

- File upload (bukti foto, bukti distribusi): Google Drive infra existing SKM
- Bukti multiple per pembayaran: JSON array di `bukti_url`
- Audit log: append-only di `audit_log` sheet existing

---

## 9. Status Tahap 3

| Sub-tahap | Status | Catatan |
|---|---|---|
| 3.A Peta Halaman & Sitemap | ✅ Lock | 5 prinsip URL, 26 halaman + sub-route |
| 3.B Navigasi & Role-based Routing | ✅ Lock | Sidebar 5-section, edition switcher in-page, middleware allow-list |
| 3.C User Flow per Persona | ✅ Lock | 20 flow dalam 6 lifecycle phase |
| 3.D.1 Wireframe Group 1 | ✅ Lock | Dashboard, Peserta, Muqorib, Edisi |
| 3.D.2 Wireframe Group 2 | ✅ Lock | Hewan, Pemetaan, Pembayaran |
| 3.D.3 Wireframe Group 3 | ✅ Lock | Distribusi 🟡, Laporan, Publik |
| Duplicate Detection Spec | ✅ Lock | Layer 1 MVP, Layer 2 deferred |
| Schema Delta | ✅ Documented | 1 kolom baru + 1 annotation update |
| 3.E API Endpoint Inventory | ⏳ TODO | Di chat baru |

---

## 10. Appendix

### 10.1 Referensi Existing System (lihat juga Tahap 2 handoff Section 10)

**SKM:**
- Repo: `github.com/familianto/skm`
- Live: `skm-pi.vercel.app`
- Sheet ID: `1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE`

**Sistem Qurban 1447H (existing standalone):**
- Sheet ID: `10tUkEXJlP3ulvaZ798pBq95nLdHrLm5BlYuDFmCLHFU`

**Landing Page Publik Qurban existing:**
- `/publik/qurban`, `/publik/qurban/tv` — biarkan as-is sampai 1447H selesai

### 10.2 Decisions Log (Tahap 3 Saja)

| # | Decision | Resolusi |
|---|---|---|
| 1 | Edition switcher placement | In-page Qurban context strip (bukan top bar global) |
| 2 | Sidebar structure | 5-section preserve SKM existing + QURBAN baru di antara LAPORAN & PENGATURAN |
| 3 | User info placement | Top sidebar di bawah header masjid |
| 4 | Edition switcher persistence | Per-session cookie HTTP-only |
| 5 | Laporan Keuangan untuk Bendahara | Full access (refinement dari matriks asli) |
| 6 | Default collapsed sections | Section 100% 🔒 collapsed default per role |
| 7 | QURBAN menu grouping | Option B — 9 items flat dengan tabs internal |
| 8 | Cetak Label sebagai tab di Distribusi | Tab "Cetak Label" di dalam Distribusi (bukan top-level) |
| 9 | Drag-drop swap on occupied slot | Swap dengan modal konfirmasi |
| 10 | Drag-drop cross-class | Allow dengan modal kesepakatan harga (3 opsi: sesuaikan/pertahankan/custom) |
| 11 | Backup bukti pembayaran | Opsional, multi-jenis (Screenshot WA / Slip Banking / Lainnya) |
| 12 | Tutup edisi dengan belum lunas | BLOCK (bukan warning), link ke peserta list filtered |
| 13 | Distribusi GAGAL saat tutup edisi | Warning only (bukan block), flag di laporan |
| 14 | Urutan pemotongan secondary sort | Opsi C — by `id` ascending (urutan input), tidak ada urutan kelas |
| 15 | Constraint generate urutan | Tidak strict, warning only |
| 16 | Label fisik per hewan | Tidak perlu, cukup Daftar Pemotongan pegangan panitia |
| 17 | Status hewan TERPOTONG di hari H | Batch manual action dengan pilih tanggal (tidak auto by date) |
| 18 | Save strategy Pemetaan | Batch save (sticky footer) |
| 19 | `bukti_url` storage | JSON array dengan metadata (jenis, uploaded_at, oleh) |
| 20 | Rekening masjid di Konfirmasi Pembayaran | Tidak perlu (cukup di pendaftaran publik) |
| 21 | Terminologi business | Hindari Revenue/Margin/KPI sebagai user-facing label |
| 22 | Audit log detail | Detail di setiap entity utama dengan timeline pattern |
| 23 | Edit modal vs full-page | Consistent full-page sesuai 3.A URL convention |
| 24 | Smart-lookup typing | Debounced 300ms, minimum 2 karakter |
| 25 | Duplicate detection | Layer 1 MVP (muqorib_id match), Layer 2 fuzzy deferred |
| 26 | Conflict data handling | Default keep data lama, modal sekunder untuk panitia |

### 10.3 Konvensi Symbol di Dokumen

- ✅ Locked / Decided
- 🟡 Pending validation / soft commit
- 🔒 Access denied (visible grayed)
- 👁 Read-only access
- ⏳ TODO / pending
- 🟢 🟡 🔴 ⚪ Status badges (lunas, sebagian, belum, n/a)

### 10.4 Iteration Discipline (Forward)

Wireframe di 3.D adalah **starting point**, bukan kontrak final. Expected iteration setelah user testing:
- 🟢 **Ringan** (UI copy, button placement, color): hari yang sama
- 🟡 **Sedang** (form fields, page layout restruktur): 1-3 hari
- 🟠 **Lumayan** (halaman baru, sidebar restruktur, role permission shift): beberapa hari sampai 1 minggu
- 🔴 **Berat** (schema change, fundamental flow): 1+ minggu dengan migrasi

**Schema sudah dirancang accommodate future:** banyak `notes` field, `metadata` JSON di pembayaran, audit log pattern. Kebanyakan kebutuhan baru bisa di-handle tanpa schema change.

**User testing milestones disarankan:**
- Setelah F4 (Pendaftaran)
- Setelah F6 (Pembayaran + Reconciliation)
- Setelah Hari H 1447H observasi → reshape F7 Distribusi

---

## Status Akhir

Tahap 3 (Information Architecture) **LOCK**. Dokumen ini self-contained dengan referensi ke Tahap 2 handoff sebagai prerequisite.

**Ready untuk Tahap 3.E (API Endpoint Inventory) di chat baru** dengan dokumen ini + Tahap 2 handoff sebagai input utama.

Selanjutnya setelah 3.E:
- Tahap 4 — Rencana Eksekusi Migrasi
- Tahap 5+ — Implementasi Bertahap mengikuti F1–F10 phasing
