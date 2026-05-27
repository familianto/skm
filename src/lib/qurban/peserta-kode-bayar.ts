import { formatKodeBayar } from './id-generator';
import { listPesertaByEdisi } from './peserta-repo';
import type { Edisi } from './edisi-repo';

/**
 * Urutan `kode_bayar` per edisi — `QRB-{tahun}-{NNN}`.
 *
 * **Model F4c-C: satu pendaftaran = satu `kode_bayar`.** Satu pendaftaran
 * multi-slot (mis. 1 sapi 7-slot oleh satu muqorib) menghasilkan SATU kode yang
 * dibagi semua barisnya — `kode_bayar` berfungsi sebagai kunci-grup
 * pendaftaran/pembayaran. Nomor `NNN` bertambah satu per PENDAFTARAN, bukan per
 * slot, sehingga banyak baris yang berbagi kode tidak menggelembungkan counter
 * (kita ambil max suffix, bukan jumlah baris).
 *
 * Nomor berikutnya = (urutan tertinggi yang sudah ada di edisi) + 1, MENGHITUNG
 * semua peserta lintas status (termasuk BATAL) — sehingga peserta batal tidak
 * pernah membebaskan kembali kode-nya. `tahun` Hijriah diambil dari
 * `edisi.tahun_hijriah` (digit-run pertama, mis. "1448 H" → "1448"). Format
 * akhir lewat `formatKodeBayar`. Dipakai bersama PS2 (panitia) & PB3 (publik).
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

/**
 * SATU `kode_bayar` untuk satu pendaftaran (dipakai oleh semua barisnya). Nomor
 * berikutnya diturunkan dari max suffix kode yang sudah ada di edisi, +1.
 */
export async function nextKodeBayar(edisi: Edisi): Promise<string> {
  const existing = await listPesertaByEdisi(edisi.id);
  const next = nextKodeBayarNumber(existing.map((p) => p.kode_bayar));
  return formatKodeBayar(resolveTahunHijriah(edisi), next);
}
