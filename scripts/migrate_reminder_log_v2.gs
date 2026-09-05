/**
 * migrate_reminder_log_v2.gs — perbaikan bulk reminder WA (pasca insiden 2026-09-03)
 *
 * Menambahkan TIGA kolom baru di akhir sheet `reminder_log`:
 *   I `target`       — nomor tujuan ternormalisasi (628…) saat pengiriman
 *   J `http_status`  — HTTP status dari Fonnte ('' bila request tak pernah sampai)
 *   K `fonnte_id`    — id pesan Fonnte, dasar rekonsiliasi status kirim
 *
 * Latar: pada blast 287 target, 244 baris gagal dengan alasan identik
 * "request invalid on disconnected device" dan tidak ada satu pun kolom yang
 * menyimpan nomor tujuan / status HTTP untuk penelusuran.
 *
 * CARA PAKAI (dijalankan manual oleh operator di Apps Script editor):
 *   1. Set RMD2_TARGET di bawah ('STAGING' untuk uji, 'PRODUCTION' untuk pra-merge).
 *   2. Set RMD2_DRY_RUN = true untuk lihat rencana tanpa menulis; ubah ke false
 *      untuk benar-benar menerapkan.
 *   3. Jalankan migrate_reminder_log_v2().
 *   4. Cek output di View > Logs.
 *   5. Jalankan verify_reminder_log_v2() untuk konfirmasi header.
 *
 * Idempotent: kalau header `target` sudah ada, script SKIP. Aman dipanggil ulang.
 * Baris lama TIDAK di-backfill — kolom baru sengaja dibiarkan kosong karena
 * datanya memang tidak pernah tercatat.
 */

// ====== TOGGLE — WAJIB DI-SET SEBELUM RUN ======
var RMD2_TARGET = 'STAGING';   // 'STAGING' | 'PRODUCTION'
var RMD2_DRY_RUN = true;       // true = log rencana, false = tulis
// ===============================================

var RMD2_SHEET_IDS = {
  STAGING:    '1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4',
  PRODUCTION: '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE'
};

var RMD2_TARGET_SHEET = 'reminder_log';
var RMD2_OLD_HEADERS = [
  'id', 'donatur_id', 'tanggal_kirim', 'jenis_reminder',
  'pesan', 'status_kirim', 'error_message', 'created_at'
];
var RMD2_NEW_COLUMNS = ['target', 'http_status', 'fonnte_id'];

function migrate_reminder_log_v2() {
  var sheetId = RMD2_SHEET_IDS[RMD2_TARGET];
  if (!sheetId) throw new Error('RMD2_TARGET tidak dikenal: ' + RMD2_TARGET);

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(RMD2_TARGET_SHEET);
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + RMD2_TARGET_SHEET);

  var lastCol = Math.max(sheet.getLastColumn(), RMD2_OLD_HEADERS.length);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log('Target   : %s (%s)', RMD2_TARGET, sheetId);
  Logger.log('Dry run  : %s', RMD2_DRY_RUN);
  Logger.log('Header   : %s', headers.join(' | '));

  if (headers.indexOf('target') !== -1) {
    Logger.log('SKIP — kolom `target` sudah ada, sheet dianggap sudah termigrasi.');
    return;
  }

  var startCol = RMD2_OLD_HEADERS.length + 1; // kolom I
  Logger.log('Rencana  : tulis %s di kolom %s-%s',
    RMD2_NEW_COLUMNS.join(', '), startCol, startCol + RMD2_NEW_COLUMNS.length - 1);

  if (RMD2_DRY_RUN) {
    Logger.log('DRY RUN — tidak ada yang ditulis. Set RMD2_DRY_RUN = false untuk menerapkan.');
    return;
  }

  sheet.getRange(1, startCol, 1, RMD2_NEW_COLUMNS.length).setValues([RMD2_NEW_COLUMNS]);
  Logger.log('OK — %s kolom ditambahkan. Baris lama sengaja dibiarkan kosong.',
    RMD2_NEW_COLUMNS.length);
}

function verify_reminder_log_v2() {
  var sheetId = RMD2_SHEET_IDS[RMD2_TARGET];
  var sheet = SpreadsheetApp.openById(sheetId).getSheetByName(RMD2_TARGET_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var expected = RMD2_OLD_HEADERS.concat(RMD2_NEW_COLUMNS);

  Logger.log('Header aktual  : %s', headers.join(' | '));
  Logger.log('Header harapan : %s', expected.join(' | '));

  for (var i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      Logger.log('MISMATCH di kolom %s: "%s" ≠ "%s"', i + 1, headers[i], expected[i]);
      return;
    }
  }
  Logger.log('OK — header `reminder_log` sesuai (%s kolom), baris data: %s',
    expected.length, Math.max(sheet.getLastRow() - 1, 0));
}
