# HANDOFF Sprint F4b — Pendaftaran Publik + Integrasi Fonnte

**Branch:** `claude/youthful-fermat-VzDoo`
(PR: `[F4b] Pendaftaran Publik + Integrasi Fonnte`, Draft)
**Status:** Milestone A–C ✅ done. **Code-complete** — pending closeout
checklist (bawah) sebelum PR merge ke `main`.
**Spec source:** session prompts `Sprint F4b · Milestone A/B/C`.

---

## Sprint Goal

Menambah **pendaftaran publik** qurban: endpoint publik tanpa-auth (PB1–PB4)
agar jamaah mendaftar sendiri, dengan pengaman publik (rate-limit, honeypot,
masking) dan notifikasi WhatsApp via Fonnte. **Backend-only** — UI di Sprint
F4c. **Tanpa migrasi** — config edisi sudah lengkap sejak F02.

## Milestones

| ID | Title | Status | Commit |
|---|---|---|---|
| A | Fondasi pengaman publik — rate-limit cascading, honeypot, masking, nominal-suffix + tests | ✅ done | `8fb737b` |
| B | Endpoint PB1–PB4 + auto-create muqorib + audit publik + helper window + tests | ✅ done | `7b169eb` |
| C | Integrasi Fonnte (PB3 + retrofit PS2) + polish (tolak muqorib nonaktif, kill-switch publik) + dokumentasi + PR Draft | ✅ done | _this commit_ |

---

## Tidak ada sheet/migrasi baru

F4b **tidak** menambah sheet apa pun. Kolom config yang dipakai
(`payment_suffix`, `wa_send_on_pendaftaran`, `wa_send_on_pembayaran_confirmed`)
sudah ada di `qurban_konfigurasi_edisi` sejak `migrate_F02`. Diverifikasi di
Milestone A terhadap `SHEET_HEADERS['qurban_konfigurasi_edisi']`.

---

## Endpoints PB1–PB4 (kontrak lengkap di `docs/API_REFERENCE.md`)

Semua **publik tanpa-auth** di `/api/publik/qurban/*`. Lolos middleware via
allow-list `/api/publik/*`. Menarget **edisi AKTIF** (`findActiveEdisi`).

| # | Method | Path | Rate limit (per-IP) | Gate window |
|---|---|---|---|---|
| PB1 | GET | `/api/publik/qurban/options` | 30/menit | tampil status; options hanya saat BUKA |
| PB2 | POST | `/api/publik/qurban/daftar/lookup` | 20/menit | hanya BUKA |
| PB3 | POST | `/api/publik/qurban/daftar` | 5/mnt · 20/jam · 50/hari | hanya BUKA |
| PB4 | GET | `/api/publik/qurban/cek-status` | 30/menit | **tidak di-gate** |

**PB3 (submit) — analog publik PS2:** rate-limit → honeypot → audit `attempted`
→ validasi + gate `BUKA` → resolusi muqorib (`muqorib_id` aktif / match `no_hp`
existing / **auto-create**) → deteksi duplikat Layer 1 (`409`) → freeze harga →
auto-assign slot (`409` bila kurang) → generate `kode_bayar` → insert batch
(`sumber_pendaftaran=PUBLIK`) → audit per peserta + `succeeded` → **WA Fonnte**.
Memakai ulang helper F4a (`autoAssignSlots`, `lookupHargaDisepakati`,
`nextKodeBayarSequence`, `findDuplikatTerdaftar`, `insertPeserta`,
`auditPesertaCreated`) — bukan logika baru.

---

## Pengaman publik (Milestone A)

- **Rate-limit cascading per-IP per-endpoint** (`publik-rate-limit.ts`): satu
  endpoint bisa punya beberapa window (PB3: 5/mnt **dan** 20/jam **dan**
  50/hari); request harus lolos **semua**. Dibangun **di atas** `checkRateLimit`
  F1 (bukan duplikasi). Lampaui → `429 RATE_LIMITED` + `Retry-After`.
- **Honeypot** (`publik-honeypot.ts`): field `HONEYPOT_FIELD='email'` (form
  pendaftaran tak mengumpulkan email). Terisi → bot → ditolak **generik**
  (tak menyebut "honeypot"), audit `daftar_captcha_failed`, tidak buat peserta.
