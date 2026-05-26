import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPesertaRecordById, updatePesertaAt, STATUS_TERDAFTAR } from '@/lib/qurban/peserta-repo';
import { getDaftarHewanById } from '@/lib/qurban/daftar-hewan-repo';
import { lookupHargaDisepakati } from '@/lib/qurban/peserta-pricing';
import { auditPesertaHargaChanged } from '@/lib/qurban/peserta-audit';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

// PS7 = SA, AQ only.
const ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * PS7 — POST /api/qurban/peserta/[id]/refresh-harga?edisi_id=EDS-...
 *
 * Terapkan harga master saat ini ke `harga_disepakati` (via
 * `lookupHargaDisepakati`, B). Hanya peserta TERDAFTAR. `kode_bayar` immutable.
 * Harga sama → no-op sukses tanpa audit. Berubah → audit peserta.harga_changed
 * + bump updated_at. Master hewan diturunkan dari `hewan_id` → master_hewan_id.
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

    const rec = await getPesertaRecordById(id);
    if (!rec || rec.peserta.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Peserta tidak ditemukan.', 404);
    }
    const current = rec.peserta;

    if (current.status_pendaftaran !== STATUS_TERDAFTAR) {
      return error(
        ErrorCodes.BUSINESS_PESERTA_NOT_TERDAFTAR,
        `Peserta berstatus ${current.status_pendaftaran} — harga tidak dapat di-refresh.`,
        422,
        { status_pendaftaran: current.status_pendaftaran }
      );
    }

    // Resolusi master via hewan yang ditempati peserta.
    const hewan = await getDaftarHewanById(current.hewan_id);
    if (!hewan) {
      return error(ErrorCodes.VALIDATION_FAILED, 'Hewan peserta tidak ditemukan — tidak dapat refresh harga.', 422, { field: 'hewan_id' });
    }
    const harga = await lookupHargaDisepakati(gate.edisi.id, hewan.master_hewan_id, current.tipe_qurban);
    if (!harga) {
      return error(ErrorCodes.VALIDATION_FAILED, 'Master hewan tidak valid (tidak ditemukan/nonaktif) — tidak dapat refresh harga.', 422, { field: 'master_hewan_id' });
    }

    const hargaLama = current.harga_disepakati;
    const hargaBaru = harga.harga_disepakati;
    if (hargaBaru === hargaLama) {
      return success({ peserta: current, harga_lama: hargaLama, harga_baru: hargaBaru }); // no-op
    }

    const updated: QurbanPeserta = {
      ...current,
      harga_disepakati: hargaBaru,
      updated_at: new Date().toISOString(),
    };
    await updatePesertaAt(rec.rowIndex, updated);
    await auditPesertaHargaChanged(id, hargaLama, hargaBaru, actor);

    return success({ peserta: updated, harga_lama: hargaLama, harga_baru: hargaBaru });
  } catch (err) {
    console.error('[POST /api/qurban/peserta/[id]/refresh-harga] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal me-refresh harga peserta.', 500);
  }
}
