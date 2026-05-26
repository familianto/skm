/**
 * Nominal-transfer-ber-suffix helper (F4b).
 *
 * The transfer amount a peserta is asked to send = `harga_disepakati` plus a
 * small per-edisi `payment_suffix` (e.g. suffix `4` → `Rp 1.500.004`). For a
 * round price the last digit of the nominal therefore equals the suffix.
 *
 * IMPORTANT: the suffix is only a categorization signal that lets the panitia
 * recognise qurban transfers in the bank statement. It is NOT a participant
 * matching key — a peserta is matched to a transfer via the `kode_bayar`
 * written in the transfer berita/note, not via this suffix.
 *
 * `payment_suffix` is per-edisi, set by the panitia in Konfigurasi Edisi and
 * read via `findKonfigurasiByEdisiId` (`@/lib/qurban/konfigurasi-repo`); it is
 * stored as a number there but tolerated here as a string for robustness.
 * Milestone A ships only this pure function — reading the config and formatting
 * the result via `formatRupiah` for the WA template is wired in Milestone B/C.
 */
export function computeNominalTransfer(
  harga_disepakati: number,
  payment_suffix: number | string
): number {
  const suffix =
    typeof payment_suffix === 'number'
      ? payment_suffix
      : parseInt(String(payment_suffix), 10);
  const safeSuffix = Number.isFinite(suffix) ? suffix : 0;
  return harga_disepakati + safeSuffix;
}
