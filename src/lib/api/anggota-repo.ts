import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { UserPeran, type Anggota } from '@/types';

/**
 * Repository for the `anggota` sheet (post-F01 schema, 13 columns).
 *
 * Column order MUST mirror `SHEET_HEADERS[ANGGOTA]` in `lib/constants.ts`:
 *   0:id 1:nama 2:telepon 3:email 4:peran 5:is_active 6:created_at
 *   7:pin_hash 8:created_by 9:updated_at 10:last_login_at
 *   11:failed_attempts 12:locked_until
 *
 * Shared between auth endpoints (A1–A4) and anggota CRUD endpoints (U1–U9).
 * Centralising row<->object mapping prevents off-by-one drift across 13 routes.
 */

export type AnggotaFull = Required<Anggota>;

/** Row→object: defensive against rows shorter than 13 cells (legacy rows). */
export function rowToAnggota(row: string[]): AnggotaFull {
  return {
    id: row[0] || '',
    nama: row[1] || '',
    telepon: row[2] || '',
    email: row[3] || '',
    peran: (row[4] || '') as UserPeran,
    is_active: (row[5] || '').toUpperCase() === 'TRUE',
    created_at: row[6] || '',
    pin_hash: row[7] || '',
    created_by: row[8] || '',
    updated_at: row[9] || '',
    last_login_at: row[10] || '',
    failed_attempts: parseInt(row[11] || '0', 10) || 0,
    locked_until: row[12] || '',
  };
}

/** Object→row: 13 string cells, ready for appendRow / updateRow. */
export function anggotaToRow(a: AnggotaFull): string[] {
  return [
    a.id,
    a.nama,
    a.telepon,
    a.email,
    String(a.peran),
    a.is_active ? 'TRUE' : 'FALSE',
    a.created_at,
    a.pin_hash,
    a.created_by,
    a.updated_at,
    a.last_login_at,
    String(a.failed_attempts),
    a.locked_until,
  ];
}

/** Strip sensitive fields before returning to the client. */
export function publicAnggota(a: AnggotaFull): Omit<AnggotaFull, 'pin_hash'> {
  return {
    id: a.id,
    nama: a.nama,
    telepon: a.telepon,
    email: a.email,
    peran: a.peran,
    is_active: a.is_active,
    created_at: a.created_at,
    created_by: a.created_by,
    updated_at: a.updated_at,
    last_login_at: a.last_login_at,
    failed_attempts: a.failed_attempts,
    locked_until: a.locked_until,
  };
}

export interface AnggotaRecord {
  row: string[];
  rowIndex: number;
  anggota: AnggotaFull;
}

export async function findByTelepon(telepon: string): Promise<AnggotaRecord | null> {
  const rows = await sheetsService.getRows(SHEET_NAMES.ANGGOTA);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][2] === telepon) {
      return { row: rows[i], rowIndex: i + 2, anggota: rowToAnggota(rows[i]) };
    }
  }
  return null;
}

export async function findById(id: string): Promise<AnggotaRecord | null> {
  const result = await sheetsService.getRowById(SHEET_NAMES.ANGGOTA, id);
  if (!result) return null;
  return {
    row: result.row,
    rowIndex: result.rowIndex,
    anggota: rowToAnggota(result.row),
  };
}

export async function listAll(): Promise<{ rowIndex: number; anggota: AnggotaFull }[]> {
  const rows = await sheetsService.getRows(SHEET_NAMES.ANGGOTA);
  return rows.map((row, i) => ({ rowIndex: i + 2, anggota: rowToAnggota(row) }));
}

export async function updateAt(rowIndex: number, anggota: AnggotaFull): Promise<void> {
  await sheetsService.updateRow(SHEET_NAMES.ANGGOTA, rowIndex, anggotaToRow(anggota));
}

/**
 * Whether `locked_until` is in the future (i.e., account currently locked).
 * Empty / past timestamps return false.
 */
export function isLocked(anggota: AnggotaFull, now: Date = new Date()): boolean {
  if (!anggota.locked_until) return false;
  const until = new Date(anggota.locked_until);
  if (isNaN(until.getTime())) return false;
  return until > now;
}

/**
 * Count active SUPER_ADMIN users (excluding optional `excludeId`).
 * Used by U4/U7 last-SUPER_ADMIN protection.
 */
export async function countActiveSuperAdmins(excludeId?: string): Promise<number> {
  const all = await listAll();
  return all.filter(
    ({ anggota }) =>
      anggota.is_active &&
      anggota.peran === UserPeran.SUPER_ADMIN &&
      anggota.id !== excludeId
  ).length;
}
