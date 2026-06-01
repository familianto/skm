import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPembayaranRecordById, updatePembayaranAt } from '@/lib/qurban/pembayaran-repo';
import { correctTransaksiKategori } from '@/lib/qurban/skm-bridge';
import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';

// Resolusi kategori mixed = domain finansial → SA + BD.
const ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];

/** Hapus penanda mixed dari JSON match_metadata; sisanya dipertahankan. */
function clearMixedFlag(metaRaw: string): string {
  if (!metaRaw) return metaRaw;
  try {
    const meta = JSON.parse(metaRaw) as Record<string, unknown>;
    delete meta.mixed;
    delete meta.note;
    meta.kategori_resolved = true;
    return JSON.stringify(meta);
  } catch {
    return metaRaw; // metadata tak terbaca → biarkan apa adanya.
  }
}

/**
 * PY9 — POST /api/qurban/pembayaran/[id]/resolve-kategori?edisi_id=EDS-...
 *
 * Q4a — selesaikan kategori transaksi TRANSFER ber-flag `mixed` (slot lintas-jenis
 * akibat remap pemetaan F5b; sudah LUNAS tapi kategori belum dikoreksi). Panitia
 * MEMILIH `kategori_id` (jangan auto-tebak); koreksi via jalur kanonik SKM, lalu
 * turunkan flag mixed di `match_metadata`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kategori_id = typeof body.kategori_id === 'string' ? body.kategori_id.trim() : '';
    if (!kategori_id) {
      return error(ErrorCodes.VALIDATION_REQUIRED, 'kategori_id wajib diisi.', 422, { field: 'kategori_id' });
    }

    const rec = await getPembayaranRecordById(id);
    if (!rec || rec.pembayaran.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Pembayaran tidak ditemukan.', 404);
    }
    const p = rec.pembayaran;
    if (!p.skm_transaksi_id) {
      return error(ErrorCodes.CONFLICT, 'Pembayaran belum tertaut transaksi; tidak ada kategori untuk dikoreksi.', 409);
    }

    // Koreksi kategori transaksi lewat jalur kanonik SKM (mirror PUT transaksi).
    const res = await correctTransaksiKategori(p.skm_transaksi_id, kategori_id, actor.user_id);

    // Turunkan flag mixed di metadata pembayaran.
    const updated = { ...p, match_metadata: clearMixedFlag(p.match_metadata), updated_at: new Date().toISOString() };
    await updatePembayaranAt(rec.rowIndex, updated);

    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'pembayaran',
      entitas_id: p.id,
      event_type: 'pembayaran.kategori_resolved',
      before: { kategori_id: res.from },
      after: { kategori_id, skm_transaksi_id: p.skm_transaksi_id, changed: res.changed },
      user_id: actor.user_id,
      ip_address: actor.ip_address,
    });

    return success(updated, { warning: res.changed ? undefined : 'Kategori transaksi sudah sama; hanya flag mixed yang diturunkan.' });
  } catch (err) {
    console.error('[POST /api/qurban/pembayaran/[id]/resolve-kategori] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal menyelesaikan kategori.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
