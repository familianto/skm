/**
 * Pure auto-numbering + reorder-permutation logic for `qurban_daftar_hewan`
 * (F5a, H2 create + H5 reorder). No I/O — unit-testable in isolation.
 *
 * Numbering grup = semua baris dengan `(edisi_id, jenis, kelas)` sama, SEMUA
 * status dihitung (nomor stabil, tak pernah dipakai ulang).
 *
 * Invariant grup: semua BAWA_SENDIRI selalu di depan semua BELI. Saat insert
 * BAWA_SENDIRI, baris BELI dengan nomor ≥ slot baru digeser +1. Reorder (H5)
 * sengaja TIDAK menegakkan invariant ini — itu operasi manual.
 */

import type { TipePembelian } from './daftar-hewan-types';

export interface NumberingRow {
  id: string;
  tipe_pembelian: TipePembelian;
  nomor_urut: number;
}

export interface NumberingResult {
  /** `nomor_urut` untuk baris hewan baru. */
  nomor_urut_baru: number;
  /** Baris BELI yang harus digeser (id → nomor_urut baru). Kosong untuk BELI. */
  shifted: { id: string; nomor_urut: number }[];
}

/**
 * Hitung `nomor_urut` baris baru + daftar geseran, sesuai `tipe_pembelian`.
 *
 * - BELI         → max(seluruh grup) + 1; grup kosong → 1. Tanpa geseran.
 * - BAWA_SENDIRI → max(baris BAWA_SENDIRI) + 1; lalu geser tiap BELI dengan
 *                  `nomor_urut ≥ nomor baru` sebesar +1.
 */
export function computeAutoNumber(
  group: NumberingRow[],
  tipe: TipePembelian
): NumberingResult {
  if (tipe === 'BELI') {
    const max = group.reduce((m, r) => Math.max(m, r.nomor_urut), 0);
    return { nomor_urut_baru: max + 1, shifted: [] };
  }

  // BAWA_SENDIRI
  const maxBawa = group
    .filter((r) => r.tipe_pembelian === 'BAWA_SENDIRI')
    .reduce((m, r) => Math.max(m, r.nomor_urut), 0);
  const nomorBaru = maxBawa + 1;

  const shifted = group
    .filter((r) => r.tipe_pembelian === 'BELI' && r.nomor_urut >= nomorBaru)
    .map((r) => ({ id: r.id, nomor_urut: r.nomor_urut + 1 }));

  return { nomor_urut_baru: nomorBaru, shifted };
}

/**
 * `true` bila `got` adalah permutasi lengkap `expected` — set yang sama, tanpa
 * duplikat, panjang sama. Dipakai H5 reorder untuk menolak payload sebagian.
 */
export function isValidPermutation(expected: string[], got: string[]): boolean {
  if (expected.length !== got.length) return false;
  const seen = new Set<string>();
  for (const id of got) {
    if (seen.has(id)) return false; // duplikat
    seen.add(id);
  }
  const expectedSet = new Set(expected);
  if (expectedSet.size !== expected.length) return false; // pengaman: expected sendiri unik
  for (const id of got) {
    if (!expectedSet.has(id)) return false; // ada yang nyasar
  }
  return seen.size === expectedSet.size;
}
