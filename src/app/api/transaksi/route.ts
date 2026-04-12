import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { transaksiCreateSchema, transaksiMutasiCreateSchema } from '@/lib/validators';
import { AuditAksi, TransaksiStatus, TransaksiJenis } from '@/types';
import type { ApiResponse, Transaksi } from '@/types';
import { nowISO } from '@/lib/utils';
import { getSession } from '@/lib/auth';

function rowToTransaksi(row: string[]): Transaksi {
  const headers = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    jumlah: parseInt(obj.jumlah, 10) || 0,
  } as unknown as Transaksi;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tahun = searchParams.get('tahun');
    const bulan = searchParams.get('bulan');

    const rows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);
    let transaksis = rows.map(rowToTransaksi);

    if (tahun) {
      transaksis = transaksis.filter((t) => t.tanggal.startsWith(tahun));
    }

    if (bulan) {
      const monthPrefix = tahun ? `${tahun}-${bulan.padStart(2, '0')}` : `-${bulan.padStart(2, '0')}-`;
      transaksis = transaksis.filter((t) =>
        tahun ? t.tanggal.startsWith(monthPrefix) : t.tanggal.includes(monthPrefix)
      );
    }

    // Sort by date descending (newest first)
    transaksis.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));

    return NextResponse.json<ApiResponse<Transaksi[]>>(
      { success: true, data: transaksis, meta: { total: transaksis.length } }
    );
  } catch (error) {
    console.error('GET /api/transaksi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data transaksi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const now = nowISO();
    const createdBy = session.role || 'Bendahara';

    // ============================================================
    // MUTASI: create a pair of rows (KELUAR + MASUK) with shared mutasi_ref
    // ============================================================
    if (body.jenis === TransaksiJenis.MUTASI) {
      const parsedM = transaksiMutasiCreateSchema.safeParse(body);
      if (!parsedM.success) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: parsedM.error.issues[0].message },
          { status: 400 }
        );
      }
      const { tanggal, deskripsi, jumlah, dari_rekening_id, ke_rekening_id } = parsedM.data;

      // Find or create the "Mutasi Internal" kategori
      const katRows = await sheetsService.getRows(SHEET_NAMES.KATEGORI);
      const katHeaders = SHEET_HEADERS[SHEET_NAMES.KATEGORI];
      let mutasiKatId = '';
      for (const r of katRows) {
        const obj: Record<string, string> = {};
        katHeaders.forEach((h, i) => { obj[h] = r[i] || ''; });
        if (obj.jenis === 'MUTASI' && obj.nama === 'Mutasi Internal') {
          mutasiKatId = obj.id;
          break;
        }
      }
      if (!mutasiKatId) {
        mutasiKatId = await sheetsService.getNextId(ID_PREFIXES.KATEGORI);
        await sheetsService.appendRow(SHEET_NAMES.KATEGORI, [
          mutasiKatId, 'Mutasi Internal', 'MUTASI',
          'Pemindahan dana antar rekening', 'TRUE', now,
        ]);
      }

      // Generate mutasi_ref id (format MUT-YYYYMMDD-NNNN)
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const trxRows = await sheetsService.getRows(SHEET_NAMES.TRANSAKSI);
      const mutasiRefIdx = SHEET_HEADERS[SHEET_NAMES.TRANSAKSI].indexOf('mutasi_ref');
      let maxRef = 0;
      const refPrefix = `MUT-${today}-`;
      for (const r of trxRows) {
        const ref = r[mutasiRefIdx] || '';
        if (ref.startsWith(refPrefix)) {
          const n = parseInt(ref.slice(refPrefix.length), 10);
          if (n > maxRef) maxRef = n;
        }
      }
      const mutasiRef = `${refPrefix}${String(maxRef + 1).padStart(4, '0')}`;

      // Generate two sequential transaksi IDs
      const idOut = await sheetsService.getNextId(ID_PREFIXES.TRANSAKSI);
      // Bump counter manually for second id (same prefix/date)
      const parts = idOut.split('-');
      const baseCounter = parseInt(parts[2], 10);
      const idIn = `${parts[0]}-${parts[1]}-${String(baseCounter + 1).padStart(4, '0')}`;

      // Columns must match SHEET_HEADERS[TRANSAKSI], including trailing bank_ref
      const rowOut = [
        idOut, tanggal, TransaksiJenis.KELUAR, mutasiKatId, deskripsi, jumlah.toString(),
        dari_rekening_id, '', TransaksiStatus.AKTIF, '', '', '',
        createdBy, now, now, mutasiRef, '',
      ];
      const rowIn = [
        idIn, tanggal, TransaksiJenis.MASUK, mutasiKatId, deskripsi, jumlah.toString(),
        ke_rekening_id, '', TransaksiStatus.AKTIF, '', '', '',
        createdBy, now, now, mutasiRef, '',
      ];

      await sheetsService.appendRows(SHEET_NAMES.TRANSAKSI, [rowOut, rowIn]);

      await logAudit(
        AuditAksi.CREATE, SHEET_NAMES.TRANSAKSI, mutasiRef,
        JSON.stringify({ tipe: 'MUTASI', tanggal, jumlah, dari_rekening_id, ke_rekening_id, ids: [idOut, idIn] }),
        createdBy
      );

      const trxOut: Transaksi = {
        id: idOut, tanggal, jenis: TransaksiJenis.KELUAR, kategori_id: mutasiKatId,
        deskripsi, jumlah, rekening_id: dari_rekening_id,
        bukti_url: '', status: TransaksiStatus.AKTIF,
        void_reason: '', void_date: '', koreksi_dari_id: '',
        created_by: createdBy, created_at: now, updated_at: now,
        mutasi_ref: mutasiRef, bank_ref: '',
      };
      return NextResponse.json<ApiResponse<Transaksi>>(
        { success: true, data: trxOut },
        { status: 201 }
      );
    }

    const parsed = transaksiCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id } = parsed.data;
    const id = await sheetsService.getNextId(ID_PREFIXES.TRANSAKSI);

    // columns: id, tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id,
    //          bukti_url, status, void_reason, void_date, koreksi_dari_id,
    //          created_by, created_at, updated_at, mutasi_ref, bank_ref
    await sheetsService.appendRow(SHEET_NAMES.TRANSAKSI, [
      id, tanggal, jenis, kategori_id, deskripsi, jumlah.toString(),
      rekening_id, '', TransaksiStatus.AKTIF, '', '', '',
      createdBy, now, now, '', '',
    ]);

    await logAudit(
      AuditAksi.CREATE, SHEET_NAMES.TRANSAKSI, id,
      JSON.stringify({ tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id }),
      createdBy
    );

    const transaksi: Transaksi = {
      id, tanggal, jenis, kategori_id, deskripsi, jumlah, rekening_id,
      bukti_url: '', status: TransaksiStatus.AKTIF,
      void_reason: '', void_date: '', koreksi_dari_id: '',
      created_by: createdBy, created_at: now, updated_at: now,
      mutasi_ref: '', bank_ref: '',
    };

    return NextResponse.json<ApiResponse<Transaksi>>(
      { success: true, data: transaksi },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/transaksi error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal membuat transaksi.' },
      { status: 500 }
    );
  }
}
