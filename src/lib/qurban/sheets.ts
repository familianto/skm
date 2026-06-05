/**
 * Qurban sheet names per F02 migration (`migrate_F02` Apps Script).
 *
 * These three sheets live in the main SKM spreadsheet (resolved via
 * `GOOGLE_SHEETS_ID`), NOT in the legacy `GOOGLE_SHEETS_QURBAN_ID` workbook
 * used by `lib/qurban-sheets.ts` (publik/TV display read-only path).
 */
export const QURBAN_SHEETS = {
  EDISI: 'qurban_edisi',
  KONFIGURASI_EDISI: 'qurban_konfigurasi_edisi',
  PANITIA: 'qurban_panitia',
  // F03 — Master Qurban
  MUQORIB: 'qurban_muqorib',
  MASTER_HEWAN: 'qurban_master_hewan',
  // F5a — Inventaris fisik per-ekor
  DAFTAR_HEWAN: 'qurban_daftar_hewan',
  // F4a — Pendaftaran peserta (1 baris = 1 slot)
  PESERTA: 'qurban_peserta',
  // F6 — Pembayaran peserta (1 baris = 1 pendaftaran / kode_bayar)
  PEMBAYARAN: 'qurban_pembayaran',
  // F8-F — Peta bagian kanonik (Rekap Bagian)
  BAGIAN_KANONIK: 'qurban_bagian_kanonik',
} as const;
