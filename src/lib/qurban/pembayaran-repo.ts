import { sheetsService } from '@/lib/google-sheets';
import { SHEET_HEADERS } from '@/lib/constants';
import { QURBAN_SHEETS } from './sheets';

/**
 * Repository for `qurban_pembayaran` — pembayaran peserta qurban (F6).
 *
 * **Grain: 1 baris = 1 pendaftaran (`kode_bayar`), BUKAN per-slot.** Satu
 * pendaftaran multi-slot berbagi satu `kode_bayar` (lihat `peserta-kode-bayar.ts`),
 * jadi satu baris pembayaran menaungi seluruh slot pendaftaran itu.
 *
 * Mirrors `peserta-repo.ts`: cells mapped BY HEADER NAME (not hardcoded index),
 * derived once from `SHEET_HEADERS['qurban_pembayaran']` (single source of truth,
 * matches `scripts/migrate_F6A_pembayaran.gs`, 19 kolom). Reordering/adding a
 * column there flows through automatically.
 *
 * Timestamp = ISO-8601 + Z (konvensi entitas qurban, beda dari SKM-core).
 */

export const PEMBAYARAN_SHEET = QURBAN_SHEETS.PEMBAYARAN;

/** Metode pembayaran. VA & IMPORT_1447H disiapkan untuk milestone berikutnya. */
export type MetodePembayaran = 'TRANSFER' | 'TUNAI' | 'VA' | 'IMPORT_1447H';

/**
 * Status lifecycle pembayaran:
 *   BELUM_BAYAR → TERIMA_PANITIA (TUNAI, M-B) / LUNAS (TRANSFER match, M-C)
 *   BATAL = soft-cancel (mis. seluruh slot pendaftaran dibatalkan).
 */
export type StatusPembayaran = 'BELUM_BAYAR' | 'TERIMA_PANITIA' | 'LUNAS' | 'BATAL';

export const VALID_METODE: readonly MetodePembayaran[] = ['TRANSFER', 'TUNAI', 'VA', 'IMPORT_1447H'];
export const VALID_STATUS: readonly StatusPembayaran[] = ['BELUM_BAYAR', 'TERIMA_PANITIA', 'LUNAS', 'BATAL'];

/** Status yang berarti "uang sudah jalan" — memblokir pembatalan slot. */
export const BLOCKING_STATUSES: readonly StatusPembayaran[] = ['TERIMA_PANITIA', 'LUNAS'];

export interface Pembayaran {
  id: string;                      // BYR-YYYYMMDD-NNNN, permanen
  edisi_id: string;                // FK qurban_edisi.id
  kode_bayar: string;              // kunci pendaftaran (unik per edisi)
  muqorib_id: string;              // FK qurban_muqorib.id
  nominal_total: number;           // Σ harga_disepakati semua slot dalam kode_bayar
  nominal_transfer: number;        // nominal_total + payment_suffix (last digit = suffix)
  metode: MetodePembayaran;
  status: StatusPembayaran;
  tanggal_terima_panitia: string;  // ISO-8601 Z | '' (TUNAI)
  panitia_terima_id: string;       // FK anggota/panitia | '' (TUNAI)
  tanggal_lunas: string;           // ISO-8601 Z | ''
  bank_ref: string;                // FK ke transaksi.bank_ref | '' (diisi M-C)
  skm_transaksi_id: string;        // FK transaksi.id | '' (diisi saat LUNAS)
  bukti_url: string;               // '' | Google Drive
  match_metadata: string;          // JSON string | '' (diisi M-C)
  notes: string;
  created_at: string;              // ISO-8601 Z
  updated_at: string;              // ISO-8601 Z
  created_by: string;              // FK anggota.id ('PUBLIK' untuk PB3)
}

const HEADERS = SHEET_HEADERS[PEMBAYARAN_SHEET];
/** header-name → 0-based column index. */
const COL: Record<string, number> = Object.fromEntries(HEADERS.map((h, i) => [h, i]));

