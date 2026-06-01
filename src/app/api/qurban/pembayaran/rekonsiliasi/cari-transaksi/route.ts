import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';
import { resolveRekeningByNama, listTransaksiMasukByRekening, REKENING_BANK_MUAMALAT } from '@/lib/qurban/skm-bridge';

// Pencarian transaksi untuk Taut Manual = domain finansial → SA + BD.
const ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];
const MAX_RESULTS = 50;

/**
 * PY8 — GET /api/qurban/pembayaran/rekonsiliasi/cari-transaksi?edisi_id=&q=
 *
 * Cari transaksi bank MASUK/AKTIF (Bank Muamalat) yang BELUM ter-link, untuk
 * Taut Manual (PY6). **TIDAK dibatasi band** — agar transfer kecil di luar band
 * (mis. Bawa Sendiri 250rb) tetap bisa ditangani manual. Read-only. `q` opsional
 * mencocokkan deskripsi / bank_ref / id / nominal (substring, case-insensitive).
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, ROLES);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    const rekeningId = await resolveRekeningByNama(REKENING_BANK_MUAMALAT);
    const linked = new Set(
      (await listPembayaranByEdisi(gate.edisi.id)).map((p) => p.skm_transaksi_id).filter(Boolean)
    );

    let rows = (await listTransaksiMasukByRekening(rekeningId)).filter((t) => !linked.has(t.id));
    if (q) {
      rows = rows.filter((t) =>
        `${t.id} ${t.deskripsi} ${t.bank_ref} ${t.jumlah}`.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => (a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? 1 : -1) : a.id < b.id ? 1 : -1));
    const limited = rows.slice(0, MAX_RESULTS);

    return success(
      limited.map((t) => ({
        id: t.id,
        tanggal: t.tanggal,
        deskripsi: t.deskripsi,
        jumlah: t.jumlah,
        bank_ref: t.bank_ref,
      })),
      { total: rows.length, filters_applied: { edisi_id: gate.edisi.id, q: q || null, returned: limited.length } }
    );
  } catch (err) {
    console.error('[GET /api/qurban/pembayaran/rekonsiliasi/cari-transaksi] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal mencari transaksi.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
