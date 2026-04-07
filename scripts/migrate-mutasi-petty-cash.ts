/**
 * Migrasi "Tambah Petty Cash" → Mutasi Internal
 *
 * Untuk setiap entry di scripts/data/petty-cash-entries.json, script ini:
 *  1. Cek duplikat di sheet `transaksi` (tanggal + jumlah + kategori Mutasi Internal)
 *     — bila sudah ada, skip
 *  2. Auto-create kategori "Mutasi Internal" (jenis MUTASI) bila belum ada
 *  3. Generate `mutasi_ref` (MUT-YYYYMMDD-NNNN) per entry
 *  4. Append 2 baris transaksi (KELUAR dari Bank, MASUK ke Kas Tunai) dalam 1 batch
 *
 * Usage:
 *   1. Salin scripts/data/petty-cash-entries.example.json → petty-cash-entries.json
 *   2. Isi dengan data dari sheet RK (kolom Keterangan mengandung "tambah petty cash")
 *   3. Set env DARI_REKENING_ID dan KE_REKENING_ID (default: REK-20260101-0001 → REK-20260101-0002)
 *   4. Jalankan: npx tsx scripts/migrate-mutasi-petty-cash.ts
 *      Tambah --dry-run untuk preview tanpa menulis ke sheet.
 *
 * Requires .env.local: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
 */

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const DARI_REKENING_ID = process.env.DARI_REKENING_ID || 'REK-20260101-0001'; // Bank BSI/Muamalat
const KE_REKENING_ID = process.env.KE_REKENING_ID || 'REK-20260101-0002';     // Kas Tunai
const CREATED_BY = 'Migrasi';
const DRY_RUN = process.argv.includes('--dry-run');

const TRX_HEADERS = [
  'id', 'tanggal', 'jenis', 'kategori_id', 'deskripsi', 'jumlah',
  'rekening_id', 'bukti_url', 'status', 'void_reason', 'void_date',
  'koreksi_dari_id', 'created_by', 'created_at', 'updated_at', 'mutasi_ref',
];
const KAT_HEADERS = ['id', 'nama', 'jenis', 'deskripsi', 'is_active', 'created_at'];

interface PettyCashEntry {
  tanggal: string; // YYYY-MM-DD
  jumlah: number;
  deskripsi?: string;
}

function nowISO() {
  return new Date().toISOString();
}

function pad(n: number, w = 4) {
  return String(n).padStart(w, '0');
}

