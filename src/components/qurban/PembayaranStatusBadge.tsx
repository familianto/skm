import { cn } from '@/lib/utils';
import { statusPembayaranBadgeClass, statusPembayaranLabel } from '@/lib/qurban/pembayaran-display';

/**
 * Badge status pembayaran qurban (F6 D2). Dipakai di halaman Pembayaran dan
 * di daftar/detail Peserta (per `kode_bayar`). Warna: BELUM_BAYAR netral,
 * TERIMA_PANITIA amber, LUNAS hijau, BATAL merah-redup.
 */
export function PembayaranStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        statusPembayaranBadgeClass(status),
        className
      )}
    >
      {statusPembayaranLabel(status)}
    </span>
  );
}
