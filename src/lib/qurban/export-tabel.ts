import type { QurbanPeserta } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import type { QurbanMuqorib } from './muqorib-repo';
import type { Pembayaran } from './pembayaran-repo';
import { normalizeRt } from './laporan-peserta';

/**
 * LP6 — mesin builder baris Export bentuk **Tabel** (F8 Milestone E).
 *
 * Modul PUR (tanpa I/O & tanpa lib biner): route membaca sheet (peserta/
 * muqorib/daftar_hewan/pembayaran) lalu memanggil `buildExportTabel(...)` →
 * menghasilkan kolom final + baris terurut. Renderer Excel/PDF mengonsumsi
 * hasil ini. Dipisah agar diuji fixture & **dipakai ulang** F (Rekap) & G
 * (Kartu/Label).
 *
 * Grain baris = peserta (`qurban_peserta`): Sapi 7-slot penuh → 7 baris,
 * `no_urut_pemotongan` berulang (sesuai dokumen operasional GAS 1447H).
 */

export type ColumnKind = 'text' | 'number' | 'currency';

export interface ColumnDef {
  id: string;
  group: string;
  label: string;
  kind: ColumnKind;
  /** Field turunan (bukan kolom mentah sheet). */
  derived?: boolean;
}

/** Katalog kolom (grain peserta). Urutan = urutan tampil di picker. */
export const EXPORT_COLUMN_CATALOG: ColumnDef[] = [
  // Lainnya
  { id: 'no_baris', group: 'Lainnya', label: 'No', kind: 'number', derived: true },
  // Muqorib
  { id: 'kode_muqorib', group: 'Muqorib', label: 'Kode Muqorib', kind: 'text' },
  { id: 'muqorib_nama', group: 'Muqorib', label: 'Nama Muqorib (pendaftar)', kind: 'text' },
  { id: 'alamat', group: 'Muqorib', label: 'Alamat', kind: 'text' },
  { id: 'rt', group: 'Muqorib', label: 'RT', kind: 'text' },
  { id: 'no_hp', group: 'Muqorib', label: 'No. HP', kind: 'text' },
  // Peserta
  { id: 'kode_peserta', group: 'Peserta', label: 'Kode Peserta', kind: 'text' },
  { id: 'atas_nama', group: 'Peserta', label: 'Atas Nama', kind: 'text' },
  { id: 'tipe_qurban', group: 'Peserta', label: 'Tipe Qurban', kind: 'text' },
  { id: 'slot', group: 'Peserta', label: 'Slot', kind: 'number' },
  { id: 'keterangan_bagian', group: 'Peserta', label: 'Keterangan Bagian', kind: 'text' },
  { id: 'permintaan_tambahan', group: 'Peserta', label: 'Permintaan Tambahan', kind: 'text', derived: true },
  { id: 'harga_disepakati', group: 'Peserta', label: 'Harga Disepakati', kind: 'currency' },
  { id: 'status_pendaftaran', group: 'Peserta', label: 'Status', kind: 'text' },
  // Hewan
  { id: 'kode_hewan', group: 'Hewan', label: 'Kode Hewan', kind: 'text' },
  { id: 'label_hewan', group: 'Hewan', label: 'Label Hewan', kind: 'text', derived: true },
  { id: 'jenis', group: 'Hewan', label: 'Jenis', kind: 'text' },
  { id: 'kelas', group: 'Hewan', label: 'Kelas', kind: 'text' },
  { id: 'tipe_pembelian', group: 'Hewan', label: 'Tipe Pembelian', kind: 'text' },
  { id: 'no_urut_pemotongan', group: 'Hewan', label: 'No. Urut Potong', kind: 'number' },
  { id: 'biaya_beli', group: 'Hewan', label: 'Biaya Beli', kind: 'currency' },
  // Pembayaran
  { id: 'kode_bayar', group: 'Pembayaran', label: 'Kode Bayar', kind: 'text' },
  { id: 'nominal', group: 'Pembayaran', label: 'Nominal', kind: 'currency' },
  { id: 'metode', group: 'Pembayaran', label: 'Metode', kind: 'text' },
  { id: 'tanggal_lunas', group: 'Pembayaran', label: 'Tanggal Lunas', kind: 'text' },
];

const CATALOG_BY_ID = new Map(EXPORT_COLUMN_CATALOG.map((c) => [c.id, c]));

export function isValidColumnId(id: string): boolean {
  return CATALOG_BY_ID.has(id);
}

export type FilterJenis = 'SEMUA' | 'SAPI' | 'KAMBING';
export type FilterStatusHewan = 'SEMUA' | 'AKTIF' | 'BATAL';
export type ExportSort = 'jenis_urut_slot' | 'kode_hewan' | 'nama' | 'rt';

