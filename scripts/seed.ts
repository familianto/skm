/**
 * Seed Script — Setup Google Sheets headers and default data
 *
 * Usage: npm run seed
 *
 * Requires environment variables to be set in .env.local:
 * - GOOGLE_SHEETS_ID
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 */

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// Sheet headers (same as constants.ts)
const SHEET_HEADERS: Record<string, string[]> = {
  master: [
    'id', 'nama_masjid', 'alamat', 'kota', 'provinsi', 'telepon',
    'email', 'pin_hash', 'logo_url', 'tahun_buku_aktif', 'mata_uang',
    'created_at', 'updated_at',
  ],
  transaksi: [
    'id', 'tanggal', 'jenis', 'kategori_id', 'deskripsi', 'jumlah',
    'rekening_id', 'bukti_url', 'status', 'void_reason', 'void_date',
    'koreksi_dari_id', 'created_by', 'created_at', 'updated_at',
  ],
  kategori: [
    'id', 'nama', 'jenis', 'deskripsi', 'is_active', 'created_at',
  ],
  rekening_bank: [
    'id', 'nama_bank', 'nomor_rekening', 'atas_nama', 'saldo_awal',
    'is_active', 'created_at', 'updated_at',
  ],
  audit_log: [
    'id', 'timestamp', 'aksi', 'entitas', 'entitas_id', 'detail', 'user_info',
  ],
  anggota: [
    'id', 'nama', 'telepon', 'email', 'peran', 'is_active', 'created_at',
  ],
  rekonsiliasi: [
    'id', 'rekening_id', 'tanggal', 'saldo_bank', 'saldo_sistem',
    'selisih', 'status', 'catatan', 'created_at',
  ],
};

const DEFAULT_CATEGORIES = [
  // Pemasukan (MASUK)
  { nama: 'Infaq Jumat', jenis: 'MASUK', deskripsi: 'Infaq mingguan hari Jumat' },
  { nama: 'Infaq Harian', jenis: 'MASUK', deskripsi: 'Infaq harian kotak amal' },
  { nama: 'Zakat', jenis: 'MASUK', deskripsi: 'Penerimaan zakat' },
  { nama: 'Donasi', jenis: 'MASUK', deskripsi: 'Donasi dari jamaah atau pihak lain' },
  { nama: 'Lain-lain Masuk', jenis: 'MASUK', deskripsi: 'Pemasukan lainnya' },
  // Pengeluaran (KELUAR)
  { nama: 'Listrik & Air', jenis: 'KELUAR', deskripsi: 'Pembayaran listrik dan air' },
  { nama: 'Kebersihan', jenis: 'KELUAR', deskripsi: 'Biaya kebersihan dan perawatan' },
  { nama: 'Honorarium Imam/Khatib', jenis: 'KELUAR', deskripsi: 'Honor imam dan khatib' },
  { nama: 'Perbaikan/Renovasi', jenis: 'KELUAR', deskripsi: 'Biaya perbaikan dan renovasi' },
  { nama: 'Kegiatan Ramadhan', jenis: 'KELUAR', deskripsi: 'Biaya kegiatan Ramadhan' },
  { nama: 'Kegiatan Sosial', jenis: 'KELUAR', deskripsi: 'Biaya kegiatan sosial' },
  { nama: 'ATK & Perlengkapan', jenis: 'KELUAR', deskripsi: 'Alat tulis dan perlengkapan' },
  { nama: 'Lain-lain Keluar', jenis: 'KELUAR', deskripsi: 'Pengeluaran lainnya' },
];

async function main() {
  console.log('🔧 SKM Seed Script');
  console.log('==================\n');

  // Validate env vars
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Missing environment variables. Check .env.local:');
    console.error('   - GOOGLE_SHEETS_ID');
    console.error('   - GOOGLE_SERVICE_ACCOUNT_EMAIL');
    console.error('   - GOOGLE_PRIVATE_KEY');
    process.exit(1);
  }

  // Authenticate
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Test connection
  console.log('📡 Testing connection...');
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log(`✅ Connected to: "${spreadsheet.data.properties?.title}"\n`);
  } catch (error) {
    console.error('❌ Failed to connect to Google Sheets:', error);
    process.exit(1);
  }

  // Setup headers for each sheet
  console.log('📋 Setting up headers...');
  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    try {
      // Check if headers already exist
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:A1`,
      });

      if (existing.data.values && existing.data.values.length > 0 && existing.data.values[0][0]) {
        console.log(`   ⏭️  ${sheetName} — headers already exist, skipping`);
        continue;
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      console.log(`   ✅ ${sheetName} — headers created (${headers.length} columns)`);
    } catch (error) {
      console.error(`   ❌ ${sheetName} — failed:`, error instanceof Error ? error.message : error);
    }
  }

  // Seed default categories
  console.log('\n📂 Seeding default categories...');
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'kategori!A2:A',
    });

    if (existing.data.values && existing.data.values.length > 0) {
      console.log(`   ⏭️  Categories already exist (${existing.data.values.length} rows), skipping`);
    } else {
      const now = new Date().toISOString();
      const today = now.slice(0, 10).replace(/-/g, '');
      const rows = DEFAULT_CATEGORIES.map((cat, index) => [
        `KAT-${today}-${String(index + 1).padStart(4, '0')}`,
        cat.nama,
        cat.jenis,
        cat.deskripsi,
        'TRUE',
        now,
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'kategori!A:A',
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
      console.log(`   ✅ ${rows.length} default categories created`);
    }
  } catch (error) {
    console.error('   ❌ Failed to seed categories:', error instanceof Error ? error.message : error);
  }

  // Seed master data placeholder
  console.log('\n🏛️  Seeding master data...');
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'master!A2:A2',
    });

    if (existing.data.values && existing.data.values.length > 0 && existing.data.values[0][0]) {
      console.log('   ⏭️  Master data already exists, skipping');
    } else {
      const now = new Date().toISOString();
      const today = now.slice(0, 10).replace(/-/g, '');
      const masterRow = [
        `MST-${today}-0001`,   // id
        'Nama Masjid',          // nama_masjid (placeholder)
        '',                     // alamat
        '',                     // kota
        '',                     // provinsi
        '',                     // telepon
        '',                     // email
        '',                     // pin_hash (will be set during first login setup)
        '',                     // logo_url
        new Date().getFullYear().toString(), // tahun_buku_aktif
        'IDR',                  // mata_uang
        now,                    // created_at
        now,                    // updated_at
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'master!A2',
        valueInputOption: 'RAW',
        requestBody: { values: [masterRow] },
      });
      console.log('   ✅ Master data placeholder created');
    }
  } catch (error) {
    console.error('   ❌ Failed to seed master data:', error instanceof Error ? error.message : error);
  }

  console.log('\n🎉 Seed completed!');
}

main().catch(console.error);
