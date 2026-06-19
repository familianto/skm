# Dokumentasi SKM — Peta Navigasi

Sistem Keuangan Masjid (SKM) v2.1. Dokumentasi dipisah menjadi dua jalur audiens
plus arsip riwayat pengembangan.

> Catatan: ini hasil **restrukturisasi mekanis** (Tahap B2a) — berkas dipindahkan
> ke struktur baru & tautan diperbaiki, **tanpa** menulis ulang isi. Penulisan
> ulang konten adopter (overview, prasyarat, panduan per-modul) & polish akan
> menyusul di Tahap B2b.

---

## 🕌 Untuk Adopter

Masjid yang ingin **memasang & memakai** SKM.

| Dokumen | Deskripsi |
|---|---|
| [adopter/SETUP_GUIDE.md](adopter/SETUP_GUIDE.md) | Panduan setup: Google Cloud, Service Account, Google Sheets, env, deploy Vercel |
| [adopter/ADOPTER_GUIDE.md](adopter/ADOPTER_GUIDE.md) | Panduan adopsi untuk masjid lain (alur, biaya, checklist) |
| [adopter/BANK_TEMPLATES.md](adopter/BANK_TEMPLATES.md) | Referensi operasional template import CSV bank |

> Panduan per-modul (keuangan, reminder WA, TV display, Qurban) & halaman overview
> adopter akan ditambahkan di Tahap B2b.

---

## 🛠️ Untuk Developer / Kontributor

Arsitektur, data model, API, dan konvensi.

| Dokumen | Deskripsi |
|---|---|
| [developer/PROJECT_BRIEF.md](developer/PROJECT_BRIEF.md) | Brief proyek lengkap |
| [developer/ARCHITECTURE.md](developer/ARCHITECTURE.md) | Arsitektur sistem & data flow |
| [developer/DATABASE_SCHEMA.md](developer/DATABASE_SCHEMA.md) | Skema 19 tab Google Sheets (10 inti + 9 Qurban, satu workbook) |
| [developer/API_REFERENCE.md](developer/API_REFERENCE.md) | Referensi semua API endpoints & kontrak |
| [developer/CONVENTIONS.md](developer/CONVENTIONS.md) | Standar & konvensi coding |
| [developer/QURBAN_VA_README.md](developer/QURBAN_VA_README.md) | ⚠️ **DRAFT — fitur belum ship.** Catatan integrasi Virtual Account (Xendit); bukan fitur produksi |

> Standar coding utama juga dirujuk dari root [`CLAUDE.md`](../CLAUDE.md) (instruksi AI-assisted dev).

---

## 📦 Arsip Riwayat (history)

Jejak proses pengembangan — handoff sprint, prompt, dan rencana sprint. Dipertahankan
sebagai catatan historis (isi **tidak** dimutakhirkan agar tetap akurat secara waktu).

- [developer/history/](developer/history/) — `HANDOFF_*`, `PROMPT_*`, `HANDOFF_TAHAP_*`, `ACCEPTANCE_F02.md`
- [developer/history/SPRINT_PLAN.md](developer/history/SPRINT_PLAN.md) — overview & dependensi sprint
- [developer/history/sprints/](developer/history/sprints/) — detail per sprint (0–6)

---

## Lihat juga

- [`README.md`](../README.md) (root) — overview proyek & quick start
- [`CLAUDE.md`](../CLAUDE.md) (root) — panduan untuk AI-assisted development
