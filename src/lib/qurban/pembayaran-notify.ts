import { sendWhatsApp } from '@/lib/fonnte';
import { findEdisiById } from './edisi-repo';
import { findKonfigurasiByEdisiId } from './konfigurasi-repo';
import { getMuqoribById } from './muqorib-repo';
import { buildPembayaranConfirmedMessage } from './publik-wa-template';
import type { Pembayaran } from './pembayaran-repo';

/**
 * Notifikasi WA "pembayaran confirmed" (F6 D2). Dipanggil dari KEDUA jalur LUNAS:
 * PY3 lunaskan (TUNAI) & `applyMatch` (TRANSFER, M-C). Gated
 * `wa_send_on_pembayaran_confirmed`.
 *
 * Best-effort: SEMUA kegagalan (flag off, muqorib/edisi/no_hp tak ada, fonnte
 * error) di-swallow + log — pelunasan keuangan TIDAK boleh gagal karena WA.
 * Mengembalikan ringkasan untuk audit/observasi opsional.
 */
export interface NotifyResult {
  sent: boolean;
  reason?: 'flag_off' | 'no_hp' | 'no_muqorib' | 'no_edisi' | 'send_failed' | 'error';
  mock?: boolean;
}

export async function notifyPembayaranLunas(pembayaran: Pembayaran): Promise<NotifyResult> {
  try {
    const konfig = await findKonfigurasiByEdisiId(pembayaran.edisi_id);
    if (!konfig?.wa_send_on_pembayaran_confirmed) return { sent: false, reason: 'flag_off' };

    const muqorib = await getMuqoribById(pembayaran.muqorib_id);
    if (!muqorib) return { sent: false, reason: 'no_muqorib' };
    if (!(muqorib.no_hp || '').trim()) return { sent: false, reason: 'no_hp' };

    const edisi = await findEdisiById(pembayaran.edisi_id);
    if (!edisi) return { sent: false, reason: 'no_edisi' };

    const message = buildPembayaranConfirmedMessage({
      nama: muqorib.nama_lengkap,
      tahun_hijriah: edisi.tahun_hijriah,
      kode_bayar: pembayaran.kode_bayar,
      jumlah: pembayaran.nominal_total,
      metode: pembayaran.metode === 'TUNAI' ? 'TUNAI' : 'TRANSFER',
    });

    const res = await sendWhatsApp({ target: muqorib.no_hp, message });
    return res.success ? { sent: true, mock: res.mock } : { sent: false, reason: 'send_failed' };
  } catch (err) {
    console.error('[notifyPembayaranLunas] gagal (di-swallow):', err);
    return { sent: false, reason: 'error' };
  }
}
