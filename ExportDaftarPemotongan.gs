/**
 * =============================================================
 * SCRIPT: Export Daftar No. Urut Pemotongan Hewan Qurban
 * Qurban 1447H — Masjid Al Jabar Jatinegara Baru
 * =============================================================
 *
 * VERSI: 1.0 (2026-05-18)
 *
 * FUNGSI:
 * Export sheet `daftar_hewan` (kolom L `no_urut_pemotongan`) +
 * sheet `peserta` → file PDF dan XLSX dengan card layout
 * Opsi B (sidebar besar). 3x3 grid per halaman A4 portrait.
 *
 * CARA PAKAI:
 * 1. Buat file baru ExportDaftarPemotongan.gs di Apps Script editor
 * 2. Paste isi script ini, save (Cmd+S)
 * 3. Update Kode.gs — tambah 1 line menu (lihat README/handoff)
 * 4. Reload GSheet (refresh tab) → menu Qurban refresh
 * 5. Klik menu Qurban → 🥩 Export Daftar Pemotongan
 * 6. Modal muncul dengan tombol Download PDF & Download XLSX
 */

// ============================================================
// KONFIGURASI
// ============================================================
var EXPORT_PEMOTONGAN_CONFIG = {
  SHEET_HEWAN: 'daftar_hewan',
  SHEET_PESERTA: 'peserta',

  // daftar_hewan columns (1-indexed)
  COL_ID_HEWAN: 1,        // A
  COL_JENIS: 2,           // B
  COL_TIPE: 3,            // C
  COL_KUOTA: 4,           // D
  COL_TERISI: 5,          // E
  COL_STATUS: 7,          // G
  COL_NO_URUT: 12,        // L

  // peserta columns
  COL_PESERTA_NAMA: 2,     // B
  COL_PESERTA_ID_HEWAN: 5, // E
  COL_PESERTA_KODE: 6,     // F (kode_muqorib)

  // Layout
  CARDS_PER_PAGE: 9,
  CARDS_PER_ROW: 3,
  SLOTS_PER_CARD: 7,       // jumlah baris nama muqorib per card (sapi kuota=7)

  // Row sizing (px) — di-tune untuk fit 3 card rows + header = 1 halaman A4
  // Page A4 portrait @ margin 0.4": tinggi usable ≈ 1175px (108 DPI export)
  // Page header (rows 1-3): 40 + 30 + 12 = 82
  // Spacer atas (row 4): 10
  // Card row group (8 rows + 1 spacer): 28 + 7×22 + 12 = 194
  // 3 card rows + spacers: 3×194 = 582
  // Subtotal page 1: 82 + 10 + 582 = 674. Slack ≈ 500px → page-break-pad row.
  ROW_H_LOGO: 40,
  ROW_H_TITLE: 30,
  ROW_H_GOLD_BAR: 12,
  ROW_H_TOP_SPACER: 10,
  ROW_H_CARD_HEADER: 28,
  ROW_H_CARD_NAME: 22,
  ROW_H_INTER_CARD_SPACER: 12,
  ROW_H_PAGE_BREAK_PAD: 500,    // tall blank row → forces auto page break

  // Column widths (px)
  COL_W_SIDEBAR: 50,
  COL_W_MAIN: 240,

  // Colors
  PRIMARY_GREEN: '#1a5f3a',
  GOLD_ACCENT: '#c9a635',
  WHITE: '#ffffff',
  BLACK_TEXT: '#1a1a1a',
  SLOT_KOSONG_COLOR: '#999999',

  // Text
  TITLE_LINE_1: 'NAMA MUQORIB & NO. URUT PEMOTONGAN HEWAN QURBAN 1447 H',
  TITLE_LINE_2: 'MASJID AL-JABAR',
  LOGO_TEXT: 'MAJ',
  SLOT_KOSONG_TEXT: '(slot kosong)',
  URUT_LABEL: 'URUT'
};

