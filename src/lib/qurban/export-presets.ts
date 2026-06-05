import type { ExportFilter, ExportSort } from './export-tabel';

/**
 * Definisi preset Export (F8 Milestone E). Statis (bukan preset buatan-user —
 * itu menyusul). Dua jenis:
 *   - row-level: memuat ke builder kolom (boleh diedit user) → LP6 Tabel.
 *   - summary: layout tetap, reuse modul LP (LP5/LP2/LP4) → export as-is.
 */

export interface RowLevelPreset {
  id: string;
  label: string;
  deskripsi: string;
  columns: string[];
  manual_columns: string[];
  filter: ExportFilter;
  sort: ExportSort;
}

export type SummaryPresetSource = 'LP5' | 'LP2' | 'LP4';

export interface SummaryPreset {
  id: string;
  label: string;
  deskripsi: string;
  source: SummaryPresetSource;
}

/** Preset baris-level (bentuk Tabel). */
export const ROW_LEVEL_PRESETS: RowLevelPreset[] = [
  {
    id: 'daftar_peserta',
    label: 'Daftar Peserta',
    deskripsi: 'Daftar lengkap peserta terdaftar dengan hewan & status.',
    columns: [
      'kode_peserta',
      'atas_nama',
      'muqorib_nama',
      'label_hewan',
      'tipe_qurban',
      'kode_bayar',
      'status_pendaftaran',
    ],
    manual_columns: [],
    filter: { status_hewan: 'SEMUA', jenis: 'SEMUA', rt: 'SEMUA' },
    sort: 'nama',
  },
  {
    id: 'tabel_mading',
    label: 'Tabel Mading',
    deskripsi: 'Pengumuman urutan pemotongan untuk mading.',
    columns: ['no_urut_pemotongan', 'jenis', 'kode_hewan', 'atas_nama'],
    manual_columns: [],
    filter: { hanya_ber_urut: true, jenis: 'SEMUA', status_hewan: 'AKTIF', rt: 'SEMUA' },
    sort: 'jenis_urut_slot',
  },
  {
    id: 'tim_penyembelihan',
    label: 'Tim Penyembelihan',
    deskripsi: 'Lembar kerja tim sembelih (ber-urut, dengan kontak).',
    columns: ['no_urut_pemotongan', 'jenis', 'kode_hewan', 'atas_nama', 'alamat', 'no_hp'],
    manual_columns: [],
    filter: { hanya_ber_urut: true, jenis: 'SEMUA', status_hewan: 'AKTIF', rt: 'SEMUA' },
    sort: 'jenis_urut_slot',
  },
  {
    id: 'tim_muqorib',
    label: 'Tim Muqorib',
    deskripsi: 'Lembar tim muqorib + permintaan tambahan + kolom petugas.',
    columns: [
      'no_urut_pemotongan',
      'jenis',
      'kode_hewan',
      'atas_nama',
      'alamat',
      'no_hp',
      'permintaan_tambahan',
    ],
    manual_columns: ['Nama Petugas Distribusi'],
    filter: { jenis: 'SEMUA', status_hewan: 'SEMUA', rt: 'SEMUA' },
    sort: 'jenis_urut_slot',
  },
  {
    id: 'tim_timbang',
    label: 'Tim Timbang/Packing',
    deskripsi: 'Lembar tim timbang/packing dengan nomor baris & kontak.',
    columns: ['no_baris', 'jenis', 'atas_nama', 'alamat', 'no_hp'],
    manual_columns: ['Nama Petugas Distribusi'],
    filter: { jenis: 'SEMUA', status_hewan: 'SEMUA', rt: 'SEMUA' },
    sort: 'kode_hewan',
  },
];

/** Preset ringkasan (reuse modul LP). */
export const SUMMARY_PRESETS: SummaryPreset[] = [
  {
    id: 'rekap_executive',
    label: 'Rekap Executive',
    deskripsi: 'Ringkasan 1 halaman: peserta, dana, hewan, status edisi.',
    source: 'LP5',
  },
  {
    id: 'inventaris_hewan',
    label: 'Inventaris Hewan',
    deskripsi: 'Matriks jenis–kelas + ringkasan biaya pengadaan.',
    source: 'LP2',
  },
  {
    id: 'ringkasan_keuangan',
    label: 'Ringkasan Keuangan',
    deskripsi: 'Dana per kategori + biaya + saldo + korelasi ledger.',
    source: 'LP4',
  },
];

const ROW_PRESET_BY_ID = new Map(ROW_LEVEL_PRESETS.map((p) => [p.id, p]));
const SUMMARY_PRESET_BY_ID = new Map(SUMMARY_PRESETS.map((p) => [p.id, p]));

export function getRowLevelPreset(id: string): RowLevelPreset | undefined {
  return ROW_PRESET_BY_ID.get(id);
}

export function getSummaryPreset(id: string): SummaryPreset | undefined {
  return SUMMARY_PRESET_BY_ID.get(id);
}

export function isSummaryPreset(id: string): boolean {
  return SUMMARY_PRESET_BY_ID.has(id);
}
