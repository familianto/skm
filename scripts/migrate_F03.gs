/**
 * migrate_F03.gs — Sprint F03 schema migration
 * Membuat 2 sheet master Qurban: qurban_muqorib, qurban_master_hewan
 *
 * CARA PAKAI (dijalankan manual oleh operator di Apps Script editor):
 *   1. Set F03_TARGET di bawah ('STAGING' untuk uji, 'PRODUCTION' untuk pra-merge).
 *   2. Jalankan migrate_F03().
 *   3. Cek output di View > Logs.
 *   4. Jalankan verify_F03() untuk konfirmasi header.
 *
 * Idempotent: kalau sheet sudah ada, di-skip — data tidak ditimpa.
 */

// ====== TOGGLE — WAJIB DI-SET SEBELUM RUN ======
var F03_TARGET = 'STAGING'; // 'STAGING' | 'PRODUCTION'
// ===============================================

var F03_SHEET_IDS = {
  STAGING:    '1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4',
  PRODUCTION: '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE'
};

var F03_HEADERS = {
  qurban_muqorib: [
    'id', 'nama_lengkap', 'alamat', 'rt', 'no_hp', 'is_active',
    'data_induk_ref_1447h', 'notes', 'created_at', 'created_by', 'updated_at'
  ],
  qurban_master_hewan: [
    'id', 'edisi_id', 'jenis', 'kelas', 'kapasitas_slot', 'harga_beli',
    'harga_bawa_sendiri', 'is_active', 'created_at', 'updated_at', 'created_by'
  ]
};

function migrate_F03() {
  var sheetId = F03_SHEET_IDS[F03_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F03_TARGET tidak valid: ' + F03_TARGET);
    return;
  }
  Logger.log('=== migrate_F03 — TARGET: ' + F03_TARGET + ' (' + sheetId + ') ===');
  var ss = SpreadsheetApp.openById(sheetId);

  Object.keys(F03_HEADERS).forEach(function (sheetName) {
    var headers = F03_HEADERS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      Logger.log('SKIP: sheet "' + sheetName + '" sudah ada (' +
        sheet.getLastRow() + ' baris). Tidak diubah.');
      return;
    }
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    Logger.log('OK: sheet "' + sheetName + '" dibuat dengan ' +
      headers.length + ' kolom.');
  });

  Logger.log('=== migrate_F03 selesai ===');
}

function verify_F03() {
  var sheetId = F03_SHEET_IDS[F03_TARGET];
  Logger.log('=== verify_F03 — TARGET: ' + F03_TARGET + ' ===');
  var ss = SpreadsheetApp.openById(sheetId);
  var allOk = true;

  Object.keys(F03_HEADERS).forEach(function (sheetName) {
    var expected = F03_HEADERS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('FAIL: sheet "' + sheetName + '" tidak ditemukan.');
      allOk = false;
      return;
    }
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    var match = JSON.stringify(actual) === JSON.stringify(expected);
    if (match) {
      Logger.log('OK: "' + sheetName + '" — header cocok (' +
        expected.length + ' kolom).');
    } else {
      Logger.log('FAIL: "' + sheetName + '" — header TIDAK cocok.');
      Logger.log('  expected: ' + JSON.stringify(expected));
      Logger.log('  actual  : ' + JSON.stringify(actual));
      allOk = false;
    }
  });

  Logger.log('=== verify_F03: ' + (allOk ? 'SEMUA OK' : 'ADA MASALAH') + ' ===');
}
