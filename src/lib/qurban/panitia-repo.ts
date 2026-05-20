import { sheetsService } from '@/lib/google-sheets';
import { QURBAN_SHEETS } from './sheets';

/**
 * Minimal repository for `qurban_panitia`. Milestone B needs only:
 *   - E5 activate pre-flight: "does this edisi have ≥1 active panitia?"
 *   - E2 create-with-clone: read source panitia (active only), write copies
 *     for the new edisi (ID/edisi_id/assigned_* regenerated).
 *
 * Full P1–P3 endpoints (assign / list / deactivate) ship with Milestone D.
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
