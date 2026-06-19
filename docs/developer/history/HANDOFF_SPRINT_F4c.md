# HANDOFF — Sprint F4c · UI Pendaftaran Qurban

Branch: `claude/f4c-peserta-list-detail-VgSY7` · 6 milestone (A–F) · **UI-only**
(mengonsumsi PS1–PS8 dari F4a & PB1–PB4 dari F4b — tanpa perubahan backend /
migrasi Sheet, kecuali dokumentasi).

Modul Qurban kini punya UI pendaftaran lengkap: **panitia** (list, detail, form
baru, edit, aksi BATAL/Refresh Harga) + **publik** (wizard daftar, cek-status).

---

## Ringkasan per milestone

### A — List & Detail Peserta (panitia, read-only)
- `/qurban/peserta` (list) + `/qurban/peserta/[id]` (detail). Enrich client-side:
  `hewan_id`→label (H1), `muqorib_id`→nama (M1/M3). Filter status + pencarian.
- **Timeline audit reusable** (A3, bangun-baru): endpoint baca generik
  `GET /api/qurban/peserta/[id]/audit` (pure `selectAuditEntries`) + komponen
  `AuditTimeline`.

### B — Form Pendaftaran Panitia
- `/qurban/peserta/baru` (PS2). Smart-lookup muqorib (M7) atau buat baru (M2).
- Deteksi duplikat: PS6 (TERDAFTAR) + probe PS1 (BATAL) → banner + modal 3-opsi.
- Tombol "+ Tambah Peserta" di list + gate tulis (`canWritePeserta` = SA·AQ·PD).

### C — Revisi Model Pendaftaran (penting)
- **`kode_bayar` per-PENDAFTARAN**: satu pendaftaran = satu kode, dibagi N baris
  peserta. Helper `nextKodeBayar` (max suffix +1), dipakai PS2 **dan** PB3.
- **Guard kapasitas**: `jumlah_slot` ≤ kapasitas satu ekor (PS2 & PB3).
- **Atas-nama per-slot** (form panitia) + opsi "samakan semua".
- **Jumlah slot cerdas-konteks** (`slotFieldConfig`): Kambing terkunci 1, Sapi
  Beli 1–kapasitas, Sapi Bawa Sendiri terkunci kapasitas. Bug "17" diperbaiki.
- Template WA & success screen → **satu kode**.

### D — Edit Peserta + Aksi Tulis
- `/qurban/peserta/[id]/edit` (PS4: `nama_atas_nama`, `keterangan_bagian`,
  `notes` — field non-struktural saja).
- Detail page: Edit (SA·AQ·PD), **Tandai BATAL** (PS5), **Refresh Harga** (PS7)
  — keduanya SA·AQ via gate baru `canManagePesertaStatus`. Alasan BATAL ditarik
  dari audit (`extractCancelAlasan`).

### E — Pendaftaran Publik
- `/publik/qurban/daftar` — wizard 3-langkah (PB1→PB2→PB3), tanpa auth/sidebar,
  mobile-first. Halaman sukses: satu kode, total + nominal transfer, rekening,
  catatan WA.
- **PB3 menerima `nama_atas_nama` TUNGGAL** (diterapkan ke semua slot) — beda
  dari form panitia yang per-slot. Honeypot field `email`.

### F — Cek-Status Publik + Polish + Closeout
- `/publik/qurban/cek-status` (PB4): cari by kode_bayar / no_hp, nama ter-mask
  (dari backend), hasil dikelompokkan per kode_bayar.
- Link dari halaman sukses daftar → cek-status.
- Polish: copy-button kode & rekening; fix stale-error banner wizard; tip UI
  Step 2 (reassurance phone-match); CTA "Daftarkan Lagi" di success panitia;
  fix nav-highlight Dashboard (`resolveActiveHref`).

---

## File penting

**Halaman/route**
- `src/app/(dashboard)/qurban/peserta/{page,[id]/page,[id]/edit/page,baru/page}.tsx`
- `src/app/api/qurban/peserta/[id]/audit/route.ts` (endpoint baca audit baru)
- `src/app/publik/qurban/{daftar,cek-status}/page.tsx`

**Komponen**
- `PesertaList`, `PesertaDetail`, `PesertaForm`, `PesertaEditForm`,
  `PesertaCancelModal`, `MuqoribLookup`, `AuditTimeline`,
  `PublikDaftarWizard`, `PublikCekStatus` (di `src/components/qurban/`)

**Logika murni (tested)**
- `src/lib/qurban/peserta-display.ts` — badge/label/filter/gate/`extractCancelAlasan`
- `src/lib/qurban/peserta-form.ts` — pricing preview, `slotFieldConfig`,
  `resolveAtasNamaPerSlot`, validasi
- `src/lib/qurban/peserta-kode-bayar.ts` — `nextKodeBayar` (per-pendaftaran)
- `src/lib/qurban/publik-daftar-form.ts` — transform options + `friendlyPublikError`
- `src/lib/qurban/publik-cek-status.ts` — query builder + group by kode
- `src/lib/api/audit-read.ts` — `selectAuditEntries` (reusable)
- `src/lib/nav-active.ts` — `resolveActiveHref`

---

## Keputusan in-repo (penting untuk sprint berikutnya)

1. **`kode_bayar` per-pendaftaran** (F4c-C) — beberapa baris peserta berbagi satu
   kode; ini kunci-grup pembayaran. Data pra-C punya kode per-slot (tidak ada
   migrasi). Lihat `docs/API_REFERENCE.md` (callout revisi).
2. **PB3 `nama_atas_nama` tunggal** — kontrak publik hanya menerima satu nama.
   Per-slot publik butuh perubahan backend PB3 (di luar F4c).
3. **Honeypot field = `email`** (controlled-input React; MVP, bukan captcha).
4. **PS7 tidak menerbitkan `BUSINESS_OVERPAYMENT_AFTER_REFRESH`** — sheet
   `qurban_pembayaran` baru di F6. UI menampilkan `harga_lama → harga_baru`.
5. **PS5 cancel** body `{ alasan?, refund_handling? }` — `refund_handling`
   free-text (UI sediakan opsi konvenien; backend tak membatasi enum).
6. **Phone-primary lookup (PB2 v2) diparkir ke sprint F4d** pasca-merge.
7. **Test komponen/route** tidak ada (repo tak punya harness React — `node:test`
   atas lib murni). Logika murni di-cover.

---

## Endpoint yang dikonsumsi
PS1, PS2, PS3, PS4, PS5, PS6, PS7, PS8 · PB1, PB2, PB3, PB4 · M1, M2, M3, M7 ·
H1, H3 · MH1 · audit-read (baru, F4c-A).

## Belum dikerjakan (sprint berikutnya)
F4d (phone-primary lookup) · F5b (Pemetaan slot) · F6 (Pembayaran) · F7 (Hari-H).
