# HANDOFF — Sprint F4d · Phone-Primary Lookup (PB2 v2)

Branch: `claude/f4d-phone-lookup-publik-I2yxs` · 2 milestone (A–B)

**Status:** Milestone A (sisi publik + mesin backend bersama) **selesai**.
Milestone B (panitia M7 phone-primary) menyusul di branch yang sama.

---

## Konteks

SKM punya seed 196 muqorib (1447H) ber-grain **1 muqorib per nomor HP** —
satu rumah tangga / keluarga = satu muqorib (nama anggota tersimpan di
`notes`). Sebelum F4d, pendaftaran publik (PB2) memakai strict-match
`{nama_lengkap, no_hp}` → ejaan/nama variatif sering meleset, padahal HP
sudah cukup untuk identifikasi. F4d men-**reshape** sisi pendaftaran agar
HP-dulu, sambil tetap aman terhadap enumeration.

---

## Milestone A — apa yang berubah

### 1. Revisi PB2 — `POST /api/publik/qurban/daftar/lookup`

**Kontrak lama** (F4b/F4c): `{nama_lengkap, no_hp}` strict-match → balas
muqorib **penuh** (nama+HP = 2-faktor cukup kuat).

**Kontrak baru** (F4d): `{no_hp, email?}`  → balas **identitas tersamar**.

```jsonc
// found:
{ "found": true,
  "muqorib_id": "MQR-…",
  "nama_masked": "Ho** Fa********",   // maskNama (reuse)
  "alamat_masked": "GN. ****",         // maskAlamat (new, coarse)
  "rt": "005" }
// not-found / honeypot:
{ "found": false }
```

Alasan: HP-saja < nama+HP. Balas penuh = enumeration / PII leak. Solusi:
hentikan PII penuh dan pakai masking sebagai **faktor-kedua baru** —
jamaah konfirmasi visual ("ini saya/keluarga saya"). 2-faktor =
**HP + pengenalan**.

**Konsumen lain PB2:** hanya `PublikDaftarWizard` (cek dengan grep) — aman
direvisi in-place; tidak ada endpoint mati.

### 2. File baru / diubah

| File | Status | Catatan |
|---|---|---|
| `src/lib/qurban/publik-masking.ts` | Edit | + `maskAlamat(alamat)` |
| `src/lib/qurban/publik-muqorib.ts` | Edit | + `selectActiveMuqoribByPhone` (pure) + `lookupMuqoribByPhone` (async, dipakai PB2 dan M7-nanti) |
| `src/lib/qurban/publik-validators.ts` | Edit | `validatePublikLookup` kini `{no_hp}` saja (nama_lengkap dihilangkan) |
| `src/lib/qurban/publik-rate-limit.ts` | Edit | PB2 tambah `60/jam` (lebih sensitif karena HP-only) |
| `src/lib/qurban/publik-audit.ts` | Edit | + emitters: `auditPublikLookupAttempted` / `_matched` / `_notFound` / `_rateLimited` / `_captchaFailed` |
| `src/app/api/publik/qurban/daftar/lookup/route.ts` | Rewrite | rate-limit → honeypot (silent) → gate BUKA → validate → lookup → masked response |
| `src/app/api/publik/qurban/daftar/route.ts` | Edit | PB3 response **tidak lagi** kirim `muqorib.nama_lengkap` / `no_hp` penuh — `nama_masked` saja |
| `src/components/qurban/PublikDaftarWizard.tsx` | Edit | Step 2 reshape: HP-only + honeypot + kartu konfirmasi (Ya / Bukan) + rejected-state |
| `src/lib/qurban/__tests__/publik-masking.test.ts` | Edit | + 6 case `maskAlamat` |
| `src/lib/qurban/__tests__/publik-muqorib.test.ts` | Edit | + 5 case `selectActiveMuqoribByPhone` |
| `src/lib/qurban/__tests__/publik-validators.test.ts` | Edit | PB2 lookup test di-update ke `{no_hp}`-only |
| `docs/API_REFERENCE.md` | Edit | Catat revisi PB2 + jejak audit baru |
| `docs/PROJECT_BRIEF.md` | Edit | Tambah subbagian F4d Milestone A |
| `CLAUDE.md` | Edit | Update Current Sprint pointer |