async function main() {
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Env variables missing. Cek .env.local');
    process.exit(1);
  }

  const dataPath = path.resolve(process.cwd(), 'scripts/data/petty-cash-entries.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`❌ File tidak ditemukan: ${dataPath}`);
    console.error('   Salin dari petty-cash-entries.example.json dan isi dengan data RK.');
    process.exit(1);
  }

  const entries: PettyCashEntry[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error('❌ File entries kosong atau bukan array.');
    process.exit(1);
  }

  console.log(`📋 ${entries.length} entry petty cash akan diproses${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`   Dari rekening: ${DARI_REKENING_ID}`);
  console.log(`   Ke rekening:   ${KE_REKENING_ID}`);

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: SERVICE_ACCOUNT_EMAIL, private_key: PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // ----- Load existing kategori & transaksi -----
  const [katResp, trxResp] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'kategori!A2:ZZ' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'transaksi!A2:ZZ' }),
  ]);

  const katRows = (katResp.data.values as string[][]) || [];
  const trxRows = (trxResp.data.values as string[][]) || [];

  // ----- Find or create Mutasi Internal kategori -----
  let mutasiKatId = '';
  for (const r of katRows) {
    const obj: Record<string, string> = {};
    KAT_HEADERS.forEach((h, i) => { obj[h] = r[i] || ''; });
    if (obj.jenis === 'MUTASI' && obj.nama === 'Mutasi Internal') {
      mutasiKatId = obj.id;
      break;
    }
  }
  if (!mutasiKatId) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let maxKat = 0;
    const katPrefix = `KAT-${today}-`;
    for (const r of katRows) {
      if (r[0]?.startsWith(katPrefix)) {
        const n = parseInt(r[0].slice(katPrefix.length), 10);
        if (n > maxKat) maxKat = n;
      }
    }
    mutasiKatId = `${katPrefix}${pad(maxKat + 1)}`;
    console.log(`➕ Membuat kategori baru "Mutasi Internal" dengan ID ${mutasiKatId}`);
    if (!DRY_RUN) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'kategori!A:A',
        valueInputOption: 'RAW',
        requestBody: { values: [[mutasiKatId, 'Mutasi Internal', 'MUTASI', 'Pemindahan dana antar rekening', 'TRUE', nowISO()]] },
      });
    }
  } else {
    console.log(`✓ Kategori "Mutasi Internal" sudah ada: ${mutasiKatId}`);
  }

  // ----- Build duplicate index: existing mutasi by tanggal+jumlah -----
  const mutasiRefIdx = TRX_HEADERS.indexOf('mutasi_ref');
  const existingMutasi = new Set<string>();
  for (const r of trxRows) {
    const ref = r[mutasiRefIdx] || '';
    const katId = r[3] || '';
    if (ref && katId === mutasiKatId) {
      existingMutasi.add(`${r[1]}|${r[5]}`); // tanggal|jumlah
    }
  }

  // ----- Track today's mutasi_ref counter & TRX id counter -----
  const todayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const refPrefix = `MUT-${todayStamp}-`;
  let refCounter = 0;
  for (const r of trxRows) {
    const ref = r[mutasiRefIdx] || '';
    if (ref.startsWith(refPrefix)) {
      const n = parseInt(ref.slice(refPrefix.length), 10);
      if (n > refCounter) refCounter = n;
    }
  }

  const trxPrefix = `TRX-${todayStamp}-`;
  let trxCounter = 0;
  for (const r of trxRows) {
    if (r[0]?.startsWith(trxPrefix)) {
      const n = parseInt(r[0].slice(trxPrefix.length), 10);
      if (n > trxCounter) trxCounter = n;
    }
  }

  // ----- Build rows to append -----
  const rowsToAppend: string[][] = [];
  const skipped: PettyCashEntry[] = [];
  const created: { tanggal: string; jumlah: number; mutasiRef: string }[] = [];
  const now = nowISO();

  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.tanggal) || !Number.isInteger(e.jumlah) || e.jumlah <= 0) {
      console.warn(`⚠️  Entry invalid, skip: ${JSON.stringify(e)}`);
      continue;
    }
    const key = `${e.tanggal}|${e.jumlah}`;
    if (existingMutasi.has(key)) {
      skipped.push(e);
      continue;
    }

    refCounter += 1;
    const mutasiRef = `${refPrefix}${pad(refCounter)}`;
    trxCounter += 1;
    const idOut = `${trxPrefix}${pad(trxCounter)}`;
    trxCounter += 1;
    const idIn = `${trxPrefix}${pad(trxCounter)}`;
    const desc = e.deskripsi || 'Tambah petty cash';

    rowsToAppend.push([
      idOut, e.tanggal, 'KELUAR', mutasiKatId, desc, String(e.jumlah),
      DARI_REKENING_ID, '', 'AKTIF', '', '', '',
      CREATED_BY, now, now, mutasiRef,
    ]);
    rowsToAppend.push([
      idIn, e.tanggal, 'MASUK', mutasiKatId, desc, String(e.jumlah),
      KE_REKENING_ID, '', 'AKTIF', '', '', '',
      CREATED_BY, now, now, mutasiRef,
    ]);

    existingMutasi.add(key);
    created.push({ tanggal: e.tanggal, jumlah: e.jumlah, mutasiRef });
  }

  console.log('');
  console.log(`📊 Ringkasan:`);
  console.log(`   Total entry input : ${entries.length}`);
  console.log(`   Akan dibuat       : ${created.length} mutasi (${rowsToAppend.length} baris)`);
  console.log(`   Skip duplikat     : ${skipped.length}`);

  if (created.length > 0) {
    console.log(`\n📝 Mutasi yang akan dibuat:`);
    for (const c of created) {
      console.log(`   - ${c.tanggal}  Rp ${c.jumlah.toLocaleString('id-ID')}  ${c.mutasiRef}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n🟡 DRY RUN — tidak ada perubahan yang ditulis ke Google Sheets.');
    return;
  }

  if (rowsToAppend.length === 0) {
    console.log('\n✓ Tidak ada baris baru. Selesai.');
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'transaksi!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: rowsToAppend },
  });

  console.log(`\n✅ Berhasil append ${rowsToAppend.length} baris ke sheet transaksi.`);
}

main().catch((err) => {
  console.error('❌ Migrasi gagal:', err);
  process.exit(1);
});
