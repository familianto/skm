import { sheetsService } from '@/lib/google-sheets';
import { QURBAN_SHEETS } from './sheets';

/**
 * Repository for `qurban_muqorib` — master jamaah qurban LINTAS-EDISI.
 *
 * Milestone A: sheet-name constant + row↔object mappers.
 * Milestone B: CRUD helpers (list/find/append/update) — mirror `edisi-repo.ts`.
 *
 * Column order MUST mirror migrate_F03's qurban_muqorib sheet (11 cols):
 *   0:id  1:nama_lengkap  2:alamat  3:rt  4:no_hp  5:is_active
 *   6:data_induk_ref_1447h  7:notes  8:created_at  9:created_by  10:updated_at
 */

export const MUQORIB_SHEET = QURBAN_SHEETS.MUQORIB;

/** Master jamaah qurban — LINTAS-EDISI (tidak ada edisi_id, sengaja). */
export interface QurbanMuqorib {
  id: string;                    // MQR-YYYYMMDD-NNNN
  nama_lengkap: string;          // wajib
  alamat: string;                // wajib
  rt: string;                    // '001'..'006' | 'Lainnya'
  no_hp: string;                 // ter-normalisasi '628...'
  is_active: boolean;            // soft-delete (Sheet menyimpan 'TRUE'/'FALSE')
  data_induk_ref_1447h: string;  // opsional; '' kalau kosong
  notes: string;                 // opsional; '' kalau kosong
  created_at: string;            // ISO 8601 + Z
  created_by: string;            // FK anggota.id
  updated_at: string;            // ISO 8601 + Z
}

export function mapRowToMuqorib(row: unknown[]): QurbanMuqorib {
  const s = (v: unknown): string => (v == null ? '' : String(v));
  return {
    id: s(row[0]),
    nama_lengkap: s(row[1]),
    alamat: s(row[2]),
    rt: s(row[3]),
    no_hp: s(row[4]),
    is_active: s(row[5]).toUpperCase() === 'TRUE',
    data_induk_ref_1447h: s(row[6]),
    notes: s(row[7]),
    created_at: s(row[8]),
    created_by: s(row[9]),
    updated_at: s(row[10]),
  };
}

export function mapMuqoribToRow(m: QurbanMuqorib): unknown[] {
  return [
    m.id,
    m.nama_lengkap,
    m.alamat,
    m.rt,
    m.no_hp,
    m.is_active ? 'TRUE' : 'FALSE',
    m.data_induk_ref_1447h,
    m.notes,
    m.created_at,
    m.created_by,
    m.updated_at,
  ];
}

/** All values produced by `mapMuqoribToRow` are strings. */
function muqoribRowAsStrings(m: QurbanMuqorib): string[] {
  return mapMuqoribToRow(m).map((v) => (v == null ? '' : String(v)));
}

/**
 * Read every muqorib row (active + inactive). Filtering/sorting/pagination
 * is the caller's responsibility (M1 route handler).
 *
 * Defensive: returns `[]` when the sheet is missing so list endpoints don't
 * crash in environments where `migrate_F03.gs` hasn't run yet.
 */
export async function listAllMuqorib(): Promise<QurbanMuqorib[]> {
  try {
    const rows = await sheetsService.getRows(MUQORIB_SHEET);
    return rows.filter((r) => r[0]).map(mapRowToMuqorib);
  } catch (err) {
    console.error('[muqorib-repo.listAllMuqorib] failed:', err);
    return [];
  }
}

export async function getMuqoribById(id: string): Promise<QurbanMuqorib | null> {
  if (!id) return null;
  const all = await listAllMuqorib();
  return all.find((m) => m.id === id) ?? null;
}

interface MuqoribRecord {
  rowIndex: number;
  muqorib: QurbanMuqorib;
}

/** Locate a muqorib row + its sheet rowIndex (1-based) for in-place update. */
async function findMuqoribRecordById(id: string): Promise<MuqoribRecord | null> {
  if (!id) return null;
  const rows = await sheetsService.getRows(MUQORIB_SHEET);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return { rowIndex: i + 2, muqorib: mapRowToMuqorib(rows[i]) };
    }
  }
  return null;
}

/** Append a new muqorib row. Returns the record unchanged for caller use. */
export async function appendMuqorib(record: QurbanMuqorib): Promise<QurbanMuqorib> {
  await sheetsService.appendRow(MUQORIB_SHEET, muqoribRowAsStrings(record));
  return record;
}

/**
 * Update an existing muqorib (matched by `record.id`). Throws if no row
 * matches — callers should `getMuqoribById` first and 404 at the route layer
 * before reaching here.
 */
export async function updateMuqorib(record: QurbanMuqorib): Promise<QurbanMuqorib> {
  const found = await findMuqoribRecordById(record.id);
  if (!found) {
    throw new Error(`Muqorib not found: ${record.id}`);
  }
  await sheetsService.updateRow(MUQORIB_SHEET, found.rowIndex, muqoribRowAsStrings(record));
  return record;
}
