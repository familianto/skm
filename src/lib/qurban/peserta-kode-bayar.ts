import { formatKodeBayar } from './id-generator';
import { listPesertaByEdisi } from './peserta-repo';
import type { Edisi } from './edisi-repo';

/**
 * Urutan `kode_bayar` per edisi (B3.3) — `QRB-{tahun}-{NNN}`.
 *
 * Nomor berikutnya = (urutan tertinggi yang sudah ada di edisi) + 1, MENGHITUNG
 * semua peserta lintas status (termasuk BATAL) — sehingga peserta batal tidak
 * pernah membebaskan kembali kode-nya. `tahun` Hijriah diambil dari
 * `edisi.tahun_hijriah` (digit-run pertama, mis. "1448 H" → "1448"). Format
 * akhir lewat `formatKodeBayar`.
 */

/** Ambil nomor urut (NNN) dari sebuah kode_bayar, atau null kalau tak terbaca. */
export function parseKodeBayarSuffix(kode: string): number | null {
  const m = /-(\d+)\s*$/.exec(kode ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Nomor urut berikutnya = max(suffix) + 1; default 1 kalau belum ada. */
export function nextKodeBayarNumber(existingKodes: string[]): number {
  let max = 0;
  for (const kode of existingKodes) {
    const n = parseKodeBayarSuffix(kode);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

/** Tahun Hijriah dari edisi: digit-run pertama dari `tahun_hijriah`. */
export function resolveTahunHijriah(edisi: Edisi): string {
  const m = /\d+/.exec(edisi.tahun_hijriah ?? '');
  return m ? m[0] : (edisi.tahun_hijriah ?? '').trim();
}

/** `count` kode_bayar berurutan untuk edisi, mulai dari nomor berikutnya. */
export async function nextKodeBayarSequence(
  edisi: Edisi,
  count: number
): Promise<string[]> {
  if (count <= 0) return [];
  const existing = await listPesertaByEdisi(edisi.id);
  const start = nextKodeBayarNumber(existing.map((p) => p.kode_bayar));
  const tahun = resolveTahunHijriah(edisi);
  return Array.from({ length: count }, (_, i) => formatKodeBayar(tahun, start + i));
}
