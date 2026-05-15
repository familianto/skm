import { cn } from './utils';

/**
 * Display helpers for the F01 anggota CRUD pages (E2–E5).
 *
 * Kept dependency-free (string → string, no React) so they can be unit-tested
 * if needed and imported into both server and client components.
 */

/** Bahasa labels per peran enum, used in tables/cards/dropdowns. */
export const PERAN_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  BENDAHARA: 'Bendahara',
  ADMIN_QURBAN: 'Admin Qurban',
  PENDAFTARAN: 'Pendaftaran',
  DISTRIBUSI: 'Distribusi',
};

/**
 * Badge color classes per peran. Keep palette stable across the F1 UI so
 * users learn role-by-color recognition.
 */
export const PERAN_BADGE_CLASS: Record<string, string> = {
  SUPER_ADMIN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  BENDAHARA: 'bg-blue-50 text-blue-700 ring-blue-200',
  ADMIN_QURBAN: 'bg-purple-50 text-purple-700 ring-purple-200',
  PENDAFTARAN: 'bg-amber-50 text-amber-700 ring-amber-200',
  DISTRIBUSI: 'bg-pink-50 text-pink-700 ring-pink-200',
};

const BADGE_BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';

export function peranBadgeClass(peran: string): string {
  const color =
    PERAN_BADGE_CLASS[peran] ||
    'bg-gray-50 text-gray-700 ring-gray-200';
  return cn(BADGE_BASE, color);
}

export function peranLabel(peran: string): string {
  return PERAN_LABEL[peran] || peran;
}

/** Account status for badge display. `Terkunci` derived from locked_until. */
export type AnggotaStatus = 'aktif' | 'nonaktif' | 'terkunci';

export function anggotaStatus(a: {
  is_active: boolean;
  locked_until?: string;
}): AnggotaStatus {
  if (a.locked_until) {
    const until = new Date(a.locked_until).getTime();
    if (!isNaN(until) && until > Date.now()) return 'terkunci';
  }
  return a.is_active ? 'aktif' : 'nonaktif';
}

export function statusBadgeClass(status: AnggotaStatus): string {
  switch (status) {
    case 'aktif':
      return cn(BADGE_BASE, 'bg-emerald-50 text-emerald-700 ring-emerald-200');
    case 'terkunci':
      return cn(BADGE_BASE, 'bg-red-50 text-red-700 ring-red-200');
    case 'nonaktif':
      return cn(BADGE_BASE, 'bg-gray-100 text-gray-600 ring-gray-200');
  }
}

export function statusLabel(status: AnggotaStatus): string {
  switch (status) {
    case 'aktif':
      return 'Aktif';
    case 'terkunci':
      return 'Terkunci';
    case 'nonaktif':
      return 'Non-aktif';
  }
}

/**
 * Format ISO timestamp as Indonesian relative time. Falls back to absolute
 * date for events older than ~30 days.
 *
 *   30s ago     → "baru saja"
 *   5m ago      → "5 menit lalu"
 *   3h ago      → "3 jam lalu"
 *   2d ago      → "2 hari lalu"
 *   45d ago     → "12 Mar 2026"
 *   empty / NaN → "—"
 */
export function relativeTimeID(iso: string | undefined | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'baru saja';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
