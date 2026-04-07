/**
 * Migrasi "Tambah Petty Cash" → Mutasi Internal (Google Apps Script)
 *
 * CARA PAKAI:
 *   1. Buka Google Sheets target (SKM).
 *   2. Menu: Ekstensi → Apps Script.
 *   3. Hapus isi Code.gs, paste seluruh isi file ini.
 *   4. (Opsional) Edit konstanta DATA / DARI_REKENING_ID / KE_REKENING_ID di bawah.
 *   5. Pilih fungsi `migrasiMutasiPettyCash` lalu klik Run.
 *      Pertama kali akan minta authorize akses Spreadsheet — terima.
 *   6. Cek log via View → Logs (atau Ctrl+Enter).
 *
 * Apa yang dilakukan:
 *   - Buka spreadsheet SKM by ID.
 *   - Cari ID kategori "Mutasi Internal" (jenis MUTASI) di sheet `kategori`.
 *     Bila belum ada, auto-create.
 *   - Per item: skip jika sudah ada baris mutasi dengan tanggal+jumlah sama.
 *     Bila baru, generate `mutasi_ref` (MUT-YYYYMMDD-NNNN) dan siapkan 2 baris
 *     (KELUAR dari Bank, MASUK ke Kas Tunai).
 *   - Tulis semua baris baru sekaligus dengan satu setValues() (batch).
 *
 * Locale: skrip ini tidak menulis CSV, jadi separator tidak relevan untuk
 * sheet. Tanggal disimpan sebagai string ISO (YYYY-MM-DD) dan jumlah sebagai
 * number, konsisten dengan konvensi SKM (locale id-ID untuk display).
 */

// ====== KONFIGURASI ======
var SPREADSHEET_ID    = '1i3xwOKVBMq72DjjIr8zznGl5LQbLFT2PHjBxYllnnIE';
var DARI_REKENING_ID  = 'REK-20260101-0001'; // Bank
var KE_REKENING_ID    = 'REK-20260101-0002'; // Kas Tunai
var CREATED_BY        = 'Migrasi';

// Data entry — copy-paste dari scripts/migrasi-mutasi-data.json bila perlu update
var DATA = [
  { tanggal: '2025-08-23', jumlah: 1000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-08-31', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-09-07', jumlah: 1000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-09-13', jumlah: 3000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-09-21', jumlah: 3000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-09-26', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-10-05', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-10-12', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-10-19', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-10-25', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-11-02', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-11-09', jumlah: 1000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-11-16', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-11-28', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-12-08', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-12-14', jumlah: 3000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-12-19', jumlah: 3409000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2025-12-27', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-01-04', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-01-09', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-01-18', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-01-24', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-02-02', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-02-06', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-02-12', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-02-19', jumlah: 3000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-02-26', jumlah: 3000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-03-07', jumlah: 3000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-03-21', jumlah: 2000000, deskripsi: 'Tambah petty cash' },
  { tanggal: '2026-03-28', jumlah: 3000000, deskripsi: 'Tambah petty cash' }
];

// ====== HEADERS (urutan kolom harus sama persis dgn sheet) ======
var TRX_HEADERS = [
  'id','tanggal','jenis','kategori_id','deskripsi','jumlah',
  'rekening_id','bukti_url','status','void_reason','void_date',
  'koreksi_dari_id','created_by','created_at','updated_at','mutasi_ref'
];
var KAT_HEADERS = ['id','nama','jenis','deskripsi','is_active','created_at'];

function pad_(n, w) {
  var s = String(n);
  while (s.length < (w || 4)) s = '0' + s;
  return s;
}

function nowISO_() {
  return new Date().toISOString();
}

function todayStamp_() {
  var d = new Date();
  return d.getFullYear() + pad_(d.getMonth() + 1, 2) + pad_(d.getDate(), 2);
}

