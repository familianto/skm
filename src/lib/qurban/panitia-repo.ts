import { sheetsService } from '@/lib/google-sheets';
import { QURBAN_SHEETS } from './sheets';

/**
 * Repository for `qurban_panitia`.
 *
 * Milestone B introduced minimal read + create helpers (preflight E5 + clone
 * E2). Milestone D extends with single-row lookup and in-place update so P3
 * can soft-remove (`is_active=FALSE`) without deleting the row.
 *
 * Column order MUST mirror migrate_F02's qurban_panitia sheet (7 cols):
 *   0:id  1:edisi_id  2:anggota_id  3:is_active  4:assigned_at
 *   5:assigned_by  6:notes
 */

export interface Panitia {
  id: string;
  edisi_id: string;
  anggota_id: string;
  is_active: boolean;
  assigned_at: string;
  assigned_by: string;
  notes: string;
}

function rowToPanitia(row: string[]): Panitia {
  return {
    id: row[0] || '',
    edisi_id: row[1] || '',
    anggota_id: row[2] || '',
    is_active: (row[3] || '').toUpperCase() === 'TRUE',
    assigned_at: row[4] || '',
    assigned_by: row[5] || '',
    notes: row[6] || '',
  };
}

export function panitiaToRow(p: Panitia): string[] {
  return [
    p.id,
    p.edisi_id,
    p.anggota_id,
    p.is_active ? 'TRUE' : 'FALSE',
    p.assigned_at,
    p.assigned_by,
    p.notes,
  ];
}

async function listPanitia(): Promise<Panitia[]> {
  try {
    const rows = await sheetsService.getRows(QURBAN_SHEETS.PANITIA);
    return rows.filter((r) => r[0]).map(rowToPanitia);
  } catch (err) {
    console.error('[panitia-repo.listPanitia] failed:', err);
    return [];
  }
}

export async function listPanitiaByEdisi(edisiId: string): Promise<Panitia[]> {
  if (!edisiId) return [];
  const all = await listPanitia();
  return all.filter((p) => p.edisi_id === edisiId);
}

export async function listActivePanitiaByEdisi(edisiId: string): Promise<Panitia[]> {
  const list = await listPanitiaByEdisi(edisiId);
  return list.filter((p) => p.is_active);
}

export async function countActivePanitiaByEdisi(edisiId: string): Promise<number> {
  return (await listActivePanitiaByEdisi(edisiId)).length;
}

export async function createPanitia(p: Panitia): Promise<void> {
  await sheetsService.appendRow(QURBAN_SHEETS.PANITIA, panitiaToRow(p));
}

export interface PanitiaRecord {
  rowIndex: number;
  panitia: Panitia;
}

/** Locate panitia row by id, returning sheet rowIndex (1-based) for update. */
export async function findPanitiaRecordById(id: string): Promise<PanitiaRecord | null> {
  if (!id) return null;
  try {
    const rows = await sheetsService.getRows(QURBAN_SHEETS.PANITIA);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === id) {
        return { rowIndex: i + 2, panitia: rowToPanitia(rows[i]) };
      }
    }
    return null;
  } catch (err) {
    console.error('[panitia-repo.findPanitiaRecordById] failed:', err);
    return null;
  }
}

/** Dedup check: is this anggota already an ACTIVE panitia for this edisi? */
export async function findActivePanitiaByEdisiAndAnggota(
  edisiId: string,
  anggotaId: string
): Promise<Panitia | null> {
  if (!edisiId || !anggotaId) return null;
  const list = await listActivePanitiaByEdisi(edisiId);
  return list.find((p) => p.anggota_id === anggotaId) ?? null;
}

export async function updatePanitiaAt(rowIndex: number, p: Panitia): Promise<void> {
  await sheetsService.updateRow(QURBAN_SHEETS.PANITIA, rowIndex, panitiaToRow(p));
}
