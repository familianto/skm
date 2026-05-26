import { listDaftarHewanByEdisi } from './daftar-hewan-repo';
import { getOccupancyByHewan, occupiedSlotNumbers, type OccupancyMap } from './peserta-occupancy';
import { HEWAN_STATUS } from './hewan-state-machine';
import type { TipeQurban } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';

/**
 * Auto-assign slot (B3.1) untuk PS2 / PB3.
 *
 * Pilih hewan AKTIF dengan `master_hewan_id` cocok + `tipe_pembelian` = tipe,
 * urut `nomor_urut` ASC, isi slot kosong bernomor terkecil dulu, auto-split ke
 * hewan berikutnya kalau perlu. "Kosong" = slot_number belum ditempati peserta
 * TERDAFTAR (okupansi B2). Kalau slot tersedia < jumlah_slot → tolak (info
 * kekurangan) agar PS2 bisa 409 INSUFFICIENT_SLOTS.
 *
 * Catatan kontrak: doc 5.10 menyebut match `(jenis, kelas, tipe_pembelian)`;
 * prompt B3.1 menyebut match `master_hewan_id`. Keduanya ekuivalen karena F03
 * menjamin `(jenis × kelas)` unik per edisi (1 master = 1 (jenis,kelas)). Kami
 * pakai `master_hewan_id` (lebih presisi, sesuai prompt).
 */

export interface SlotAssignment {
  hewan_id: string;
  slot_number: number;
}

/** Slot kosong + nomor_urut hewannya (PS8 available-slots). */
export interface SlotDetail {
  hewan_id: string;
  nomor_urut: number;
  slot_number: number;
}

export type SlotAssignmentResult =
  | { ok: true; assignments: SlotAssignment[] }
  | { ok: false; available: number; needed: number };

/** Minimal shape the pure planner needs from a hewan row. */
export interface AssignableHewan {
  id: string;
  nomor_urut: number;
  kapasitas_slot: number;
}

/**
 * Pure: ALL empty slots across `hewanList`, in assignment order — hewan by
 * `nomor_urut` ASC, then smallest free slot first. Single source of truth for
 * both auto-assign (PS2) and available-slots (PS8).
 */
export function enumerateEmptySlots(
  hewanList: AssignableHewan[],
  occupiedByHewan: Map<string, Set<number>>
): SlotDetail[] {
  const ordered = [...hewanList].sort((a, b) => a.nomor_urut - b.nomor_urut);
  const out: SlotDetail[] = [];
  for (const hewan of ordered) {
    const occupied = occupiedByHewan.get(hewan.id) ?? new Set<number>();
    for (let slot = 1; slot <= hewan.kapasitas_slot; slot++) {
      if (occupied.has(slot)) continue;
      out.push({ hewan_id: hewan.id, nomor_urut: hewan.nomor_urut, slot_number: slot });
    }
  }
  return out;
}

/**
 * Pure: plan `jumlah_slot` assignments — the first `jumlah_slot` empty slots in
 * order. Fewer available than requested → `ok:false` with the shortfall.
 */
export function computeSlotAssignment(
  hewanList: AssignableHewan[],
  occupiedByHewan: Map<string, Set<number>>,
  jumlahSlot: number
): SlotAssignmentResult {
  const empty = enumerateEmptySlots(hewanList, occupiedByHewan);
  if (empty.length < jumlahSlot) {
    return { ok: false, available: empty.length, needed: jumlahSlot };
  }
  return {
    ok: true,
    assignments: empty
      .slice(0, jumlahSlot)
      .map(({ hewan_id, slot_number }) => ({ hewan_id, slot_number })),
  };
}

/** Build the occupied-slot sets per hewan from an occupancy map (pure). */
export function occupiedSetsFrom(
  occ: OccupancyMap,
  hewanIds: string[]
): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const id of hewanIds) {
    out.set(id, new Set(occupiedSlotNumbers(occ, id)));
  }
  return out;
}

export interface SlotCandidateFilter {
  master_hewan_id?: string;
  tipe_qurban?: TipeQurban;
}

/**
 * Load AKTIF hewan (optionally filtered by master/tipe) + their occupied-slot
 * sets. Shared by `autoAssignSlots` (PS2) and `listAvailableSlots` (PS8).
 */
async function loadAktifCandidates(
  edisiId: string,
  filter: SlotCandidateFilter
): Promise<{ hewan: AssignableHewan[]; occupiedByHewan: Map<string, Set<number>> }> {
  const all = await listDaftarHewanByEdisi(edisiId);
  const candidates: QurbanDaftarHewan[] = all.filter((h) => {
    if (h.status !== HEWAN_STATUS.AKTIF) return false;
    if (filter.master_hewan_id && h.master_hewan_id !== filter.master_hewan_id) return false;
    if (filter.tipe_qurban && h.tipe_pembelian !== filter.tipe_qurban) return false;
    return true;
  });

  const occ = await getOccupancyByHewan(edisiId);
  const occupiedByHewan = occupiedSetsFrom(occ, candidates.map((h) => h.id));
  const hewan = candidates.map((h) => ({
    id: h.id,
    nomor_urut: h.nomor_urut,
    kapasitas_slot: h.kapasitas_slot,
  }));
  return { hewan, occupiedByHewan };
}

/**
 * Read inventory + occupancy and plan slot assignments. Reads the AKTIF hewan
 * for `(edisi, master_hewan, tipe)` and delegates the layout to the pure
 * `computeSlotAssignment`.
 */
export async function autoAssignSlots(
  edisiId: string,
  masterHewanId: string,
  tipe: TipeQurban,
  jumlahSlot: number
): Promise<SlotAssignmentResult> {
  if (jumlahSlot <= 0) return { ok: false, available: 0, needed: jumlahSlot };
  const { hewan, occupiedByHewan } = await loadAktifCandidates(edisiId, {
    master_hewan_id: masterHewanId,
    tipe_qurban: tipe,
  });
  return computeSlotAssignment(hewan, occupiedByHewan, jumlahSlot);
}

/**
 * Enumerate empty slots for one edisi (PS8). `filter` opsional: kalau
 * master_hewan_id/tipe_qurban diberikan, batasi ke kombinasi itu; kalau tidak,
 * seluruh edisi.
 */
export async function listAvailableSlots(
  edisiId: string,
  filter: SlotCandidateFilter = {}
): Promise<SlotDetail[]> {
  if (!edisiId) return [];
  const { hewan, occupiedByHewan } = await loadAktifCandidates(edisiId, filter);
  return enumerateEmptySlots(hewan, occupiedByHewan);
}
