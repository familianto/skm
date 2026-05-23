import { sheetsService } from '@/lib/google-sheets';
import { QURBAN_SHEETS } from './sheets';

/**
 * Repository for `qurban_master_hewan` — katalog tipe hewan qurban PER-EDISI.
 *
 * Milestone A: sheet-name constant + row↔object mappers.
 * Milestone C: CRUD helpers (list-by-edisi/find/append/update) — mirror
 * `muqorib-repo.ts` / `edisi-repo.ts`.
 *
 * Column order MUST mirror migrate_F03's qurban_master_hewan sheet (11 cols):
 *   0:id  1:edisi_id  2:jenis  3:kelas  4:kapasitas_slot  5:harga_beli
 *   6:harga_bawa_sendiri  7:is_active  8:created_at  9:updated_at  10:created_by
 */

export const MASTER_HEWAN_SHEET = QURBAN_SHEETS.MASTER_HEWAN;

/** Katalog tipe hewan qurban — PER-EDISI. */
export interface QurbanMasterHewan {
  id: string;                    // MHW-YYYYMMDD-NNNN
  edisi_id: string;              // FK qurban_edisi.id
  jenis: 'SAPI' | 'KAMBING';
  kelas: 'A' | 'B' | 'C' | 'D';
  kapasitas_slot: number;        // integer > 0 (Sapi umumnya 7, Kambing 1)
  harga_beli: number;            // >= 0 — harga 1 ekor utuh (BELI)
  harga_bawa_sendiri: number;    // >= 0 — jasa penitipan & potong (BAWA_SENDIRI)
  is_active: boolean;            // soft-delete
  created_at: string;            // ISO 8601 + Z
  updated_at: string;            // ISO 8601 + Z
  created_by: string;            // FK anggota.id
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapRowToMasterHewan(row: unknown[]): QurbanMasterHewan {
  const s = (v: unknown): string => (v == null ? '' : String(v));
  // Keep raw jenis/kelas as-is — don't silently coerce unknown values to
  // SAPI/A. This sheet has no legacy data, so a non-enum value means manual
  // corruption that should stay visible (write-side validators are the real
  // guard). A bad row must not throw — it just surfaces the raw cell.
  return {
    id: s(row[0]),
    edisi_id: s(row[1]),
    jenis: s(row[2]).toUpperCase() as QurbanMasterHewan['jenis'],
    kelas: s(row[3]).toUpperCase() as QurbanMasterHewan['kelas'],
    kapasitas_slot: toNum(row[4]),
    harga_beli: toNum(row[5]),
    harga_bawa_sendiri: toNum(row[6]),
    is_active: s(row[7]).toUpperCase() === 'TRUE',
    created_at: s(row[8]),
    updated_at: s(row[9]),
    created_by: s(row[10]),
  };
}

export function mapMasterHewanToRow(m: QurbanMasterHewan): unknown[] {
  return [
    m.id,
    m.edisi_id,
    m.jenis,
    m.kelas,
    m.kapasitas_slot,
    m.harga_beli,
    m.harga_bawa_sendiri,
    m.is_active ? 'TRUE' : 'FALSE',
    m.created_at,
    m.updated_at,
    m.created_by,
  ];
}

/** Coerce a mapped row to the (string|number|boolean)[] sheetsService expects. */
function masterHewanRowCells(m: QurbanMasterHewan): (string | number | boolean)[] {
  return mapMasterHewanToRow(m).map((v) => (v == null ? '' : (v as string | number | boolean)));
}

/**
 * Read every master_hewan row for one edisi. Defensive: returns `[]` when the
 * sheet is missing (pre-`migrate_F03.gs` environments) so list endpoints don't
 * crash.
 */
export async function listMasterHewanByEdisi(
  edisiId: string
): Promise<QurbanMasterHewan[]> {
  if (!edisiId) return [];
  try {
    const rows = await sheetsService.getRows(MASTER_HEWAN_SHEET);
    return rows
      .filter((r) => r[0])
      .map(mapRowToMasterHewan)
      .filter((m) => m.edisi_id === edisiId);
  } catch (err) {
    console.error('[master-hewan-repo.listMasterHewanByEdisi] failed:', err);
    return [];
  }
}

export async function getMasterHewanById(
  id: string
): Promise<QurbanMasterHewan | null> {
  if (!id) return null;
  try {
    const rows = await sheetsService.getRows(MASTER_HEWAN_SHEET);
    const found = rows.find((r) => r[0] === id);
    return found ? mapRowToMasterHewan(found) : null;
  } catch (err) {
    console.error('[master-hewan-repo.getMasterHewanById] failed:', err);
    return null;
  }
}

/**
 * Natural-key lookup `(edisi_id, jenis, kelas)` — used for the duplicate check
 * (MH2) and the upsert match (MH5). Matches regardless of `is_active`.
 */
export async function findMasterHewanByJenisKelas(
  edisiId: string,
  jenis: string,
  kelas: string
): Promise<QurbanMasterHewan | null> {
  if (!edisiId) return null;
  const list = await listMasterHewanByEdisi(edisiId);
  return list.find((m) => m.jenis === jenis && m.kelas === kelas) ?? null;
}

export async function appendMasterHewan(
  record: QurbanMasterHewan
): Promise<QurbanMasterHewan> {
  await sheetsService.appendRow(MASTER_HEWAN_SHEET, masterHewanRowCells(record));
  return record;
}

/**
 * Update an existing master_hewan (matched by `record.id`). Throws if no row
 * matches — callers should `getMasterHewanById` first and 404 at the route
 * layer before reaching here.
 */
export async function updateMasterHewan(
  record: QurbanMasterHewan
): Promise<QurbanMasterHewan> {
  const rows = await sheetsService.getRows(MASTER_HEWAN_SHEET);
  const index = rows.findIndex((r) => r[0] === record.id);
  if (index === -1) {
    throw new Error(`Master hewan not found: ${record.id}`);
  }
  await sheetsService.updateRow(
    MASTER_HEWAN_SHEET,
    index + 2,
    masterHewanRowCells(record)
  );
  return record;
}
