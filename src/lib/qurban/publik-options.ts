import { selectHargaPenuh, hargaPerSlot } from './peserta-pricing';
import type { QurbanMasterHewan } from './master-hewan-repo';
import type { TipeQurban } from './peserta-types';

/**
 * Pure shaping for PB1 `options` (F4b B2). Given the active masters, active
 * physical hewan, and the occupancy map, produce the bookable (master × tipe)
 * combinations with per-slot price and available-slot count.
 *
 * Only combinations with `slot_tersedia > 0` are emitted — the public form
 * should offer what can actually be booked. Per-slot price reuses the F4a
 * pricing helpers (`harga_penuh ÷ kapasitas_slot`, integer Rupiah).
 */

export interface OptionHewan {
  id: string;
  master_hewan_id: string;
  tipe_pembelian: TipeQurban;
  kapasitas_slot: number;
}

export interface TipeOption {
  master_hewan_id: string;
  jenis: string;
  kelas: string;
  kapasitas_slot: number;
  tipe_qurban: TipeQurban;
  harga_per_slot: number;
  slot_tersedia: number;
}

export function buildTipeOptions(
  masterList: readonly QurbanMasterHewan[],
  hewanList: readonly OptionHewan[],
  occupiedByHewan: Map<string, Set<number>>
): TipeOption[] {
  const masterById = new Map(masterList.map((m) => [m.id, m]));

  const emptyByKey = new Map<string, number>(); // `${master_hewan_id}|${tipe}` → sum empty slots
  for (const h of hewanList) {
    if (!masterById.has(h.master_hewan_id)) continue; // master inactive/unknown → not offered
    const occupied = occupiedByHewan.get(h.id)?.size ?? 0;
    const empty = Math.max(0, h.kapasitas_slot - occupied);
    if (empty === 0) continue;
    const key = `${h.master_hewan_id}|${h.tipe_pembelian}`;
    emptyByKey.set(key, (emptyByKey.get(key) ?? 0) + empty);
  }

  const out: TipeOption[] = [];
  for (const [key, slot_tersedia] of emptyByKey) {
    const sep = key.lastIndexOf('|');
    const masterId = key.slice(0, sep);
    const tipe = key.slice(sep + 1) as TipeQurban;
    const master = masterById.get(masterId);
    if (!master) continue;
    out.push({
      master_hewan_id: masterId,
      jenis: master.jenis,
      kelas: master.kelas,
      kapasitas_slot: master.kapasitas_slot,
      tipe_qurban: tipe,
      harga_per_slot: hargaPerSlot(selectHargaPenuh(master, tipe), master.kapasitas_slot),
      slot_tersedia,
    });
  }

  out.sort((a, b) =>
    a.jenis !== b.jenis ? (a.jenis < b.jenis ? -1 : 1)
      : a.kelas !== b.kelas ? (a.kelas < b.kelas ? -1 : 1)
        : a.tipe_qurban < b.tipe_qurban ? -1 : a.tipe_qurban > b.tipe_qurban ? 1 : 0
  );
  return out;
}
