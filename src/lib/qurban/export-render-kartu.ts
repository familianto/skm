import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';

import type { Kartu, LabelItem } from './export-kartu';
import type { ExportDocMeta } from './export-render-tabel';

/**
 * Renderer **Kartu Pemotongan** & **Label Bagikan** (F8 Milestone G).
 *
 * PDF via **jspdf koordinat-absolut** (rect/line/text dalam mm) — BUKAN tabel,
 * BUKAN Puppeteer/Chromium (tak jalan di Vercel serverless). Grid digambar
 * manual + page-break + header berulang. Karakter ASCII aman (pelajaran F:
 * glyph non-ASCII rusak di font helvetica default jspdf).
 *
 * Excel = fallback datar (1 baris per slot / per label).
 */

const HEADER_ARGB = 'FF0F5132';
const GRID_GRAY = 180;

function fmtTanggalEkspor(d: Date): string {
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Potong teks agar muat lebar `maxW` mm pada font aktif (tambah ellipsis). */
function fit(doc: jsPDF, text: string, maxW: number): string {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxW) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(s + '..') > maxW) s = s.slice(0, -1);
  return s + '..';
}

interface GridSpec {
  cols: number;
  rows: number;
  marginX: number;
  marginTop: number;
  gutter: number;
  cellH: number;
}

