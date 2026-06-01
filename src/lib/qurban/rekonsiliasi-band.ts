/**
 * Band nominal kandidat rekonsiliasi qurban (transaksi bank MASUK tanpa kode_bayar).
 * Hanya membatasi jalur CODE-LESS (smart-match Layer 2 + antrian). Layer 1 (kode_bayar
 * di deskripsi) TIDAK dibatasi band — transfer ber-kode tetap match berapa pun nominalnya.
 * Rasional harga produksi 1448H:
 *   - Pembelian hewan termurah (Kambing A / 1-slot Sapi A) = Rp 3.500.000  → floor < itu
 *   - Hewan utuh termahal (Sapi D, 7 slot) = Rp 35.000.000 (+suffix)       → ceiling > itu
 *   - Bawa Sendiri (jasa titip 250rb / 1,75jt) SENGAJA di bawah floor → tak diauto-antri
 *     (ditangani Layer 1 ber-kode, alur tunai, atau manual-link any di bawah).
 * Ubah dua angka ini bila harga bergeser di masa depan.
 */
export const QURBAN_RECON_BAND_MIN = 3_000_000;
export const QURBAN_RECON_BAND_MAX = 40_000_000;

/** True bila nominal berada di dalam band inklusif [MIN, MAX]. */
export function isWithinReconBand(jumlah: number): boolean {
  return jumlah >= QURBAN_RECON_BAND_MIN && jumlah <= QURBAN_RECON_BAND_MAX;
}
