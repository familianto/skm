import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { formatRupiah } from '@/lib/utils';
import type { BuiltExportTabel, ColumnDef } from './export-tabel';

/**
 * Renderer bentuk **Tabel** (F8 Milestone E) — Excel (`exceljs`) & PDF
 * (`jspdf` + `jspdf-autotable`). Server-only (biner); konsumsi `BuiltExportTabel`
 * dari mesin pur `export-tabel.ts`. Lib dipilih karena **sudah dipakai** modul
 * export SKM-core (`/api/export/{excel,pdf}`) dan ringan di Vercel serverless
 * (tanpa headless Chrome).
 *
 * Konvensi: header hijau `#0F5132`, `no_hp`/kode sebagai **teks** (anti artefak
 * float Excel), zebra per kelompok hewan, title block (masjid + edisi + tanggal),
 * freeze header (Excel).
 */

export interface ExportDocMeta {
  /** Judul dokumen, mis. "Tim Penyembelihan". */
  title: string;
  /** Nama edisi, mis. "1447 H". */
  edisiNama: string;
  /** Nama masjid (dari sesi; fallback di route). */
  masjidName: string;
  generatedAt: Date;
}

const HEADER_ARGB = 'FF0F5132';
const HEADER_RGB: [number, number, number] = [15, 81, 50];
const ZEBRA_ARGB = 'FFF1F5F3';
const ZEBRA_RGB: [number, number, number] = [241, 245, 243];

function fmtTanggalEkspor(d: Date): string {
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Parity zebra per kelompok hewan: bertukar tiap groupKey berganti. */
function zebraParity(rows: BuiltExportTabel['rows']): boolean[] {
  const out: boolean[] = [];
  let cur = false;
  let prev: string | null = null;
  for (const r of rows) {
    if (prev !== null && r.groupKey !== prev) cur = !cur;
    out.push(cur);
    prev = r.groupKey;
  }
  return out;
}

function cellToText(col: ColumnDef, value: string | number): string {
  if (value === '' || value == null) return '';
  if (col.kind === 'currency') return formatRupiah(Number(value));
  return String(value);
}

function columnWidth(col: ColumnDef): number {
  switch (col.id) {
    case 'no_baris':
    case 'slot':
    case 'no_urut_pemotongan':
    case 'kelas':
      return 6;
    case 'jenis':
    case 'tipe_qurban':
    case 'tipe_pembelian':
    case 'rt':
    case 'metode':
    case 'status_pendaftaran':
      return 12;
    case 'alamat':
    case 'keterangan_bagian':
    case 'permintaan_tambahan':
    case 'muqorib_nama':
    case 'atas_nama':
      return 28;
    case 'harga_disepakati':
    case 'biaya_beli':
    case 'nominal':
    case 'no_hp':
    case 'kode_bayar':
    case 'kode_hewan':
    case 'kode_peserta':
    case 'kode_muqorib':
    case 'label_hewan':
    case 'tanggal_lunas':
      return 16;
    default:
      return 18;
  }
}

// ── Excel ────────────────────────────────────────────────────────────────────

export async function renderTabelExcel(
  built: BuiltExportTabel,
  meta: ExportDocMeta
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SKM';
  wb.created = meta.generatedAt;
  const ws = wb.addWorksheet('Tabel');

  const nCols = Math.max(1, built.columns.length);
  const lastColLetter = ws.getColumn(nCols).letter;

  // Title block.
  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getCell('A1').value = meta.masjidName;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.getCell('A2').value = meta.title;
  ws.getCell('A2').font = { bold: true, size: 11 };
  ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getCell('A3').value = `Qurban ${meta.edisiNama} · Diekspor ${fmtTanggalEkspor(meta.generatedAt)}`;
  ws.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  ws.addRow([]);

  // Header.
  const headerRow = ws.addRow(built.columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });
  const headerRowNumber = headerRow.number;

  // Data rows.
  const parity = zebraParity(built.rows);
  built.rows.forEach((r, idx) => {
    const values = built.columns.map((c) => {
      const v = r.cells[c.id];
      if (v === '' || v == null) return '';
      // currency/number → numeric; teks → string (anti float coercion).
      if (c.kind === 'currency' || c.kind === 'number') return Number(v) || 0;
      return String(v);
    });
    const row = ws.addRow(values);
    built.columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      if (c.kind === 'currency') cell.numFmt = '#,##0';
      else if (c.kind === 'text') cell.numFmt = '@'; // paksa teks (no_hp, kode)
      if (parity[idx]) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_ARGB } };
      }
    });
  });

  // Column widths + freeze header.
  built.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = columnWidth(c);
  });
  ws.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── PDF (A4 portrait) ────────────────────────────────────────────────────────

export function renderTabelPdf(built: BuiltExportTabel, meta: ExportDocMeta): ArrayBuffer {
  // Lebih banyak kolom → landscape agar muat.
  const orientation = built.columns.length > 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title block.
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(meta.masjidName, pageWidth / 2, 14, { align: 'center' });
  doc.setFontSize(11);
  doc.text(meta.title, pageWidth / 2, 21, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Qurban ${meta.edisiNama} · Diekspor ${fmtTanggalEkspor(meta.generatedAt)}`,
    pageWidth / 2,
    27,
    { align: 'center' }
  );

  const parity = zebraParity(built.rows);
  const head = [built.columns.map((c) => c.label)];
  const body = built.rows.map((r) => built.columns.map((c) => cellToText(c, r.cells[c.id])));
  const rightAlignCols = new Set<number>();
  built.columns.forEach((c, i) => {
    if (c.kind === 'currency') rightAlignCols.add(i);
  });

  autoTable(doc, {
    startY: 32,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: HEADER_RGB, textColor: 255, fontStyle: 'bold' },
    margin: { left: 10, right: 10 },
    columnStyles: Object.fromEntries(
      [...rightAlignCols].map((i) => [i, { halign: 'right' as const }])
    ),
    didParseCell: (data) => {
      if (data.section === 'body' && parity[data.row.index]) {
        data.cell.styles.fillColor = ZEBRA_RGB;
      }
    },
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Halaman ${data.pageNumber} / ${page}`,
        pageWidth - 10,
        doc.internal.pageSize.getHeight() - 6,
        { align: 'right' }
      );
      doc.setTextColor(0);
    },
  });

  return doc.output('arraybuffer');
}