export interface ExportFilter {
  jenis?: FilterJenis;
  status_hewan?: FilterStatusHewan;
  /** 'SEMUA' | '01'..'06' | 'LAINNYA'. */
  rt?: string;
  hanya_ber_urut?: boolean;
}

export interface ExportTabelConfig {
  columns: string[];
  manual_columns?: string[];
  filter?: ExportFilter;
  sort?: ExportSort;
}

export interface BuiltRow {
  /** Kunci kelompok hewan untuk zebra shading (hewan_id, '' bila tak ada). */
  groupKey: string;
  cells: Record<string, string | number>;
}

export interface BuiltExportTabel {
  /** Kolom final terurut (katalog terpilih + kolom isi-tangan). */
  columns: ColumnDef[];
  rows: BuiltRow[];
  total_baris: number;
}

interface BuildInput {
  peserta: QurbanPeserta[];
  muqoribById: Map<string, QurbanMuqorib>;
  hewanById: Map<string, QurbanDaftarHewan>;
  /** key = kode_bayar. */
  pembayaranByKode: Map<string, Pembayaran>;
  config: ExportTabelConfig;
}

const STATUS_TERDAFTAR = 'TERDAFTAR';

function titleJenis(j: string): string {
  return j ? j.charAt(0).toUpperCase() + j.slice(1).toLowerCase() : j;
}

/** Label hewan "Sapi A-03" dari jenis+kelas+nomor_urut. '' bila hewan kosong. */
export function buildLabelHewan(h: QurbanDaftarHewan | undefined): string {
  if (!h || !h.jenis) return '';
  return `${titleJenis(h.jenis)} ${h.kelas}-${String(h.nomor_urut).padStart(2, '0')}`;
}

/**
 * Field turunan `permintaan_tambahan`: buang token "N bks (kupon)" dari
 * `keterangan_bagian`, rapikan koma sisa. Logika persis dari GAS
 * `tabelCleanPermintaan_`. Aman bila keterangan kosong.
 */
export function cleanPermintaanTambahan(keterangan: string): string {
  if (!keterangan) return '';
  let s = keterangan.replace(/\d+\s*bks\s*\(kupon\)/gi, '');
  // Rapikan koma sisa: koma ganda, koma di tepi, spasi sebelum koma.
  s = s
    .replace(/\s*,\s*/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/^,+|,+$/g, '')
    .trim();
  return s;
}

/** Nama tampil baris: `nama_atas_nama` || muqorib nama || ''. */
function atasNamaValue(p: QurbanPeserta, m: QurbanMuqorib | undefined): string {
  const override = (p.nama_atas_nama || '').trim();
  if (override) return override;
  return (m?.nama_lengkap || '').trim();
}

interface Enriched {
  peserta: QurbanPeserta;
  muqorib?: QurbanMuqorib;
  hewan?: QurbanDaftarHewan;
  pembayaran?: Pembayaran;
}

