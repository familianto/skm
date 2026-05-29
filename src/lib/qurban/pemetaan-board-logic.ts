import type {
  SnapshotHewan,
  SnapshotSlot,
} from './pemetaan-snapshot';
import type { Operation } from './pemetaan-validators';

/**
 * F5b B — Logika murni untuk papan pemetaan (UI).
 *
 * Tidak menyentuh DOM, dnd-kit, atau fetch — hanya transformasi nilai dari
 * snapshot ke keputusan UI (modal harga, opsi decision yang tersedia,
 * permutasi nomor_urut). Tested via node:test.
 *
 * Konvensi cross-class:
 *   F03 menjamin `(jenis, kelas)` unik per edisi (1 master_hewan = 1
 *   kombinasi jenis+kelas per edisi). Snapshot PM2 tidak meng-ekspose
 *   `master_hewan_id` per hewan, tapi `(jenis, kelas)` tuple cukup sebagai
 *   proxy: dua hewan dengan tuple sama = master sama = same-class. Tuple
 *   berbeda = different-class → trigger modal harga.
 */

export interface HewanLite {
  jenis: string;
  kelas: string;
  tipe_pembelian: 'BELI' | 'BAWA_SENDIRI';
}

/** Same-class iff (jenis, kelas) tuple identik. */
export function isSameClass(a: HewanLite, b: HewanLite): boolean {
  return a.jenis === b.jenis && a.kelas === b.kelas;
}

/** Cross-class = bukan same-class. Trigger modal harga. */
export function isCrossClass(a: HewanLite, b: HewanLite): boolean {
  return !isSameClass(a, b);
}

/** Cross-tipe = tipe_pembelian berbeda (BELI ↔ BAWA_SENDIRI). */
export function isCrossTipe(a: HewanLite, b: HewanLite): boolean {
  return a.tipe_pembelian !== b.tipe_pembelian;
}

/**
 * Opsi `harga_decision` yang tersedia untuk **move** (peserta dari `source`
 * ke `target`). Cross-tipe → `use_new` di-disable dan default jadi
 * `use_custom`. Same-class → tidak perlu modal (caller deteksi via
 * `isCrossClass`); fungsi ini tetap diekspos untuk fallback.
 */
export interface HargaDecisionOption {
  value: 'use_old' | 'use_new' | 'use_existing_target' | 'use_custom';
  label: string;
  /** `true` saat radio harus dinonaktifkan. */
  disabled: boolean;
  /** Catatan kecil untuk radio yang disabled. */
  note?: string;
  /** Default-selected option (UI menyalakan radio ini saat modal dibuka). */
  isDefault: boolean;
}

export function moveHargaOptions(
  source: HewanLite,
  target: HewanLite
): HargaDecisionOption[] {
  const crossTipe = isCrossTipe(source, target);
  return [
    {
      value: 'use_old',
      label: 'Pertahankan harga lama',
      disabled: false,
      isDefault: !crossTipe,
    },
    {
      value: 'use_new',
      label: 'Pakai harga hewan baru',
      disabled: crossTipe,
      note: crossTipe
        ? 'Tidak tersedia untuk lintas tipe pembelian — gunakan Harga Manual.'
        : undefined,
      isDefault: false,
    },
    {
      value: 'use_custom',
      label: 'Harga manual',
      disabled: false,
      isDefault: crossTipe,
    },
  ];
}

export function swapHargaOptions(
  a: HewanLite,
  b: HewanLite
): HargaDecisionOption[] {
  const crossTipe = isCrossTipe(a, b);
  return [
    {
      value: 'use_old',
      label: 'Pertahankan harga masing-masing',
      disabled: false,
      isDefault: !crossTipe,
    },
    {
      value: 'use_new',
      label: 'Sesuaikan ke harga hewan tujuan masing-masing',
      disabled: crossTipe,
      note: crossTipe
        ? 'Tidak tersedia untuk lintas tipe pembelian — gunakan Harga Manual.'
        : undefined,
      isDefault: false,
    },
    {
      value: 'use_existing_target',
      label: 'Tukar harga sekalian',
      disabled: false,
      isDefault: false,
    },
    {
      value: 'use_custom',
      label: 'Harga manual',
      disabled: false,
      isDefault: crossTipe,
    },
  ];
}

// ---------------------------------------------------------------------------
// Permutasi nomor_urut hewan (mode "Atur Urutan Hewan")
// ---------------------------------------------------------------------------

export interface RenumberHewanInput {
  id: string;
  nomor_urut: number;
}

/**
 * Hitung daftar `renumber_hewan` op dari urutan baru hewan vs urutan asal.
 *
 * @param ordered  Daftar `{id, nomor_urut}` hasil drag-reorder. Index
 *                 array = posisi baru (0-based). Setiap entri mengandung
 *                 `nomor_urut` ASAL (sebelum reorder).
 *
 * Output: satu `renumber_hewan` op per hewan yang `nomor_urut`-nya berubah
 * (`new_nomor_urut = index + 1`).
 */
