import { cn } from '@/lib/utils';
import type {
  QurbanPeserta,
  StatusPendaftaran,
  SumberPendaftaran,
  TipeQurban,
} from './peserta-types';

/**
 * Display helpers + role gates for the F4c Peserta UI pages (Milestone A).
 *
 * Mirrors `muqorib-display.ts` / `daftar-hewan-display.ts`: dependency-free
 * string→string helpers plus the client-side role sets used to show/hide UI.
 * The authoritative role checks live server-side in the PS1–PS8 route guards;
 * these constants just keep the UI honest. No server-only imports (no
 * `google-sheets`) so this is safe in client components.
 *
 * PS1/PS3 return raw `QurbanPeserta` rows (NOT denormalised) — the list/detail
 * views enrich `hewan_id`→label (via H1) and `muqorib_id`→nama (via M1) on the
 * client. Name resolution follows the schema rule: `nama_atas_nama` first, then
 * `muqorib.nama_lengkap`.
 */

export type { QurbanPeserta } from './peserta-types';

/** List row enriched with human-readable labels resolved client-side. */
export interface PesertaListRow extends QurbanPeserta {
  /** `nama_atas_nama` || muqorib nama || '—'. */
  display_nama: string;
  /** e.g. `"Sapi-A-01 · Slot 3"` — falls back to raw `hewan_id` if unresolved. */
  hewan_label: string;
}

// Role sets — mirror the peserta route guards. READ = PS1/PS3; WRITE = PS2/PS4
// create/patch (Tambah here in F4c-B; Edit/Batal reuse it in F4c-C). BENDAHARA
// is read-only (in READ but not WRITE).
export const PESERTA_READ_ROLES = [
  'SUPER_ADMIN',
  'BENDAHARA',
  'ADMIN_QURBAN',
  'PENDAFTARAN',
] as const;
export const PESERTA_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN'] as const;

export function canReadPeserta(peran: string | undefined): boolean {
  return !!peran && (PESERTA_READ_ROLES as readonly string[]).includes(peran);
}

export function canWritePeserta(peran: string | undefined): boolean {
  return !!peran && (PESERTA_WRITE_ROLES as readonly string[]).includes(peran);
}

const BADGE_BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';

export function statusPendaftaranBadgeClass(status: string): string {
  switch (status) {
    case 'TERDAFTAR':
      return cn(BADGE_BASE, 'bg-emerald-50 text-emerald-700 ring-emerald-200');
    case 'BATAL':
      return cn(BADGE_BASE, 'bg-gray-100 text-gray-600 ring-gray-200');
    default:
      return cn(BADGE_BASE, 'bg-gray-100 text-gray-600 ring-gray-200');
  }
}

export function statusPendaftaranLabel(status: string): string {
  switch (status) {
    case 'TERDAFTAR':
      return 'Terdaftar';
    case 'BATAL':
      return 'Batal';
    default:
      return status || '—';
  }
}

export function tipeQurbanBadgeClass(tipe: string): string {
  switch (tipe) {
    case 'BELI':
      return cn(BADGE_BASE, 'bg-sky-50 text-sky-700 ring-sky-200');
    case 'BAWA_SENDIRI':
      return cn(BADGE_BASE, 'bg-violet-50 text-violet-700 ring-violet-200');
    default:
      return cn(BADGE_BASE, 'bg-gray-100 text-gray-600 ring-gray-200');
  }
}

export function tipeQurbanLabel(tipe: string): string {
  switch (tipe) {
    case 'BELI':
      return 'Beli';
    case 'BAWA_SENDIRI':
      return 'Bawa Sendiri';
    default:
      return tipe || '—';
  }
}

export function sumberPendaftaranLabel(sumber: string): string {
  switch (sumber) {
    case 'PUBLIK':
      return 'Pendaftaran Publik';
    case 'PANITIA':
      return 'Input Panitia';
    case 'IMPORT_1447H':
      return 'Impor 1447H';
    default:
      return sumber || '—';
  }
}

/**
 * Resolve the human label for a peserta row: `nama_atas_nama` (override) first,
 * then the muqorib's `nama_lengkap`, else a dash. Mirrors the schema rule in
 * `DATABASE_SCHEMA` / API_REFERENCE (no `nama` column on `qurban_peserta`).
 */
export function pesertaDisplayNama(
  namaAtasNama: string | null | undefined,
  muqoribNama?: string | null
): string {
  const override = (namaAtasNama || '').trim();
  if (override) return override;
  const muqorib = (muqoribNama || '').trim();
  if (muqorib) return muqorib;
  return '—';
}

/** `"Sapi-A-01 · Slot 3"` — `namaDisplay` from H1, slot from the peserta row. */
export function hewanSlotLabel(
  namaDisplay: string | null | undefined,
  slotNumber: number,
  fallbackId?: string
): string {
  const base = (namaDisplay || '').trim() || (fallbackId || '').trim() || '—';
  return `${base} · Slot ${slotNumber}`;
}

/** Format an ISO timestamp as a compact Indonesian date (mirror of F03/F5a). */
export function formatPesertaDateID(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export type StatusFilterValue = 'ALL' | StatusPendaftaran;

export interface PesertaFilterState {
  status: StatusFilterValue;
  search: string;
}

/**
 * Pure list filter: status (ALL passes everything) + case-insensitive text
 * match over the resolved display name and `kode_bayar`. Operates on enriched
 * rows so the haystack already carries the resolved muqorib/override name.
 */
export function filterPeserta(
  rows: PesertaListRow[],
  state: PesertaFilterState
): PesertaListRow[] {
  const q = state.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (state.status !== 'ALL' && r.status_pendaftaran !== state.status) {
      return false;
    }
    if (!q) return true;
    return (
      r.display_nama.toLowerCase().includes(q) ||
      r.kode_bayar.toLowerCase().includes(q)
    );
  });
}

// Re-export the underlying enum types for convenience in client components.
export type { StatusPendaftaran, SumberPendaftaran, TipeQurban };
