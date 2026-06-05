import { sheetsService } from '@/lib/google-sheets';
import { SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from './sheets';
import { DEFAULT_BAGIAN_MAP, type BagianKanonik, type TipeBagian } from './rekap-bagian';

/**
 * Repository `qurban_bagian_kanonik` (F8 Milestone F) — peta alias→kanonik
 * untuk Rekap Bagian, editable & tersimpan. Di-seed dari `DEFAULT_BAGIAN_MAP`.
 *
 * Agregasi rekap READ-ONLY: `loadBagianMap()` membaca sheet, fallback ke default
 * bila kosong TANPA menulis. Seed/edit lewat endpoint admin terpisah.
 *
 * Kolom (SHEET_HEADERS['qurban_bagian_kanonik'], 8):
 *   id | nama_kanonik | aliases(csv lower) | tipe | is_active |
 *   created_at | updated_at | created_by
 */

export const BAGIAN_KANONIK_SHEET = QURBAN_SHEETS.BAGIAN_KANONIK;
const HEADERS = SHEET_HEADERS[BAGIAN_KANONIK_SHEET];
const COL: Record<string, number> = Object.fromEntries(HEADERS.map((h, i) => [h, i]));

export interface BagianKanonikRecord {
  rowIndex: number;
  entry: BagianKanonik;
  id: string;
}

function s(v: unknown): string {
  return v == null ? '' : String(v);
}

/** id stabil dari nama kanonik (idempoten saat seed/upsert). */
export function bagianId(nama: string): string {
  return `BGN-${nama.trim().toUpperCase().replace(/\s+/g, '_')}`;
}

function splitAliases(csv: string): string[] {
  return csv
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
}

export function mapRowToBagian(row: unknown[]): BagianKanonik {
  const tipe = s(row[COL.tipe]).toUpperCase() === 'TAMBAHAN' ? 'TAMBAHAN' : 'BAKU';
  return {
    nama_kanonik: s(row[COL.nama_kanonik]),
    aliases: splitAliases(s(row[COL.aliases])),
    tipe: tipe as TipeBagian,
    is_active: s(row[COL.is_active]).toUpperCase() !== 'FALSE',
  };
}

export function bagianToRow(entry: BagianKanonik, createdBy: string, now: string): (string | number)[] {
  const cells: (string | number)[] = new Array(HEADERS.length).fill('');
  cells[COL.id] = bagianId(entry.nama_kanonik);
  cells[COL.nama_kanonik] = entry.nama_kanonik;
  cells[COL.aliases] = entry.aliases.join(', ');
  cells[COL.tipe] = entry.tipe;
  cells[COL.is_active] = entry.is_active ? 'TRUE' : 'FALSE';
  cells[COL.created_at] = now;
  cells[COL.updated_at] = now;
  cells[COL.created_by] = createdBy;
  return cells;
}

/** Baca semua baris peta. Defensif: sheet hilang/kosong → `[]`. */
export async function listBagianKanonikRecords(): Promise<BagianKanonikRecord[]> {
  try {
    const rows = await sheetsService.getRows(BAGIAN_KANONIK_SHEET);
    const out: BagianKanonikRecord[] = [];
    rows.forEach((r, i) => {
      if (!r[COL.id] && !r[COL.nama_kanonik]) return;
      out.push({ rowIndex: i + 2, entry: mapRowToBagian(r), id: s(r[COL.id]) });
    });
    return out;
  } catch (err) {
    console.error('[bagian-kanonik-repo.listBagianKanonikRecords] failed:', err);
    return [];
  }
}

/**
 * Peta efektif untuk agregasi: sheet bila terisi, else `DEFAULT_BAGIAN_MAP`
 * (TANPA menulis — menjaga agregasi read-only).
 */
export async function loadBagianMap(): Promise<BagianKanonik[]> {
  const records = await listBagianKanonikRecords();
  if (records.length === 0) return DEFAULT_BAGIAN_MAP;
  return records.map((r) => r.entry);
}

/** Seed default bila sheet kosong (idempoten). Membuat tab bila belum ada. */
export async function seedBagianKanonik(createdBy: string): Promise<BagianKanonik[]> {
  await sheetsService.ensureSheet(BAGIAN_KANONIK_SHEET);
  const records = await listBagianKanonikRecords();
  if (records.length > 0) return records.map((r) => r.entry);
  const now = new Date().toISOString();
  await sheetsService.appendRows(
    BAGIAN_KANONIK_SHEET,
    DEFAULT_BAGIAN_MAP.map((e) => bagianToRow(e, createdBy, now))
  );
  return DEFAULT_BAGIAN_MAP;
}

async function findRecord(namaKanonik: string): Promise<BagianKanonikRecord | null> {
  const id = bagianId(namaKanonik);
  const records = await listBagianKanonikRecords();
  return records.find((r) => r.id === id || r.entry.nama_kanonik.toLowerCase() === namaKanonik.trim().toLowerCase()) ?? null;
}

async function writeEntry(rec: BagianKanonikRecord, entry: BagianKanonik, createdBy: string): Promise<void> {
  const now = new Date().toISOString();
  await sheetsService.updateRow(BAGIAN_KANONIK_SHEET, rec.rowIndex, bagianToRow(entry, createdBy, now));
}

/** Tambah kanonik baru (default tipe TAMBAHAN). No-op bila sudah ada. */
export async function addKanonik(namaKanonik: string, tipe: TipeBagian, createdBy: string): Promise<BagianKanonik[]> {
  await seedBagianKanonik(createdBy);
  const existing = await findRecord(namaKanonik);
  if (existing) return loadBagianMap();
  const now = new Date().toISOString();
  const entry: BagianKanonik = { nama_kanonik: namaKanonik.trim(), aliases: [], tipe, is_active: true };
  await sheetsService.appendRow(BAGIAN_KANONIK_SHEET, bagianToRow(entry, createdBy, now));
  return loadBagianMap();
}

/** Tambah alias ke kanonik. */
export async function addAlias(namaKanonik: string, alias: string, createdBy: string): Promise<BagianKanonik[]> {
  await seedBagianKanonik(createdBy);
  const rec = await findRecord(namaKanonik);
  if (!rec) return loadBagianMap();
  const a = alias.trim().toLowerCase();
  if (a && !rec.entry.aliases.includes(a)) {
    await writeEntry(rec, { ...rec.entry, aliases: [...rec.entry.aliases, a] }, createdBy);
  }
  return loadBagianMap();
}

/** Hapus alias dari kanonik. */
export async function removeAlias(namaKanonik: string, alias: string, createdBy: string): Promise<BagianKanonik[]> {
  await seedBagianKanonik(createdBy);
  const rec = await findRecord(namaKanonik);
  if (!rec) return loadBagianMap();
  const a = alias.trim().toLowerCase();
  await writeEntry(rec, { ...rec.entry, aliases: rec.entry.aliases.filter((x) => x !== a) }, createdBy);
  return loadBagianMap();
}

/** Aktif/nonaktifkan kanonik (nonaktif → tak dihitung di rekap). */
export async function setBagianActive(namaKanonik: string, isActive: boolean, createdBy: string): Promise<BagianKanonik[]> {
  await seedBagianKanonik(createdBy);
  const rec = await findRecord(namaKanonik);
  if (!rec) return loadBagianMap();
  await writeEntry(rec, { ...rec.entry, is_active: isActive }, createdBy);
  return loadBagianMap();
}
