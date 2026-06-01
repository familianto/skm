import { jaroWinkler } from './jaro-winkler';
import { normalizePhone } from '@/lib/api/phone';
import type { Pembayaran } from './pembayaran-repo';

/**
 * Smart-scoring Layer 2 (F6 C2) — peringkat kandidat untuk transfer TANPA kode
 * (atau kode tak ditemukan). Pure & teruji. Tidak menulis apa pun; output dipakai
 * PY5/PY7 sebagai `suggestions` yang dikonfirmasi BD lewat PY6.
 *
 * Bobot (dari arsitektur F6; suffix configurable per-edisi, JANGAN hardcode 3):
 *   suffix nominal            +30  (jumlah mod 1000 === payment_suffix)
 *   keyword QRB/QURBAN/KURBAN  +30
 *   nominal cocok (±1%)        +25  (vs nominal_total / nominal_transfer)
 *   tanggal ≤ 14 hari          +15  (sejak tanggal_daftar kandidat)
 *   fuzzy nama (JW ≥ 0.8)      +20
 *   phone match                +10  (deskripsi memuat no_hp muqorib)
 *
 * Ambang suggest: skor ≥ 50. Output di-rank descending.
 */

export const SUGGEST_THRESHOLD = 50;
const JW_NAME_THRESHOLD = 0.8;
const NOMINAL_TOLERANCE = 0.01; // ±1%
const DATE_WINDOW_DAYS = 14;

export const SCORE_WEIGHTS = {
  suffix: 30,
  keyword: 30,
  nominal: 25,
  tanggal: 15,
  nama: 20,
  phone: 10,
} as const;

const KEYWORD_RE = /\bQRB\b|\bQURBAN\b|\bKURBAN\b/i;

/** Konteks per-kandidat yang dibutuhkan skorer (diturunkan dari peserta/muqorib). */
export interface KandidatKonteks {
  pembayaran: Pembayaran;
  muqorib_nama: string;
  muqorib_no_hp: string;
  /** ISO-8601 Z; tanggal_daftar paling awal di antara slot kode_bayar ini. */
  tanggal_daftar: string;
}

export interface TransaksiForScore {
  deskripsi: string;
  jumlah: number;
  /** YYYY-MM-DD (atau ISO) — tanggal transaksi bank. */
  tanggal: string;
}

export interface Sinyal {
  key: keyof typeof SCORE_WEIGHTS;
  poin: number;
  detail: string;
}

export interface ScoredKandidat {
  pembayaran_id: string;
  kode_bayar: string;
  muqorib_nama: string;
  score: number;
  sinyal: Sinyal[];
  reason: string;
}

/**
 * Ekstrak token "kandidat nama" dari berita bank: buang token kode (QRB-…),
 * angka, dan keyword qurban; sisanya jadi token alfabetik untuk fuzzy match.
 */
export function extractNameTokens(deskripsi: string): string[] {
  return deskripsi
    .replace(/QRB-\d{4}-\d{3}/gi, ' ')
    .split(/[^A-Za-z]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && !/^(qrb|qurban|kurban|trf|transfer|biaya|an|bin|binti)$/i.test(t));
}

