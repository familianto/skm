import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { sheetsService } from '@/lib/google-sheets';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPesertaRecordById, updatePesertaAt, STATUS_TERDAFTAR, STATUS_BATAL } from '@/lib/qurban/peserta-repo';
import { validatePesertaCancel } from '@/lib/qurban/peserta-validators';
import { auditPesertaStatusChanged } from '@/lib/qurban/peserta-audit';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

// PS5 = SA, AQ only.
const CANCEL_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

const PEMBAYARAN_SHEET = 'qurban_pembayaran';

/**
 * Defensif: sheet `qurban_pembayaran` belum ada (Sprint F6). Hitung pembayaran
 * milik peserta lewat resolusi kolom by-header. Sheet hilang / error → 0 (skip).
 */
async function countPembayaranForPeserta(pesertaId: string): Promise<number> {
  try {
    const headerRows = await sheetsService.getRows(PEMBAYARAN_SHEET, `${PEMBAYARAN_SHEET}!A1:ZZ1`);
    const header = headerRows[0] ?? [];
    const idx = header.indexOf('peserta_id');
    if (idx === -1) return 0;
    const rows = await sheetsService.getRows(PEMBAYARAN_SHEET);
    return rows.filter((r) => r[idx] === pesertaId).length;
  } catch {
    return 0; // sheet belum ada (pre-F6) atau error baca → lewati.
  }
}

/**
 * PS5 — POST /api/qurban/peserta/[id]/cancel?edisi_id=EDS-...
 *
 * TERDAFTAR → BATAL. Slot otomatis kosong (computed via okupansi). Pembayaran
 * existing TIDAK di-nonaktifkan; bila ada, sertakan peringatan di response.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, CANCEL_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    const rec = await getPesertaRecordById(id);
    if (!rec || rec.peserta.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Peserta tidak ditemukan.', 404);
    }
    const current = rec.peserta;

    if (current.status_pendaftaran !== STATUS_TERDAFTAR) {
      return error(
        ErrorCodes.BUSINESS_PESERTA_NOT_TERDAFTAR,
        `Peserta berstatus ${current.status_pendaftaran} tidak dapat dibatalkan.`,
        422,
        { status_pendaftaran: current.status_pendaftaran }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validatePesertaCancel(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const { alasan, refund_handling } = parsed.value;

    const updated: QurbanPeserta = {
      ...current,
      status_pendaftaran: STATUS_BATAL,
      updated_at: new Date().toISOString(),
    };
    await updatePesertaAt(rec.rowIndex, updated);
    await auditPesertaStatusChanged(id, current.status_pendaftaran, STATUS_BATAL, actor, {
      alasan,
      refund_handling,
      notes: alasan || undefined,
    });

    const pembayaranCount = await countPembayaranForPeserta(id);
    const meta = pembayaranCount > 0
      ? {
          warning: `Peserta memiliki ${pembayaranCount} pembayaran. Refund ditangani di luar sistem; pembayaran tidak dinonaktifkan otomatis.`,
        }
      : undefined;

    return success(updated, meta);
  } catch (err) {
    console.error('[POST /api/qurban/peserta/[id]/cancel] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal membatalkan peserta.', 500);
  }
}
