import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { selectAuditEntries } from '@/lib/api/audit-read';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPesertaById } from '@/lib/qurban/peserta-repo';

const READ_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * PS-AUDIT — GET /api/qurban/peserta/[id]/audit?edisi_id=EDS-...
 *
 * Riwayat audit untuk satu peserta (F4c-A, A3). Membungkus pembaca generik
 * `selectAuditEntries(rows, { entitas: 'peserta', entitas_id })` — pola
 * reusable untuk entitas lain. Gate edisi & 404 mirror PS3 (panitia hanya
 * edisi AKTIF; peserta harus milik edisi terpilih). Urut terbaru dulu.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;

    const peserta = await getPesertaById(id);
    if (!peserta || peserta.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Peserta tidak ditemukan.', 404);
    }

    const rows = await sheetsService.getRows(SHEET_NAMES.AUDIT_LOG);
    const entries = selectAuditEntries(rows, { entitas: 'peserta', entitas_id: id });

    return success(entries, { total: entries.length });
  } catch (err) {
    console.error('[GET /api/qurban/peserta/[id]/audit] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat riwayat peserta.', 500);
  }
}