### 3. Signature kunci

```ts
// pure (dipakai unit-test, dan reusable jika nanti ada pemanggil yang
// sudah memegang list muqorib)
export function selectActiveMuqoribByPhone(
  list: readonly QurbanMuqorib[],
  no_hp: string
): QurbanMuqorib | null;

// thin async I/O wrapper — single entry-point untuk PB2 & (nanti) M7
export async function lookupMuqoribByPhone(
  no_hp: string
): Promise<{ muqorib: QurbanMuqorib } | null>;

export function maskAlamat(alamat: string): string;
// "Jl. Gn. Sahari No. 5"  → "GN. ****"
// "Taman Mini Indonesia"  → "TA. ****"
// "" / whitespace          → ""
// no usable alpha          → "****"
```

### 4. Keputusan masking & guard

- **`alamat_masked` sengaja kasar**: hanya 2 huruf pertama dari token
  non-stopword pertama, sisanya `****`. Stopwords: `jl/jln/jalan/gg/gang/
  komp/komplek/perum/no/nomor/rt/rw/blok/kav` + angka apa pun dibuang. Tujuan:
  cukup untuk pengenalan, **tidak bisa dipanen**.
- **`rt` apa adanya**: kasar (~30 RT di lingkup masjid), tidak meng-identifikasi sendiri.
- **Inactive muqorib disembunyikan**: `lookupMuqoribByPhone` mengembalikan
  `null` saat satu-satunya match nonaktif → PB2 tampak "not-found". PB3
  tetap pakai `findMuqoribByNoHp` langsung agar bisa **menolak eksplisit**
  inactive (`publik.daftar_muqorib_inactive`, konsisten PS2).
- **Honeypot `email` terisi → silent `{found:false}`** (audit
  `publik.lookup_captcha_failed`). Bot tidak belajar apa-apa.
- **Rate-limit lebih ketat**: tetap `20/menit` + tambah `60/jam` per-IP
  (PB2 sekarang lebih mudah dienumerasi).
- **Audit tidak menyimpan HP mentah** — selalu `no_hp_masked` (selaras
  pola `publik.daftar_muqorib_inactive`).

### 5. PB3 (submit) — verifikasi TIDAK rusak

PB3 tetap menerima dua jalur identitas:
- `muqorib_id` (dari "Ya, lanjutkan" di kartu konfirmasi) → server pakai
  data tersimpan; klien **tidak mengirim** alamat/HP penuh.
- `muqorib_data` (jalur pendaftar baru) → user mengetik sendiri.

PB3 **response disempitkan**: `muqorib: { id, nama_masked }` saja (tanpa
`nama_lengkap` / `no_hp` penuh). Klien wizard tidak menampilkan keduanya
di success screen — aman. Notifikasi WA tetap dikirim server-side dengan
PII asli (kontrak `pendaftaran_publik` Fonnte tidak berubah).

### 6. Frontend Step 2 (wizard publik)

State machine `LookupState`:
- `idle`: input HP, tombol "Cek Nomor" (+ honeypot tersembunyi).
- `confirm`: HP cocok → kartu **"Apakah ini Anda atau keluarga Anda?"**
  dengan `nama_masked` + `alamat_masked` + `RT {rt}` + tombol
  **"Ya, lanjutkan"** / **"Bukan / nomor salah"**.
- `rejected`: user menolak → banner ramah "Periksa kembali nomor HP /
  hubungi panitia" + tombol "Ubah nomor HP & cek ulang". **TIDAK**
  fall-through ke form pendaftar-baru dengan HP yang sama (PB3 akan
  diam-diam attach ke muqorib existing → kita cegah di klien).
