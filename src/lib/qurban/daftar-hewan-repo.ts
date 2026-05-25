import { sheetsService } from '@/lib/google-sheets';
import { SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from './sheets';
import type {
  QurbanDaftarHewan,
  JenisHewan,
  KelasHewan,
  StatusHewan,
  TipePembelian,
} from './daftar-hewan-types';

/**
 * Repository for `qurban_daftar_hewan` — inventaris fisik per-ekor (F5a).
 *
 * Mirrors `master-hewan-repo.ts`, but maps cells BY HEADER NAME (not hardcoded
 * index): the column index for each field is derived once from
 * `SHEET_HEADERS['qurban_daftar_hewan']` (single source of truth, matches
 * `scripts/migrate_F5a.gs`). Adding/reordering a column there flows through
 * automatically.
 *
 * `nomor_urut_pemotongan` (F7): boleh DIBACA ke field objek (`number | null`),
 * tapi TIDAK PERNAH DITULIS oleh kode F5a — pada setiap append/update kolom ini
 * ditulis kosong. Lihat catatan di `mapDaftarHewanToRow`.
 */

export const DAFTAR_HEWAN_SHEET = QURBAN_SHEETS.DAFTAR_HEWAN;

const HEADERS = SHEET_HEADERS[DAFTAR_HEWAN_SHEET];
/** header-name → 0-based column index. */
const COL: Record<string, number> = Object.fromEntries(
  HEADERS.map((h, i) => [h, i])
);

/** One row + its 1-based sheet row index (for in-place updates). */
export interface DaftarHewanRecord {
  rowIndex: number;
  hewan: QurbanDaftarHewan;
}

function s(v: unknown): string {
  return v == null ? '' : String(v);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Empty cell → null; numeric → number. Never written by F5a. */
function toNullableNum(v: unknown): number | null {
  if (v == null || s(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapRowToDaftarHewan(row: unknown[]): QurbanDaftarHewan {
  // Keep raw enum values as-is — write-side validators are the real guard; a
  // corrupt cell stays visible instead of being silently coerced.
  return {
    id: s(row[COL.id]),
    edisi_id: s(row[COL.edisi_id]),
    master_hewan_id: s(row[COL.master_hewan_id]),
    jenis: s(row[COL.jenis]).toUpperCase() as JenisHewan,
    kelas: s(row[COL.kelas]).toUpperCase() as KelasHewan,
    nomor_urut: toNum(row[COL.nomor_urut]),
    kapasitas_slot: toNum(row[COL.kapasitas_slot]),
    tipe_pembelian: s(row[COL.tipe_pembelian]).toUpperCase() as TipePembelian,
    vendor_nama: s(row[COL.vendor_nama]),
    harga_beli_aktual: toNum(row[COL.harga_beli_aktual]),
    tanggal_pembelian: s(row[COL.tanggal_pembelian]),
    status: s(row[COL.status]).toUpperCase() as StatusHewan,
    notes: s(row[COL.notes]),
    nomor_urut_pemotongan: toNullableNum(row[COL.nomor_urut_pemotongan]),
    created_at: s(row[COL.created_at]),
    updated_at: s(row[COL.updated_at]),
    created_by: s(row[COL.created_by]),
  };
}

/**
 * Object → row cells (length = HEADERS.length), placed by header index.
 *
 * `nomor_urut_pemotongan` is ALWAYS written empty — F5a never owns this column
 * (milik F7). On update, `updateRow` rewrites the whole row, so any future F7
 * value would be cleared here; F7 must reconcile this when it lands.
 */
export function mapDaftarHewanToRow(h: QurbanDaftarHewan): (string | number)[] {
  const cells: (string | number)[] = new Array(HEADERS.length).fill('');
  cells[COL.id] = h.id;
  cells[COL.edisi_id] = h.edisi_id;
  cells[COL.master_hewan_id] = h.master_hewan_id;
  cells[COL.jenis] = h.jenis;
  cells[COL.kelas] = h.kelas;
  cells[COL.nomor_urut] = h.nomor_urut;
  cells[COL.kapasitas_slot] = h.kapasitas_slot;
  cells[COL.tipe_pembelian] = h.tipe_pembelian;
  cells[COL.vendor_nama] = h.vendor_nama;
  cells[COL.harga_beli_aktual] = h.harga_beli_aktual;
  cells[COL.tanggal_pembelian] = h.tanggal_pembelian;
  cells[COL.status] = h.status;
  cells[COL.notes] = h.notes;
  // cells[COL.nomor_urut_pemotongan] stays '' — F7 owns it.
  cells[COL.created_at] = h.created_at;
  cells[COL.updated_at] = h.updated_at;
  cells[COL.created_by] = h.created_by;
  return cells;
}

/** Tampilan ramah-manusia, mis. `"Sapi-A-01"`. */
export function namaDisplay(
  jenis: string,
  kelas: string,
  nomor_urut: number
): string {
  const titled =
    jenis.length === 0
      ? jenis
      : jenis.charAt(0).toUpperCase() + jenis.slice(1).toLowerCase();
  return `${titled}-${kelas}-${String(nomor_urut).padStart(2, '0')}`;
}

/**
 * All rows for one edisi (defensive: `[]` if sheet missing pre-`migrate_F5a`).
 */
export async function listDaftarHewanByEdisi(
  edisiId: string
): Promise<QurbanDaftarHewan[]> {
  if (!edisiId) return [];
  try {
    const rows = await sheetsService.getRows(DAFTAR_HEWAN_SHEET);
    return rows
      .filter((r) => r[COL.id])
      .map(mapRowToDaftarHewan)
      .filter((h) => h.edisi_id === edisiId);
  } catch (err) {
    console.error('[daftar-hewan-repo.listDaftarHewanByEdisi] failed:', err);
    return [];
  }
}

/** Rows for one edisi WITH their 1-based sheet row index (for batch writes). */
export async function listDaftarHewanRecordsByEdisi(
  edisiId: string
): Promise<DaftarHewanRecord[]> {
  if (!edisiId) return [];
  try {
    const rows = await sheetsService.getRows(DAFTAR_HEWAN_SHEET);
    const records: DaftarHewanRecord[] = [];
    rows.forEach((r, i) => {
      if (!r[COL.id]) return;
      const hewan = mapRowToDaftarHewan(r);
      if (hewan.edisi_id !== edisiId) return;
      records.push({ rowIndex: i + 2, hewan });
    });
    return records;
  } catch (err) {
    console.error('[daftar-hewan-repo.listDaftarHewanRecordsByEdisi] failed:', err);
    return [];
  }
}

export async function getDaftarHewanById(
  id: string
): Promise<QurbanDaftarHewan | null> {
  const rec = await getDaftarHewanRecordById(id);
  return rec ? rec.hewan : null;
}

export async function getDaftarHewanRecordById(
  id: string
): Promise<DaftarHewanRecord | null> {
  if (!id) return null;
  try {
    const rows = await sheetsService.getRows(DAFTAR_HEWAN_SHEET);
    const index = rows.findIndex((r) => r[COL.id] === id);
    if (index === -1) return null;
    return { rowIndex: index + 2, hewan: mapRowToDaftarHewan(rows[index]) };
  } catch (err) {
    console.error('[daftar-hewan-repo.getDaftarHewanRecordById] failed:', err);
    return null;
  }
}

export async function appendDaftarHewan(
  record: QurbanDaftarHewan
): Promise<QurbanDaftarHewan> {
  await sheetsService.appendRow(DAFTAR_HEWAN_SHEET, mapDaftarHewanToRow(record));
  return record;
}

export async function updateDaftarHewanAt(
  rowIndex: number,
  record: QurbanDaftarHewan
): Promise<QurbanDaftarHewan> {
  await sheetsService.updateRow(
    DAFTAR_HEWAN_SHEET,
    rowIndex,
    mapDaftarHewanToRow(record)
  );
  return record;
}

/**
 * Apply several row updates. Google Sheets has no row locking / transactions
 * (single-writer-per-masjid, per CLAUDE.md) so this is a sequential loop —
 * callers MUST validate the whole batch up front (all-or-nothing) before
 * calling, mirroring `master-hewan` bulk-upsert.
 */
export async function batchUpdateDaftarHewan(
  records: DaftarHewanRecord[]
): Promise<void> {
  for (const r of records) {
    await updateDaftarHewanAt(r.rowIndex, r.hewan);
  }
}