/** Nilai sel untuk satu kolom katalog. `no_baris` diisi terpisah saat assign. */
function cellValue(columnId: string, e: Enriched): string | number {
  const { peserta: p, muqorib: m, hewan: h, pembayaran: bayar } = e;
  switch (columnId) {
    case 'kode_muqorib':
      return p.muqorib_id;
    case 'muqorib_nama':
      return (m?.nama_lengkap || '').trim();
    case 'alamat':
      return (m?.alamat || '').trim();
    case 'rt':
      return m ? normalizeRt(m.rt) : 'LAINNYA';
    case 'no_hp':
      return (m?.no_hp || '').trim();
    case 'kode_peserta':
      return p.id;
    case 'atas_nama':
      return atasNamaValue(p, m);
    case 'tipe_qurban':
      return p.tipe_qurban;
    case 'slot':
      return p.slot_number;
    case 'keterangan_bagian':
      return p.keterangan_bagian || '';
    case 'permintaan_tambahan':
      return cleanPermintaanTambahan(p.keterangan_bagian || '');
    case 'harga_disepakati':
      return num(p.harga_disepakati);
    case 'status_pendaftaran':
      return p.status_pendaftaran;
    case 'kode_hewan':
      return p.hewan_id;
    case 'label_hewan':
      return buildLabelHewan(h);
    case 'jenis':
      return h?.jenis || '';
    case 'kelas':
      return h?.kelas || '';
    case 'tipe_pembelian':
      return h?.tipe_pembelian || '';
    case 'no_urut_pemotongan':
      return h?.nomor_urut_pemotongan != null ? h.nomor_urut_pemotongan : '';
    case 'biaya_beli':
      return num(h?.harga_beli_aktual);
    case 'kode_bayar':
      return p.kode_bayar;
    case 'nominal':
      return num(bayar?.nominal_total);
    case 'metode':
      return bayar?.metode || '';
    case 'tanggal_lunas':
      return (bayar?.tanggal_lunas || '').slice(0, 10);
    default:
      return '';
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const JENIS_RANK: Record<string, number> = { SAPI: 0, KAMBING: 1 };

function passesFilter(e: Enriched, f: ExportFilter): boolean {
  // Base scope: peserta TERDAFTAR.
  if (e.peserta.status_pendaftaran !== STATUS_TERDAFTAR) return false;

  if (f.jenis && f.jenis !== 'SEMUA') {
    if (!e.hewan || e.hewan.jenis !== f.jenis) return false;
  }
  if (f.status_hewan && f.status_hewan !== 'SEMUA') {
    if (!e.hewan || e.hewan.status !== f.status_hewan) return false;
  }
  if (f.rt && f.rt !== 'SEMUA') {
    const rt = e.muqorib ? normalizeRt(e.muqorib.rt) : 'LAINNYA';
    if (rt !== f.rt) return false;
  }
  if (f.hanya_ber_urut) {
    if (!e.hewan || e.hewan.nomor_urut_pemotongan == null) return false;
  }
  return true;
}

function comparator(sort: ExportSort): (a: Enriched, b: Enriched) => number {
  const byJenis = (e: Enriched) => JENIS_RANK[e.hewan?.jenis ?? ''] ?? 9;
  const byUrut = (e: Enriched) =>
    e.hewan?.nomor_urut_pemotongan != null ? e.hewan.nomor_urut_pemotongan : Number.POSITIVE_INFINITY;
  const bySlot = (e: Enriched) => e.peserta.slot_number || 0;
  const byNama = (e: Enriched) => atasNamaValue(e.peserta, e.muqorib).toLowerCase();
  const byKodeHewan = (e: Enriched) => e.peserta.hewan_id || '';
  const byRt = (e: Enriched) => {
    const rt = e.muqorib ? normalizeRt(e.muqorib.rt) : 'LAINNYA';
    // 'LAINNYA' selalu di akhir.
    return rt === 'LAINNYA' ? '~~' : rt;
  };

  const cmpNum = (x: number, y: number) => (x < y ? -1 : x > y ? 1 : 0);
  const cmpStr = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

  switch (sort) {
    case 'kode_hewan':
      return (a, b) =>
        cmpNum(byJenis(a), byJenis(b)) ||
        cmpStr(byKodeHewan(a), byKodeHewan(b)) ||
        cmpNum(bySlot(a), bySlot(b));
    case 'nama':
      return (a, b) => cmpStr(byNama(a), byNama(b)) || cmpStr(a.peserta.id, b.peserta.id);
    case 'rt':
      return (a, b) =>
        cmpStr(byRt(a), byRt(b)) || cmpStr(byNama(a), byNama(b)) || cmpStr(a.peserta.id, b.peserta.id);
    case 'jenis_urut_slot':
    default:
      return (a, b) =>
        cmpNum(byJenis(a), byJenis(b)) ||
        cmpNum(byUrut(a), byUrut(b)) ||
        cmpNum(bySlot(a), bySlot(b)) ||
        cmpStr(a.peserta.id, b.peserta.id);
  }
}

/** Resolusi kolom final: katalog terpilih (urut config) + kolom isi-tangan. */
export function resolveColumns(columns: string[], manualColumns: string[] = []): ColumnDef[] {
  const out: ColumnDef[] = [];
  for (const id of columns) {
    const def = CATALOG_BY_ID.get(id);
    if (def) out.push(def);
  }
  manualColumns.forEach((label, i) => {
    const clean = (label || '').trim();
    if (clean) out.push({ id: `manual_${i}`, group: 'Manual', label: clean, kind: 'text', derived: true });
  });
  return out;
}

export function buildExportTabel(input: BuildInput): BuiltExportTabel {
  const { peserta, muqoribById, hewanById, pembayaranByKode, config } = input;
  const filter = config.filter ?? {};
  const sort = config.sort ?? 'jenis_urut_slot';

  // Enrich + filter.
  const enriched: Enriched[] = [];
  for (const p of peserta) {
    const e: Enriched = {
      peserta: p,
      muqorib: muqoribById.get(p.muqorib_id),
      hewan: hewanById.get(p.hewan_id),
      pembayaran: pembayaranByKode.get(p.kode_bayar),
    };
    if (passesFilter(e, filter)) enriched.push(e);
  }

  // Sort.
  enriched.sort(comparator(sort));

  // Resolve columns + assign cells.
  const columns = resolveColumns(config.columns, config.manual_columns);
  const rows: BuiltRow[] = enriched.map((e, idx) => {
    const cells: Record<string, string | number> = {};
    for (const col of columns) {
      if (col.id === 'no_baris') cells[col.id] = idx + 1;
      else if (col.group === 'Manual') cells[col.id] = ''; // isi-tangan kosong
      else cells[col.id] = cellValue(col.id, e);
    }
    return { groupKey: e.peserta.hewan_id || '', cells };
  });

  return { columns, rows, total_baris: rows.length };
}
