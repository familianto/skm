import type { Pembayaran } from './pembayaran-repo';

/**
 * Engine rekonsiliasi TRANSFER (F6 M-C, Layer 1 — deterministik).
 *
 * `kode_bayar` (`QRB-{tahun}-{NNN}`) unik per edisi & per pendaftaran, ditulis
 * muqorib di berita transfer → tersimpan di `transaksi.deskripsi`. Cocok tepat
 * satu pembayaran TRANSFER + nominal pas = match 1:1. Pure & fully testable.
 *
 * Layer 2 (smart-scoring) & Layer 3 (antrian) = Milestone C2.
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
  | { kind: 'auto'; kode_bayar: string; pembayaran: Pembayaran }
  | { kind: 'anomali'; kode_bayar: string; alasan: string; pembayaran: Pembayaran }
  | { kind: 'unmatched'; kode_bayar: string | null };

/**
 * Klasifikasi satu transaksi terhadap indeks pembayaran by `kode_bayar`
 * (seluruh pembayaran edisi — kode unik → maks 1 per kode).
 *
 *  - **auto:** kode ada, pembayaran TRANSFER + BELUM_BAYAR + nominal == nominal_transfer.
 *  - **anomali:** kode ketemu pembayaran tapi metode≠TRANSFER / status≠BELUM_BAYAR /
 *    nominal beda (jangan auto-apply; sertakan alasan).
 *  - **unmatched:** tanpa kode, atau kode tak punya pembayaran di edisi ini.
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
  if (transaksi.jumlah !== pembayaran.nominal_transfer) {
    return {
      kind: 'anomali',
      kode_bayar: kode,
      alasan: `nominal transaksi ${transaksi.jumlah} ≠ nominal_transfer ${pembayaran.nominal_transfer}`,
      pembayaran,
    };
  }
  return { kind: 'auto', kode_bayar: kode, pembayaran };
}

/** Bangun indeks `kode_bayar → pembayaran` (kode unik per edisi). */
export function indexPembayaranByKode(list: Pembayaran[]): Map<string, Pembayaran> {
  const m = new Map<string, Pembayaran>();
  for (const p of list) if (p.kode_bayar) m.set(p.kode_bayar, p);
  return m;
}
