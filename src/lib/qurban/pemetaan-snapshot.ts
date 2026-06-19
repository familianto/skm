import type { QurbanDaftarHewan, JenisHewan, KelasHewan, StatusHewan, TipePembelian } from './daftar-hewan-types';
import type { QurbanPeserta, TipeQurban } from './peserta-types';
import { STATUS_TERDAFTAR } from './peserta-repo';
import { HEWAN_STATUS } from './hewan-state-machine';
import { masterHargaPerSlot } from './pemetaan-engine';

/**
 * F5b Milestone A1 — Snapshot Pemetaan (PM2).
 *
 * Fungsi murni (tanpa I/O Sheets) yang merangkai snapshot papan pemetaan dari
 * data mentah yang sudah dibaca handler PM2. Konvensi pattern sama dengan
 * `peserta-occupancy.computeOccupancy` & `peserta-slot-assignment.enumerateEmptySlots`:
 * handler bertugas baca Sheets + bangun lookup map, fungsi murni ini bertugas
 * transformasi → unit-testable tanpa mock Sheets.
 *
 * Output kontrak PM2 (lihat `docs/developer/API_REFERENCE.md`):
 *   {
 *     edisi_id, version,
 *     hewan: [
 *       { id, nomor_urut, tipe_pembelian, jenis, kelas, nama_tipe,
 *         kapasitas_slot, status, harga_master_per_slot,
 *         slots: [{ slot_number, peserta }] }
 *     ]
 *   }
 *
 * Aturan:
 * - **Hanya hewan `AKTIF`** yang ditampilkan (caller harus pre-filter; fungsi
 *   ini juga defensive-filter ulang). DRAFT/TERPOTONG/BATAL → drop.
 * - **Hanya peserta `TERDAFTAR`** yang menempati slot (caller pre-filter +
 *   guard ulang). BATAL tidak boleh muncul di papan.
 * - **Slot computed**: setiap hewan punya `slots.length === kapasitas_slot`,
 *   slot_number 1..kapasitas_slot urut. Slot tanpa peserta → `peserta: null`.
 * - Hewan diurut `nomor_urut` ASC (konsisten dengan urutan auto-assign F4a +
 *   reorder F5a-H5).
 * - **Sumber field hewan**: `jenis`/`kelas`/`kapasitas_slot`/`tipe_pembelian`
 *   diambil dari baris `qurban_daftar_hewan` (denormalisasi sudah dijamin saat
 *   create, tahan terhadap perubahan master retroaktif). `nama_tipe`
 *   disintesis sebagai `"<jenis> Kelas <kelas>"` dari master kalau ada,
 *   fallback ke hewan row sendiri kalau master_hewan_id tidak terpetakan.
 * - **Peserta enrichment**: `muqorib_nama` dari `muqoribNameById`; fallback
 *   string kosong kalau lookup gagal (tidak throw — display tetap berfungsi).
 *
 * Tidak ada audit, tidak ada penulisan, tidak ada efek samping.
 */

export interface SnapshotMasterInfo {
  /** SAPI | KAMBING (uppercase, konsisten dengan baris hewan). */
  jenis: JenisHewan;
  /** A | B | C | D. */
  kelas: KelasHewan;
  /** `qurban_master_hewan.harga_beli` — harga 1 ekor utuh (BELI). */
  harga_beli: number;
  /** `qurban_master_hewan.kapasitas_slot` — pembagi harga per slot. */
  kapasitas_slot: number;
}

export interface SnapshotPesertaSlot {
  id: string;
  nama_atas_nama: string;
  muqorib_id: string;
  muqorib_nama: string;
  harga_disepakati: number;
  kode_bayar: string;
  tipe_qurban: TipeQurban;
}

export interface SnapshotSlot {
  slot_number: number;
  peserta: SnapshotPesertaSlot | null;
}

export interface SnapshotHewan {
  id: string;
  nomor_urut: number;
  tipe_pembelian: TipePembelian;
  jenis: JenisHewan;
  kelas: KelasHewan;
  nama_tipe: string;
  kapasitas_slot: number;
  status: StatusHewan;
  /**
   * Harga master "per slot" untuk hewan ini = `master.harga_beli ÷
   * master.kapasitas_slot`, dibulatkan via `masterHargaPerSlot` (konvensi
   * tunggal PM1/PM2). Dipakai HargaDecisionModal sebagai "Harga master
   * tujuan" — identik dengan nilai yang disimpan handler PM1 `use_new`.
   * Master tidak terpetakan → 0 (tidak ada harga master yang diketahui).
   */
  harga_master_per_slot: number;
  slots: SnapshotSlot[];
}