// ============================================================
// MAIN: EXPORT DAFTAR PEMOTONGAN
// ============================================================
function exportDaftarPemotongan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  // 1. Read & filter daftar_hewan
  var hewanList = readHewanWithUrut_(ss);
  if (hewanList.length === 0) {
    if (ui) ui.alert('ℹ️ Info',
      'Belum ada hewan dengan no_urut_pemotongan terisi.',
      ui.ButtonSet.OK);
    return;
  }

  // 2. Read peserta → muqorib map
  var muqoribMap = buildMuqoribMap_(ss);

  // 3. Build cardsData: per hewan, list nama (pad dengan slot kosong)
  var cardsData = hewanList.map(function(h) {
    var muqorib = muqoribMap[h.id_hewan] || [];
    var slots = EXPORT_PEMOTONGAN_CONFIG.SLOTS_PER_CARD;
    var nama = [];
    for (var i = 0; i < slots; i++) {
      nama.push(muqorib[i] || EXPORT_PEMOTONGAN_CONFIG.SLOT_KOSONG_TEXT);
    }
    return { hewan: h, nama: nama };
  });

  // 4. Build temp Sheets
  var tempName = 'TEMP_Pemotongan_' + new Date().getTime();
  var tempSS = SpreadsheetApp.create(tempName);

  try {
    var tempWS = tempSS.getActiveSheet();
    tempWS.setName('Daftar Pemotongan');

    buildPemotonganLayout_(tempWS, cardsData);
    SpreadsheetApp.flush();

    // 5. Export PDF + XLSX
    var pdfBase64 = exportTempAs_(tempSS.getId(), 'pdf');
    var xlsxBase64 = exportTempAs_(tempSS.getId(), 'xlsx');

    // 6. Filename
    var dateStr = Utilities.formatDate(new Date(),
      Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    var filenameBase = 'Daftar_Pemotongan_Qurban_1447H_' + dateStr;

    // 7. Modal
    if (ui) {
      showDownloadModalPemotongan_(pdfBase64, xlsxBase64,
        filenameBase, cardsData.length);
    } else {
      Logger.log('Generated PDF + XLSX. Filename: ' + filenameBase);
      Logger.log('Total cards: ' + cardsData.length);
    }
  } catch (e) {
    if (ui) ui.alert('❌ Error',
      'Gagal generate export:\n' + e.message, ui.ButtonSet.OK);
    Logger.log('Error: ' + e.message + '\n' + e.stack);
  } finally {
    try {
      DriveApp.getFileById(tempSS.getId()).setTrashed(true);
    } catch (cleanupErr) {}
  }
}

// ============================================================
// READ: daftar_hewan dengan no_urut terisi
// ============================================================
function readHewanWithUrut_(ss) {
  var CFG = EXPORT_PEMOTONGAN_CONFIG;
  var ws = ss.getSheetByName(CFG.SHEET_HEWAN);
  if (!ws) throw new Error('Sheet ' + CFG.SHEET_HEWAN + ' tidak ditemukan');

  var data = ws.getDataRange().getValues();
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var noUrutRaw = data[i][CFG.COL_NO_URUT - 1];
    if (noUrutRaw === '' || noUrutRaw === null || noUrutRaw === undefined) continue;
    var noUrut = parseInt(noUrutRaw, 10);
    if (isNaN(noUrut)) continue;

    var status = String(data[i][CFG.COL_STATUS - 1] || '').trim().toUpperCase();
    if (status === 'KOSONG') continue;  // skip hewan tanpa peserta sama sekali

    result.push({
      id_hewan: String(data[i][CFG.COL_ID_HEWAN - 1] || '').trim(),
      jenis: String(data[i][CFG.COL_JENIS - 1] || '').trim(),
      tipe: String(data[i][CFG.COL_TIPE - 1] || '').trim(),
      kuota: parseInt(data[i][CFG.COL_KUOTA - 1], 10) || 7,
      status: status,
      no_urut: noUrut
    });
  }

  result.sort(function(a, b) { return a.no_urut - b.no_urut; });
  return result;
}

