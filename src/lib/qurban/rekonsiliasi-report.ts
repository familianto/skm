import { listPembayaranByEdisi, type Pembayaran } from './pembayaran-repo';
import { listPesertaByEdisi, STATUS_TERDAFTAR } from './peserta-repo';
import { listAllMuqorib } from './muqorib-repo';
import {
  resolveRekeningByNama,
  listTransaksiMasukByRekening,
  REKENING_BANK_MUAMALAT,
  type TransaksiLite,
} from './skm-bridge';
import { classifyTransaksi, indexPembayaranByKode, type ClassifyResult } from './rekonsiliasi-engine';
import { rankKandidat, type KandidatKonteks, type ScoredKandidat } from './rekonsiliasi-scoring';
import { isWithinReconBand } from './rekonsiliasi-band';

/**
 * Pengumpul data + klasifikasi bersama untuk PY5 (apply) & PY7 (queue read-only).
 * Membaca transaksi Bank Muamalat MASUK/AKTIF yang belum ter-link, lalu
 * mengklasifikasi (engine) + skor Layer 2 (scoring) tanpa menulis apa pun.
 */

export interface SuggestionEntry {
  transaksi: { id: string; jumlah: number; deskripsi: string; tanggal: string };
  kandidat: ScoredKandidat[];
}
export interface AnomaliEntry {
  transaksi_id: string;
  kode_bayar: string;
  alasan: string;
}
export interface UnmatchedEntry {
  transaksi_id: string;
  jumlah: number;
  deskripsi: string;
  tanggal: string;
}

export interface RekonInput {
  edisiId: string;
  payment_suffix: number;
}

export interface RekonContext {
  rekeningId: string;
  /** Transaksi kandidat (belum ter-link) + hasil klasifikasi engine. */
  classified: Array<{ transaksi: TransaksiLite; result: ClassifyResult }>;
  /** Konteks kandidat Layer 2 (pembayaran TRANSFER+BELUM_BAYAR + muqorib + tgl daftar). */
  scoringKandidat: KandidatKonteks[];
  pembayaranEdisi: Pembayaran[];
}

/** Baca + klasifikasi (tanpa apply). Dipakai PY5 & PY7. */
export async function buildRekonContext(input: RekonInput): Promise<RekonContext> {
  const rekeningId = await resolveRekeningByNama(REKENING_BANK_MUAMALAT);

  const pembayaranEdisi = await listPembayaranByEdisi(input.edisiId);
  const linked = new Set(pembayaranEdisi.map((p) => p.skm_transaksi_id).filter(Boolean));
  const kodeIndex = indexPembayaranByKode(pembayaranEdisi);

  const kandidatTrx = (await listTransaksiMasukByRekening(rekeningId)).filter((t) => !linked.has(t.id));

  // Konteks Layer 2: pembayaran TRANSFER+BELUM_BAYAR + nama/no_hp muqorib +
  // tanggal_daftar paling awal di antara slot kode_bayar.
  const muqoribById = new Map((await listAllMuqorib()).map((m) => [m.id, m]));
  const earliestDaftar = new Map<string, string>();
  for (const p of await listPesertaByEdisi(input.edisiId)) {
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    const cur = earliestDaftar.get(p.kode_bayar);
    if (!cur || (p.tanggal_daftar && p.tanggal_daftar < cur)) earliestDaftar.set(p.kode_bayar, p.tanggal_daftar);
  }
  const scoringKandidat: KandidatKonteks[] = pembayaranEdisi
    .filter((p) => p.metode === 'TRANSFER' && p.status === 'BELUM_BAYAR')
    .map((p) => {
      const m = muqoribById.get(p.muqorib_id);
      return {
        pembayaran: p,
        muqorib_nama: m?.nama_lengkap ?? '',
        muqorib_no_hp: m?.no_hp ?? '',
        tanggal_daftar: earliestDaftar.get(p.kode_bayar) ?? '',
      };
    });

  const classified = kandidatTrx.map((t) => ({ transaksi: t, result: classifyTransaksi(t, kodeIndex) }));
  return { rekeningId, classified, scoringKandidat, pembayaranEdisi };
}

/**
 * Bangun bagian `suggestions` (kode-off high + scored Layer 2), `anomali`,
 * `unmatched` dari konteks. AUTO_MATCH TIDAK termasuk di sini (di-apply caller).
 */
export function buildSuggestionBuckets(
  ctx: RekonContext,
  opts: { payment_suffix: number }
): { suggestions: SuggestionEntry[]; anomali: AnomaliEntry[]; unmatched: UnmatchedEntry[] } {
  const suggestions: SuggestionEntry[] = [];
  const anomali: AnomaliEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  const muqoribNamaByPembayaranId = new Map(ctx.scoringKandidat.map((k) => [k.pembayaran.id, k.muqorib_nama]));

  for (const { transaksi: t, result: c } of ctx.classified) {
    if (c.kind === 'auto') continue; // di-apply caller (PY5); PY7 abaikan.

    if (c.kind === 'suggestion_high') {
      suggestions.push({
        transaksi: { id: t.id, jumlah: t.jumlah, deskripsi: t.deskripsi, tanggal: t.tanggal },
        kandidat: [
          {
            pembayaran_id: c.pembayaran.id,
            kode_bayar: c.kode_bayar,
            muqorib_nama: muqoribNamaByPembayaranId.get(c.pembayaran.id) ?? '',
            score: 100,
            sinyal: [{ key: 'keyword', poin: 0, detail: 'kode_bayar cocok (otoritatif)' }],
            reason: c.reason,
          },
        ],
      });
      continue;
    }

    if (c.kind === 'anomali') {
      anomali.push({ transaksi_id: t.id, kode_bayar: c.kode_bayar, alasan: c.alasan });
      continue;
    }

    // CODE-LESS (engine 'unmatched' → tanpa kode_bayar di deskripsi). Band-filter:
    // hanya nominal dalam [MIN, MAX] yang diauto-antri (saran/unmatched). Di luar
    // band SENGAJA tak diantri otomatis — ditangani lewat Taut Manual (PY6) yang
    // pencariannya tak dibatasi band. Layer 1 (kode_bayar) sudah lewat di atas.
    if (!isWithinReconBand(t.jumlah)) continue;

    // unmatched dari engine → coba skor Layer 2.
    const ranked = rankKandidat(
      { deskripsi: t.deskripsi, jumlah: t.jumlah, tanggal: t.tanggal },
      ctx.scoringKandidat,
      { payment_suffix: opts.payment_suffix }
    );
    if (ranked.length > 0) {
      suggestions.push({
        transaksi: { id: t.id, jumlah: t.jumlah, deskripsi: t.deskripsi, tanggal: t.tanggal },
        kandidat: ranked,
      });
    } else {
      unmatched.push({ transaksi_id: t.id, jumlah: t.jumlah, deskripsi: t.deskripsi, tanggal: t.tanggal });
    }
  }

  return { suggestions, anomali, unmatched };
}
