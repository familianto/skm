import type { QurbanPeserta } from './peserta-types';

/**
 * LP — Rekap Bagian (F8 Milestone F). Modul PUR: parsing `keterangan_bagian` +
 * normalisasi via peta alias→kanonik + agregasi per bagian. Logika alias
 * persis dari script GAS `ExportRekapBagian` (arsip 1447H free-text + checklist
 * 1448H). Dipakai endpoint rekap (read-only) & dipakai-ulang Export (LP6 shape
 * "rekap"). Peta bisa di-override dari sheet `qurban_bagian_kanonik`.
 */

export type TipeBagian = 'BAKU' | 'TAMBAHAN';

export interface BagianKanonik {
  nama_kanonik: string;
  /** Alias lowercase (tanpa duplikat). Nama kanonik sendiri jadi alias implisit. */
  aliases: string[];
  tipe: TipeBagian;
  is_active: boolean;
}

/**
 * Peta default (seed). BAKU = checklist 1448H (8 bagian); TAMBAHAN = kanonik
 * tambahan dari arsip 1447H. Alias lowercase; alias terpanjang dicek dulu saat
 * mencocokkan agar "Daging Khas Dalam" → "Khas Dalam" + "Daging".
 */
export const DEFAULT_BAGIAN_MAP: BagianKanonik[] = [
  { nama_kanonik: 'Daging', aliases: ['daging'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Paha', aliases: ['paha kambing', 'paha belakang', 'paha'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Tulang Iga', aliases: ['tulang iga', 'iga'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Kaki', aliases: ['kaki'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Hati', aliases: ['hati'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Kepala', aliases: ['kepala'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Buntut', aliases: ['buntut', 'ekor/buntut', 'ekor'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Jeroan', aliases: ['jeroan'], tipe: 'BAKU', is_active: true },
  { nama_kanonik: 'Khas Dalam', aliases: ['khas dalam'], tipe: 'TAMBAHAN', is_active: true },
  { nama_kanonik: 'Khas Luar', aliases: ['khas luar'], tipe: 'TAMBAHAN', is_active: true },
  { nama_kanonik: 'Sengkel', aliases: ['sengkel'], tipe: 'TAMBAHAN', is_active: true },
  { nama_kanonik: 'Lidah', aliases: ['lidah'], tipe: 'TAMBAHAN', is_active: true },
  { nama_kanonik: 'Paru', aliases: ['paru'], tipe: 'TAMBAHAN', is_active: true },
  { nama_kanonik: 'Sandung Lamur', aliases: ['sandung lamur'], tipe: 'TAMBAHAN', is_active: true },
];

const STATUS_TERDAFTAR = 'TERDAFTAR';

/**
 * Bersihkan `keterangan_bagian` dari noise SEBELUM dipecah per koma:
 *   - isi dalam kurung `(...)`
 *   - token kupon `N bks` (dan apa pun mengandung "kupon")
 *   - "data tidak tersedia"
 *   - berat `N kg` / `N,N kg`
 */
export function cleanKeterangan(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+\s*bks/gi, ' ')
    .replace(/[^,]*kupon[^,]*/gi, ' ')
    .replace(/data tidak tersedia/gi, ' ')
    .replace(/\d+[.,]?\d*\s*kg/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Jumlah bungkus kupon yang diminta (Σ N pada "N bks"). Untuk catatan kaki. */
export function sumKuponBungkus(raw: string): number {
  if (!raw) return 0;
  let total = 0;
  const re = /(\d+)\s*bks/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) total += parseInt(m[1], 10) || 0;
  return total;
}

interface CompiledAlias {
  alias: string;
  kanonik: string;
}

/** Susun daftar alias aktif, terurut panjang DESC (alias terpanjang dulu). */
export function compileAliases(map: BagianKanonik[]): CompiledAlias[] {
  const out: CompiledAlias[] = [];
  for (const entry of map) {
    if (!entry.is_active) continue;
    const set = new Set<string>();
    set.add(entry.nama_kanonik.toLowerCase());
    for (const a of entry.aliases) {
      const v = a.trim().toLowerCase();
      if (v) set.add(v);
    }
    for (const a of set) out.push({ alias: a, kanonik: entry.nama_kanonik });
  }
  out.sort((a, b) => b.alias.length - a.alias.length);
  return out;
}

/**
 * Kanonik-kanonik yang terdeteksi dari satu `keterangan_bagian` (Set, 1× per
 * bagian). Substring-match alias terpanjang-dulu; substring yang cocok dibuang
 * agar "Daging Khas Dalam" menghasilkan {Khas Dalam, Daging} (bukan dobel).
 */
export function detectBagian(keterangan: string, compiled: CompiledAlias[]): Set<string> {
  const found = new Set<string>();
  let hay = ` ${cleanKeterangan(keterangan).toLowerCase()} `;
  if (hay.trim() === '') return found;
  for (const { alias, kanonik } of compiled) {
    if (!alias) continue;
    if (hay.includes(alias)) {
      found.add(kanonik);
      hay = hay.split(alias).join(' '); // buang semua kemunculan alias
    }
  }
  return found;
}

export interface RekapBagianRow {
  no: number;
  nama: string;
  jumlah: number;
}

export interface RekapBagianResult {
  rows: RekapBagianRow[];
  total_permintaan: number;
  peserta_valid: number;
  dengan_permintaan: number;
  tanpa_permintaan: number;
  total_bungkus_kupon: number;
}

interface BuildInput {
  peserta: QurbanPeserta[];
  map: BagianKanonik[];
}

/**
 * Agregasi rekap bagian atas peserta TERDAFTAR. `jumlah` = banyak peserta yang
 * meminta bagian itu (1 peserta dihitung 1× per bagian). Urut jumlah DESC lalu
 * alfabet. Total permintaan bisa > peserta (multi-bagian per peserta).
 */
export function buildRekapBagian(input: BuildInput): RekapBagianResult {
  const compiled = compileAliases(input.map);
  const counts = new Map<string, number>();
  // Inisialisasi semua kanonik aktif agar bagian ber-0 tetap muncul.
  for (const entry of input.map) {
    if (entry.is_active) counts.set(entry.nama_kanonik, 0);
  }

  let pesertaValid = 0;
  let denganPermintaan = 0;
  let totalBungkusKupon = 0;

  for (const p of input.peserta) {
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    pesertaValid += 1;
    totalBungkusKupon += sumKuponBungkus(p.keterangan_bagian || '');
    const detected = detectBagian(p.keterangan_bagian || '', compiled);
    if (detected.size > 0) denganPermintaan += 1;
    for (const k of detected) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const rows: RekapBagianRow[] = [...counts.entries()]
    .map(([nama, jumlah]) => ({ nama, jumlah }))
    .sort((a, b) => (b.jumlah !== a.jumlah ? b.jumlah - a.jumlah : a.nama < b.nama ? -1 : 1))
    .map((r, i) => ({ no: i + 1, nama: r.nama, jumlah: r.jumlah }));

  const total_permintaan = rows.reduce((s, r) => s + r.jumlah, 0);

  return {
    rows,
    total_permintaan,
    peserta_valid: pesertaValid,
    dengan_permintaan: denganPermintaan,
    tanpa_permintaan: pesertaValid - denganPermintaan,
    total_bungkus_kupon: totalBungkusKupon,
  };
}