// ============================================================
// READ: peserta → muqorib map per id_hewan
// ============================================================
function buildMuqoribMap_(ss) {
  var CFG = EXPORT_PEMOTONGAN_CONFIG;
  var ws = ss.getSheetByName(CFG.SHEET_PESERTA);
  if (!ws) throw new Error('Sheet ' + CFG.SHEET_PESERTA + ' tidak ditemukan');

  var data = ws.getDataRange().getValues();
  var map = {};

  for (var i = 1; i < data.length; i++) {
    var nama = String(data[i][CFG.COL_PESERTA_NAMA - 1] || '').trim();
    var idHewan = String(data[i][CFG.COL_PESERTA_ID_HEWAN - 1] || '').trim();
    var kode = String(data[i][CFG.COL_PESERTA_KODE - 1] || '').trim();
    if (!nama || !idHewan) continue;

    if (!map[idHewan]) map[idHewan] = [];
    map[idHewan].push({ nama: nama, kode: kode, rowOrder: i });
  }

  // Sort tiap group by kode_muqorib (fallback ke urutan row)
  for (var k in map) {
    map[k].sort(function(a, b) {
      if (a.kode && b.kode) {
        var cmp = a.kode.localeCompare(b.kode);
        if (cmp !== 0) return cmp;
      } else if (a.kode && !b.kode) {
        return -1;
      } else if (!a.kode && b.kode) {
        return 1;
      }
      return a.rowOrder - b.rowOrder;
    });
    map[k] = map[k].map(function(x) { return x.nama; });
  }

  return map;
}

// ============================================================
// BUILD LAYOUT
// ============================================================
function buildPemotonganLayout_(ws, cardsData) {
  var CFG = EXPORT_PEMOTONGAN_CONFIG;

  // ---------- Column widths ----------
  // 6 kolom: [sidebar1, main1, sidebar2, main2, sidebar3, main3]
  for (var c = 1; c <= 6; c++) {
    var w = (c % 2 === 1) ? CFG.COL_W_SIDEBAR : CFG.COL_W_MAIN;
    ws.setColumnWidth(c, w);
  }

  // ---------- Page header (rows 1-3) ----------
  ws.setRowHeight(1, CFG.ROW_H_LOGO);
  ws.setRowHeight(2, CFG.ROW_H_TITLE);
  ws.setRowHeight(3, CFG.ROW_H_GOLD_BAR);

  // Logo box: merge A1:A2 (kolom sidebar pertama saja, lebar ~50px) — height 70px
  var logoRange = ws.getRange('A1:A2');
  logoRange.merge()
    .setValue(CFG.LOGO_TEXT)
    .setBackground(CFG.PRIMARY_GREEN)
    .setFontColor(CFG.WHITE)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold')
    .setFontSize(16);

  // Title line 1 (B1:F1)
  ws.getRange('B1:F1').merge()
    .setValue(CFG.TITLE_LINE_1)
    .setFontWeight('bold')
    .setFontSize(11)
    .setFontColor(CFG.BLACK_TEXT)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('bottom')
    .setBackground(CFG.WHITE);

  // Title line 2 (B2:F2) — subtitle gold
  ws.getRange('B2:F2').merge()
    .setValue(CFG.TITLE_LINE_2)
    .setFontWeight('bold')
    .setFontSize(9)
    .setFontColor(CFG.GOLD_ACCENT)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('top')
    .setBackground(CFG.WHITE);

  // Gold bar row 3 — bottom border thick gold
  ws.getRange('A3:F3').merge()
    .setBackground(CFG.WHITE)
    .setBorder(null, null, true, null, null, null,
      CFG.GOLD_ACCENT, SpreadsheetApp.BorderStyle.SOLID_THICK);

  // Freeze first 3 rows agar header repeat di tiap halaman PDF
  ws.setFrozenRows(3);

  // ---------- Cards ----------
  var totalCards = cardsData.length;
  var totalRowGroups = Math.ceil(totalCards / CFG.CARDS_PER_ROW);

  // Top spacer (row 4)
  ws.setRowHeight(4, CFG.ROW_H_TOP_SPACER);
  var startRow = 5;  // first card top row

  var rowsPerCard = 1 + CFG.SLOTS_PER_CARD;  // 1 header + 7 names = 8

  for (var idx = 0; idx < totalCards; idx++) {
    var card = cardsData[idx];
    var posInRow = idx % CFG.CARDS_PER_ROW;        // 0,1,2
    var rowGroup = Math.floor(idx / CFG.CARDS_PER_ROW);
    var cardTopRow = startRow + rowGroup * (rowsPerCard + 1);  // +1 spacer row
    var cardLeftCol = posInRow * 2 + 1;            // 1, 3, 5

    // Set row heights pertama kali per row group (saat posInRow == 0)
    if (posInRow === 0) {
      ws.setRowHeight(cardTopRow, CFG.ROW_H_CARD_HEADER);
      for (var rr = 1; rr <= CFG.SLOTS_PER_CARD; rr++) {
        ws.setRowHeight(cardTopRow + rr, CFG.ROW_H_CARD_NAME);
      }
      // Spacer setelah card row group
      var spacerRow = cardTopRow + rowsPerCard;
      var isPageEndGroup = ((rowGroup + 1) % 3 === 0)
        && (rowGroup + 1 < totalRowGroups);
      ws.setRowHeight(spacerRow,
        isPageEndGroup ? CFG.ROW_H_PAGE_BREAK_PAD : CFG.ROW_H_INTER_CARD_SPACER);
    }

    drawSingleCard_(ws, cardTopRow, cardLeftCol, card);
  }
}

