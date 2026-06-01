import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { TransaksiJenis } from '@/types';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPembayaranById, listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';
import { getTransaksiLiteById } from '@/lib/qurban/skm-bridge';
import { applyMatch } from '@/lib/qurban/rekonsiliasi-apply';

// PY6 — link manual = domain finansial (SA + BD).
const LINK_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];

/**
 * PY6 — POST /api/qurban/pembayaran/[id]/link-transaksi?edisi_id=EDS-...
 *
 * Tautkan manual satu transaksi bank ke pembayaran TRANSFER (untuk transfer
 * tanpa kode / nominal beda / bank_ref tak match — BD memutuskan). Nominal beda
 * tetap diizinkan; selisih dicatat di `match_metadata`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, LINK_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const transaksi_id = typeof body.transaksi_id === 'string' ? body.transaksi_id.trim() : '';
    if (!transaksi_id) {
      return error(ErrorCodes.VALIDATION_REQUIRED, 'transaksi_id wajib diisi.', 422, { field: 'transaksi_id' });
    }

    // Pembayaran ada & milik edisi ini.
    const pembayaran = await getPembayaranById(id);
    if (!pembayaran || pembayaran.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Pembayaran tidak ditemukan.', 404);
    }

    // Transaksi ada & MASUK.
    const transaksi = await getTransaksiLiteById(transaksi_id);
    if (!transaksi) {
      return error(ErrorCodes.NOT_FOUND, 'Transaksi tidak ditemukan.', 404, { transaksi_id });
    }
    if (transaksi.jenis !== TransaksiJenis.MASUK) {
      return error(ErrorCodes.CONFLICT, `Transaksi ${transaksi_id} bukan MASUK (jenis: ${transaksi.jenis}).`, 409);
    }

    // Transaksi belum ter-link ke pembayaran lain.
    const already = (await listPembayaranByEdisi(gate.edisi.id)).find((p) => p.skm_transaksi_id === transaksi_id);
    if (already) {
      return error(ErrorCodes.CONFLICT, `Transaksi ${transaksi_id} sudah tertaut ke pembayaran ${already.id}.`, 409, { pembayaran_id: already.id });
    }

    const r = await applyMatch(id, transaksi, { layer: 'MANUAL', via: 'PY6', edisiId: gate.edisi.id, actor });
    if (!r.ok) {
      const status = r.code === 'NOT_FOUND' ? 404 : 409;
      return error(r.code === 'NOT_FOUND' ? ErrorCodes.NOT_FOUND : ErrorCodes.CONFLICT, r.reason, status);
    }

    return success(r.pembayaran, r.amount_ok ? undefined : { warning: 'Nominal transaksi ≠ nominal_transfer; selisih dicatat di match_metadata.' });
  } catch (err) {
    console.error('[POST /api/qurban/pembayaran/[id]/link-transaksi] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal menautkan transaksi.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
