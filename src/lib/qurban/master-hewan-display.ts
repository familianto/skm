import { cn } from '@/lib/utils';

/**
 * Display helpers + role gates for the F03 Master Hewan UI (Milestone E).
 *
 * Mirrors `muqorib-display.ts`. Master Hewan is PER-EDISI (unlike Muqorib).
 * Read access follows `path-rules.ts` (`/qurban/hewan` → SA/BD/AQ/PD; the
 * middleware blocks DISTRIBUSI at the page level). Write (create/edit/
 * deactivate) is SA/AQ only — matches the MH2/MH3/MH4 server guards.
 * Free of server-only imports so it can be used in client components.
 */

/** Client-side shape of a master_hewan record (mirror of `QurbanMasterHewan`). */
export interface MasterHewan {
  id: string;
  edisi_id: string;
  jenis: string;
  kelas: string;
  kapasitas_slot: number;
  harga_beli: number;
  harga_bawa_sendiri: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export const JENIS_OPTIONS = ['SAPI', 'KAMBING'] as const;
export const KELAS_OPTIONS = ['A', 'B', 'C', 'D'] as const;

// Role sets — mirror path-rules.ts (page read) + MH write guards.
export const MASTER_HEWAN_READ_ROLES = [
  'SUPER_ADMIN',
  'BENDAHARA',
  'ADMIN_QURBAN',
  'PENDAFTARAN',
] as const;
export const MASTER_HEWAN_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN_QURBAN'] as const;

export function canReadMasterHewan(peran: string | undefined): boolean {
  return !!peran && (MASTER_HEWAN_READ_ROLES as readonly string[]).includes(peran);
}
export function canWriteMasterHewan(peran: string | undefined): boolean {
  return !!peran && (MASTER_HEWAN_WRITE_ROLES as readonly string[]).includes(peran);
}

const BADGE_BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';

export function masterHewanStatusBadgeClass(isActive: boolean): string {
  return cn(
    BADGE_BASE,
    isActive
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : 'bg-gray-100 text-gray-600 ring-gray-200'
  );
}

export function masterHewanStatusLabel(isActive: boolean): string {
  return isActive ? 'Aktif' : 'Nonaktif';
}
