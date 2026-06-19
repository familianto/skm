/**
 * Seed Admin Script — bootstrap the FIRST SUPER_ADMIN
 *
 * Solves the chicken-and-egg problem: creating an `anggota` normally requires a
 * logged-in SUPER_ADMIN, but a fresh install has none. This script writes that
 * very first row directly so the operator can log in.
 *
 * Usage:
 *   SEED_ADMIN_HP=08123456789 \
 *   SEED_ADMIN_NAMA="Nama Admin" \
 *   SEED_ADMIN_PIN=5731 \
 *   npm run seed:admin
 *
 * Requires (in .env.local, same as `npm run seed`):
 * - GOOGLE_SHEETS_ID
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 *
 * Properties:
 * - Idempotent: if an `anggota` with the same (normalized) phone already exists,
 *   it SKIPS — never duplicates and never overwrites an existing PIN.
 * - Reuses the canonical utils: PIN policy (`validatePin`), phone normalization
 *   (`normalizePhone`/`validatePhone`), bcrypt hashing (`hashPin`), and the
 *   row mapper (`anggotaToRow`) so the row always matches the F01 header.
 * - Non-destructive: only appends; warns (does not block) if another active
 *   SUPER_ADMIN is already present.
 *
 * SECURITY: change the PIN after first login and remove SEED_ADMIN_PIN from the
 * environment once used.
 */

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { hashPin, verifyPin } from '../src/lib/auth';
import { validatePin } from '../src/lib/api/pin-policy';
import { normalizePhone, validatePhone } from '../src/lib/api/phone';
import { anggotaToRow, type AnggotaFull } from '../src/lib/api/anggota-repo';
import { SHEET_NAMES } from '../src/lib/constants';
import { UserPeran } from '../src/types';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const ANGGOTA_PREFIX = 'ANG';

// Column indexes within an `anggota` row (mirror SHEET_HEADERS[ANGGOTA] / anggota-repo).
const COL_ID = 0;
const COL_TELEPON = 2;
const COL_PERAN = 4;
const COL_IS_ACTIVE = 5;

export interface SeedAdminInput {
  telepon: string;
  nama: string;
  pin: string;
}

export interface SeedAdminOptions {
  /** ISO timestamp for created_at/updated_at. Defaults to now. */
  now?: string;
  /** YYYYMMDD used for the ID. Defaults to today (WIB). */
  today?: string;
}

export type SeedAdminResult =
  | { status: 'created'; id: string; telepon: string; row: string[]; warnings: string[] }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string };