export interface PemetaanSnapshot {
  edisi_id: string;
  version: string;
  hewan: SnapshotHewan[];
}

/** Format friendly nama_tipe — `"SAPI Kelas A"`. */
function formatNamaTipe(jenis: string, kelas: string): string {
  return `${jenis} Kelas ${kelas}`;
}

/**
 * Bangun snapshot pemetaan untuk satu edisi.
 *
 * @param hewanRows  Seluruh baris `qurban_daftar_hewan` untuk edisi (akan
 *                   di-filter `status=AKTIF` di sini juga; caller boleh
 *                   pre-filter atau tidak).
 * @param pesertaRows Seluruh baris `qurban_peserta` untuk edisi (akan di-filter
 *                   `status_pendaftaran=TERDAFTAR` di sini juga).
 * @param masterInfo Map `master_hewan_id → {jenis, kelas}` untuk sintesis
 *                   `nama_tipe`. Kalau master sebuah hewan tidak ada di map,
 *                   fallback ke jenis/kelas denormalisasi di hewan row.
 * @param muqoribNameById Map `muqorib_id → nama_lengkap`. Lookup miss → ''.
 * @param edisiId   Untuk validasi defensif: drop baris dengan `edisi_id` lain.
 * @param version   Nilai `qurban_edisi.pemetaan_version` saat dibaca.
 */
export function buildPemetaanSnapshot(
  hewanRows: readonly QurbanDaftarHewan[],
  pesertaRows: readonly QurbanPeserta[],
  masterInfo: ReadonlyMap<string, SnapshotMasterInfo>,
  muqoribNameById: ReadonlyMap<string, string>,
  edisiId: string,
  version: string
): PemetaanSnapshot {
  // 1. Index peserta TERDAFTAR per (hewan_id, slot_number).
  type SlotKey = string; // `${hewan_id}|${slot_number}`
  const slotKey = (hewanId: string, slotNumber: number): SlotKey =>
    `${hewanId}|${slotNumber}`;
  const pesertaBySlot = new Map<SlotKey, SnapshotPesertaSlot>();
  for (const p of pesertaRows) {
    if (p.edisi_id !== edisiId) continue;
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    if (!p.hewan_id) continue;
    if (!Number.isFinite(p.slot_number) || p.slot_number <= 0) continue;
    pesertaBySlot.set(slotKey(p.hewan_id, p.slot_number), {
      id: p.id,
      nama_atas_nama: p.nama_atas_nama,
      muqorib_id: p.muqorib_id,
      muqorib_nama: muqoribNameById.get(p.muqorib_id) ?? '',
      harga_disepakati: p.harga_disepakati,
      kode_bayar: p.kode_bayar,
      tipe_qurban: p.tipe_qurban,
    });
  }

  // 2. Filter + sort hewan, lalu rakit slot list 1..kapasitas_slot.
  const aktifHewan = hewanRows
    .filter((h) => h.edisi_id === edisiId)
    .filter((h) => h.status === HEWAN_STATUS.AKTIF)
    .slice()
    .sort((a, b) => a.nomor_urut - b.nomor_urut);

  const hewanOut: SnapshotHewan[] = aktifHewan.map((h) => {
    const master = masterInfo.get(h.master_hewan_id);
    const jenis = master?.jenis ?? h.jenis;
    const kelas = master?.kelas ?? h.kelas;
    // Harga master per slot: pakai master asli (konsisten dgn PM1 use_new).
    // Master tak terpetakan → 0 (tidak ada harga master yang diketahui).
    const hargaMasterPerSlot = master
      ? masterHargaPerSlot(master.harga_beli, master.kapasitas_slot)
      : 0;
    const slots: SnapshotSlot[] = [];
    for (let n = 1; n <= h.kapasitas_slot; n++) {
      slots.push({
        slot_number: n,
        peserta: pesertaBySlot.get(slotKey(h.id, n)) ?? null,
      });
    }
    return {
      id: h.id,
      nomor_urut: h.nomor_urut,
      tipe_pembelian: h.tipe_pembelian,
      jenis,
      kelas,
      nama_tipe: formatNamaTipe(jenis, kelas),
      kapasitas_slot: h.kapasitas_slot,
      status: h.status,
      harga_master_per_slot: hargaMasterPerSlot,
      slots,
    };
  });

  return {
    edisi_id: edisiId,
    version,
    hewan: hewanOut,
  };
}