- **Masking** (`publik-masking.ts`): `maskNama` (per-kata, sisakan 2 huruf
  pertama; **cutoff > 2**, mis. `Pak Budi`→`Pa* Bu**`), `maskNoHp`
  (sisakan 3 awal + 4 akhir).
- **Status pendaftaran** (`publik-pendaftaran-window.ts`, pure): `BELUM_BUKA` /
  `BUKA` (window + edisi AKTIF) / `TUTUP` (lewat tutup, atau edisi non-AKTIF).
  Tanggal dibanding `YYYY-MM-DD` WIB; `now` injectable untuk test.

> **⚠️ Keterbatasan rate-limit (jujur):** counter `Map` **in-memory per-proses**
> — di serverless Vercel limit bersifat **per-instance, bukan global** (lambda
> dingin mulai dengan window kosong). Memadai sebagai **friksi-abuse MVP**;
> pengerasan keras = ganti store F1 ke **Upstash Redis** (item masa depan).

---

## Keputusan yang dikunci

- **Nominal-ber-suffix:** `nominal_transfer = total_harga + payment_suffix`,
  dihitung **sekali pada total** submission (bukan per-slot). Suffix =
  **sinyal kategorisasi** transaksi qurban (`payment_suffix` per-edisi di config);
  **pencocokan peserta lewat `kode_bayar` di berita transfer**, BUKAN suffix.
- **Auto-create muqorib (PB3):** kalau `muqorib_data` dikirim dan `no_hp`
  (ternormalisasi) tak cocok muqorib mana pun → buat baru (`is_active=true`,
  `created_by='PUBLIK'`), audit `muqorib.auto_created_from_publik`. Kalau cocok →
  pakai record existing **apa adanya** (input publik **tak pernah** menimpa);
  bila data berbeda → audit `muqorib.data_conflict_detected`, lanjut dgn existing.
- **Muqorib nonaktif ditolak (F4b-C, konsisten PS2):** kalau satu-satunya
  kecocokan `no_hp` adalah record **nonaktif**, PB3 menolak dengan pesan
  membantu ("hubungi panitia untuk mengaktifkan kembali") + audit
  `publik.daftar_muqorib_inactive`. (`findMuqoribByNoHp` mengutamakan record
  aktif, jadi ini hanya kena saat tak ada record aktif dgn no_hp itu.)
- **Cek-status (PB4) lintas-edisi & ungated:** by `kode_bayar` (unik global) atau
  `no_hp` (lewat muqorib lintas-edisi). Nama **di-mask**; `no_hp` **tak pernah**
  dikembalikan.
- **Cap input publik:** `jumlah_slot ≤ 50` per submission (panitia PS2 uncapped)
  — pengaman input, bukan aturan bisnis.
- **Kill-switch (F4b-C):** `QURBAN_MODULE_ENABLED='false'` kini menjadikan
  `/api/publik/qurban/*` 404 juga (sebelumnya hanya `/api/qurban/*`). Matcher
  pure di `src/lib/api/qurban-kill-switch.ts`; di middleware dipindah **sebelum**
  allow-list publik (kalau tidak, allow-list men-short-circuit duluan). Allow-list
  auth & `path-rules.ts` **tidak** disentuh.

---

## Fonnte WhatsApp (Milestone C)

- **Klien dipakai ulang:** `sendWhatsApp({target, message})` dari
  **`src/lib/fonnte.ts`** (fitur Reminder existing). Env var token:
  **`FONNTE_API_TOKEN`**. Tanpa token (atau `FONNTE_MOCK=true`) → **mock graceful**
  (tidak hit jaringan, tidak crash). Test selalu **mock** `global.fetch`.
- **Dua template** (`publik-wa-template.ts`, pure data→string): `pendaftaran_publik`
  (PB3) & `pendaftaran_panitia` (PS2). Memuat nama, edisi, semua `kode_bayar`,
  ringkasan hewan + slot, total harga, **nominal-ber-suffix**, rekening, instruksi
  "tulis kode bayar di berita transfer".
- **Pola kirim:** gated `wa_send_on_pendaftaran` (`shouldSendPendaftaranWA`), kirim
  **di-`await`** (tuntas dalam lifetime serverless) tetapi **error ditangkap** —
  kegagalan WA **tidak** menggagalkan response. Audit `publik.wa_sent_success`/
  `_failed` (PB3) & `peserta.wa_sent_success`/`_failed` (PS2 retrofit).