/** Skor fuzzy nama: JW terbaik antar token nama-kandidat × token berita. */
export function bestNameSimilarity(deskripsi: string, nama: string): number {
  const beritaTokens = extractNameTokens(deskripsi);
  const namaTokens = nama
    .split(/[^A-Za-z]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
  if (beritaTokens.length === 0 || namaTokens.length === 0) return 0;

  let best = 0;
  for (const bt of beritaTokens) {
    for (const nt of namaTokens) {
      const s = jaroWinkler(bt, nt);
      if (s > best) best = s;
    }
  }
  return best;
}

function daysBetween(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso.slice(0, 10));
  const b = Date.parse(bIso.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(a - b) / 86_400_000;
}

function nominalWithinTolerance(jumlah: number, target: number): boolean {
  if (target <= 0) return false;
  return Math.abs(jumlah - target) <= target * NOMINAL_TOLERANCE;
}

/**
 * Skor satu transaksi terhadap satu kandidat pembayaran. `paymentSuffix`
 * configurable (per-edisi). Mengembalikan skor + rincian sinyal.
 */
export function scoreTransaksi(
  transaksi: TransaksiForScore,
  kandidat: KandidatKonteks,
  opts: { payment_suffix: number }
): { score: number; sinyal: Sinyal[] } {
  const sinyal: Sinyal[] = [];

  // 1. Suffix nominal.
  if (transaksi.jumlah % 1000 === opts.payment_suffix) {
    sinyal.push({ key: 'suffix', poin: SCORE_WEIGHTS.suffix, detail: `digit suffix ${opts.payment_suffix}` });
  }

  // 2. Keyword qurban.
  if (KEYWORD_RE.test(transaksi.deskripsi)) {
    sinyal.push({ key: 'keyword', poin: SCORE_WEIGHTS.keyword, detail: 'keyword QRB/QURBAN/KURBAN' });
  }

  // 3. Nominal cocok (±1%) vs total atau transfer.
  if (
    nominalWithinTolerance(transaksi.jumlah, kandidat.pembayaran.nominal_total) ||
    nominalWithinTolerance(transaksi.jumlah, kandidat.pembayaran.nominal_transfer)
  ) {
    sinyal.push({ key: 'nominal', poin: SCORE_WEIGHTS.nominal, detail: 'nominal cocok ±1%' });
  }

  // 4. Tanggal ≤ 14 hari sejak tanggal_daftar.
  const dd = kandidat.tanggal_daftar ? daysBetween(transaksi.tanggal, kandidat.tanggal_daftar) : null;
  if (dd !== null && dd <= DATE_WINDOW_DAYS) {
    sinyal.push({ key: 'tanggal', poin: SCORE_WEIGHTS.tanggal, detail: `${Math.round(dd)} hari dari pendaftaran` });
  }

  // 5. Fuzzy nama (JW ≥ 0.8).
  const nameSim = bestNameSimilarity(transaksi.deskripsi, kandidat.muqorib_nama);
  if (nameSim >= JW_NAME_THRESHOLD) {
    sinyal.push({ key: 'nama', poin: SCORE_WEIGHTS.nama, detail: `nama mirip (JW ${nameSim.toFixed(2)})` });
  }

  // 6. Phone match (no_hp ter-normalisasi muncul di berita).
  if (kandidat.muqorib_no_hp) {
    const beritaPhone = normalizePhone(transaksi.deskripsi);
    const hp = normalizePhone(kandidat.muqorib_no_hp);
    if (hp && beritaPhone.includes(hp)) {
      sinyal.push({ key: 'phone', poin: SCORE_WEIGHTS.phone, detail: 'no_hp cocok' });
    }
  }

  const score = sinyal.reduce((s, x) => s + x.poin, 0);
  return { score, sinyal };
}

/**
 * Peringkat semua kandidat untuk satu transaksi; kembalikan yang ≥ ambang,
 * descending. `reason` ringkas dari sinyal teratas.
 */
export function rankKandidat(
  transaksi: TransaksiForScore,
  kandidatList: KandidatKonteks[],
  opts: { payment_suffix: number }
): ScoredKandidat[] {
  const out: ScoredKandidat[] = [];
  for (const k of kandidatList) {
    const { score, sinyal } = scoreTransaksi(transaksi, k, opts);
    if (score >= SUGGEST_THRESHOLD) {
      out.push({
        pembayaran_id: k.pembayaran.id,
        kode_bayar: k.pembayaran.kode_bayar,
        muqorib_nama: k.muqorib_nama,
        score,
        sinyal,
        reason: sinyal.map((s) => s.detail).join('; '),
      });
    }
  }
  out.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.pembayaran_id < b.pembayaran_id ? -1 : 1));
  return out;
}
