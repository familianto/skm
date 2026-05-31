import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import {
  listPembayaranByEdisi,
  isValidMetode,
  isValidStatus,
} from '@/lib/qurban/pembayaran-repo';
import { listPesertaByEdisi, STATUS_TERDAFTAR } from '@/lib/qurban/peserta-repo';
import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';

// PY4 — read untuk semua peran qurban.
const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * PY4 — GET /api/qurban/pembayaran?edisi_id=EDS-...&status=&metode=&panitia_terima_id=
 *
 * Daftar pembayaran satu edisi + enrichment ringan (nama muqorib, jumlah slot
 * TERDAFTAR per kode_bayar) untuk UI M-D. Urut `created_at` ASC (tiebreak id).
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || '').trim().toUpperCase();
    const metode = (url.searchParams.get('metode') || '').trim().toUpperCase();
    const panitiaTerimaId = (url.searchParams.get('panitia_terima_id') || '').trim();

    if (status && !isValidStatus(status)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'status tidak valid.', 400, { field: 'status' });
    }
    if (metode && !isValidMetode(metode)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'metode tidak valid.', 400, { field: 'metode' });
    }

    let items = await listPembayaranByEdisi(edisiId);
    if (status) items = items.filter((p) => p.status === status);
    if (metode) items = items.filter((p) => p.metode === metode);
    if (panitiaTerimaId) items = items.filter((p) => p.panitia_terima_id === panitiaTerimaId);

    items.sort((a, b) => (a.created_at !== b.created_at ? (a.created_at < b.created_at ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Enrichment: nama muqorib + jumlah slot TERDAFTAR per kode_bayar.
    const muqoribNama = new Map<string, string>();
    for (const m of await listAllMuqorib()) muqoribNama.set(m.id, m.nama_lengkap);

    const slotCount = new Map<string, number>();
    for (const p of await listPesertaByEdisi(edisiId)) {
      if (p.status_pendaftaran === STATUS_TERDAFTAR) {
        slotCount.set(p.kode_bayar, (slotCount.get(p.kode_bayar) || 0) + 1);
      }
    }

    const enriched = items.map((p) => ({
      ...p,
      muqorib_nama: muqoribNama.get(p.muqorib_id) || '',
      jumlah_slot: slotCount.get(p.kode_bayar) || 0,
    }));

    return success(enriched, {
      total: enriched.length,
      filters_applied: {
        edisi_id: edisiId,
        status: status || null,
        metode: metode || null,
        panitia_terima_id: panitiaTerimaId || null,
      },
    });
  } catch (err) {
    console.error('[GET /api/qurban/pembayaran] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat daftar pembayaran.', 500);
  }
}
