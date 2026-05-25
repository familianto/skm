import { cn } from '@/lib/utils';

/**
 * Display helpers + role gates for the F5a Daftar Hewan (inventaris fisik) UI
 * (Milestone C). Mirrors `muqorib-display.ts` / `master-hewan-display.ts`:
 * dependency-free string helpers + client-side role sets. Server route guards
 * (H1–H7) remain the source of truth; these keep the UI honest. No server-only
 * imports so this is safe in client components.
 */

/** Enriched list item shape returned by H1 (and H2 minus occupants). */
export interface DaftarHewanListItem {
  id: string;
  edisi_id: string;
  master_hewan_id: string;
  jenis: string;
  kelas: string;
  nomor_urut: number;
  kapasitas_slot: number;
  tipe_pembelian: string;
  vendor_nama: string;
  harga_beli_aktual: number;
  tanggal_pembelian: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  nama_display: string;
  slot_terisi: number;
}

export interface Occupant {
  peserta_id: string;
  nama: string;
  status: string;
}

/** Detail shape returned by H3 (list item + slot occupants). */
export interface DaftarHewanDetailData extends DaftarHewanListItem {
  occupants: Occupant[];
}

// Role sets — mirror the H1–H7 guards. Write (H2/H4/H5) includes PENDAFTARAN;
// status/cancel (H6/H7) are admin-only but those actions land in Milestone D.
export const DAFTAR_HEWAN_READ_ROLES = [
  'SUPER_ADMIN',
  'BENDAHARA',
  'ADMIN_QURBAN',
  'PENDAFTARAN',
] as const;
export const DAFTAR_HEWAN_WRITE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN_QURBAN',
  'PENDAFTARAN',
] as const;

export function canReadDaftarHewan(peran: string | undefined): boolean {
  return !!peran && (DAFTAR_HEWAN_READ_ROLES as readonly string[]).includes(peran);
}
export function canWriteDaftarHewan(peran: string | undefined): boolean {
  return !!peran && (DAFTAR_HEWAN_WRITE_ROLES as readonly string[]).includes(peran);
}

export const JENIS_OPTIONS = ['SAPI', 'KAMBING'] as const;
export const KELAS_OPTIONS = ['A', 'B', 'C', 'D'] as const;
export const STATUS_OPTIONS = ['DRAFT', 'AKTIF', 'TERPOTONG', 'BATAL'] as const;

/** TERPOTONG & BATAL are terminal — Edit is hidden for these. */
export function isHewanTerminal(status: string): boolean {
  return status === 'TERPOTONG' || status === 'BATAL';
}

const BADGE_BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';

export function hewanStatusBadgeClass(status: string): string {
  switch (status) {
    case 'AKTIF':
      return cn(BADGE_BASE, 'bg-emerald-50 text-emerald-700 ring-emerald-200');
    case 'DRAFT':
      return cn(BADGE_BASE, 'bg-amber-50 text-amber-700 ring-amber-200');
    case 'TERPOTONG':
      return cn(BADGE_BASE, 'bg-sky-50 text-sky-700 ring-sky-200');
    case 'BATAL':
      return cn(BADGE_BASE, 'bg-gray-100 text-gray-600 ring-gray-200');
    default:
      return cn(BADGE_BASE, 'bg-gray-100 text-gray-600 ring-gray-200');
  }
}

export function hewanStatusLabel(status: string): string {
  switch (status) {
    case 'AKTIF':
      return 'Aktif';
    case 'DRAFT':
      return 'Draft';
    case 'TERPOTONG':
      return 'Terpotong';
    case 'BATAL':
      return 'Batal';
    default:
      return status || '—';
  }
}

export function tipePembelianLabel(tipe: string): string {
  if (tipe === 'BELI') return 'Beli';
  if (tipe === 'BAWA_SENDIRI') return 'Bawa Sendiri';
  return tipe || '—';
}

/** Title-case a jenis enum, mis. `SAPI` → `Sapi`. */
export function jenisLabel(jenis: string): string {
  if (!jenis) return '';
  return jenis.charAt(0).toUpperCase() + jenis.slice(1).toLowerCase();
}

/** Dropdown label for a master hewan, mis. "Sapi — Kelas A (kapasitas 7 slot)". */
export function masterHewanOptionLabel(m: {
  jenis: string;
  kelas: string;
  kapasitas_slot: number;
}): string {
  return `${jenisLabel(m.jenis)} — Kelas ${m.kelas} (kapasitas ${m.kapasitas_slot} slot)`;
}

/** Format an ISO timestamp / `YYYY-MM-DD` as a readable Indonesian date. */
export function formatHewanDateID(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
