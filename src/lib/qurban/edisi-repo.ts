import { sheetsService } from '@/lib/google-sheets';
import { QURBAN_SHEETS } from './sheets';
import { EDISI_STATUS, type EdisiStatus } from './edisi-state-machine';

/**
 * Repository for `qurban_edisi`. Read side (listEdisi / findEdisiById /
 * findActiveEdisi) shipped with Milestone A; Milestone B adds the write
 * helpers (createEdisi / updateEdisiAt / row<->object mapping).
 *
 * Column order MUST mirror migrate_F02's qurban_edisi sheet (12 cols):
 *   0:id  1:tahun_hijriah  2:tahun_masehi  3:tanggal_idul_adha
 *   4:tanggal_pendaftaran_buka  5:tanggal_pendaftaran_tutup  6:status
 *   7:parent_edisi_id  8:cloned_at  9:created_at  10:updated_at  11:created_by
 */

export interface Edisi {
  id: string;
  tahun_hijriah: string;
  tahun_masehi: number;
  tanggal_idul_adha: string;
  tanggal_pendaftaran_buka: string;
  tanggal_pendaftaran_tutup: string;
  status: EdisiStatus;
  parent_edisi_id: string;
  cloned_at: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

function rowToEdisi(row: string[]): Edisi {
  const rawStatus = (row[6] || '').toUpperCase();
  const status: EdisiStatus =
    rawStatus === EDISI_STATUS.AKTIF
      ? EDISI_STATUS.AKTIF
      : rawStatus === EDISI_STATUS.SELESAI
      ? EDISI_STATUS.SELESAI
      : EDISI_STATUS.DRAFT;

  const tahunMasehi = parseInt(row[2] || '0', 10);

  return {
    id: row[0] || '',
    tahun_hijriah: row[1] || '',
    tahun_masehi: Number.isFinite(tahunMasehi) ? tahunMasehi : 0,
    tanggal_idul_adha: row[3] || '',
    tanggal_pendaftaran_buka: row[4] || '',
    tanggal_pendaftaran_tutup: row[5] || '',
    status,
    parent_edisi_id: row[7] || '',
    cloned_at: row[8] || '',
    created_at: row[9] || '',
    updated_at: row[10] || '',
    created_by: row[11] || '',
  };
}

/**
 * Read all edisi rows. Returns `[]` if the sheet doesn't exist yet (e.g. local
 * dev without migrate_F02). Errors propagate otherwise so the caller decides
 * whether to fall back to an empty state or surface the failure.
 */
export async function listEdisi(): Promise<Edisi[]> {
  try {
    const rows = await sheetsService.getRows(QURBAN_SHEETS.EDISI);
    return rows
      .filter((r) => r[0])
      .map(rowToEdisi);
  } catch (err) {
    // Sheet missing → treat as empty. Anything else → log + empty (so the
    // dashboard renders the empty state instead of crashing the layout).
    console.error('[edisi-repo.listEdisi] failed:', err);
    return [];
  }
}

export async function findEdisiById(id: string): Promise<Edisi | null> {
  if (!id) return null;
  const all = await listEdisi();
  return all.find((e) => e.id === id) ?? null;
}

/** Returns the (at-most-one) edisi with `status = AKTIF`, or null. */
export async function findActiveEdisi(): Promise<Edisi | null> {
  const all = await listEdisi();
  return all.find((e) => e.status === EDISI_STATUS.AKTIF) ?? null;
}

/** Sort newest-first by `created_at` (ISO 8601 lexicographic). */
export function sortEdisiByCreatedDesc(list: readonly Edisi[]): Edisi[] {
  return [...list].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );
}

/** Sort newest-first by `tahun_masehi` desc (E1 default ordering). */
export function sortEdisiByTahunDesc(list: readonly Edisi[]): Edisi[] {
  return [...list].sort((a, b) => b.tahun_masehi - a.tahun_masehi);
}

/** Object→row: 12 string cells, ready for appendRow / updateRow. */
export function edisiToRow(e: Edisi): string[] {
  return [
    e.id,
    e.tahun_hijriah,
    String(e.tahun_masehi),
    e.tanggal_idul_adha,
    e.tanggal_pendaftaran_buka,
    e.tanggal_pendaftaran_tutup,
    e.status,
    e.parent_edisi_id,
    e.cloned_at,
    e.created_at,
    e.updated_at,
    e.created_by,
  ];
}

export interface EdisiRecord {
  rowIndex: number;
  edisi: Edisi;
}

export async function findEdisiRecordById(id: string): Promise<EdisiRecord | null> {
  if (!id) return null;
  const rows = await sheetsService.getRows(QURBAN_SHEETS.EDISI);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return { rowIndex: i + 2, edisi: rowToEdisi(rows[i]) };
    }
  }
  return null;
}

export async function isTahunHijriahTaken(
  tahun: string,
  excludeId?: string
): Promise<boolean> {
  const all = await listEdisi();
  const norm = tahun.trim().toUpperCase();
  return all.some(
    (e) => e.tahun_hijriah.trim().toUpperCase() === norm && e.id !== excludeId
  );
}

export async function createEdisi(edisi: Edisi): Promise<void> {
  await sheetsService.appendRow(QURBAN_SHEETS.EDISI, edisiToRow(edisi));
}

export async function updateEdisiAt(rowIndex: number, edisi: Edisi): Promise<void> {
  await sheetsService.updateRow(QURBAN_SHEETS.EDISI, rowIndex, edisiToRow(edisi));
}
