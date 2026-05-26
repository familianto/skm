import { listPeserta, STATUS_TERDAFTAR } from './peserta-repo';
import { listAllMuqorib } from './muqorib-repo';
import type { QurbanPeserta } from './peserta-types';

/**
 * Occupancy of physical hewan slots, derived from `qurban_peserta` (F4a).
 *
 * Milestone B fix: `qurban_peserta` now EXISTS, so occupancy is real (no longer
 * the F5a defensive `0`-stub). A slot is occupied iff a peserta row references
 * the hewan with `status_pendaftaran === 'TERDAFTAR'` (BATAL frees the slot).
 *
 * Occupant `nama` resolution (no `nama` column in the sheet): `nama_atas_nama`
 * when set, else the muqorib's `nama_lengkap` looked up by `muqorib_id`.
 *
 * `getOccupancyByHewan` stays defensive — any read failure (e.g. sheet missing
 * in a pre-migrate env) yields an empty map so F5a H1/H3/H7 never crash.
 */

export interface Occupant {
  peserta_id: string;
  nama: string;
  status: string;
  slot_number: number;
}

export interface OccupancyInfo {
  slot_terisi: number;
  occupants: Occupant[];
}

export type OccupancyMap = Map<string, OccupancyInfo>;

/**
 * Pure: build the occupancy map from already-loaded peserta rows + a
 * muqorib-name lookup. Only `TERDAFTAR` peserta in `edisiId` count. Kept pure
 * (no I/O) so slot logic is unit-testable without the Sheets layer.
 */
export function computeOccupancy(
  pesertaList: QurbanPeserta[],
  muqoribNameById: Map<string, string>,
  edisiId: string
): OccupancyMap {
  const map: OccupancyMap = new Map();
  if (!edisiId) return map;

  for (const p of pesertaList) {
    if (p.edisi_id !== edisiId) continue;
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    if (!p.hewan_id) continue;

    const nama = p.nama_atas_nama || muqoribNameById.get(p.muqorib_id) || '';
    const entry = map.get(p.hewan_id) ?? { slot_terisi: 0, occupants: [] };
    entry.slot_terisi += 1;
    entry.occupants.push({
      peserta_id: p.id,
      nama,
      status: p.status_pendaftaran,
      slot_number: p.slot_number,
    });
    map.set(p.hewan_id, entry);
  }
  return map;
}

/**
 * Read `qurban_peserta` + `qurban_muqorib` and build the occupancy map for one
 * edisi. Any failure → empty map. Never throws.
 */
export async function getOccupancyByHewan(edisiId: string): Promise<OccupancyMap> {
  if (!edisiId) return new Map();
  try {
    const [peserta, muqoribs] = await Promise.all([
      listPeserta({ edisi_id: edisiId }),
      listAllMuqorib(),
    ]);
    const nameById = new Map(muqoribs.map((m) => [m.id, m.nama_lengkap]));
    return computeOccupancy(peserta, nameById, edisiId);
  } catch (err) {
    console.error('[peserta-occupancy.getOccupancyByHewan] failed:', err);
    return new Map();
  }
}

export function slotTerisi(occ: OccupancyMap, hewanId: string): number {
  return occ.get(hewanId)?.slot_terisi ?? 0;
}

export function occupantsOf(occ: OccupancyMap, hewanId: string): Occupant[] {
  return occ.get(hewanId)?.occupants ?? [];
}

/** Slot numbers currently occupied (TERDAFTAR) on `hewanId`. */
export function occupiedSlotNumbers(occ: OccupancyMap, hewanId: string): number[] {
  return occupantsOf(occ, hewanId).map((o) => o.slot_number);
}

/** `true` when the hewan has at least one TERDAFTAR peserta. */
export function hasPesertaTerdaftar(occ: OccupancyMap, hewanId: string): boolean {
  return slotTerisi(occ, hewanId) > 0;
}
