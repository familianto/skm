import { sheetsService } from '@/lib/google-sheets';
import { SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from './sheets';
import type {
  QurbanPeserta,
  SumberPendaftaran,
  StatusPendaftaran,
  TipeQurban,
} from './peserta-types';

/**
 * Repository for `qurban_peserta` — pendaftaran peserta (F4a, 1 baris = 1 slot).
 *
 * Mirrors `daftar-hewan-repo.ts`: cells mapped BY HEADER NAME (not hardcoded
 * index), derived once from `SHEET_HEADERS['qurban_peserta']` (single source of
 * truth, matches `scripts/migrate_F4a.gs`, 17 kolom). Reordering/adding a column
 * there flows through automatically.
 *
 * Tanggal/datetime ditulis sebagai string ISO 8601 + Z, konsisten dengan F5a.
 */

export const PESERTA_SHEET = QURBAN_SHEETS.PESERTA;
export const STATUS_TERDAFTAR: StatusPendaftaran = 'TERDAFTAR';
export const STATUS_BATAL: StatusPendaftaran = 'BATAL';

const HEADERS = SHEET_HEADERS[PESERTA_SHEET];
/** header-name → 0-based column index. */
const COL: Record<string, number> = Object.fromEntries(
  HEADERS.map((h, i) => [h, i])
);

/** One row + its 1-based sheet row index (for in-place updates). */
export interface PesertaRecord {
  rowIndex: number;
  peserta: QurbanPeserta;
}

export interface PesertaFilter {
  edisi_id?: string;
  status_pendaftaran?: StatusPendaftaran;
  hewan_id?: string;
  muqorib_id?: string;
  tipe_qurban?: TipeQurban;
  sumber_pendaftaran?: SumberPendaftaran;
}

function s(v: unknown): string {
  return v == null ? '' : String(v);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapRowToPeserta(row: unknown[]): QurbanPeserta {
  // Keep raw enum values as-is — write-side validators are the real guard; a
  // corrupt cell stays visible instead of being silently coerced.
  return {
    id: s(row[COL.id]),
    edisi_id: s(row[COL.edisi_id]),
    muqorib_id: s(row[COL.muqorib_id]),
    hewan_id: s(row[COL.hewan_id]),
    slot_number: toNum(row[COL.slot_number]),
    tipe_qurban: s(row[COL.tipe_qurban]).toUpperCase() as TipeQurban,
    nama_atas_nama: s(row[COL.nama_atas_nama]),
    keterangan_bagian: s(row[COL.keterangan_bagian]),
    harga_disepakati: toNum(row[COL.harga_disepakati]),
    kode_bayar: s(row[COL.kode_bayar]),
    sumber_pendaftaran: s(row[COL.sumber_pendaftaran]).toUpperCase() as SumberPendaftaran,
    status_pendaftaran: s(row[COL.status_pendaftaran]).toUpperCase() as StatusPendaftaran,
    tanggal_daftar: s(row[COL.tanggal_daftar]),
    notes: s(row[COL.notes]),
    created_at: s(row[COL.created_at]),
    updated_at: s(row[COL.updated_at]),
    created_by: s(row[COL.created_by]),
  };
}

/** Object → row cells (length = HEADERS.length), placed by header index. */
export function mapPesertaToRow(p: QurbanPeserta): (string | number)[] {
  const cells: (string | number)[] = new Array(HEADERS.length).fill('');
  cells[COL.id] = p.id;
  cells[COL.edisi_id] = p.edisi_id;
  cells[COL.muqorib_id] = p.muqorib_id;
  cells[COL.hewan_id] = p.hewan_id;
  cells[COL.slot_number] = p.slot_number;
  cells[COL.tipe_qurban] = p.tipe_qurban;
  cells[COL.nama_atas_nama] = p.nama_atas_nama;
  cells[COL.keterangan_bagian] = p.keterangan_bagian;
  cells[COL.harga_disepakati] = p.harga_disepakati;
  cells[COL.kode_bayar] = p.kode_bayar;
  cells[COL.sumber_pendaftaran] = p.sumber_pendaftaran;
  cells[COL.status_pendaftaran] = p.status_pendaftaran;
  cells[COL.tanggal_daftar] = p.tanggal_daftar;
  cells[COL.notes] = p.notes;
  cells[COL.created_at] = p.created_at;
  cells[COL.updated_at] = p.updated_at;
  cells[COL.created_by] = p.created_by;
  return cells;
}

/** Apply a `PesertaFilter` to an in-memory list (pure). */
export function applyPesertaFilter(
  list: QurbanPeserta[],
  filter: PesertaFilter
): QurbanPeserta[] {
  return list.filter((p) => {
    if (filter.edisi_id && p.edisi_id !== filter.edisi_id) return false;
    if (filter.status_pendaftaran && p.status_pendaftaran !== filter.status_pendaftaran) return false;
    if (filter.hewan_id && p.hewan_id !== filter.hewan_id) return false;
    if (filter.muqorib_id && p.muqorib_id !== filter.muqorib_id) return false;
    if (filter.tipe_qurban && p.tipe_qurban !== filter.tipe_qurban) return false;
    if (filter.sumber_pendaftaran && p.sumber_pendaftaran !== filter.sumber_pendaftaran) return false;
    return true;
  });
}

/**
 * Read every peserta row, optionally filtered. Defensive: returns `[]` when the
 * sheet is missing (pre-`migrate_F4a` environments) so list endpoints + the F5a
 * occupancy reader never crash.
 */
export async function listPeserta(
  filter: PesertaFilter = {}
): Promise<QurbanPeserta[]> {
  try {
    const rows = await sheetsService.getRows(PESERTA_SHEET);
    const all = rows.filter((r) => r[COL.id]).map(mapRowToPeserta);
    return applyPesertaFilter(all, filter);
  } catch (err) {
    console.error('[peserta-repo.listPeserta] failed:', err);
    return [];
  }
}

/** Convenience: all peserta for one edisi (any status). */
export async function listPesertaByEdisi(edisiId: string): Promise<QurbanPeserta[]> {
  if (!edisiId) return [];
  return listPeserta({ edisi_id: edisiId });
}

/**
 * List peserta + their 1-based sheet row index for one edisi (optionally
 * filtered). Dipakai PM1 batch-save (F5b A2) yang butuh rowIndex untuk
 * `batchUpdateRanges`. Defensive: kalau sheet missing → `[]`.
 */
export async function listPesertaRecordsByEdisi(
  edisiId: string,
  filter: Omit<PesertaFilter, 'edisi_id'> = {}
): Promise<PesertaRecord[]> {
  if (!edisiId) return [];
  try {
    const rows = await sheetsService.getRows(PESERTA_SHEET);
    const out: PesertaRecord[] = [];
    rows.forEach((r, i) => {
      if (!r[COL.id]) return;
      const p = mapRowToPeserta(r);
      if (p.edisi_id !== edisiId) return;
      if (filter.status_pendaftaran && p.status_pendaftaran !== filter.status_pendaftaran) return;
      if (filter.hewan_id && p.hewan_id !== filter.hewan_id) return;
      if (filter.muqorib_id && p.muqorib_id !== filter.muqorib_id) return;
      if (filter.tipe_qurban && p.tipe_qurban !== filter.tipe_qurban) return;
      if (filter.sumber_pendaftaran && p.sumber_pendaftaran !== filter.sumber_pendaftaran) return;
      out.push({ rowIndex: i + 2, peserta: p });
    });
    return out;
  } catch (err) {
    console.error('[peserta-repo.listPesertaRecordsByEdisi] failed:', err);
    return [];
  }
}

export async function getPesertaById(id: string): Promise<QurbanPeserta | null> {
  const rec = await getPesertaRecordById(id);
  return rec ? rec.peserta : null;
}

export async function getPesertaRecordById(id: string): Promise<PesertaRecord | null> {
  if (!id) return null;
  try {
    const rows = await sheetsService.getRows(PESERTA_SHEET);
    const index = rows.findIndex((r) => r[COL.id] === id);
    if (index === -1) return null;
    return { rowIndex: index + 2, peserta: mapRowToPeserta(rows[index]) };
  } catch (err) {
    console.error('[peserta-repo.getPesertaRecordById] failed:', err);
    return null;
  }
}

/**
 * Batch insert — multi-slot PS2 menulis N baris dalam SATU panggilan API
 * (`appendRows`), bukan loop per-baris. Caller harus sudah memvalidasi seluruh
 * batch (all-or-nothing) sebelum memanggil.
 */
export async function insertPeserta(records: QurbanPeserta[]): Promise<QurbanPeserta[]> {
  if (records.length === 0) return [];
  await sheetsService.appendRows(PESERTA_SHEET, records.map(mapPesertaToRow));
  return records;
}

export async function updatePesertaAt(
  rowIndex: number,
  record: QurbanPeserta
): Promise<QurbanPeserta> {
  await sheetsService.updateRow(PESERTA_SHEET, rowIndex, mapPesertaToRow(record));
  return record;
}

/**
 * Duplicate detection (Layer 1): peserta TERDAFTAR untuk `(edisi_id, muqorib_id)`.
 * Kosong = tidak ada duplikat. Dipakai PS2; dibungkus jadi endpoint PS6 (M-C).
 */
export async function findDuplikatTerdaftar(
  edisiId: string,
  muqoribId: string
): Promise<QurbanPeserta[]> {
  if (!edisiId || !muqoribId) return [];
  return listPeserta({
    edisi_id: edisiId,
    muqorib_id: muqoribId,
    status_pendaftaran: STATUS_TERDAFTAR,
  });
}