/** Today's date in WIB (Asia/Jakarta, UTC+7) as YYYYMMDD — matches id-gen.ts. */
export function getTodayWIB(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Compute the next sequential `ANG-{today}-NNNN` id from existing rows.
 * Pure mirror of id-gen.ts (which needs a live sheetsService); kept local so
 * this script stays self-contained and unit-testable without network.
 */
export function nextAnggotaId(rows: string[][], today: string, prefix = ANGGOTA_PREFIX): string {
  const prefixPattern = `${prefix}-${today}-`;
  let maxCounter = 0;
  for (const row of rows) {
    const id = row[COL_ID];
    if (id?.startsWith(prefixPattern)) {
      const counter = parseInt(id.slice(prefixPattern.length), 10);
      if (!isNaN(counter) && counter > maxCounter) maxCounter = counter;
    }
  }
  return `${prefixPattern}${String(maxCounter + 1).padStart(4, '0')}`;
}

/**
 * Pure core: validate input, check idempotency against `existingRows`, and
 * build the new `anggota` row (with a real bcrypt hash). No network I/O — the
 * caller supplies the current rows and persists the returned row.
 */
export async function prepareAdminSeed(
  input: SeedAdminInput,
  existingRows: string[][],
  opts: SeedAdminOptions = {}
): Promise<SeedAdminResult> {
  const nama = (input.nama || '').trim();
  if (!nama) {
    return { status: 'error', reason: 'Nama wajib diisi (set SEED_ADMIN_NAMA).' };
  }

  const telepon = normalizePhone(input.telepon || '');
  if (!validatePhone(telepon)) {
    return {
      status: 'error',
      reason: 'Format telepon tidak valid. Gunakan 628xxx atau 08xxx (set SEED_ADMIN_HP).',
    };
  }

  const pinCheck = validatePin(input.pin || '');
  if (!pinCheck.valid) {
    return {
      status: 'error',
      reason: `PIN ditolak: ${pinCheck.constraint || 'tidak memenuhi kebijakan.'} (violation: ${pinCheck.violation})`,
    };
  }

  // Idempotency: skip if this phone already exists (any status). Never overwrite.
  const dup = existingRows.find((r) => r[COL_TELEPON] === telepon);
  if (dup) {
    return {
      status: 'skipped',
      reason: `Anggota dengan telepon ${telepon} sudah ada (id ${dup[COL_ID] || '?'}). Tidak diduplikasi.`,
    };
  }

  const warnings: string[] = [];
  const existingSuperAdmin = existingRows.some(
    (r) => r[COL_PERAN] === UserPeran.SUPER_ADMIN && (r[COL_IS_ACTIVE] || '').toUpperCase() === 'TRUE'
  );
  if (existingSuperAdmin) {
    warnings.push('Sudah ada SUPER_ADMIN aktif lain — admin baru tetap dibuat.');
  }

  const now = opts.now || new Date().toISOString();
  const today = opts.today || getTodayWIB();
  const id = nextAnggotaId(existingRows, today);
  const pin_hash = await hashPin(input.pin);

  const newAnggota: AnggotaFull = {
    id,
    nama,
    telepon,
    email: '',
    peran: UserPeran.SUPER_ADMIN,
    is_active: true,
    created_at: now,
    pin_hash,
    created_by: 'SYSTEM_BOOTSTRAP',
    updated_at: now,
    last_login_at: '',
    failed_attempts: 0,
    locked_until: '',
  };

  return { status: 'created', id, telepon, row: anggotaToRow(newAnggota), warnings };
}

async function main() {
  console.log('🔑 SKM Seed Admin (bootstrap first SUPER_ADMIN)');
  console.log('===============================================\n');

  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Missing environment variables. Check .env.local:');
    console.error('   - GOOGLE_SHEETS_ID');
    console.error('   - GOOGLE_SERVICE_ACCOUNT_EMAIL');
    console.error('   - GOOGLE_PRIVATE_KEY');
    process.exit(1);
  }

  const input: SeedAdminInput = {
    telepon: process.env.SEED_ADMIN_HP || '',
    nama: process.env.SEED_ADMIN_NAMA || '',
    pin: process.env.SEED_ADMIN_PIN || '',
  };
  if (!input.telepon || !input.nama || !input.pin) {
    console.error('❌ Missing admin inputs. Provide via environment:');
    console.error('   - SEED_ADMIN_HP    (mis. 08123456789)');
    console.error('   - SEED_ADMIN_NAMA  (mis. "Nama Admin")');
    console.error('   - SEED_ADMIN_PIN   (4-6 digit, bukan PIN lemah)');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Read existing anggota rows (data only, header excluded).
  console.log('📡 Reading existing anggota...');
  let existingRows: string[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.ANGGOTA}!A2:ZZ`,
    });
    existingRows = (res.data.values as string[][]) || [];
  } catch (error) {
    console.error(
      `❌ Could not read the "${SHEET_NAMES.ANGGOTA}" sheet. Run \`npm run seed\` first to create it.`
    );
    console.error('   ', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const result = await prepareAdminSeed(input, existingRows);

  if (result.status === 'error') {
    console.error(`❌ ${result.reason}`);
    process.exit(1);
  }

  if (result.status === 'skipped') {
    console.log(`⏭️  ${result.reason}`);
    console.log('\n   Nothing to do. (Re-running this script is safe.)');
    return;
  }

  for (const w of result.warnings) console.log(`⚠️  ${w}`);

  // Sanity check: hash must round-trip and must NOT be plaintext.
  const hash = result.row[7];
  if (hash === input.pin || !(await verifyPin(input.pin, hash))) {
    console.error('❌ Internal error: PIN hash failed verification. Aborting before write.');
    process.exit(1);
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.ANGGOTA}!A:A`,
      valueInputOption: 'RAW',
      requestBody: { values: [result.row] },
    });
  } catch (error) {
    console.error('❌ Failed to write admin row:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`\n✅ SUPER_ADMIN created: ${result.id} (${result.telepon})`);
  console.log('\n🎉 Done. Login with the phone + PIN you provided.');
  console.log('\n🔐 SECURITY REMINDERS:');
  console.log('   • Change this PIN right after the first login.');
  console.log('   • Remove SEED_ADMIN_PIN from your environment/shell history.');
}

// Only run the I/O entrypoint when executed directly (not when imported by tests).
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('seed-admin.ts');
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
