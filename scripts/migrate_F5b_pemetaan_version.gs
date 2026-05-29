/**
 * migrate_F5b_pemetaan_version.gs — Sprint F5b Milestone A1
 *
 * Menambahkan SATU kolom baru di sheet `qurban_edisi`:
 *   `pemetaan_version` (string ISO-8601 Z)
 *
 * Token concurrency untuk endpoint Pemetaan (PM1 di Milestone A2). A1 hanya
 * memastikan kolom ada + terisi (baris awal = `updated_at`, fallback
 * `created_at`, fallback `now`). PM1 nanti yang mem-bump tiap batch-save.
 *
 * CARA PAKAI (dijalankan manual oleh operator di Apps Script editor):
 *   1. Set F5b_TARGET di bawah ('STAGING' untuk uji, 'PRODUCTION' untuk pra-merge).
 *   2. Set F5b_DRY_RUN = true untuk lihat rencana tanpa menulis; ubah ke false
 *      untuk benar-benar menerapkan.
 *   3. Jalankan migrate_F5b_pemetaan_version().
 *   4. Cek output di View > Logs.
 *   5. Jalankan verify_F5b_pemetaan_version() untuk konfirmasi header + backfill.
 *
 * Idempotent: kalau header `pemetaan_version` sudah ada, script SKIP penambahan
 * kolom & SKIP backfill (anggap sudah benar). Aman dipanggil berulang.
 */

// ====== TOGGLE — WAJIB DI-SET SEBELUM RUN ======
var F5b_TARGET = 'STAGING';   // 'STAGING' | 'PRODUCTION'
var F5b_DRY_RUN = true;       // true = log rencana, false = tulis
// ===============================================

var F5b_SHEET_IDS = {
  STAGING:    '1AeyUU0rM3XmcvqU5rSZYTrqLqBXOaTr7S50aSDOGsh4',
  PRODUCTION: '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE'
};

var F5b_TARGET_SHEET = 'qurban_edisi';
var F5b_NEW_COLUMN = 'pemetaan_version';

// Header awal F02 (12 kolom). Setelah migrasi F5b → 13 kolom dengan
// `pemetaan_version` di kolom ke-13 (terakhir).
var F5b_F02_HEADERS = [
  'id', 'tahun_hijriah', 'tahun_masehi', 'tanggal_idul_adha',
  'tanggal_pendaftaran_buka', 'tanggal_pendaftaran_tutup', 'status',
  'parent_edisi_id', 'cloned_at', 'created_at', 'updated_at', 'created_by'
];

function migrate_F5b_pemetaan_version() {
  var sheetId = F5b_SHEET_IDS[F5b_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F5b_TARGET tidak valid: ' + F5b_TARGET);
    return;
  }
  Logger.log('=== migrate_F5b_pemetaan_version — TARGET: ' + F5b_TARGET +
    ' (' + sheetId + ') | DRY_RUN: ' + F5b_DRY_RUN + ' ===');
  Logger.log('⚠️ PASTIKAN BACKUP: File > Make a copy sebelum lanjut.');

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(F5b_TARGET_SHEET);
  if (!sheet) {
    Logger.log('ERROR: sheet "' + F5b_TARGET_SHEET + '" tidak ditemukan. ' +
      'Jalankan migrate_F02 dulu.');
    return;
  }

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // 1. Idempotensi — kalau kolom sudah ada, no-op.
  for (var c = 0; c < headerRow.length; c++) {
    if (String(headerRow[c]).trim() === F5b_NEW_COLUMN) {
      Logger.log('SKIP: kolom "' + F5b_NEW_COLUMN + '" sudah ada di kolom ' +
        (c + 1) + ' — migrasi sudah pernah dijalankan. Tidak ada yang diubah.');
      return;
    }
  }

  // 2. Cek prasyarat: 12 kolom F02 standar.
  if (lastCol !== F5b_F02_HEADERS.length) {
    Logger.log('WARN: jumlah kolom saat ini ' + lastCol +
      ' ≠ ekspektasi F02 (' + F5b_F02_HEADERS.length + ').');
    Logger.log('Header saat ini: ' + JSON.stringify(headerRow));
    Logger.log('Akan tetap menambahkan kolom "' + F5b_NEW_COLUMN +
      '" di posisi terakhir (' + (lastCol + 1) + '). Periksa hasilnya manual.');
  } else {
    var headerMatch = JSON.stringify(headerRow) === JSON.stringify(F5b_F02_HEADERS);
    if (!headerMatch) {
      Logger.log('WARN: header F02 tidak persis cocok. Tetap lanjut menambah kolom baru.');
      Logger.log('Expected: ' + JSON.stringify(F5b_F02_HEADERS));
      Logger.log('Actual:   ' + JSON.stringify(headerRow));
    }
  }

  // 3. Rencana penulisan: header di kolom (lastCol+1), data backfill row 2..lastRow.
  var newColIndex = lastCol + 1; // 1-based
  var dataRowsCount = Math.max(0, lastRow - 1); // row 1 = header

  Logger.log('PLAN: append header "' + F5b_NEW_COLUMN + '" di kolom ' + newColIndex +
    '. Backfill ' + dataRowsCount + ' baris data: pemetaan_version = updated_at ' +
    '(fallback created_at; fallback NOW ISO-Z).');

  if (F5b_DRY_RUN) {
    Logger.log('DRY_RUN=true → tidak menulis. Ubah F5b_DRY_RUN=false untuk apply.');
    return;
  }

  // 4. Tulis header.
  sheet.getRange(1, newColIndex, 1, 1).setValues([[F5b_NEW_COLUMN]]);
  Logger.log('OK: header "' + F5b_NEW_COLUMN + '" ditambahkan di kolom ' + newColIndex + '.');

  // 5. Backfill data.
  if (dataRowsCount > 0) {
    // Index created_at = 9 (0-based) → col 10; updated_at = 10 → col 11.
    // Baca created_at + updated_at sekaligus (2 kolom mulai dari col 10).
    var dataRange = sheet.getRange(2, 10, dataRowsCount, 2);
    var data = dataRange.getValues(); // [[created_at, updated_at], ...]

    var nowIso = new Date().toISOString();
    var backfillValues = []; // [[value], ...] untuk dataRowsCount baris
    var fallbackNowCount = 0;
    var fallbackCreatedCount = 0;
    var usedUpdatedCount = 0;
    for (var i = 0; i < data.length; i++) {
      var createdAt = data[i][0];
      var updatedAt = data[i][1];
      var version;
      if (updatedAt && String(updatedAt).trim() !== '') {
        version = String(updatedAt).trim();
        usedUpdatedCount++;
      } else if (createdAt && String(createdAt).trim() !== '') {
        version = String(createdAt).trim();
        fallbackCreatedCount++;
      } else {
        version = nowIso;
        fallbackNowCount++;
      }
      backfillValues.push([version]);
    }

    // Batch setValues — 1 API call untuk seluruh kolom data.
    sheet.getRange(2, newColIndex, dataRowsCount, 1).setValues(backfillValues);
    Logger.log('OK: backfill ' + dataRowsCount + ' baris (updated_at=' +
      usedUpdatedCount + ', created_at=' + fallbackCreatedCount +
      ', now=' + fallbackNowCount + ').');
  } else {
    Logger.log('INFO: tidak ada baris data untuk di-backfill (sheet kosong).');
  }

  Logger.log('=== migrate_F5b_pemetaan_version selesai ===');
}

