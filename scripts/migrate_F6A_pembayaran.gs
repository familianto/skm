/**
 * migrate_F6A_pembayaran.gs — Sprint F6 Milestone A schema migration
 * Membuat 1 sheet pembayaran Qurban: qurban_pembayaran
 * (1 baris = 1 pendaftaran / kode_bayar — BUKAN per-slot).
 *
 * Sheet ini hidup di WORKBOOK UTAMA (GOOGLE_SHEETS_ID), sebelah `transaksi` —
 * sama seperti qurban_peserta / qurban_daftar_hewan, BUKAN workbook legacy
 * GOOGLE_SHEETS_QURBAN_ID.
 *
 * CARA PAKAI (dijalankan manual oleh operator di Apps Script editor):
 *   1. Set F6_TARGET di bawah ('STAGING' untuk uji, 'PRODUCTION' untuk pra-merge).
 *   2. (Disarankan) Jalankan dryRun_F6A() dulu — hanya log rencana, tidak menulis.
 *   3. Jalankan migrate_F6A().
 *   4. Cek output di View > Logs.
 *   5. Jalankan verify_F6A() untuk konfirmasi header.
 *
 * Idempotent: kalau sheet sudah ada, di-skip — data TIDAK ditimpa (header
 * dipastikan benar). Tidak ada formula → isu titik-koma locale tidak relevan.
 */

// ====== TOGGLE — WAJIB DI-SET SEBELUM RUN ======
var F6_TARGET = 'STAGING'; // 'STAGING' | 'PRODUCTION'
// ===============================================

var F6_SHEET_IDS = {
  STAGING:    '1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4',
  PRODUCTION: '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE'
};

// Urutan kolom OTORITATIF — harus identik dengan
// SHEET_HEADERS['qurban_pembayaran'] di src/lib/constants.ts (19 kolom).
var F6_HEADERS = {
  qurban_pembayaran: [
    'id', 'edisi_id', 'kode_bayar', 'muqorib_id', 'nominal_total',
    'nominal_transfer', 'metode', 'status', 'tanggal_terima_panitia',
    'panitia_terima_id', 'tanggal_lunas', 'bank_ref', 'skm_transaksi_id',
    'bukti_url', 'match_metadata', 'notes', 'created_at', 'updated_at',
    'created_by'
  ]
};

/** Dry-run: tampilkan rencana tanpa menulis apa pun. */
function dryRun_F6A() {
  var sheetId = F6_SHEET_IDS[F6_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F6_TARGET tidak valid: ' + F6_TARGET);
    return;
  }
  Logger.log('=== DRY-RUN migrate_F6A — TARGET: ' + F6_TARGET + ' (' + sheetId + ') ===');
  var ss = SpreadsheetApp.openById(sheetId);
  Object.keys(F6_HEADERS).forEach(function (sheetName) {
    var headers = F6_HEADERS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      Logger.log('PLAN(SKIP): sheet "' + sheetName + '" sudah ada (' +
        sheet.getLastRow() + ' baris) — hanya header yang akan dipastikan.');
    } else {
      Logger.log('PLAN(CREATE): sheet "' + sheetName + '" akan dibuat dengan ' +
        headers.length + ' kolom: ' + JSON.stringify(headers));
    }
  });
  Logger.log('=== DRY-RUN selesai — tidak ada penulisan ===');
}

function migrate_F6A() {
  var sheetId = F6_SHEET_IDS[F6_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F6_TARGET tidak valid: ' + F6_TARGET);
    return;
  }
  Logger.log('⚠️ PASTIKAN BACKUP: File > Make a copy sebelum lanjut.');
  Logger.log('=== migrate_F6A — TARGET: ' + F6_TARGET + ' (' + sheetId + ') ===');
  var ss = SpreadsheetApp.openById(sheetId);

  Object.keys(F6_HEADERS).forEach(function (sheetName) {
    var headers = F6_HEADERS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      // Idempoten: sheet sudah ada — pastikan baris header benar, jangan timpa data.
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      Logger.log('SKIP: sheet "' + sheetName + '" sudah ada (' +
        sheet.getLastRow() + ' baris). Header dipastikan, data tidak diubah.');
      return;
    }
    sheet = ss.insertSheet(sheetName);
    // Tulis header sekali via batch setValues (bukan loop per-sel).
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    Logger.log('OK: sheet "' + sheetName + '" dibuat dengan ' +
      headers.length + ' kolom.');
  });

  Logger.log('=== migrate_F6A selesai ===');
}

function verify_F6A() {
  var sheetId = F6_SHEET_IDS[F6_TARGET];
  Logger.log('=== verify_F6A — TARGET: ' + F6_TARGET + ' ===');
  var ss = SpreadsheetApp.openById(sheetId);
  var allOk = true;

  Object.keys(F6_HEADERS).forEach(function (sheetName) {
    var expected = F6_HEADERS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('❌ FAIL: sheet "' + sheetName + '" tidak ditemukan.');
      allOk = false;
      return;
    }
    // Guard: jumlah kolom — tangkap kolom nyasar atau kurang.
    var lastCol = sheet.getLastColumn();
    if (lastCol !== expected.length) {
      Logger.log('FAIL: "' + sheetName + '" — jumlah kolom ' + lastCol +
        ', diharapkan ' + expected.length + '.');
      allOk = false;
    }
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    var match = JSON.stringify(actual) === JSON.stringify(expected);
    if (match) {
      Logger.log('✅ OK: "' + sheetName + '" — header cocok (' +
        expected.length + ' kolom).');
    } else {
      Logger.log('❌ FAIL: "' + sheetName + '" — header TIDAK cocok.');
      Logger.log('  expected: ' + JSON.stringify(expected));
      Logger.log('  actual  : ' + JSON.stringify(actual));
      allOk = false;
    }
  });

  Logger.log('=== verify_F6A: ' + (allOk ? '✅ SEMUA OK' : '❌ ADA MASALAH') + ' ===');
}