- **Retrofit PS2 (F4a):** endpoint panitia kini juga mengirim WA setelah peserta
  dibuat (template `pendaftaran_panitia`), pola sama.

---

## Watch-out untuk sprint berikutnya

- **F4c (UI)** akan mengonsumsi PB1–PB4 (form publik + halaman sukses + cek
  status). Field honeypot `email` harus dirender tersembunyi oleh UI.
- **Multi-slot → N `kode_bayar` tapi 1 transfer.** Pendaftaran multi-slot
  menghasilkan beberapa `kode_bayar` namun nominal-ber-suffix dihitung sebagai
  **satu** transfer total. **F6/Pembayaran perlu memutuskan cara satu transfer
  dipetakan ke N `kode_bayar`** (mis. satu pembayaran menutup beberapa kode, atau
  berita memuat banyak kode).
- **`wa_send_on_pembayaran_confirmed`** ada di config tapi **belum dipakai**
  sampai F6 (konfirmasi pembayaran).
- **Rate-limit per-instance** (lihat keterbatasan di atas) — kalau butuh jaminan
  keras, migrasikan store ke Redis. Keputusan infra, bukan kode utilitas.
- **Muqorib auto-create `created_by='PUBLIK'`** (sentinel non-anggota) — sama
  untuk peserta dari publik. Audit publik pakai `user_id='PUBLIK'`, `user_info=''`.

---

## Files

**Milestone A (`8fb737b`):** `src/lib/qurban/publik-rate-limit.ts`,
`publik-honeypot.ts`, `publik-masking.ts`, `publik-nominal.ts`,
`src/lib/api/rate-limit.ts` (+param `now` opsional), 4 file test, `package.json`.

**Milestone B (`7b169eb`):** routes
`src/app/api/publik/qurban/{options,daftar/lookup,daftar,cek-status}/route.ts`,
helper `publik-pendaftaran-window.ts`, `publik-validators.ts`, `publik-options.ts`,
`publik-muqorib.ts`, `publik-status.ts`, `publik-pembayaran.ts`, `publik-audit.ts`,
6 file test, `package.json`.

**Milestone C (_this commit_):** `publik-wa-template.ts`,
`src/lib/api/qurban-kill-switch.ts`; edits `publik-audit.ts` (+`wa_sent_*`,
`daftar_muqorib_inactive`), `peserta-audit.ts` (+`wa_sent_*`), `middleware.ts`
(kill-switch publik), PB3 route (C4 tolak nonaktif + C2 Fonnte), PS2 route
(C3 Fonnte retrofit); test `fonnte`, `publik-wa-template`, `qurban-kill-switch`
(+1 case `publik-muqorib`); docs `API_REFERENCE.md`,
`PROJECT_BRIEF.md`, `HANDOFF_SPRINT_F4b.md`; `package.json`.

---

## Verification (build / CI)

`npm run type-check`, `npm run lint`, `npm test` (**289 hijau**), `npm run build`
semua hijau lokal. Tidak ada migrasi (F4b tanpa sheet baru). Fonnte tak pernah
di-hit sungguhan dari test (HTTP di-mock).

---

## Closeout checklist (operator-executed, manual)

> F4b **tanpa migrasi** → lebih ringkas dari F4a.

1. **Set env Fonnte di Vercel** (scope Preview + Production): `FONNTE_API_TOKEN`
   = token dari dashboard fonnte.com. Tanpa token, kirim WA dilewati dgn anggun
   (build & test tetap jalan) — set saat siap mengaktifkan notifikasi.
2. **Pastikan flag `wa_send_on_pendaftaran`** di Konfigurasi Edisi sesuai keinginan
   (default dari config). `false` → WA dilewati.
3. **Konfirmasi CI hijau** di PR Draft → **squash-merge** ke `main` via GitHub UI.
   (Tak perlu urutan migrasi-dulu seperti F4a — tidak ada sheet baru.)
4. **Smoke test:**
   - `GET /api/publik/qurban/options` — di staging `BELUM_BUKA` (window 1448H
     mulai 2027-03-01) = benar; untuk uji `BUKA`, set sementara
     `tanggal_pendaftaran_buka` ke kemarin di Konfigurasi Edisi.
   - `GET /api/publik/qurban/cek-status?kode_bayar=…` — kosong sebelum ada peserta.
5. Branch `claude/youthful-fermat-VzDoo` **dipertahankan** pasca-merge.
