import { sheetsService } from '@/lib/google-sheets';

/**
 * Occupancy of physical hewan slots, derived from `qurban_peserta` (F5a, §6.3).
 *
 * `qurban_peserta` does NOT exist yet — it ships in F4a. Every read here is
 * defensive: a missing sheet (or an unrecognized schema) yields an empty map,
 * so H1/H3 report `slot_terisi = 0` / `occupants = []` and H6/H7 BATAL guards
 * pass. When F4a creates the sheet with `hewan_id` + `status` columns, this
 * lights up WITHOUT a code change (columns resolved by header name).
 *
 * Assumed F4a columns (resolved by name, all optional except `hewan_id`):
 *   `hewan_id`, `status` (TERDAFTAR counts as occupying), `edisi_id`, `id`,
 *   `nama`. Helper Claude / F4a: confirm these names when peserta lands.
 */

const PESERTA_SHEET = 'qurban_peserta';
const STATUS_TERDAFTAR = 'TERDAFTAR';

export interface Occupant {
  peserta_id: string;
  nama: string;
  status: string;
}

export interface OccupancyInfo {
  slot_terisi: number;
  occupants: Occupant[];
}

export type OccupancyMap = Map<string, OccupancyInfo>;

/**
 * Pure: build the occupancy map from a header row + data rows. Returns an empty
 * map when the schema isn't recognized (no `hewan_id` column) — this is the
 * "peserta not ready yet" path, kept pure so it's unit-testable without I/O.
 */
export function computeOccupancy(
  header: string[],
  dataRows: string[][],
  edisiId: string
): OccupancyMap {
  const map: OccupancyMap = new Map();
  if (!edisiId) return map;

  const idx = (name: string) => header.indexOf(name);
  const iHewan = idx('hewan_id');
  if (iHewan === -1) return map; // schema not recognized (pre-F4a) → empty

  const iStatus = idx('status');
  const iEdisi = idx('edisi_id');
  const iPeserta = idx('id');
  const iNama = idx('nama');

  for (const row of dataRows) {
    if (iEdisi !== -1 && row[iEdisi] !== edisiId) continue;
    const hewanId = row[iHewan];
    if (!hewanId) continue;

    const status = iStatus !== -1 ? String(row[iStatus] ?? '') : '';
    // Only TERDAFTAR peserta occupy a slot. If no status column, count the row.
    if (iStatus !== -1 && status.toUpperCase() !== STATUS_TERDAFTAR) continue;

    const entry = map.get(hewanId) ?? { slot_terisi: 0, occupants: [] };
    entry.slot_terisi += 1;
    entry.occupants.push({
      peserta_id: iPeserta !== -1 ? String(row[iPeserta] ?? '') : '',
      nama: iNama !== -1 ? String(row[iNama] ?? '') : '',
      status,
    });
    map.set(hewanId, entry);
  }
  return map;
}

/**
 * Read `qurban_peserta` and build the occupancy map for one edisi. Any failure
 * (sheet not found pre-F4a, read error) → empty map. Never throws.
 */
export async function getOccupancyByHewan(edisiId: string): Promise<OccupancyMap> {
  if (!edisiId) return new Map();
  try {
    const headerRows = await sheetsService.getRows(
      PESERTA_SHEET,
      `${PESERTA_SHEET}!A1:ZZ1`
    );
    const dataRows = await sheetsService.getRows(PESERTA_SHEET);
    return computeOccupancy(headerRows[0] ?? [], dataRows, edisiId);
  } catch {
    // Sheet missing (pre-F4a) or any read error → no occupancy.
    return new Map();
  }
}

export function slotTerisi(occ: OccupancyMap, hewanId: string): number {
  return occ.get(hewanId)?.slot_terisi ?? 0;
}

export function occupantsOf(occ: OccupancyMap, hewanId: string): Occupant[] {
  return occ.get(hewanId)?.occupants ?? [];
}

/** `true` when the hewan has at least one TERDAFTAR peserta. */
export function hasPesertaTerdaftar(occ: OccupancyMap, hewanId: string): boolean {
  return slotTerisi(occ, hewanId) > 0;
}