function s(v: unknown): string {
  return v == null ? '' : String(v);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapRowToPembayaran(row: unknown[]): Pembayaran {
  // Raw enum values kept as-is — write-side validators are the real guard.
  return {
    id: s(row[COL.id]),
    edisi_id: s(row[COL.edisi_id]),
    kode_bayar: s(row[COL.kode_bayar]),
    muqorib_id: s(row[COL.muqorib_id]),
    nominal_total: toNum(row[COL.nominal_total]),
    nominal_transfer: toNum(row[COL.nominal_transfer]),
    metode: s(row[COL.metode]).toUpperCase() as MetodePembayaran,
    status: s(row[COL.status]).toUpperCase() as StatusPembayaran,
    tanggal_terima_panitia: s(row[COL.tanggal_terima_panitia]),
    panitia_terima_id: s(row[COL.panitia_terima_id]),
    tanggal_lunas: s(row[COL.tanggal_lunas]),
    bank_ref: s(row[COL.bank_ref]),
    skm_transaksi_id: s(row[COL.skm_transaksi_id]),
    bukti_url: s(row[COL.bukti_url]),
    match_metadata: s(row[COL.match_metadata]),
    notes: s(row[COL.notes]),
    created_at: s(row[COL.created_at]),
    updated_at: s(row[COL.updated_at]),
    created_by: s(row[COL.created_by]),
  };
}

/** Object → row cells (length = HEADERS.length), placed by header index. */
export function mapPembayaranToRow(p: Pembayaran): (string | number)[] {
  const cells: (string | number)[] = new Array(HEADERS.length).fill('');
  cells[COL.id] = p.id;
  cells[COL.edisi_id] = p.edisi_id;
  cells[COL.kode_bayar] = p.kode_bayar;
  cells[COL.muqorib_id] = p.muqorib_id;
  cells[COL.nominal_total] = p.nominal_total;
  cells[COL.nominal_transfer] = p.nominal_transfer;
  cells[COL.metode] = p.metode;
  cells[COL.status] = p.status;
  cells[COL.tanggal_terima_panitia] = p.tanggal_terima_panitia;
  cells[COL.panitia_terima_id] = p.panitia_terima_id;
  cells[COL.tanggal_lunas] = p.tanggal_lunas;
  cells[COL.bank_ref] = p.bank_ref;
  cells[COL.skm_transaksi_id] = p.skm_transaksi_id;
  cells[COL.bukti_url] = p.bukti_url;
  cells[COL.match_metadata] = p.match_metadata;
  cells[COL.notes] = p.notes;
  cells[COL.created_at] = p.created_at;
  cells[COL.updated_at] = p.updated_at;
  cells[COL.created_by] = p.created_by;
  return cells;
}

/** One row + its 1-based sheet row index (for in-place updates). */
export interface PembayaranRecord {
  rowIndex: number;
  pembayaran: Pembayaran;
}

export function isValidMetode(v: string): v is MetodePembayaran {
  return (VALID_METODE as readonly string[]).includes(v);
}

export function isValidStatus(v: string): v is StatusPembayaran {
  return (VALID_STATUS as readonly string[]).includes(v);
}

/**
 * Read every pembayaran row for one edisi. Defensive: returns `[]` when the
 * sheet is missing (pre-`migrate_F6A` environments) so callers never crash.
 */
export async function listPembayaranByEdisi(edisiId: string): Promise<Pembayaran[]> {
  if (!edisiId) return [];
  try {
    const rows = await sheetsService.getRows(PEMBAYARAN_SHEET);
    return rows
      .filter((r) => r[COL.id])
      .map(mapRowToPembayaran)
      .filter((p) => p.edisi_id === edisiId);
  } catch (err) {
    console.error('[pembayaran-repo.listPembayaranByEdisi] failed:', err);
    return [];
  }
}

export async function getPembayaranById(id: string): Promise<Pembayaran | null> {
  const rec = await getPembayaranRecordById(id);
  return rec ? rec.pembayaran : null;
}

export async function getPembayaranRecordById(id: string): Promise<PembayaranRecord | null> {
  if (!id) return null;
  try {
    const rows = await sheetsService.getRows(PEMBAYARAN_SHEET);
    const index = rows.findIndex((r) => r[COL.id] === id);
    if (index === -1) return null;
    return { rowIndex: index + 2, pembayaran: mapRowToPembayaran(rows[index]) };
  } catch (err) {
    console.error('[pembayaran-repo.getPembayaranRecordById] failed:', err);
    return null;
  }
}

/**
 * Cari pembayaran milik satu pendaftaran. `kode_bayar` unik per edisi sehingga
 * pasangan `(edisi_id, kode_bayar)` mengembalikan paling banyak satu baris.
 */
export async function findPembayaranByKodeBayar(
  edisiId: string,
  kodeBayar: string
): Promise<Pembayaran | null> {
  const rec = await findPembayaranRecordByKodeBayar(edisiId, kodeBayar);
  return rec ? rec.pembayaran : null;
}

export async function findPembayaranRecordByKodeBayar(
  edisiId: string,
  kodeBayar: string
): Promise<PembayaranRecord | null> {
  if (!edisiId || !kodeBayar) return null;
  try {
    const rows = await sheetsService.getRows(PEMBAYARAN_SHEET);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r[COL.id] && r[COL.edisi_id] === edisiId && r[COL.kode_bayar] === kodeBayar) {
        return { rowIndex: i + 2, pembayaran: mapRowToPembayaran(r) };
      }
    }
    return null;
  } catch (err) {
    console.error('[pembayaran-repo.findPembayaranRecordByKodeBayar] failed:', err);
    return null;
  }
}

export async function insertPembayaran(p: Pembayaran): Promise<Pembayaran> {
  await sheetsService.appendRow(PEMBAYARAN_SHEET, mapPembayaranToRow(p));
  return p;
}

export async function updatePembayaranAt(rowIndex: number, p: Pembayaran): Promise<Pembayaran> {
  await sheetsService.updateRow(PEMBAYARAN_SHEET, rowIndex, mapPembayaranToRow(p));
  return p;
}