// ============================================================
// DRAW: satu card
// ============================================================
function drawSingleCard_(ws, topRow, leftCol, card) {
  var CFG = EXPORT_PEMOTONGAN_CONFIG;
  var hewan = card.hewan;
  var nama = card.nama;

  var sidebarCol = leftCol;
  var mainCol = leftCol + 1;
  var rowsPerCard = 1 + CFG.SLOTS_PER_CARD;  // 8

  // ---------- Sidebar (merged vertical, kolom sidebar) ----------
  var sidebarRange = ws.getRange(topRow, sidebarCol, rowsPerCard, 1);
  sidebarRange.merge()
    .setBackground(CFG.PRIMARY_GREEN)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  // RichText: "URUT" kecil + nomor besar
  var urutText = CFG.URUT_LABEL;             // "URUT" length=4
  var numStr = String(hewan.no_urut);
  var fullText = urutText + '\n' + numStr;

  var styleSmall = SpreadsheetApp.newTextStyle()
    .setForegroundColor(CFG.WHITE)
    .setFontSize(9)
    .setBold(true)
    .build();
  var styleBig = SpreadsheetApp.newTextStyle()
    .setForegroundColor(CFG.WHITE)
    .setFontSize(24)
    .setBold(true)
    .build();

  var rich = SpreadsheetApp.newRichTextValue()
    .setText(fullText)
    .setTextStyle(0, urutText.length, styleSmall)
    .setTextStyle(urutText.length + 1, fullText.length, styleBig)
    .build();
  sidebarRange.setRichTextValue(rich);

  // ---------- Main: header (top row, kolom main) ----------
  var headerLabel = (hewan.jenis || '').toUpperCase() + ' – ' + hewan.id_hewan;
  var headerCell = ws.getRange(topRow, mainCol);
  headerCell.setValue(headerLabel)
    .setFontWeight('bold')
    .setFontColor(CFG.PRIMARY_GREEN)
    .setFontSize(11)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setBackground(CFG.WHITE);

  // Bottom border tipis hijau di bawah header label
  headerCell.setBorder(null, null, true, null, null, null,
    CFG.PRIMARY_GREEN, SpreadsheetApp.BorderStyle.SOLID);

  // ---------- Main: 7 baris nama muqorib ----------
  for (var i = 0; i < CFG.SLOTS_PER_CARD; i++) {
    var name = nama[i] != null ? nama[i] : CFG.SLOT_KOSONG_TEXT;
    var isKosong = (name === CFG.SLOT_KOSONG_TEXT);
    var cell = ws.getRange(topRow + 1 + i, mainCol);
    cell.setValue((i + 1) + '. ' + name)
      .setFontSize(10)
      .setHorizontalAlignment('left')
      .setVerticalAlignment('middle')
      .setBackground(CFG.WHITE);

    if (isKosong) {
      cell.setFontColor(CFG.SLOT_KOSONG_COLOR)
        .setFontStyle('italic')
        .setFontWeight('normal');
    } else {
      cell.setFontColor(CFG.BLACK_TEXT)
        .setFontStyle('normal')
        .setFontWeight('normal');
    }
  }

  // ---------- Outer border thick hijau (seluruh card 2 cols × 8 rows) ----------
  ws.getRange(topRow, sidebarCol, rowsPerCard, 2).setBorder(
    true, true, true, true, false, false,
    CFG.PRIMARY_GREEN, SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
}

// ============================================================
// EXPORT: temp Sheets → PDF atau XLSX (base64 string)
// ============================================================
function exportTempAs_(spreadsheetId, format) {
  var params = 'format=' + format;
  if (format === 'pdf') {
    params += '&size=A4&portrait=true&fitw=true' +
              '&gridlines=false&printtitle=false&pagenumbers=false' +
              '&sheetnames=false&fzr=true' +
              '&top_margin=0.4&bottom_margin=0.4' +
              '&left_margin=0.4&right_margin=0.4';
  }
  var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId +
            '/export?' + params;
  var token = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Export ' + format + ' gagal: HTTP ' +
      response.getResponseCode());
  }
  return Utilities.base64Encode(response.getBlob().getBytes());
}

