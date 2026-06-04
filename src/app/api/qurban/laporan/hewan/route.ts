import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { findActiveEdisi, findEdisiById } from '@/lib/qurban/edisi-repo';
import { evaluatePesertaEdisiGate } from '@/lib/qurban/peserta-context';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import { listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';
import { isEdisiArsip } from '@/lib/qurban/laporan-dashboard';
import { buildLaporanHewan } from '@/lib/qurban/laporan-hewan';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * LP2 — GET /api/qurban/laporan/hewan?edisi_id=EDS-...
 *
 * Agregasi read-only Laporan Hewan (F8 Milestone C). Semua role login boleh.
 * `edisi_id` opsional → default edisi AKTIF. Panitia (PENDAFTARAN/DISTRIBUSI)
 * hanya boleh edisi AKTIF (gate `peserta-context`, reuse Milestone A/B).
 *
 * Matriks inventaris per (jenis, kelas) + ringkasan biaya pengadaan. TIDAK
 * menulis apa pun & TIDAK memanggil withAuditLog. Baca `qurban_daftar_hewan`
 * sekali, agregasi in-memory.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();

    const edisi = edisiId ? await findEdisiById(edisiId) : await findActiveEdisi();
    const decision = evaluatePesertaEdisiGate(edisi, guard.session.peran, {});
    if (!decision.ok) {
      return error(decision.code, decision.message, decision.status, decision.details);
    }
    const resolved = edisi!;

    const [hewan, pembayaran] = await Promise.all([
      listDaftarHewanByEdisi(resolved.id),
      listPembayaranByEdisi(resolved.id),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const dto = buildLaporanHewan({
      edisi: resolved,
      isArsip: isEdisiArsip(resolved, pembayaran, today),
      hewan,
    });

    return success(dto, { generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /api/qurban/laporan/hewan] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat laporan hewan.', 500);
  }
}
