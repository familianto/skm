import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { Transaksi, Kategori, RekeningBank } from '@/types';
import { getSession } from '@/lib/auth';
import ExcelJS from 'exceljs';

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

function rowToRekening(row: string[]): RekeningBank {
  const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    saldo_awal: parseInt(obj.saldo_awal, 10) || 0,
    is_active: obj.is_active === 'TRUE',
  } as unknown as RekeningBank;
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

    // Parse rekening data and calculate saldo_awal
    const rekeningList = rekeningRows.map(rowToRekening).filter(r => r.is_active);
    const filteredRekening = rekeningId
      ? rekeningList.filter(r => r.id === rekeningId)
      : rekeningList;
    const totalSaldoAwal = filteredRekening.reduce((sum, r) => sum + r.saldo_awal, 0);

    // Build rekening label for the chosen rekening (if any)
    let rekeningLabel = '';
    if (rekeningId) {
      const rek = rekeningList.find(r => r.id === rekeningId);
      if (rek) {
        rekeningLabel = `${rek.nama_bank}${rek.nomor_rekening ? ` - ${rek.nomor_rekening}` : ''}`;
      }
    }

    const masterHeaders = SHEET_HEADERS[SHEET_NAMES.MASTER];
    const masterObj: Record<string, string> = {};
    if (masterRows[0]) {
      masterHeaders.forEach((h, i) => { masterObj[h] = masterRows[0][i] || ''; });
    }
    const namaMasjid = masterObj.nama_masjid || process.env.NEXT_PUBLIC_MASJID_NAME || 'Masjid';

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

    let periode: string;
    if (isAllYears) {
      periode = bulan ? `${BULAN_NAMES[parseInt(bulan, 10)]} (Semua Tahun)` : 'Semua Tahun';
    } else {
      periode = bulan ? `${BULAN_NAMES[parseInt(bulan, 10)]} ${tahun}` : `Tahun ${tahun}`;
    }
    if (rekeningLabel) {
      periode += ` — ${rekeningLabel}`;
    }

    const kategoriFilterLabel = kategoriIds.length > 0
      ? kategoriIds.map(id => kategoriMap.get(id) || id).join(', ')
      : '';

    const totalMasuk = transaksis.filter(t => t.jenis === TransaksiJenis.MASUK).reduce((s, t) => s + t.jumlah, 0);
    const totalKeluar = transaksis.filter(t => t.jenis === TransaksiJenis.KELUAR).reduce((s, t) => s + t.jumlah, 0);

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SKM';
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
    const currencyFormat = '#,##0';

    // Sheet 1: Ringkasan
    const wsRingkasan = workbook.addWorksheet('Ringkasan');
    wsRingkasan.mergeCells('A1:D1');
    wsRingkasan.getCell('A1').value = namaMasjid;
    wsRingkasan.getCell('A1').font = { bold: true, size: 14 };
    wsRingkasan.mergeCells('A2:D2');
    wsRingkasan.getCell('A2').value = `Laporan Keuangan - ${periode}`;
    wsRingkasan.getCell('A2').font = { bold: true, size: 11 };
    if (kategoriFilterLabel) {
      wsRingkasan.mergeCells('A3:D3');
      wsRingkasan.getCell('A3').value = `Kategori: ${kategoriFilterLabel}`;
      wsRingkasan.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    }

    // Summary table
    const ringkasanStartRow = kategoriFilterLabel ? 'A5' : 'A4';
    wsRingkasan.getCell(ringkasanStartRow).value = 'Ringkasan';
    wsRingkasan.getCell(ringkasanStartRow).font = { bold: true, size: 12 };

    const summaryData = [
      ['Keterangan', 'Jumlah'],
      ['Total Pemasukan', totalMasuk],
      ['Total Pengeluaran', totalKeluar],
      ['Saldo', totalSaldoAwal + totalMasuk - totalKeluar],
      ['Jumlah Transaksi', transaksis.length],
    ];

    summaryData.forEach((row, i) => {
      const excelRow = wsRingkasan.addRow(row);
      if (i === 0) {
        excelRow.eachCell(cell => {
          cell.fill = headerFill;
          cell.font = headerFont;
        });
      }
      if (i > 0 && i < 4) {
        excelRow.getCell(2).numFmt = currencyFormat;
      }
    });

    // Category breakdown - Pemasukan
    wsRingkasan.addRow([]);
    wsRingkasan.addRow([]);
    const masukTitleRow = wsRingkasan.addRow(['Breakdown Pemasukan per Kategori']);
    masukTitleRow.getCell(1).font = { bold: true, size: 11 };

    const masukHeaderRow = wsRingkasan.addRow(['Kategori', 'Jumlah']);
    masukHeaderRow.eachCell(cell => { cell.fill = headerFill; cell.font = headerFont; });

    const masukByKat = new Map<string, number>();
    transaksis.filter(t => t.jenis === TransaksiJenis.MASUK).forEach(t => {
      masukByKat.set(t.kategori_id, (masukByKat.get(t.kategori_id) || 0) + t.jumlah);
    });

    for (const [kid, jml] of masukByKat) {
      const row = wsRingkasan.addRow([kategoriMap.get(kid) || kid, jml]);
      row.getCell(2).numFmt = currencyFormat;
    }
    const masukTotalRow = wsRingkasan.addRow(['Total Pemasukan', totalMasuk]);
    masukTotalRow.getCell(1).font = { bold: true };
    masukTotalRow.getCell(2).font = { bold: true };
    masukTotalRow.getCell(2).numFmt = currencyFormat;

    // Category breakdown - Pengeluaran
    wsRingkasan.addRow([]);
    const keluarTitleRow = wsRingkasan.addRow(['Breakdown Pengeluaran per Kategori']);
    keluarTitleRow.getCell(1).font = { bold: true, size: 11 };

    const keluarHeaderRow = wsRingkasan.addRow(['Kategori', 'Jumlah']);
    keluarHeaderRow.eachCell(cell => { cell.fill = headerFill; cell.font = headerFont; });

    const keluarByKat = new Map<string, number>();
    transaksis.filter(t => t.jenis === TransaksiJenis.KELUAR).forEach(t => {
      keluarByKat.set(t.kategori_id, (keluarByKat.get(t.kategori_id) || 0) + t.jumlah);
    });

    for (const [kid, jml] of keluarByKat) {
      const row = wsRingkasan.addRow([kategoriMap.get(kid) || kid, jml]);
      row.getCell(2).numFmt = currencyFormat;
    }
    const keluarTotalRow = wsRingkasan.addRow(['Total Pengeluaran', totalKeluar]);
    keluarTotalRow.getCell(1).font = { bold: true };
    keluarTotalRow.getCell(2).font = { bold: true };
    keluarTotalRow.getCell(2).numFmt = currencyFormat;

    wsRingkasan.getColumn(1).width = 35;
    wsRingkasan.getColumn(2).width = 20;

    // Sheet 2: Detail Transaksi
    const wsDetail = workbook.addWorksheet('Detail Transaksi');
    wsDetail.mergeCells('A1:F1');
    wsDetail.getCell('A1').value = namaMasjid;
    wsDetail.getCell('A1').font = { bold: true, size: 14 };
    wsDetail.mergeCells('A2:F2');
    wsDetail.getCell('A2').value = `Detail Transaksi - ${periode}`;
    wsDetail.getCell('A2').font = { bold: true, size: 11 };
    if (kategoriFilterLabel) {
      wsDetail.mergeCells('A3:F3');
      wsDetail.getCell('A3').value = `Kategori: ${kategoriFilterLabel}`;
      wsDetail.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    }

    const detailHeader = wsDetail.addRow([]);
    detailHeader.values = ['No', 'Tanggal', 'Deskripsi', 'Kategori', 'Masuk', 'Keluar'];
    detailHeader.eachCell(cell => { cell.fill = headerFill; cell.font = headerFont; });

    transaksis.forEach((t, idx) => {
      const row = wsDetail.addRow([
        idx + 1,
        t.tanggal,
        t.deskripsi,
        kategoriMap.get(t.kategori_id) || t.kategori_id,
        t.jenis === TransaksiJenis.MASUK ? t.jumlah : 0,
        t.jenis === TransaksiJenis.KELUAR ? t.jumlah : 0,
      ]);
      row.getCell(5).numFmt = currencyFormat;
      row.getCell(6).numFmt = currencyFormat;
    });

    // Totals row
    const totalRow = wsDetail.addRow(['', '', '', 'Total', totalMasuk, totalKeluar]);
    totalRow.eachCell(cell => { cell.font = { bold: true }; });
    totalRow.getCell(5).numFmt = currencyFormat;
    totalRow.getCell(6).numFmt = currencyFormat;

    // Saldo row
    const saldoRow = wsDetail.addRow(['', '', '', 'Saldo', '', totalSaldoAwal + totalMasuk - totalKeluar]);
    saldoRow.eachCell(cell => { cell.font = { bold: true }; });
    saldoRow.getCell(6).numFmt = currencyFormat;

    wsDetail.getColumn(1).width = 6;
    wsDetail.getColumn(2).width = 14;
    wsDetail.getColumn(3).width = 35;
    wsDetail.getColumn(4).width = 22;
    wsDetail.getColumn(5).width = 18;
    wsDetail.getColumn(6).width = 18;

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Laporan_${periode.replace(/\s+/g, '_')}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('GET /api/export/excel error:', error);
    return NextResponse.json({ success: false, error: 'Gagal generate Excel.' }, { status: 500 });
  }
}
