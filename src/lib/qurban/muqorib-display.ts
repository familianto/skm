import { cn } from '@/lib/utils';

/**
 * Display helpers + role gates for the F03 Muqorib UI pages (Milestone D).
 *
 * Mirrors `lib/anggota-display.ts` (F01): dependency-free string→string
 * helpers plus the client-side role sets used to show/hide action elements.
 * The authoritative role checks live server-side in the M1–M6 route guards;
 * these constants just keep the UI honest. Kept free of server-only imports
 * (no `google-sheets`) so it can be pulled into client components.
 */

/** Client-side shape of a muqorib record (mirror of `QurbanMuqorib`). */
export interface Muqorib {
  id: string;
  nama_lengkap: string;
  alamat: string;
  rt: string;
  no_hp: string;
  is_active: boolean;
  data_induk_ref_1447h: string;
  notes: string;
  created_at: string;
  created_by: string;
  updated_at: string;
}

/** RT options for the muqorib form (mirror of `RT_VALUES` in validators.ts). */
export const RT_OPTIONS = ['001', '002', '003', '004', '005', '006', 'Lainnya'] as const;

// Role sets — mirror the guards in src/app/api/qurban/muqorib/*.
export const MUQORIB_READ_ROLES = [
  'SUPER_ADMIN',
  'BENDAHARA',
  'ADMIN_QURBAN',
  'PENDAFTARAN',
] as const;
export const MUQORIB_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN'] as const;
export const MUQORIB_STATUS_ROLES = ['SUPER_ADMIN', 'ADMIN_QURBAN'] as const;

export function canReadMuqorib(peran: string | undefined): boolean {
  return !!peran && (MUQORIB_READ_ROLES as readonly string[]).includes(peran);
}
export function canWriteMuqorib(peran: string | undefined): boolean {
  return !!peran && (MUQORIB_WRITE_ROLES as readonly string[]).includes(peran);
}
export function canManageMuqoribStatus(peran: string | undefined): boolean {
  return !!peran && (MUQORIB_STATUS_ROLES as readonly string[]).includes(peran);
}

const BADGE_BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';

export function muqoribStatusBadgeClass(isActive: boolean): string {
  return cn(
    BADGE_BASE,
    isActive
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : 'bg-gray-100 text-gray-600 ring-gray-200'
  );
}

export function muqoribStatusLabel(isActive: boolean): string {
  return isActive ? 'Aktif' : 'Nonaktif';
}

/** Format an ISO timestamp as a readable Indonesian date (mirror of F01). */
export function formatMuqoribDateID(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