function verify_F5b_pemetaan_version() {
  var sheetId = F5b_SHEET_IDS[F5b_TARGET];
  if (!sheetId) {
    Logger.log('ERROR: F5b_TARGET tidak valid: ' + F5b_TARGET);
    return;
  }
  Logger.log('=== verify_F5b_pemetaan_version — TARGET: ' + F5b_TARGET + ' ===');

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(F5b_TARGET_SHEET);
  if (!sheet) {
    Logger.log('❌ FAIL: sheet "' + F5b_TARGET_SHEET + '" tidak ditemukan.');
    return;
  }

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // 1. Cek header `pemetaan_version` ada di kolom terakhir.
  var foundAt = -1;
  for (var c = 0; c < headerRow.length; c++) {
    if (String(headerRow[c]).trim() === F5b_NEW_COLUMN) {
      foundAt = c + 1;
      break;
    }
  }
  if (foundAt === -1) {
    Logger.log('❌ FAIL: kolom "' + F5b_NEW_COLUMN + '" TIDAK ditemukan di header.');
    return;
  }
  if (foundAt !== lastCol) {
    Logger.log('⚠️ WARN: kolom "' + F5b_NEW_COLUMN + '" ada di kolom ' + foundAt +
      ' (bukan terakhir = ' + lastCol + '). Periksa manual.');
  } else {
    Logger.log('✅ OK: header "' + F5b_NEW_COLUMN + '" ada di kolom terakhir (' +
      foundAt + ').');
  }

  // 2. Cek backfill — tiap baris data harus terisi (tidak kosong).
  var dataRowsCount = Math.max(0, lastRow - 1);
  if (dataRowsCount === 0) {
    Logger.log('INFO: sheet kosong (tidak ada baris data). Backfill tidak relevan.');
    Logger.log('=== verify_F5b_pemetaan_version selesai (SEMUA OK) ===');
    return;
  }
  var col = sheet.getRange(2, foundAt, dataRowsCount, 1).getValues();
  var emptyCount = 0;
  for (var i = 0; i < col.length; i++) {
    var v = col[i][0];
    if (v === '' || v === null || v === undefined) emptyCount++;
  }
  if (emptyCount > 0) {
    Logger.log('❌ FAIL: ' + emptyCount + '/' + dataRowsCount +
      ' baris memiliki pemetaan_version kosong.');
  } else {
    Logger.log('✅ OK: semua ' + dataRowsCount + ' baris terisi pemetaan_version.');
  }

  Logger.log('=== verify_F5b_pemetaan_version selesai ===');
}
