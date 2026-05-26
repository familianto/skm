/**
 * migrate_F4a.gs — Sprint F4a schema migration (Milestone A)
 * Membuat 1 sheet pendaftaran peserta Qurban: qurban_peserta
 * (1 baris = 1 slot; soft-delete via status_pendaftaran = BATAL, tanpa is_active).
 *
 * CARA PAKAI (dijalankan manual oleh operator di Apps Script editor):
 *   1. Set F4a_TARGET di bawah ('STAGING' untuk uji, 'PRODUCTION' untuk pra-merge).
 *   2. Jalankan migrate_F4a().
 *   3. Cek output di View > Logs.
 *   4. Jalankan verify_F4a() untuk konfirmasi header.
 *
 * Idempotent: kalau sheet sudah ada, di-skip — data tidak ditimpa.
 */

// ====== TOGGLE — WAJIB DI-SET SEBELUM RUN ======
var F4a_TARGET = 'STAGING'; // 'STAGING' | 'PRODUCTION'
// ===============================================

var F4a_SHEET_IDS = {
  STAGING:    '1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4',
  PRODUCTION: '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE'
};

var F4a_HEADERS = {
  qurban_peserta: [
    'id', 'edisi_id', 'muqorib_id', 'hewan_id', 'slot_number', 'tipe_qurban',
    'nama_atas_nama', 'keterangan_bagian', 'harga_disepakati', 'kode_bayar',
    'sumber_pendaftaran', 'status_pendaftaran', 'tanggal_daftar', 'notes',
    'created_at', 'updated_at', 'created_by'
  ]
};

function migrate_F4a() {
  var sheetId = F4a_SHEET_IDS[F4a_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F4a_TARGET tidak valid: ' + F4a_TARGET);
    return;
  }
  Logger.log('⚠️ PASTIKAN BACKUP: File > Make a copy sebelum lanjut.');
  Logger.log('=== migrate_F4a — TARGET: ' + F4a_TARGET + ' (' + sheetId + ') ===');
  var ss = SpreadsheetApp.openById(sheetId);

  Object.keys(F4a_HEADERS).forEach(function (sheetName) {
    var headers = F4a_HEADERS[sheetName];
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

  Logger.log('=== migrate_F4a selesai ===');
}

function verify_F4a() {
  var sheetId = F4a_SHEET_IDS[F4a_TARGET];
  Logger.log('=== verify_F4a — TARGET: ' + F4a_TARGET + ' ===');
  var ss = SpreadsheetApp.openById(sheetId);
  var allOk = true;

  Object.keys(F4a_HEADERS).forEach(function (sheetName) {
    var expected = F4a_HEADERS[sheetName];
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

  Logger.log('=== verify_F4a: ' + (allOk ? '✅ SEMUA OK' : '❌ ADA MASALAH') + ' ===');
}
