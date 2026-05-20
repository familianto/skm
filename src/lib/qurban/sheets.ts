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
} as const;
