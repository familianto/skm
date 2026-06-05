import type { Edisi } from './edisi-repo';
import type { QurbanPeserta } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import type { QurbanMuqorib } from './muqorib-repo';
import { JENIS_HEWAN, KELAS_HEWAN } from './validators';

/**
 * LP1 — agregasi read-only Laporan Peserta (F8 Milestone B).
 *
 * Modul PUR (tanpa I/O), sejajar `laporan-dashboard.ts`: route handler
 * `GET /api/qurban/laporan/peserta` membaca sheet (peserta/daftar_hewan/
 * muqorib) lalu memanggil `buildLaporanPeserta(...)`. Dipisah dari I/O agar
 * diuji dengan fixture & dipakai ulang oleh Export (LP6) nanti.
 *
 * Tiga grouping dihitung sekaligus (data kecil, ±239 baris) → UI ganti
 * grouping instan tanpa refetch. SEMUA grouping berdenominasi **peserta**
 * (status_pendaftaran = TERDAFTAR) agar total konsisten antar-tab.
 */

export interface TipeGroup {
  key: 'BELI' | 'BAWA_SENDIRI';
  label: string;
  peserta: number;
  persen: number;
}

export interface JenisKelasGroup {
  jenis: string;
  kelas: string;
  label: string;
  peserta: number;
}

export interface RtGroup {
  rt: string;
  label: string;
  peserta: number;
  muqorib: number;
}

export interface LaporanPesertaDTO {
  edisi: { id: string; nama: string; is_arsip: boolean };
  total_peserta: number;
  peserta_batal: number;
  groupings: {
    tipe: TipeGroup[];
    jenis_kelas: JenisKelasGroup[];
    rt: RtGroup[];
  };
}

const STATUS_TERDAFTAR = 'TERDAFTAR';
const STATUS_BATAL = 'BATAL';
const RT_LAINNYA = 'LAINNYA';

/** Persen 1-desimal, aman pembagian-nol. mis. 141/239 → 59.0 */
export function roundPct(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function titleJenis(jenis: string): string {
  if (!jenis) return jenis;
  return jenis.charAt(0).toUpperCase() + jenis.slice(1).toLowerCase();
}

/**
 * Normalisasi nilai RT mentah (`muqorib.rt`) → kunci kanonik.
 *
 *   - kosong / null / "Lainnya" (case-insensitive) / non-numerik → `"LAINNYA"`.
 *   - numerik (termasuk float `"4.0"`/angka `4`) → 2-digit zero-pad, mis.
 *     `"01"`, `"04"`, `"06"`. `"001"` → `"01"`.
 */
export function normalizeRt(raw: unknown): string {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!s) return RT_LAINNYA;
  if (s.toLowerCase() === 'lainnya') return RT_LAINNYA;
  const n = Number(s);
  if (!Number.isFinite(n)) return RT_LAINNYA;
  return String(Math.trunc(n)).padStart(2, '0');
}

interface BuildInput {
  edisi: Pick<Edisi, 'id' | 'tahun_hijriah'>;
  isArsip: boolean;
  peserta: QurbanPeserta[];
  hewan: QurbanDaftarHewan[];
  muqorib: QurbanMuqorib[];
}

export function buildLaporanPeserta(input: BuildInput): LaporanPesertaDTO {
  const { edisi, isArsip, peserta, hewan, muqorib } = input;

  const terdaftar = peserta.filter(
    (p) => p.status_pendaftaran === STATUS_TERDAFTAR
  );
  const batal = peserta.filter((p) => p.status_pendaftaran === STATUS_BATAL).length;
  const total = terdaftar.length;

  return {
    edisi: { id: edisi.id, nama: edisi.tahun_hijriah, is_arsip: isArsip },
    total_peserta: total,
    peserta_batal: batal,
    groupings: {
      tipe: groupTipe(terdaftar, total),
      jenis_kelas: groupJenisKelas(terdaftar, hewan),
      rt: groupRt(terdaftar, muqorib),
    },
  };
}

// ── Tipe Qurban ──────────────────────────────────────────────────────────────

function groupTipe(terdaftar: QurbanPeserta[], total: number): TipeGroup[] {
  const beli = terdaftar.filter((p) => p.tipe_qurban === 'BELI').length;
  const bawa = terdaftar.filter((p) => p.tipe_qurban === 'BAWA_SENDIRI').length;
  return [
    { key: 'BELI', label: 'Beli', peserta: beli, persen: roundPct(beli, total) },
    {
      key: 'BAWA_SENDIRI',
      label: 'Bawa Sendiri',
      peserta: bawa,
      persen: roundPct(bawa, total),
    },
  ];
}

// ── Jenis–Kelas Hewan ────────────────────────────────────────────────────────

function groupJenisKelas(
  terdaftar: QurbanPeserta[],
  hewan: QurbanDaftarHewan[]
): JenisKelasGroup[] {
  const byId = new Map(hewan.map((h) => [h.id, h]));
  const counts = new Map<string, number>();
  let unmapped = 0;

  for (const p of terdaftar) {
    const h = byId.get(p.hewan_id);
    if (!h || !h.jenis || !h.kelas) {
      unmapped += 1;
      continue;
    }
    const key = `${h.jenis}|${h.kelas}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out: JenisKelasGroup[] = [];
  // Urut kanonik: SAPI A→D lalu KAMBING A→D; hanya emit yang ada pesertanya.
  for (const jenis of JENIS_HEWAN) {
    for (const kelas of KELAS_HEWAN) {
      const n = counts.get(`${jenis}|${kelas}`) ?? 0;
      if (n > 0) {
        out.push({ jenis, kelas, label: `${titleJenis(jenis)} ${kelas}`, peserta: n });
      }
    }
  }
  if (unmapped > 0) {
    out.push({
      jenis: '',
      kelas: '',
      label: 'Tidak Terpetakan',
      peserta: unmapped,
    });
  }
  return out;
}

// ── RT (primary peserta, secondary muqorib distinct) ─────────────────────────

function groupRt(
  terdaftar: QurbanPeserta[],
  muqorib: QurbanMuqorib[]
): RtGroup[] {
  const rtById = new Map(muqorib.map((m) => [m.id, normalizeRt(m.rt)]));

  const pesertaPerRt = new Map<string, number>();
  const muqoribPerRt = new Map<string, Set<string>>();

  for (const p of terdaftar) {
    // muqorib tak ketemu → bucket LAINNYA (jangan error).
    const rt = rtById.get(p.muqorib_id) ?? RT_LAINNYA;
    pesertaPerRt.set(rt, (pesertaPerRt.get(rt) ?? 0) + 1);
    const set = muqoribPerRt.get(rt) ?? new Set<string>();
    set.add(p.muqorib_id);
    muqoribPerRt.set(rt, set);
  }

  const keys = [...pesertaPerRt.keys()];
  // RT baku urut natural menaik; "LAINNYA" selalu paling akhir.
  const realKeys = keys
    .filter((k) => k !== RT_LAINNYA)
    .sort((a, b) => Number(a) - Number(b));
  const ordered = pesertaPerRt.has(RT_LAINNYA)
    ? [...realKeys, RT_LAINNYA]
    : realKeys;

  return ordered.map((rt) => ({
    rt,
    label: rt === RT_LAINNYA ? 'Lainnya' : `RT ${rt}`,
    peserta: pesertaPerRt.get(rt) ?? 0,
    muqorib: muqoribPerRt.get(rt)?.size ?? 0,
  }));
}
