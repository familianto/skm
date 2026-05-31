import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';
import {
  resolveRekeningByNama,
  listTransaksiMasukByRekening,
  REKENING_BANK_MUAMALAT,
} from '@/lib/qurban/skm-bridge';
import { classifyTransaksi, indexPembayaranByKode } from '@/lib/qurban/rekonsiliasi-engine';
import { applyMatch } from '@/lib/qurban/rekonsiliasi-apply';

// Rekonsiliasi = domain finansial → SA + BD.
const REKON_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];

/**
 * C-2 — POST /api/qurban/pembayaran/rekonsiliasi?edisi_id=EDS-...
 *
 * Pass rekonsiliasi TRANSFER (Layer 1, deterministik). Membaca transaksi
 * `MASUK`/`AKTIF` rekening Bank Muamalat yang BELUM ter-link, mengklasifikasi
 * via engine, lalu AUTO-apply yang `AUTO_MATCH`. Idempoten (run ulang melewati
 * transaksi yang sudah ter-link). TIDAK menyentuh alur import.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, REKON_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const rekeningId = await resolveRekeningByNama(REKENING_BANK_MUAMALAT);

    const pembayaranEdisi = await listPembayaranByEdisi(edisiId);
    const linked = new Set(pembayaranEdisi.map((p) => p.skm_transaksi_id).filter(Boolean));
    const kodeIndex = indexPembayaranByKode(pembayaranEdisi);

    const kandidat = (await listTransaksiMasukByRekening(rekeningId)).filter((t) => !linked.has(t.id));

    const auto_lunas: Array<{ transaksi_id: string; pembayaran_id: string; kode_bayar: string; kategori_corrected: boolean; mixed: boolean }> = [];
    const anomali: Array<{ transaksi_id: string; kode_bayar: string; alasan: string }> = [];
    const unmatched: Array<{ transaksi_id: string; jumlah: number; deskripsi: string; tanggal: string }> = [];

    for (const t of kandidat) {
      const c = classifyTransaksi(t, kodeIndex);
      if (c.kind === 'auto') {
        const r = await applyMatch(c.pembayaran.id, t, { layer: 'AUTO', via: 'rekonsiliasi', edisiId, actor });
        if (r.ok) {
          auto_lunas.push({
            transaksi_id: t.id,
            pembayaran_id: c.pembayaran.id,
            kode_bayar: c.kode_bayar,
            kategori_corrected: r.kategori_corrected,
            mixed: r.mixed,
          });
        } else {
          // Gate gagal di apply (mis. ter-link oleh proses lain) → catat anomali.
          anomali.push({ transaksi_id: t.id, kode_bayar: c.kode_bayar, alasan: r.reason });
        }
      } else if (c.kind === 'anomali') {
        anomali.push({ transaksi_id: t.id, kode_bayar: c.kode_bayar, alasan: c.alasan });
      } else {
        unmatched.push({ transaksi_id: t.id, jumlah: t.jumlah, deskripsi: t.deskripsi, tanggal: t.tanggal });
      }
    }

    return success(
      { auto_lunas, anomali, unmatched },
      { total: kandidat.length, filters_applied: { edisi_id: edisiId, rekening_id: rekeningId } }
    );
  } catch (err) {
    console.error('[POST /api/qurban/pembayaran/rekonsiliasi] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal menjalankan rekonsiliasi.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