function migrasiMutasiPettyCash() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var katSheet = ss.getSheetByName('kategori');
  var trxSheet = ss.getSheetByName('transaksi');
  if (!katSheet || !trxSheet) {
    throw new Error('Sheet `kategori` atau `transaksi` tidak ditemukan.');
  }

  // ----- Cari/buat kategori "Mutasi Internal" -----
  var katValues = katSheet.getDataRange().getValues();
  var mutasiKatId = '';
  for (var i = 1; i < katValues.length; i++) {
    var row = katValues[i];
    if (String(row[2]) === 'MUTASI' && String(row[1]) === 'Mutasi Internal') {
      mutasiKatId = String(row[0]);
      break;
    }
  }
  if (!mutasiKatId) {
    var katStamp = todayStamp_();
    var katPrefix = 'KAT-' + katStamp + '-';
    var maxKat = 0;
    for (var k = 1; k < katValues.length; k++) {
      var kid = String(katValues[k][0] || '');
      if (kid.indexOf(katPrefix) === 0) {
        var n = parseInt(kid.substring(katPrefix.length), 10);
        if (n > maxKat) maxKat = n;
      }
    }
    mutasiKatId = katPrefix + pad_(maxKat + 1, 4);
    katSheet.appendRow([
      mutasiKatId, 'Mutasi Internal', 'MUTASI',
      'Pemindahan dana antar rekening', 'TRUE', nowISO_()
    ]);
    Logger.log('Kategori dibuat: ' + mutasiKatId);
  } else {
    Logger.log('Kategori ditemukan: ' + mutasiKatId);
  }

  // ----- Baca transaksi existing -----
  var trxRange = trxSheet.getDataRange().getValues();
  var refIdx = TRX_HEADERS.indexOf('mutasi_ref'); // 15
  var existing = {};
  var todayPrefix = 'MUT-' + todayStamp_() + '-';
  var refCounter = 0;
  var trxPrefix = 'TRX-' + todayStamp_() + '-';
  var trxCounter = 0;

  for (var r = 1; r < trxRange.length; r++) {
    var row = trxRange[r];
    var ref = String(row[refIdx] || '');
    var katId = String(row[3] || '');
    if (ref && katId === mutasiKatId) {
      existing[String(row[1]) + '|' + String(row[5])] = true;
    }
    if (ref.indexOf(todayPrefix) === 0) {
      var rn = parseInt(ref.substring(todayPrefix.length), 10);
      if (rn > refCounter) refCounter = rn;
    }
    var id0 = String(row[0] || '');
    if (id0.indexOf(trxPrefix) === 0) {
      var tn = parseInt(id0.substring(trxPrefix.length), 10);
      if (tn > trxCounter) trxCounter = tn;
    }
  }

  // ----- Bangun baris baru -----
  var rowsToAppend = [];
  var skipped = 0;
  var created = [];
  var now = nowISO_();

  for (var e = 0; e < DATA.length; e++) {
    var entry = DATA[e];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.tanggal) || !(entry.jumlah > 0)) {
      Logger.log('Skip invalid: ' + JSON.stringify(entry));
      continue;
    }
    var key = entry.tanggal + '|' + entry.jumlah;
    if (existing[key]) {
      skipped++;
      continue;
    }
    refCounter++;
    var mutasiRef = todayPrefix + pad_(refCounter, 4);
    trxCounter++;
    var idOut = trxPrefix + pad_(trxCounter, 4);
    trxCounter++;
    var idIn = trxPrefix + pad_(trxCounter, 4);
    var desc = entry.deskripsi || 'Tambah petty cash';

    rowsToAppend.push([
      idOut, entry.tanggal, 'KELUAR', mutasiKatId, desc, entry.jumlah,
      DARI_REKENING_ID, '', 'AKTIF', '', '', '',
      CREATED_BY, now, now, mutasiRef
    ]);
    rowsToAppend.push([
      idIn, entry.tanggal, 'MASUK', mutasiKatId, desc, entry.jumlah,
      KE_REKENING_ID, '', 'AKTIF', '', '', '',
      CREATED_BY, now, now, mutasiRef
    ]);

    existing[key] = true;
    created.push(entry.tanggal + ' Rp' + entry.jumlah + ' ' + mutasiRef);
  }

  Logger.log('Total input  : ' + DATA.length);
  Logger.log('Akan dibuat  : ' + (rowsToAppend.length / 2) + ' mutasi (' + rowsToAppend.length + ' baris)');
  Logger.log('Skip duplikat: ' + skipped);

  if (rowsToAppend.length === 0) {
    Logger.log('Tidak ada baris baru. Selesai.');
    return;
  }

  // ----- Batch setValues di bawah baris terakhir -----
  var startRow = trxSheet.getLastRow() + 1;
  trxSheet
    .getRange(startRow, 1, rowsToAppend.length, TRX_HEADERS.length)
    .setValues(rowsToAppend);

  for (var c = 0; c < created.length; c++) Logger.log(' + ' + created[c]);
  Logger.log('Selesai. ' + rowsToAppend.length + ' baris ditulis ke sheet transaksi.');
}
