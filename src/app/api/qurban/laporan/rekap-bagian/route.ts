import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { findActiveEdisi, findEdisiById } from '@/lib/qurban/edisi-repo';
import { evaluatePesertaEdisiGate } from '@/lib/qurban/peserta-context';
import { listPesertaByEdisi } from '@/lib/qurban/peserta-repo';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import { buildRekapBagian } from '@/lib/qurban/rekap-bagian';
import { loadBagianMap } from '@/lib/qurban/bagian-kanonik-repo';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * GET /api/qurban/laporan/rekap-bagian?edisi_id=&jenis=SEMUA|SAPI|KAMBING
 *
 * Data JSON Rekap Bagian untuk panel UI (read-only). Memakai peta tersimpan
 * (`qurban_bagian_kanonik`), fallback default bila kosong. Semua role login.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();
    const jenis = (url.searchParams.get('jenis') || 'SEMUA').toUpperCase();

    const edisi = edisiId ? await findEdisiById(edisiId) : await findActiveEdisi();
    const decision = evaluatePesertaEdisiGate(edisi, guard.session.peran, {});
    if (!decision.ok) {
      return error(decision.code, decision.message, decision.status, decision.details);
    }
    const resolved = edisi!;

    const [peserta, hewan, map] = await Promise.all([
      listPesertaByEdisi(resolved.id),
      listDaftarHewanByEdisi(resolved.id),
      loadBagianMap(),
    ]);

    const scoped =
      jenis === 'SAPI' || jenis === 'KAMBING'
        ? (() => {
            const hewanById = new Map(hewan.map((h) => [h.id, h]));
            return peserta.filter((p) => hewanById.get(p.hewan_id)?.jenis === jenis);
          })()
        : peserta;

    const rekap = buildRekapBagian({ peserta: scoped, map });

    return success(
      {
        edisi: { id: resolved.id, nama: resolved.tahun_hijriah },
        jenis: jenis === 'SAPI' || jenis === 'KAMBING' ? jenis : 'SEMUA',
        rekap,
        map,
      },
      { generated_at: new Date().toISOString() }
    );
  } catch (err) {
    console.error('[GET /api/qurban/laporan/rekap-bagian] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat rekap bagian.', 500);
  }
}
