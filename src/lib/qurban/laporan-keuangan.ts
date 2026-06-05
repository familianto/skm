import type { Edisi } from './edisi-repo';
import type { QurbanPeserta } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import type { Pembayaran } from './pembayaran-repo';
import { buildLaporanHewan } from './laporan-hewan';

/**
 * LP4 — agregasi read-only Laporan Keuangan (F8 Milestone D).
 *
 * Modul PUR (tanpa I/O), sejajar `laporan-hewan.ts`: route handler
 * `GET /api/qurban/laporan/keuangan` membaca sheet (pembayaran/peserta/
 * daftar_hewan) lalu memanggil `buildLaporanKeuangan(...)`. Dipisah dari I/O
 * agar diuji fixture & dipakai ulang Export (LP6) nanti.
 *
 * DUA-MODE (arsip/live). Data 1447H = arsip: semua pembayaran `IMPORT_1447H`,
 * `skm_transaksi_id` kosong → korelasi ledger = **N/A** (BUKAN selisih/alarm).
 * Biaya pengadaan REUSE `buildLaporanHewan` (LP2) — tidak duplikasi logika harga.
 */

const STATUS_TERDAFTAR = 'TERDAFTAR';
const STATUS_LUNAS = 'LUNAS';

export type KategoriDanaKey = 'QURBAN_SAPI' | 'QURBAN_KAMBING' | 'JASA_TITIP';

export interface KategoriDana {
  key: KategoriDanaKey;
  label: string;
  peserta: number;
  nominal: number;
}

export interface DanaTerhimpun {
  total: number;
  jumlah_pembayaran_lunas: number;
  per_kategori: KategoriDana[];
  nilai_pendaftaran: number;
}

export interface BiayaPengadaanRingkas {
  total: number;
  sapi: number;
  kambing: number;
  hewan_beli_tanpa_harga: number;
}

export interface KorelasiLedger {
  mode: 'arsip' | 'live';
  pembayaran_total: number;
  pembayaran_tertaut: number;
  status: string;
}

export interface LaporanKeuanganDTO {
  edisi: { id: string; nama: string; is_arsip: boolean };
  mode: 'arsip' | 'live';
  dana_terhimpun: DanaTerhimpun;
  biaya_pengadaan: BiayaPengadaanRingkas;
  saldo_qurban: number;
  korelasi_ledger: KorelasiLedger;
}

const KATEGORI_LABEL: Record<KategoriDanaKey, string> = {
  QURBAN_SAPI: 'Qurban Sapi',
  QURBAN_KAMBING: 'Qurban Kambing',
  JASA_TITIP: 'Jasa Titip & Pakan',
};

/** Klasifikasi satu peserta TERDAFTAR ke kategori dana (null bila BELI tanpa hewan). */
function classify(
  p: QurbanPeserta,
  hewanById: Map<string, QurbanDaftarHewan>
): KategoriDanaKey | null {
  if (p.tipe_qurban === 'BAWA_SENDIRI') return 'JASA_TITIP';
  // BELI → bergantung jenis hewan.
  const h = hewanById.get(p.hewan_id);
  if (h?.jenis === 'SAPI') return 'QURBAN_SAPI';
  if (h?.jenis === 'KAMBING') return 'QURBAN_KAMBING';
  return null; // BELI tanpa hewan ter-resolve (langka; 0 di produksi 1447H).
}

interface BuildInput {
  edisi: Pick<Edisi, 'id' | 'tahun_hijriah'>;
  isArsip: boolean;
  pembayaran: Pembayaran[];
  peserta: QurbanPeserta[];
  hewan: QurbanDaftarHewan[];
}

export function buildLaporanKeuangan(input: BuildInput): LaporanKeuanganDTO {
  const { edisi, isArsip, pembayaran, peserta, hewan } = input;

  // ── Dana Terhimpun ───────────────────────────────────────────────────────
  const lunas = pembayaran.filter((p) => p.status === STATUS_LUNAS);
  const total = lunas.reduce((s, p) => s + safeNum(p.nominal_total), 0);

  const terdaftar = peserta.filter((p) => p.status_pendaftaran === STATUS_TERDAFTAR);
  const hewanById = new Map(hewan.map((h) => [h.id, h]));

  // Selalu emit 3 kategori (urut stabil) walau 0 — UI konsisten.
  const acc: Record<KategoriDanaKey, { peserta: number; nominal: number }> = {
    QURBAN_SAPI: { peserta: 0, nominal: 0 },
    QURBAN_KAMBING: { peserta: 0, nominal: 0 },
    JASA_TITIP: { peserta: 0, nominal: 0 },
  };
  let nilaiPendaftaran = 0;
  for (const p of terdaftar) {
    const harga = safeNum(p.harga_disepakati);
    nilaiPendaftaran += harga;
    const key = classify(p, hewanById);
    if (key) {
      acc[key].peserta += 1;
      acc[key].nominal += harga;
    }
  }
  const per_kategori: KategoriDana[] = (
    ['QURBAN_SAPI', 'QURBAN_KAMBING', 'JASA_TITIP'] as KategoriDanaKey[]
  ).map((key) => ({
    key,
    label: KATEGORI_LABEL[key],
    peserta: acc[key].peserta,
    nominal: acc[key].nominal,
  }));

  // ── Biaya Pengadaan (reuse LP2) ──────────────────────────────────────────
  const hewanReport = buildLaporanHewan({ edisi, isArsip, hewan });
  const biaya_pengadaan: BiayaPengadaanRingkas = {
    total: hewanReport.ringkasan.biaya_pengadaan_total,
    sapi: hewanReport.ringkasan.biaya_pengadaan_sapi,
    kambing: hewanReport.ringkasan.biaya_pengadaan_kambing,
    hewan_beli_tanpa_harga: hewanReport.ringkasan.hewan_beli_tanpa_harga,
  };

  // ── Saldo Qurban (BUKAN laba; BOP belum termasuk) ────────────────────────
  const saldo_qurban = total - biaya_pengadaan.total;

  // ── Korelasi Ledger SKM (dua-mode) ───────────────────────────────────────
  const pembayaran_total = pembayaran.length;
  const pembayaran_tertaut = pembayaran.filter(
    (p) => (p.skm_transaksi_id || '').trim() !== ''
  ).length;
  // Arsip bila edisi arsip ATAU tak ada satupun pembayaran tertaut.
  const korelasiArsip = isArsip || pembayaran_tertaut === 0;
  const korelasi_ledger: KorelasiLedger = {
    mode: korelasiArsip ? 'arsip' : 'live',
    pembayaran_total,
    pembayaran_tertaut,
    status: korelasiArsip ? 'N/A' : 'LIVE',
  };

  return {
    edisi: { id: edisi.id, nama: edisi.tahun_hijriah, is_arsip: isArsip },
    mode: isArsip ? 'arsip' : 'live',
    dana_terhimpun: {
      total,
      jumlah_pembayaran_lunas: lunas.length,
      per_kategori,
      nilai_pendaftaran: nilaiPendaftaran,
    },
    biaya_pengadaan,
    saldo_qurban,
    korelasi_ledger,
  };
}

/** Parse aman: kosong/null/non-finite → 0. */
function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