- `new`: HP tidak terdaftar → form pendaftar baru (`nama_lengkap`,
  `alamat`, `rt`, `notes?`). HP ini per definisi belum ada, jadi PB3
  akan membuat muqorib baru.

UX dipertahankan: `friendlyPublikError` tetap dipakai, banner error
dibersihkan saat ganti HP (`resetLookup`).

---

## Verifikasi

- `npm run lint` → ✅ hijau.
- `npm run type-check` → ✅ hijau.
- `npm test` → ✅ **371 tests pass, 0 fail** (naik dari 353 sebelum F4d
  karena tambahan kasus `maskAlamat` + `selectActiveMuqoribByPhone`).
- `npm run build` → ✅ kompilasi Next.js sukses (route PB2 baru di-detect).

### Contoh response PB2 (dengan HP dummy)

```bash
# request
{ "no_hp": "08226000001" }                    # asumsi cocok seed staging
# response — masked
{ "ok": true,
  "data": {
    "found": true,
    "muqorib_id": "MQR-20260520-0042",
    "nama_masked": "Bu** Sa****",
    "alamat_masked": "GN. ****",
    "rt": "005"
  }
}

# request — HP tak terdaftar
{ "no_hp": "08999999999" }
# response
{ "ok": true, "data": { "found": false } }

# request — honeypot terisi
{ "no_hp": "08226000001", "email": "x" }
# response (silent)
{ "ok": true, "data": { "found": false } }   # + audit publik.lookup_captcha_failed
```

### Langkah uji UI (preview / iPad)

1. **HP terdaftar (seed staging)** → kartu konfirmasi muncul dengan
   identitas tersamar. Klik "Ya, lanjutkan" → Step 3 → submit → success
   dengan kode_bayar.
2. **HP tidak terdaftar** → form pendaftar baru muncul (nama, alamat, rt,
   notes). Submit → success.
3. **"Bukan / nomor salah"** → banner amber muncul, tombol "Ubah nomor
   HP" me-reset state, **tidak ada peserta baru yang terdaftar**.
4. **Honeypot terisi** (lewat devtools) → wizard tampak seperti "not
   found"; di sheet `qurban_audit_log` ada event `publik.lookup_captcha_failed`.
5. **Rate-limit** — kirim PB2 21× dalam 1 menit → response 429
   `RATE_LIMITED`.

---

## Milestone B — yang menyusul (BELUM dikerjakan)

- M7 panitia (`GET /api/qurban/muqorib/lookup`) di-reshape jadi
  phone-primary juga (smart-lookup tetap untuk pencarian nama, tapi
  prioritaskan HP-exact).
- Komponen `MuqoribLookup` (form panitia PS2) ikut menyesuaikan: HP-dulu
  + kartu konfirmasi (tapi panitia boleh lihat PII penuh — beda
  contract dari publik).
- Re-use `lookupMuqoribByPhone` yang sudah dibuat di Milestone A.

---

## Catatan / Keputusan terbuka

- **`maskAlamat` deterministik tapi lossy** — bila atribut "Gn. Sahari"
  dan "Gn. Kerinci" ada dua-duanya di RT yang sama, keduanya akan
  menampilkan "GN. ****". Trade-off acceptable: jamaah seharusnya kenal
  nomor HP-nya sendiri (kunci utama); masking cuma sanity-check visual.
- **Inactive-only match → silent not-found di PB2**, tapi PB3 tetap
  tolak eksplisit. Konsisten: panitia masjid yang harus mengaktifkan
  kembali muqorib nonaktif, bukan jalur publik.
- **Rate-limit serverless caveat tetap berlaku** (in-memory `Map`, per
  cold-instance bukan global) — pengerasan keras = Upstash Redis backlog.

Selesai. Tunggu review sebelum lanjut Milestone B.
