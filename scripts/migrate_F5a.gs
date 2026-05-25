/**
 * migrate_F5a.gs — Sprint F5a schema migration
 * Membuat 1 sheet inventaris fisik Qurban: qurban_daftar_hewan
 * (1 baris = 1 ekor hewan nyata, melengkapi katalog qurban_master_hewan dari F03).
 *
 * CARA PAKAI (dijalankan manual oleh operator di Apps Script editor):
 *   1. Set F5a_TARGET di bawah ('STAGING' untuk uji, 'PRODUCTION' untuk pra-merge).
 *   2. Jalankan migrate_F5a().
 *   3. Cek output di View > Logs.
 *   4. Jalankan verify_F5a() untuk konfirmasi header.
 *
 * Idempotent: kalau sheet sudah ada, di-skip — data tidak ditimpa.
 */

// ====== TOGGLE — WAJIB DI-SET SEBELUM RUN ======
var F5a_TARGET = 'STAGING'; // 'STAGING' | 'PRODUCTION'
// ===============================================

var F5a_SHEET_IDS = {
  STAGING:    '1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4',
  PRODUCTION: '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE'
};

var F5a_HEADERS = {
  qurban_daftar_hewan: [
    'id', 'edisi_id', 'master_hewan_id', 'jenis', 'kelas', 'nomor_urut',
    'kapasitas_slot', 'tipe_pembelian', 'vendor_nama', 'harga_beli_aktual',
    'tanggal_pembelian', 'status', 'notes', 'nomor_urut_pemotongan',
    'created_at', 'updated_at', 'created_by'
  ]
};

function migrate_F5a() {
  var sheetId = F5a_SHEET_IDS[F5a_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F5a_TARGET tidak valid: ' + F5a_TARGET);
    return;
  }
  Logger.log('⚠️ PASTIKAN BACKUP: File > Make a copy sebelum lanjut.');
  Logger.log('=== migrate_F5a — TARGET: ' + F5a_TARGET + ' (' + sheetId + ') ===');
  var ss = SpreadsheetApp.openById(sheetId);

  Object.keys(F5a_HEADERS).forEach(function (sheetName) {
    var headers = F5a_HEADERS[sheetName];
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
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    Logger.log('OK: sheet "' + sheetName + '" dibuat dengan ' +
      headers.length + ' kolom.');
  });

  Logger.log('=== migrate_F5a selesai ===');
}

function verify_F5a() {
  var sheetId = F5a_SHEET_IDS[F5a_TARGET];
  Logger.log('=== verify_F5a — TARGET: ' + F5a_TARGET + ' ===');
  var ss = SpreadsheetApp.openById(sheetId);
  var allOk = true;

  Object.keys(F5a_HEADERS).forEach(function (sheetName) {
    var expected = F5a_HEADERS[sheetName];
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

  Logger.log('=== verify_F5a: ' + (allOk ? '✅ SEMUA OK' : '❌ ADA MASALAH') + ' ===');
}
