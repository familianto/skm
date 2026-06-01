import type { Pembayaran } from './pembayaran-repo';

/**
 * Engine rekonsiliasi TRANSFER (F6 M-C / C2).
 *
 * `kode_bayar` (`QRB-{tahun}-{NNN}`) unik per edisi & per pendaftaran, ditulis
 * muqorib di berita transfer → tersimpan di `transaksi.deskripsi`. Klasifikasi
 * deterministik berbasis kode di sini; smart-scoring tanpa-kode (Layer 2) ada di
 * `rekonsiliasi-scoring.ts`. Pure & fully testable.
 *
 * C2 (Q3 — perluasan kriteria auto): auto-apply bila kode cocok DAN
 * `jumlah ∈ { nominal_total, nominal_transfer }` (mencakup kasus "lupa suffix" →
 * bayar nominal bulat). Selisih nominal lain → `suggestion_high` (kode otoritatif
 * tapi nominal janggal → konfirmasi manusia via PY6), BUKAN auto.
 */

const KODE_BAYAR_RE = /QRB-\d{4}-\d{3}/;

/** Ekstrak `kode_bayar` pertama dari teks (deskripsi/berita), atau null. */
export function extractKodeBayar(deskripsi: string): string | null {
  if (!deskripsi) return null;
  const m = KODE_BAYAR_RE.exec(deskripsi);
  return m ? m[0] : null;
}

/** Subset transaksi yang dibutuhkan engine (sejajar `TransaksiLite`). */
export interface TransaksiForMatch {
  deskripsi: string;
  jumlah: number;
}

export type ClassifyResult =
  /** Kode cocok + jumlah ∈ {nominal_total, nominal_transfer} → auto-apply. */
  | { kind: 'auto'; kode_bayar: string; pembayaran: Pembayaran; via_nominal: 'total' | 'transfer' }
  /** Kode cocok TRANSFER+BELUM_BAYAR tapi nominal di luar himpunan → suggest high. */
  | { kind: 'suggestion_high'; kode_bayar: string; pembayaran: Pembayaran; reason: string; selisih: number }
  /** Kode ketemu pembayaran yang sudah LUNAS / metode TUNAI → anomali. */
  | { kind: 'anomali'; kode_bayar: string; alasan: string; pembayaran: Pembayaran }
  /** Tanpa kode, atau kode tak punya pembayaran di edisi → bahan Layer 2. */
  | { kind: 'unmatched'; kode_bayar: string | null };

/**
 * Klasifikasi satu transaksi terhadap indeks pembayaran by `kode_bayar`
 * (seluruh pembayaran edisi — kode unik → maks 1 per kode).
 */
export function classifyTransaksi(
  transaksi: TransaksiForMatch,
  pembayaranByKode: Map<string, Pembayaran>
): ClassifyResult {
  const kode = extractKodeBayar(transaksi.deskripsi);
  if (!kode) return { kind: 'unmatched', kode_bayar: null };

  const pembayaran = pembayaranByKode.get(kode);
  if (!pembayaran) return { kind: 'unmatched', kode_bayar: kode };

  if (pembayaran.metode !== 'TRANSFER') {
    return { kind: 'anomali', kode_bayar: kode, alasan: `pembayaran metode ${pembayaran.metode}, bukan TRANSFER`, pembayaran };
  }
  if (pembayaran.status !== 'BELUM_BAYAR') {
    return { kind: 'anomali', kode_bayar: kode, alasan: `pembayaran sudah berstatus ${pembayaran.status}`, pembayaran };
  }

  // Q3: auto bila jumlah cocok salah satu nominal (total = lupa suffix).
  if (transaksi.jumlah === pembayaran.nominal_transfer) {
    return { kind: 'auto', kode_bayar: kode, pembayaran, via_nominal: 'transfer' };
  }
  if (transaksi.jumlah === pembayaran.nominal_total) {
    return { kind: 'auto', kode_bayar: kode, pembayaran, via_nominal: 'total' };
  }

  // Kode otoritatif tapi nominal janggal → suggestion confidence tinggi.
  const selisih = transaksi.jumlah - pembayaran.nominal_transfer;
  return {
    kind: 'suggestion_high',
    kode_bayar: kode,
    pembayaran,
    reason: `kode cocok tapi nominal ${transaksi.jumlah} ≠ {total ${pembayaran.nominal_total}, transfer ${pembayaran.nominal_transfer}}`,
    selisih,
  };
}

/** Bangun indeks `kode_bayar → pembayaran` (kode unik per edisi). */
export function indexPembayaranByKode(list: Pembayaran[]): Map<string, Pembayaran> {
  const m = new Map<string, Pembayaran>();
  for (const p of list) if (p.kode_bayar) m.set(p.kode_bayar, p);
  return m;
}
