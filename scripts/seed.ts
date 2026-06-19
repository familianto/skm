/**
 * Seed Script — Setup Google Sheets tabs + headers and default data
 *
 * Usage: npm run seed
 *
 * Requires environment variables to be set in .env.local:
 * - GOOGLE_SHEETS_ID
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 *
 * Behaviour:
 * - Sheet list is derived from `SHEET_HEADERS` (src/lib/constants.ts) — the
 *   single source of truth — so it can never drift out of sync again. ALL
 *   registered sheets are created (10 inti + 9 qurban_*); empty tabs are
 *   harmless and prevent the "Unknown sheet" error on first use.
 * - Idempotent & non-destructive: existing tabs/rows are never overwritten or
 *   deleted. If an existing sheet's header differs from `SHEET_HEADERS`, it is
 *   only FLAGGED (no auto-migrate — that would risk misaligning existing data).
 */

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { SHEET_HEADERS, DEFAULT_CATEGORIES } from '../src/lib/constants';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

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

  // Test connection + read existing tabs
  console.log('📡 Testing connection...');
  let existingTitles: string[] = [];
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log(`✅ Connected to: "${spreadsheet.data.properties?.title}"\n`);
    existingTitles = (spreadsheet.data.sheets || [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => !!t);
  } catch (error) {
    console.error('❌ Failed to connect to Google Sheets:', error);
    process.exit(1);
  }

  const registeredSheets = Object.keys(SHEET_HEADERS);
  const mismatches: { sheet: string; expected: string[]; actual: string[] }[] = [];

  // 1) Create any registered tab that is missing (single batchUpdate)
  console.log(`📑 Ensuring ${registeredSheets.length} sheet tabs exist...`);
  const missing = registeredSheets.filter((name) => !existingTitles.includes(name));
  if (missing.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
    for (const name of missing) console.log(`   ✅ ${name} — tab created`);
  } else {
    console.log('   ⏭️  All tabs already present');
  }

  // 2) Set up / verify header row for every registered sheet (non-destructive)
  console.log('\n📋 Setting up headers...');
  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    try {
      // Read the full existing header row (up to ZZ)
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:ZZ1`,
      });
      const actual = (existing.data.values?.[0] as string[] | undefined) || [];

      if (actual.length > 0 && actual[0]) {
        // Header already present — verify it matches, but NEVER overwrite.
        const matches =
          actual.length === headers.length &&
          headers.every((h, i) => actual[i] === h);
        if (matches) {
          console.log(`   ⏭️  ${sheetName} — headers already correct, skipping`);
        } else {
          mismatches.push({ sheet: sheetName, expected: headers, actual });
          console.log(`   ⚠️  ${sheetName} — header MISMATCH (flagged, not modified)`);
        }
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

  // 3) Seed default categories
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
      const flat = [
        ...DEFAULT_CATEGORIES.MASUK.map((c) => ({ ...c, jenis: 'MASUK' })),
        ...DEFAULT_CATEGORIES.KELUAR.map((c) => ({ ...c, jenis: 'KELUAR' })),
      ];
      const rows = flat.map((cat, index) => [
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

  // 4) Seed master data placeholder
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
        '',                     // pin_hash (legacy single-PIN; admin login uses `anggota` — see seed:admin)
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

  // Summary
  console.log('\n🎉 Seed completed!');
  if (mismatches.length > 0) {
    console.log('\n⚠️  HEADER MISMATCHES (NOT modified — review manually):');
    for (const m of mismatches) {
      console.log(`   • ${m.sheet}`);
      console.log(`       expected (${m.expected.length}): ${m.expected.join(', ')}`);
      console.log(`       actual   (${m.actual.length}): ${m.actual.join(', ')}`);
    }
    console.log('\n   Auto-migration is intentionally NOT performed to avoid misaligning');
    console.log('   existing data. Reconcile these headers manually if needed.');
  }
  console.log('\n👉 Next: create the first SUPER_ADMIN with `npm run seed:admin`.');
}

main().catch(console.error);