// ============================================================
// MODAL: 2 download buttons (PDF + XLSX)
// ============================================================
function showDownloadModalPemotongan_(pdfBase64, xlsxBase64, filenameBase, totalCards) {
  var CFG = EXPORT_PEMOTONGAN_CONFIG;
  var ui = SpreadsheetApp.getUi();
  var totalPages = Math.ceil(totalCards / CFG.CARDS_PER_PAGE);

  var html = HtmlService.createHtmlOutput(
    '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; ' +
    'font-size: 13px; padding: 16px; line-height: 1.5;">' +
    '<h3 style="color: ' + CFG.PRIMARY_GREEN + '; margin: 0 0 12px 0; font-size: 16px;">' +
    '✅ File Siap Diunduh</h3>' +
    '<p style="font-size: 12px; color: #666; margin: 0 0 16px;">' +
    'Total: <b>' + totalCards + ' hewan</b> dalam <b>' + totalPages + ' halaman</b>' +
    '</p>' +
    '<div style="display: flex; gap: 12px; margin: 20px 0;">' +
    // PDF
    '<a href="data:application/pdf;base64,' + pdfBase64 + '" ' +
       'download="' + escapeHtmlPemotongan_(filenameBase) + '.pdf" ' +
       'style="flex: 1; display: block; background: ' + CFG.PRIMARY_GREEN + '; ' +
              'color: white; padding: 14px; text-decoration: none; ' +
              'border-radius: 8px; font-weight: bold; font-size: 13px; ' +
              'text-align: center;">' +
    '📄 Download PDF</a>' +
    // XLSX
    '<a href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' +
       xlsxBase64 + '" ' +
       'download="' + escapeHtmlPemotongan_(filenameBase) + '.xlsx" ' +
       'style="flex: 1; display: block; background: ' + CFG.GOLD_ACCENT + '; ' +
              'color: white; padding: 14px; text-decoration: none; ' +
              'border-radius: 8px; font-weight: bold; font-size: 13px; ' +
              'text-align: center;">' +
    '📊 Download XLSX</a>' +
    '</div>' +
    '<p style="font-size: 11px; color: #999; margin: 12px 0 0 0;">' +
    'Tip: PDF untuk poster (touch-up di Canva). XLSX untuk dokumen kerja panitia.' +
    '</p>' +
    '</div>'
  ).setWidth(440).setHeight(280);

  ui.showModalDialog(html, 'Export Daftar Pemotongan');
}

function escapeHtmlPemotongan_(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
