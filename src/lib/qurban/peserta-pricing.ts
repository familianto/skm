import { getMasterHewanById, type QurbanMasterHewan } from './master-hewan-repo';
import type { TipeQurban } from './peserta-types';

/**
 * Harga jual peserta (B3.2) — "harga per slot" yang dibekukan ke
 * `harga_disepakati` saat pendaftaran (PS2) dan dipakai ulang PS7 (refresh).
 *
 * Sumber harga = `qurban_master_hewan` (F03), dipilih per `tipe_qurban`:
 *   BELI         → `harga_beli`          (harga 1 ekor utuh)
 *   BAWA_SENDIRI → `harga_bawa_sendiri`  (jasa penitipan & potong)
 *
 * Per-slot = harga_penuh / kapasitas_slot, sesuai kontrak in-repo
 * `docs/HANDOFF_TAHAP_2_ARCHITECTURE.md` §4.4 ("Harga per slot BELI dihitung di
 * app: harga_beli / kapasitas_slot"). Pembagian yang sama diterapkan ke
 * BAWA_SENDIRI agar pendaftaran 1 ekor penuh (semua slot) berjumlah tepat
 * harga_penuh. Dibulatkan ke Rupiah integer (Math.round) — monetary = integer.
 */

/** Harga 1 ekor penuh untuk tipe terpilih (pure). */
export function selectHargaPenuh(master: QurbanMasterHewan, tipe: TipeQurban): number {
  return tipe === 'BELI' ? master.harga_beli : master.harga_bawa_sendiri;
}

/** Harga per-slot = harga_penuh / kapasitas_slot, integer Rupiah (pure). */
export function hargaPerSlot(hargaPenuh: number, kapasitasSlot: number): number {
  if (!Number.isFinite(kapasitasSlot) || kapasitasSlot <= 0) return 0;
  return Math.round(hargaPenuh / kapasitasSlot);
}

export interface HargaLookupResult {
  harga_disepakati: number;
  master: QurbanMasterHewan;
}

/**
 * Lookup harga per-slot saat ini untuk `(edisi, master_hewan, tipe)`. Returns
 * `null` kalau master tidak ada / nonaktif / beda edisi — caller (PS2/PS7)
 * memetakan ini ke 422.
 */
export async function lookupHargaDisepakati(
  edisiId: string,
  masterHewanId: string,
  tipe: TipeQurban
): Promise<HargaLookupResult | null> {
  const master = await getMasterHewanById(masterHewanId);
  if (!master || master.edisi_id !== edisiId || !master.is_active) return null;
  const hargaPenuh = selectHargaPenuh(master, tipe);
  return { harga_disepakati: hargaPerSlot(hargaPenuh, master.kapasitas_slot), master };
}
