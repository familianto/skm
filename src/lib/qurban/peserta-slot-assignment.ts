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
 * Pure: plan `jumlah_slot` assignments across `hewanList` given the set of
 * already-occupied slot numbers per hewan. Hewan are visited in `nomor_urut`
 * ASC; within a hewan, the smallest free slot first.
 */
export function computeSlotAssignment(
  hewanList: AssignableHewan[],
  occupiedByHewan: Map<string, Set<number>>,
  jumlahSlot: number
): SlotAssignmentResult {
  const ordered = [...hewanList].sort((a, b) => a.nomor_urut - b.nomor_urut);
  const assignments: SlotAssignment[] = [];

  for (const hewan of ordered) {
    const occupied = occupiedByHewan.get(hewan.id) ?? new Set<number>();
    for (let slot = 1; slot <= hewan.kapasitas_slot; slot++) {
      if (occupied.has(slot)) continue;
      assignments.push({ hewan_id: hewan.id, slot_number: slot });
      if (assignments.length === jumlahSlot) {
        return { ok: true, assignments };
      }
    }
  }

  return { ok: false, available: assignments.length, needed: jumlahSlot };
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

  const all = await listDaftarHewanByEdisi(edisiId);
  const candidates: QurbanDaftarHewan[] = all.filter(
    (h) =>
      h.master_hewan_id === masterHewanId &&
      h.tipe_pembelian === tipe &&
      h.status === HEWAN_STATUS.AKTIF
  );

  const occ = await getOccupancyByHewan(edisiId);
  const occupiedByHewan = occupiedSetsFrom(occ, candidates.map((h) => h.id));

  return computeSlotAssignment(
    candidates.map((h) => ({
      id: h.id,
      nomor_urut: h.nomor_urut,
      kapasitas_slot: h.kapasitas_slot,
    })),
    occupiedByHewan,
    jumlahSlot
  );
}
