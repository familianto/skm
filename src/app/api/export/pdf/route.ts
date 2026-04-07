import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { Transaksi, Kategori } from '@/types';
import { getSession } from '@/lib/auth';
import { formatRupiah } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return { ...obj, jumlah: parseInt(obj.jumlah, 10) || 0 } as unknown as Transaksi;
}

function rowToKategori(row: string[]): Kategori {
  const headers = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return { ...obj, is_active: obj.is_active === 'TRUE' } as unknown as Kategori;
}

const BULAN_NAMES = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const tahunParam = searchParams.get('tahun') || new Date().getFullYear().toString();
    const isAllYears = tahunParam === 'all';
    const tahun = isAllYears ? 'all' : tahunParam;
    const bulan = searchParams.get('bulan');
    const type = searchParams.get('type') || 'ringkasan'; // ringkasan or detail
    const kategoriParam = searchParams.get('kategori');
    const kategoriIds = kategoriParam ? kategoriParam.split(',').filter(Boolean) : [];
    const rekeningId = searchParams.get('rekening') || '';

    // Fetch data
    const [transaksiRows, kategoriRows, masterRows, rekeningRows] = await sheetsService.batchGet([
      `${SHEET_NAMES.TRANSAKSI}!A2:ZZ`,
      `${SHEET_NAMES.KATEGORI}!A2:ZZ`,
      `${SHEET_NAMES.MASTER}!A2:ZZ`,
      `${SHEET_NAMES.REKENING_BANK}!A2:ZZ`,
    ]);

    const kategoriList = kategoriRows.map(rowToKategori);
    const kategoriMap = new Map(kategoriList.map(k => [k.id, k.nama]));

    // Build rekening label for the chosen rekening (if any)
    let rekeningLabel = '';
    if (rekeningId && rekeningRows.length > 0) {
      const rekHeaders = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
      for (const row of rekeningRows) {
        const obj: Record<string, string> = {};
        rekHeaders.forEach((h, i) => { obj[h] = row[i] || ''; });
        if (obj.id === rekeningId) {
          rekeningLabel = `${obj.nama_bank}${obj.nomor_rekening ? ` - ${obj.nomor_rekening}` : ''}`;
          break;
        }
      }
    }

    const masterHeaders = SHEET_HEADERS[SHEET_NAMES.MASTER];
    const masterObj: Record<string, string> = {};
    if (masterRows[0]) {
      masterHeaders.forEach((h, i) => { masterObj[h] = masterRows[0][i] || ''; });
    }
    const namaMasjid = masterObj.nama_masjid || process.env.NEXT_PUBLIC_MASJID_NAME || 'Masjid';
    const alamatMasjid = masterObj.alamat || '';

    // Filter transactions
    let transaksis = transaksiRows.map(rowToTransaksi)
      .filter(t => t.status === TransaksiStatus.AKTIF && !t.mutasi_ref);

    if (!isAllYears) {
      transaksis = transaksis.filter(t => t.tanggal.startsWith(tahun));
    }

    if (bulan) {
      if (!isAllYears) {
        const monthPrefix = `${tahun}-${bulan.padStart(2, '0')}`;
        transaksis = transaksis.filter(t => t.tanggal.startsWith(monthPrefix));
      } else {
        const monthStr = `-${bulan.padStart(2, '0')}-`;
        transaksis = transaksis.filter(t => t.tanggal.includes(monthStr));
      }
    }

    // Apply kategori filter
    if (kategoriIds.length > 0) {
      transaksis = transaksis.filter(t => kategoriIds.includes(t.kategori_id));
    }

    // Apply rekening filter
    if (rekeningId) {
      transaksis = transaksis.filter(t => t.rekening_id === rekeningId);
    }

    transaksis.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    // Period label
    let periode: string;
    if (isAllYears) {
      periode = bulan ? `${BULAN_NAMES[parseInt(bulan, 10)]} (Semua Tahun)` : 'Semua Tahun';
    } else {
      periode = bulan ? `${BULAN_NAMES[parseInt(bulan, 10)]} ${tahun}` : `Tahun ${tahun}`;
    }

    // Kategori filter label for PDF title — grouped by jenis
    const kategoriJenisMap = new Map(kategoriList.map(k => [k.id, k.jenis]));
    const kategoriFilterLines: string[] = [];
    if (rekeningLabel) {
      kategoriFilterLines.push(`Rekening: ${rekeningLabel}`);
    }
    if (kategoriIds.length > 0) {
      const masukNames = kategoriIds
        .filter(id => kategoriJenisMap.get(id) === TransaksiJenis.MASUK)
        .map(id => kategoriMap.get(id) || id);
      const keluarNames = kategoriIds
        .filter(id => kategoriJenisMap.get(id) === TransaksiJenis.KELUAR)
        .map(id => kategoriMap.get(id) || id);

      if (masukNames.length > 0) {
        kategoriFilterLines.push(`Kategori Masuk: ${masukNames.join(', ')}`);
      }
      if (keluarNames.length > 0) {
        kategoriFilterLines.push(`Kategori Keluar: ${keluarNames.join(', ')}`);
      }
    }

    // Generate PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(namaMasjid, pageWidth / 2, 20, { align: 'center' });
    if (alamatMasjid) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(alamatMasjid, pageWidth / 2, 27, { align: 'center' });
    }

    doc.setDrawColor(0, 128, 0);
    doc.setLineWidth(0.5);
    doc.line(14, 32, pageWidth - 14, 32);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const reportTitle = type === 'detail' ? 'Laporan Detail Transaksi' : 'Laporan Ringkasan Keuangan';
    doc.text(reportTitle, pageWidth / 2, 40, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${periode}`, pageWidth / 2, 46, { align: 'center' });
    const tableMarginLeft = 14;
    const tableMarginRight = 14;
    const maxTextWidth = pageWidth - tableMarginLeft - tableMarginRight;
    let nextY = 51;

    if (kategoriFilterLines.length > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      for (const line of kategoriFilterLines) {
        const wrapped = doc.splitTextToSize(line, maxTextWidth) as string[];
        doc.text(wrapped, pageWidth / 2, nextY, { align: 'center' });
        nextY += wrapped.length * 4; // ~4pt per line at font size 9
      }
      nextY += 2; // small gap before content
    }

    const totalMasuk = transaksis.filter(t => t.jenis === TransaksiJenis.MASUK).reduce((s, t) => s + t.jumlah, 0);
    const totalKeluar = transaksis.filter(t => t.jenis === TransaksiJenis.KELUAR).reduce((s, t) => s + t.jumlah, 0);
    const saldo = totalMasuk - totalKeluar;

    const contentStartY = kategoriFilterLines.length > 0 ? nextY : 56;

    if (type === 'ringkasan') {
      // Summary section
      let y = contentStartY;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Ringkasan', 14, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['Keterangan', 'Jumlah']],
        body: [
          ['Total Pemasukan', formatRupiah(totalMasuk)],
          ['Total Pengeluaran', formatRupiah(totalKeluar)],
          ['Saldo', formatRupiah(saldo)],
          ['Jumlah Transaksi', transaksis.length.toString()],
        ],
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });

      // Category breakdown - Pemasukan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 12;
      doc.setFont('helvetica', 'bold');
      doc.text('Breakdown Pemasukan per Kategori', 14, y);
      y += 6;

      const masukByKat = new Map<string, number>();
      transaksis.filter(t => t.jenis === TransaksiJenis.MASUK).forEach(t => {
        masukByKat.set(t.kategori_id, (masukByKat.get(t.kategori_id) || 0) + t.jumlah);
      });

      const masukRows = Array.from(masukByKat.entries())
        .map(([kid, jml]) => [kategoriMap.get(kid) || kid, formatRupiah(jml)])
        .sort((a, b) => b[1].localeCompare(a[1]));
      masukRows.push(['Total Pemasukan', formatRupiah(totalMasuk)]);

      autoTable(doc, {
        startY: y,
        head: [['Kategori', 'Jumlah']],
        body: masukRows,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.row.index === masukRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      // Category breakdown - Pengeluaran
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 12;
      doc.setFont('helvetica', 'bold');
      doc.text('Breakdown Pengeluaran per Kategori', 14, y);
      y += 6;

      const keluarByKat = new Map<string, number>();
      transaksis.filter(t => t.jenis === TransaksiJenis.KELUAR).forEach(t => {
        keluarByKat.set(t.kategori_id, (keluarByKat.get(t.kategori_id) || 0) + t.jumlah);
      });

      const keluarRows = Array.from(keluarByKat.entries())
        .map(([kid, jml]) => [kategoriMap.get(kid) || kid, formatRupiah(jml)])
        .sort((a, b) => b[1].localeCompare(a[1]));
      keluarRows.push(['Total Pengeluaran', formatRupiah(totalKeluar)]);

      autoTable(doc, {
        startY: y,
        head: [['Kategori', 'Jumlah']],
        body: keluarRows,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.row.index === keluarRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    } else {
      // Detail: list all transactions
      const tableBody = transaksis.map(t => [
        t.tanggal,
        t.deskripsi,
        kategoriMap.get(t.kategori_id) || t.kategori_id,
        t.jenis === TransaksiJenis.MASUK ? formatRupiah(t.jumlah) : '',
        t.jenis === TransaksiJenis.KELUAR ? formatRupiah(t.jumlah) : '',
      ]);

      tableBody.push(['', '', 'Total', formatRupiah(totalMasuk), formatRupiah(totalKeluar)]);
      tableBody.push(['', '', 'Saldo', '', formatRupiah(saldo)]);

      autoTable(doc, {
        startY: contentStartY - 2,
        head: [['Tanggal', 'Deskripsi', 'Kategori', 'Masuk', 'Keluar']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 25 },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 },
        didParseCell: (data) => {
          if (data.row.index >= tableBody.length - 2) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128);
      const footerY = doc.internal.pageSize.getHeight() - 10;
      doc.text(
        `Dicetak: ${new Date().toLocaleDateString('id-ID')} | Dibuat oleh SKM`,
        14, footerY
      );
      doc.text(`Halaman ${i}/${pageCount}`, pageWidth - 14, footerY, { align: 'right' });
    }

    const pdfBuffer = doc.output('arraybuffer');

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Laporan_${type}_${periode.replace(/\s+/g, '_')}.pdf"`,
      },
    });
  } catch (error) {
    console.error('GET /api/export/pdf error:', error);
    return NextResponse.json({ success: false, error: 'Gagal generate PDF.' }, { status: 500 });
  }
}