export function buildRenumberOps(
  ordered: RenumberHewanInput[]
): Operation[] {
  const ops: Operation[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const target = i + 1;
    if (ordered[i].nomor_urut !== target) {
      ops.push({
        type: 'renumber_hewan',
        hewan_id: ordered[i].id,
        new_nomor_urut: target,
      });
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Drop classification — apa yang seharusnya dihasilkan oleh sebuah drop?
// ---------------------------------------------------------------------------

export interface DropContext {
  /** Hewan asal peserta yang di-drag. */
  source: HewanLite;
  /** Hewan tujuan drop. */
  target: HewanLite;
  /** Slot tujuan: berisi peserta lain → swap; null → move. */
  targetSlot: SnapshotSlot;
}

export type DropClassification =
  | { kind: 'noop'; reason: string }
  | { kind: 'move'; needsModal: boolean }
  | { kind: 'swap'; needsModal: boolean };

/**
 * Klasifikasi drop:
 *  - target sama dengan source slot → noop.
 *  - target slot kosong → move; modal harga **hanya** kalau cross-class.
 *  - target slot terisi → swap; modal harga **hanya** kalau cross-class.
 */
export function classifyDrop(ctx: DropContext): DropClassification {
  const crossClass = isCrossClass(ctx.source, ctx.target);
  if (ctx.targetSlot.peserta) {
    return { kind: 'swap', needsModal: crossClass };
  }
  return { kind: 'move', needsModal: crossClass };
}

// ---------------------------------------------------------------------------
// Local snapshot mutation — apply op ke salinan hewan[] (untuk pratinjau UI)
// ---------------------------------------------------------------------------

/**
 * Apply MOVE secara lokal ke `hewan[]`. Tidak validasi (handler PM1 yang
 * validasi). Tidak mengubah harga (UI gabungkan harga decision di tempat
 * lain — ini hanya pindah posisi peserta). Caller bertanggung jawab
 * membuat salinan dulu.
 */
export function applyMoveLocal(
  hewan: SnapshotHewan[],
  pesertaId: string,
  targetHewanId: string,
  targetSlotNumber: number,
  hargaOverride: number | null
): SnapshotHewan[] {
  // Cari peserta asal.
  let payload: SnapshotSlot['peserta'] = null;
  const next = hewan.map((h) => ({
    ...h,
    slots: h.slots.map((s) => {
      if (s.peserta && s.peserta.id === pesertaId) {
        payload = s.peserta;
        return { ...s, peserta: null };
      }
      return s;
    }),
  }));
  if (!payload) return hewan; // peserta tak ditemukan → tidak berubah.

  // payload bisa di-narrow Type setelah cek di atas, tapi TS tidak menyimpulkannya
  // karena dimutasi di dalam closure. Cast eksplisit.
  const carrier = payload as NonNullable<SnapshotSlot['peserta']>;

  return next.map((h) => {
    if (h.id !== targetHewanId) return h;
    return {
      ...h,
      slots: h.slots.map((s) => {
        if (s.slot_number !== targetSlotNumber) return s;
        return {
          ...s,
          peserta: {
            ...carrier,
            harga_disepakati:
              hargaOverride != null ? hargaOverride : carrier.harga_disepakati,
          },
        };
      }),
    };
  });
}

/**
 * Apply SWAP secara lokal: peserta A & B tukar `(hewan_id, slot_number)`.
 * `hargaOverrideA/B` (kalau di-set) → harga peserta tujuan.
 */
export function applySwapLocal(
  hewan: SnapshotHewan[],
  pesertaAId: string,
  pesertaBId: string,
  hargaOverrideA: number | null,
  hargaOverrideB: number | null
): SnapshotHewan[] {
  // Snapshot peserta A & B.
  let aSnap: SnapshotSlot['peserta'] = null;
  let bSnap: SnapshotSlot['peserta'] = null;
  for (const h of hewan) {
    for (const s of h.slots) {
      if (s.peserta?.id === pesertaAId) aSnap = s.peserta;
      if (s.peserta?.id === pesertaBId) bSnap = s.peserta;
    }
  }
  if (!aSnap || !bSnap) return hewan;
  const aCarrier = aSnap as NonNullable<SnapshotSlot['peserta']>;
  const bCarrier = bSnap as NonNullable<SnapshotSlot['peserta']>;

  return hewan.map((h) => ({
    ...h,
    slots: h.slots.map((s) => {
      if (s.peserta?.id === pesertaAId) {
        return {
          ...s,
          peserta: {
            ...bCarrier,
            harga_disepakati:
              hargaOverrideA != null ? hargaOverrideA : bCarrier.harga_disepakati,
          },
        };
      }
      if (s.peserta?.id === pesertaBId) {
        return {
          ...s,
          peserta: {
            ...aCarrier,
            harga_disepakati:
              hargaOverrideB != null ? hargaOverrideB : aCarrier.harga_disepakati,
          },
        };
      }
      return s;
    }),
  }));
}

/**
 * Reorder hewan[] sesuai daftar id baru. Menulis ulang `nomor_urut` ke
 * `1..N` (sesuai posisi baru). Caller bertanggung jawab memastikan
 * `orderedIds` adalah permutasi penuh `hewan.map(h => h.id)`.
 */
export function applyRenumberLocal(
  hewan: SnapshotHewan[],
  orderedIds: string[]
): SnapshotHewan[] {
  const byId = new Map(hewan.map((h) => [h.id, h]));
  const out: SnapshotHewan[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const h = byId.get(orderedIds[i]);
    if (!h) continue;
    out.push({ ...h, nomor_urut: i + 1 });
  }
  return out;
}