/** Header halaman berulang. Mengembalikan Y mulai grid. */
function drawPageHeader(doc: jsPDF, meta: ExportDocMeta, pageWidth: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(meta.masjidName, pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(11);
  doc.text(meta.title, pageWidth / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(
    `Qurban ${meta.edisiNama} - Diunduh ${fmtTanggalEkspor(meta.generatedAt)}`,
    pageWidth / 2,
    23,
    { align: 'center' }
  );
  doc.setTextColor(0);
  return 28;
}

function drawPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const total = doc.getNumberOfPages();
  const cur = doc.getCurrentPageInfo().pageNumber;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Halaman ${cur} / ${total}`, pageWidth - 10, pageHeight - 6, { align: 'right' });
  doc.setTextColor(0);
}

// ── Kartu Pemotongan (PDF) ───────────────────────────────────────────────────

export function renderKartuPdf(kartu: Kartu[], meta: ExportDocMeta, jenis: 'SAPI' | 'KAMBING'): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Sapi: 3x3 (kartu tinggi, ≤7 nama). Kambing: 3x6 (kartu pendek, 1 nama).
  const spec: GridSpec =
    jenis === 'SAPI'
      ? { cols: 3, rows: 3, marginX: 10, marginTop: 28, gutter: 4, cellH: 84 }
      : { cols: 3, rows: 6, marginX: 10, marginTop: 28, gutter: 4, cellH: 41 };

  const usableW = pageWidth - spec.marginX * 2 - spec.gutter * (spec.cols - 1);
  const cellW = usableW / spec.cols;
  const perPage = spec.cols * spec.rows;

  if (kartu.length === 0) {
    drawPageHeader(doc, meta, pageWidth);
    doc.setFontSize(11);
    doc.text('Belum ada hewan ber-urut potong untuk dicetak.', pageWidth / 2, 60, { align: 'center' });
    drawPageFooter(doc, pageWidth, pageHeight);
    return doc.output('arraybuffer');
  }

  kartu.forEach((k, idx) => {
    const posInPage = idx % perPage;
    if (posInPage === 0) {
      if (idx > 0) doc.addPage();
      drawPageHeader(doc, meta, pageWidth);
    }
    const col = posInPage % spec.cols;
    const row = Math.floor(posInPage / spec.cols);
    const x = spec.marginX + col * (cellW + spec.gutter);
    const y = spec.marginTop + row * (spec.cellH + spec.gutter);
    drawKartu(doc, k, x, y, cellW, spec.cellH);

    // Footer setelah kartu terakhir di halaman / kartu terakhir total.
    const lastOnPage = posInPage === perPage - 1;
    const lastOverall = idx === kartu.length - 1;
    if (lastOnPage || lastOverall) drawPageFooter(doc, pageWidth, pageHeight);
  });

  return doc.output('arraybuffer');
}

function drawKartu(doc: jsPDF, k: Kartu, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(GRID_GRAY);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);

  // Sidebar kiri: "URUT" + angka besar.
  const sidebarW = 16;
  doc.line(x + sidebarW, y, x + sidebarW, y + h);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('URUT', x + sidebarW / 2, y + 6, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(h > 60 ? 26 : 18);
  doc.text(String(k.no_urut), x + sidebarW / 2, y + (h > 60 ? 18 : 14), { align: 'center' });

  // Body.
  const bx = x + sidebarW + 2.5;
  const bw = w - sidebarW - 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(fit(doc, k.label_hewan, bw), bx, y + 7);

  // Daftar slot.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(k.kapasitas > 1 ? 8.5 : 10);
  const lineH = k.kapasitas > 1 ? (h - 12) / k.kapasitas : 9;
  let ly = y + (k.kapasitas > 1 ? 13 : 16);
  for (const s of k.slots) {
    const text = `${s.slot}. ${s.nama || '-'}`;
    doc.text(fit(doc, text, bw), bx, ly);
    ly += lineH;
  }
}

// ── Label Bagikan (PDF) ──────────────────────────────────────────────────────

export function renderLabelPdf(labels: LabelItem[], meta: ExportDocMeta): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 3 kolom x 8 baris = 24 label/halaman (~63 x 31 mm).
  const cols = 3;
  const rows = 8;
  const marginX = 8;
  const marginTop = 28;
  const gutter = 3;
  const cellH = 31;
  const usableW = pageWidth - marginX * 2 - gutter * (cols - 1);
  const cellW = usableW / cols;
  const perPage = cols * rows;

  if (labels.length === 0) {
    drawPageHeader(doc, meta, pageWidth);
    doc.setFontSize(11);
    doc.text('Belum ada peserta untuk dicetak label.', pageWidth / 2, 60, { align: 'center' });
    drawPageFooter(doc, pageWidth, pageHeight);
    return doc.output('arraybuffer');
  }

  labels.forEach((lab, idx) => {
    const posInPage = idx % perPage;
    if (posInPage === 0) {
      if (idx > 0) doc.addPage();
      drawPageHeader(doc, meta, pageWidth);
    }
    const col = posInPage % cols;
    const row = Math.floor(posInPage / cols);
    const x = marginX + col * (cellW + gutter);
    const y = marginTop + row * (cellH + gutter);
    drawLabel(doc, lab, x, y, cellW, cellH);

    if (posInPage === perPage - 1 || idx === labels.length - 1) {
      drawPageFooter(doc, pageWidth, pageHeight);
    }
  });

  return doc.output('arraybuffer');
}

function drawLabel(doc: jsPDF, lab: LabelItem, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(GRID_GRAY);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
  const pad = 2.5;
  const bw = w - pad * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(fit(doc, lab.atas_nama, bw), x + pad, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(fit(doc, lab.label_hewan || '-', bw), x + pad, y + 15);

  doc.setFontSize(8);
  doc.setTextColor(90);
  const urut = lab.no_urut != null ? `Urut Potong: ${lab.no_urut}` : 'Urut Potong: -';
  doc.text(fit(doc, urut, bw), x + pad, y + 21);
  if (lab.rt) doc.text(fit(doc, `RT ${lab.rt}`, bw), x + pad, y + 26);
  doc.setTextColor(0);
}

// ── Excel fallback (datar) ───────────────────────────────────────────────────

async function flatWorkbook(meta: ExportDocMeta, header: string[], rows: (string | number)[][], widths: number[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SKM';
  wb.created = meta.generatedAt;
  const ws = wb.addWorksheet('Data');
  const n = header.length;
  const last = ws.getColumn(n).letter;

  ws.mergeCells(`A1:${last}1`);
  ws.getCell('A1').value = meta.masjidName;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').value = meta.title;
  ws.getCell('A2').font = { bold: true, size: 11 };
  ws.mergeCells(`A3:${last}3`);
  ws.getCell('A3').value = `Qurban ${meta.edisiNama} - Diunduh ${fmtTanggalEkspor(meta.generatedAt)}`;
  ws.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  ws.addRow([]);

  const hr = ws.addRow(header);
  hr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  for (const r of rows) {
    const xrow = ws.addRow(r);
    // Kolom teks (kode/nama) sebagai teks.
    xrow.eachCell((cell) => {
      if (typeof cell.value === 'string') cell.numFmt = '@';
    });
  }
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function renderKartuExcel(kartu: Kartu[], meta: ExportDocMeta): Promise<Buffer> {
  const rows: (string | number)[][] = [];
  for (const k of kartu) {
    for (const s of k.slots) {
      rows.push([k.no_urut, k.label_hewan, s.slot, s.nama || '-']);
    }
  }
  return flatWorkbook(meta, ['No. Urut', 'Label Hewan', 'Slot', 'Atas Nama'], rows, [10, 18, 8, 30]);
}

export async function renderLabelExcel(labels: LabelItem[], meta: ExportDocMeta): Promise<Buffer> {
  const rows = labels.map((l) => [l.atas_nama, l.label_hewan, l.no_urut ?? '-', l.rt || '-']);
  return flatWorkbook(meta, ['Atas Nama', 'Label Hewan', 'No. Urut', 'RT'], rows, [30, 18, 10, 10]);
}
