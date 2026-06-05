import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { formatRupiah } from '@/lib/utils';
import type { SummaryDoc, SummaryCell } from './export-summary';
import type { ExportDocMeta } from './export-render-tabel';

/**
 * Renderer preset **ringkasan** (F8 Milestone E) — Excel & PDF dari `SummaryDoc`
 * (netral-renderer). Reuse lib yang sama dengan renderer Tabel.
 */

const HEADER_ARGB = 'FF0F5132';
const HEADER_RGB: [number, number, number] = [15, 81, 50];

function fmtTanggalEkspor(d: Date): string {
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cellText(c: SummaryCell): string {
  if (c.v === '' || c.v == null) return '';
  if (c.currency) return formatRupiah(Number(c.v));
  return String(c.v);
}

// ── Excel ────────────────────────────────────────────────────────────────────

export async function renderSummaryExcel(doc: SummaryDoc, meta: ExportDocMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SKM';
  wb.created = meta.generatedAt;
  const ws = wb.addWorksheet('Ringkasan');

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = meta.masjidName;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = meta.title;
  ws.getCell('A2').font = { bold: true, size: 11 };
  ws.mergeCells('A3:F3');
  ws.getCell('A3').value = `Qurban ${meta.edisiNama} · Diekspor ${fmtTanggalEkspor(meta.generatedAt)}`;
  ws.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  for (const section of doc.sections) {
    ws.addRow([]);
    const titleRow = ws.addRow([section.title]);
    titleRow.getCell(1).font = { bold: true, size: 12 };

    if (section.header) {
      const hr = ws.addRow(section.header);
      hr.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      });
    }
    for (const row of section.rows) {
      const xrow = ws.addRow(row.map((c) => (c.currency ? Number(c.v) || 0 : c.v)));
      row.forEach((c, ci) => {
        const cell = xrow.getCell(ci + 1);
        if (c.currency) cell.numFmt = '#,##0';
        if (c.bold) cell.font = { bold: true };
      });
    }
  }

  ws.getColumn(1).width = 34;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 16;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── PDF (A4 portrait) ────────────────────────────────────────────────────────

export function renderSummaryPdf(doc: SummaryDoc, meta: ExportDocMeta): ArrayBuffer {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(meta.masjidName, pageWidth / 2, 16, { align: 'center' });
  pdf.setFontSize(11);
  pdf.text(meta.title, pageWidth / 2, 23, { align: 'center' });
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `Qurban ${meta.edisiNama} · Diekspor ${fmtTanggalEkspor(meta.generatedAt)}`,
    pageWidth / 2,
    29,
    { align: 'center' }
  );

  let y = 36;
  for (const section of doc.sections) {
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(section.title, 14, y);
    y += 4;

    const body = section.rows.map((row) => row.map(cellText));
    const currencyCols = new Set<number>();
    if (section.rows[0]) {
      section.rows[0].forEach((c, i) => {
        if (c.currency) currencyCols.add(i);
      });
    }

    autoTable(pdf, {
      startY: y,
      head: section.header ? [section.header] : undefined,
      body,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.5 },
      headStyles: { fillColor: HEADER_RGB, textColor: 255, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(
        [...currencyCols].map((i) => [i, { halign: 'right' as const }])
      ),
      margin: { left: 14, right: 14 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  return pdf.output('arraybuffer');
}
