import type { QurbanPeserta } from './peserta-types';

/**
 * Bagian hewan — opsi terstruktur untuk `keterangan_bagian` (polish pendaftaran).
 *
 * Storage TETAP string comma-separated (kompatibel data historis & format sheet);
 * modul ini hanya menstrukturkan UI menjadi checklist + field "Lainnya", lalu
 * menyediakan konversi dua arah string ⇄ {selected, lainnya} agar dipakai
 * bersama oleh form panitia (PS2/PS4) dan wizard publik (PB3) tanpa duplikasi.
 *
 * Urutan `BAGIAN_OPTIONS` adalah urutan KANONIK: `composeBagian` merangkai opsi
 * tercentang mengikuti urutan ini, dan UI menampilkannya dalam urutan yang sama.
 * (Contoh kontrak ada di docstring `composeBagian`.)
 */
export const BAGIAN_OPTIONS = [
  'Daging',
  'Paha',
  'Tulang Iga',
  'Kaki',
  'Hati',
  'Kepala',
  'Buntut',
  'Jeroan',
] as const;

export type BagianOption = (typeof BAGIAN_OPTIONS)[number];

export interface BagianParts {
  /** Opsi standar tercentang, bentuk kanonik, urut `BAGIAN_OPTIONS`. */
  selected: string[];
  /** Sisa free-text (tidak cocok daftar standar), comma-separated. */
  lainnya: string;
}

/** Pecah string comma-separated → token bersih (trim, buang kosong). */
function splitParts(value: string): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Rangkai pilihan checklist + "Lainnya" menjadi satu string comma-separated
 * (bentuk simpanan `keterangan_bagian`).
 *
 * - `selected` diurutkan mengikuti `BAGIAN_OPTIONS` (kanonik), di-dedupe
 *   case-insensitive, dan hanya yang benar-benar ada di daftar standar ikut.
 * - `lainnya` boleh memuat beberapa item dipisah koma; di-trim, dibuang yang
 *   kosong, lalu ditempel SETELAH opsi standar.
 *
 * Contoh:
 *   composeBagian(['Hati', 'Daging'], '')           → 'Daging, Hati'
 *   composeBagian(['Daging','Kepala','Buntut'], '')  → 'Daging, Kepala, Buntut'
 *   composeBagian(['Paha'], 'Kulit')                 → 'Paha, Kulit'
 *   composeBagian([], '')                            → ''
 */
export function composeBagian(selected: readonly string[], lainnya: string): string {
  const wanted = new Set(selected.map((s) => s.trim().toLowerCase()));
  const canonical = BAGIAN_OPTIONS.filter((o) => wanted.has(o.toLowerCase()));
  const extras = splitParts(lainnya);
  return [...canonical, ...extras].join(', ');
}

/**
 * Pecah string `keterangan_bagian` menjadi {selected, lainnya}. Token yang cocok
 * (case-insensitive + trim) dengan daftar standar → `selected` (bentuk kanonik);
 * sisanya digabung ke `lainnya` (mempertahankan urutan kemunculan asli).
 *
 * Form hanya MENAMPILKAN apa yang ada — TIDAK membersihkan data historis. Mis.
 * 'Paha Kambing, Hati' → { selected: ['Hati'], lainnya: 'Paha Kambing' }.
 */
export function parseBagian(value: string): BagianParts {
  const byLower = new Map<string, string>(BAGIAN_OPTIONS.map((o) => [o.toLowerCase(), o]));
  const matched = new Set<string>();
  const extras: string[] = [];
  for (const tok of splitParts(value)) {
    const canon = byLower.get(tok.toLowerCase());
    if (canon) matched.add(canon);
    else extras.push(tok);
  }
  return {
    selected: BAGIAN_OPTIONS.filter((o) => matched.has(o)),
    lainnya: extras.join(', '),
  };
}

// Type-only reference to keep this module aligned with the storage field; the
// import is erased at build time (no runtime/server dependency pulled in).
export type KeteranganBagian = QurbanPeserta['keterangan_bagian'];
