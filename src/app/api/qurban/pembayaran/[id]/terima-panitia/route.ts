import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPembayaranRecordById, updatePembayaranAt } from '@/lib/qurban/pembayaran-repo';
import { auditPembayaranTerimaPanitia } from '@/lib/qurban/pembayaran-audit';

// PY2 — terima cash adalah operasi panitia (C-0: BD read-only di Pembayaran).
const TERIMA_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * PY2 — PATCH /api/qurban/pembayaran/[id]/terima-panitia?edisi_id=EDS-...
 *
 * TUNAI: `BELUM_BAYAR → TERIMA_PANITIA`. Panitia menerima cash dari muqorib;
 * setoran ke Kas Tunai (transaksi SKM) dilakukan di PY3 (lunaskan).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, TERIMA_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    const rec = await getPembayaranRecordById(id);
    if (!rec || rec.pembayaran.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Pembayaran tidak ditemukan.', 404);
    }
    const current = rec.pembayaran;

    if (current.metode !== 'TUNAI') {
      return error(
        ErrorCodes.CONFLICT,
        `Hanya pembayaran TUNAI yang dapat diterima panitia (metode saat ini: ${current.metode}).`,
        409,
        { metode: current.metode }
      );
    }
    if (current.status !== 'BELUM_BAYAR') {
      return error(
        ErrorCodes.CONFLICT,
        `Pembayaran berstatus ${current.status} tidak dapat ditandai TERIMA_PANITIA.`,
        409,
        { status: current.status }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const panitia_terima_id = typeof body.panitia_terima_id === 'string' ? body.panitia_terima_id.trim() : '';
    if (!panitia_terima_id) {
      return error(ErrorCodes.VALIDATION_REQUIRED, 'panitia_terima_id wajib diisi.', 422, { field: 'panitia_terima_id' });
    }
    const tanggalRaw = typeof body.tanggal_terima_panitia === 'string' ? body.tanggal_terima_panitia.trim() : '';
    const tanggal_terima_panitia = tanggalRaw || new Date().toISOString();
    if (!ISO_Z.test(tanggal_terima_panitia)) {
      return error(ErrorCodes.VALIDATION_FORMAT, 'tanggal_terima_panitia harus ISO-8601 Z.', 422, {
        field: 'tanggal_terima_panitia',
      });
    }
    const bukti_url = typeof body.bukti_url === 'string' ? body.bukti_url.trim() : '';

    const updated = {
      ...current,
      status: 'TERIMA_PANITIA' as const,
      tanggal_terima_panitia,
      panitia_terima_id,
      bukti_url: bukti_url || current.bukti_url,
      updated_at: new Date().toISOString(),
    };
    await updatePembayaranAt(rec.rowIndex, updated);
    await auditPembayaranTerimaPanitia(updated, actor, { panitia_terima_id, tanggal_terima_panitia });

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/pembayaran/[id]/terima-panitia] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal menandai pembayaran diterima panitia.', 500);
  }
}
