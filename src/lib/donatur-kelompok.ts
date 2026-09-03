import { DonaturKelompok } from '@/types';
import type { Donatur } from '@/types';

/**
 * Kelompok donatur (kolom E sheet `donatur`) — sumber opsi filter.
 *
 * Nilai kolom ini TIDAK selalu `TETAP`/`INSIDENTAL`: masjid yang mengimpor data
 * sendiri memakai kode kelompoknya (mis. `1`, `2`, `5`). Karena itu opsi dropdown
 * filter DITURUNKAN dari data yang benar-benar ada di sheet, bukan dari daftar
 * statis, sehingga filter tetap berguna apa pun konvensi kelompok yang dipakai.
 */
export interface KelompokOption {
  /** Nilai untuk dibandingkan dengan `donatur.kelompok` (sudah dinormalisasi). */
  value: string;
  /** Teks yang ditampilkan di dropdown. */
  label: string;
}

/** Bentuk banding kanonik: string ter-trim (kosong = tanpa kelompok). */
export function normalizeKelompok(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

const LEGACY_LABELS: Record<string, string> = {
  [DonaturKelompok.TETAP]: 'Tetap',
  [DonaturKelompok.INSIDENTAL]: 'Insidental',
};

/**
 * Label tampilan: dua nilai legacy dimanusiakan, nilai lain (kode kelompok milik
 * masjid) ditampilkan APA ADANYA agar cocok dengan badge di daftar donatur.
 */
export function kelompokLabel(value: string): string {
  const v = normalizeKelompok(value);
  return LEGACY_LABELS[v] ?? v;
}

const isNumeric = (v: string) => /^\d+$/.test(v);

/**
 * Daftar kelompok unik dari data donatur, siap dipakai sebagai opsi dropdown.
 *
 * - Nilai kosong dibuang (donatur tanpa kelompok hanya muncul di opsi "Semua").
 * - Duplikat dibuang setelah trim; nilai numerik diurut menaik secara numerik
 *   (2 sebelum 10), lalu nilai non-numerik diurut alfabetis.
 * - Opsi "Semua" TIDAK termasuk di sini — itu urusan komponen pemanggil.
 */
export function kelompokOptions(donaturs: readonly Pick<Donatur, 'kelompok'>[]): KelompokOption[] {
  const seen = new Set<string>();
  for (const d of donaturs) {
    const v = normalizeKelompok(d.kelompok);
    if (v) seen.add(v);
  }
  return [...seen]
    .sort((a, b) => {
      if (isNumeric(a) && isNumeric(b)) return Number(a) - Number(b);
      if (isNumeric(a)) return -1;
      if (isNumeric(b)) return 1;
      return a.localeCompare(b, 'id');
    })
    .map((value) => ({ value, label: kelompokLabel(value) }));
}
