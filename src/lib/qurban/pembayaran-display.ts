import type { MetodePembayaran, StatusPembayaran } from './pembayaran-repo';

/**
 * Helper presentasi murni untuk UI pembayaran (F6 D2). RBAC UI mengikuti API:
 * PY2 terima-panitia `[SA,AQ,PD]`, PY3 lunaskan `[SA,BD]` (guard API tetap
 * sumber kebenaran). Semua fungsi pure → mudah dites.
 */

export const PEMBAYARAN_READ_ROLES = ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'] as const;
const TERIMA_ROLES = ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN'];
const LUNASKAN_ROLES = ['SUPER_ADMIN', 'BENDAHARA'];

export function canReadPembayaran(peran: string | undefined): boolean {
  return !!peran && (PEMBAYARAN_READ_ROLES as readonly string[]).includes(peran);
}

/** Boleh tekan "Terima Panitia" (PY2): metode TUNAI + BELUM_BAYAR + peran cocok. */
export function canTerimaPanitia(peran: string | undefined, metode: string, status: string): boolean {
  return !!peran && TERIMA_ROLES.includes(peran) && metode === 'TUNAI' && status === 'BELUM_BAYAR';
}

/** Boleh tekan "Setor ke Kas" (PY3): metode TUNAI + TERIMA_PANITIA + peran cocok. */
export function canLunaskan(peran: string | undefined, metode: string, status: string): boolean {
  return !!peran && LUNASKAN_ROLES.includes(peran) && metode === 'TUNAI' && status === 'TERIMA_PANITIA';
}

export function statusPembayaranLabel(status: string): string {
  switch (status) {
    case 'BELUM_BAYAR': return 'Belum Bayar';
    case 'TERIMA_PANITIA': return 'Diterima Panitia';
    case 'LUNAS': return 'Lunas';
    case 'BATAL': return 'Batal';
    default: return status || '—';
  }
}

/** Kelas Tailwind badge per status (netral/amber/hijau/merah-redup). */
export function statusPembayaranBadgeClass(status: string): string {
  switch (status) {
    case 'BELUM_BAYAR':
      return 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200';
    case 'TERIMA_PANITIA':
      return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200';
    case 'LUNAS':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
    case 'BATAL':
      return 'bg-red-50 text-red-500 ring-1 ring-inset ring-red-200';
    default:
      return 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200';
  }
}

export function metodePembayaranLabel(metode: string): string {
  switch (metode) {
    case 'TRANSFER': return 'Transfer';
    case 'TUNAI': return 'Cash · Datang Langsung';
    case 'VA': return 'Virtual Account';
    case 'IMPORT_1447H': return 'Impor 1447H';
    default: return metode || '—';
  }
}

/** Indikasi sub-teks untuk TRANSFER yang belum lunas (menunggu rekonsiliasi). */
export function transferHintForStatus(metode: string, status: string): string | null {
  if (metode !== 'TRANSFER') return null;
  if (status === 'BELUM_BAYAR') return 'Menunggu transfer / rekonsiliasi';
  return null;
}

/** Baris pembayaran yang dikembalikan PY4 (+ enrichment). */
export interface PembayaranRow {
  id: string;
  edisi_id: string;
  kode_bayar: string;
  muqorib_id: string;
  nominal_total: number;
  nominal_transfer: number;
  metode: MetodePembayaran;
  status: StatusPembayaran;
  tanggal_terima_panitia: string;
  panitia_terima_id: string;
  tanggal_lunas: string;
  bank_ref: string;
  skm_transaksi_id: string;
  bukti_url: string;
  match_metadata: string;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  muqorib_nama: string;
  jumlah_slot: number;
}

export type StatusPembayaranFilter = 'ALL' | StatusPembayaran;
export type MetodePembayaranFilter = 'ALL' | MetodePembayaran;

/** Filter client-side (mirror query PY4) atas baris yang sudah dimuat. */
export function filterPembayaran(
  rows: PembayaranRow[],
  f: { status: StatusPembayaranFilter; metode: MetodePembayaranFilter; q: string }
): PembayaranRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status !== 'ALL' && r.status !== f.status) return false;
    if (f.metode !== 'ALL' && r.metode !== f.metode) return false;
    if (q && !(`${r.kode_bayar} ${r.muqorib_nama}`.toLowerCase().includes(q))) return false;
    return true;
  });
}
