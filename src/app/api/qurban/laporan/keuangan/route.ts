import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { findActiveEdisi, findEdisiById } from '@/lib/qurban/edisi-repo';
import { evaluatePesertaEdisiGate } from '@/lib/qurban/peserta-context';
import { listPesertaByEdisi } from '@/lib/qurban/peserta-repo';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import { listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';
import { isEdisiArsip } from '@/lib/qurban/laporan-dashboard';
import { buildLaporanKeuangan } from '@/lib/qurban/laporan-keuangan';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * LP4 — GET /api/qurban/laporan/keuangan?edisi_id=EDS-...
 *
 * Agregasi read-only Laporan Keuangan (F8 Milestone D), dua-mode (arsip/live).
 * Semua role login boleh (konsisten LP1/LP2/LP5). `edisi_id` opsional → default
 * edisi AKTIF. Panitia (PENDAFTARAN/DISTRIBUSI) hanya boleh edisi AKTIF (gate
 * `peserta-context`, reuse Milestone A–C).
 *
 * Dana terhimpun per kategori + biaya pengadaan (reuse LP2) + saldo + korelasi
 * ledger. TIDAK menulis apa pun & TIDAK memanggil withAuditLog. Baca tiap sheet
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

    const [pembayaran, peserta, hewan] = await Promise.all([
      listPembayaranByEdisi(resolved.id),
      listPesertaByEdisi(resolved.id),
      listDaftarHewanByEdisi(resolved.id),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const dto = buildLaporanKeuangan({
      edisi: resolved,
      isArsip: isEdisiArsip(resolved, pembayaran, today),
      pembayaran,
      peserta,
      hewan,
    });

    return success(dto, { generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /api/qurban/laporan/keuangan] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat laporan keuangan.', 500);
  }
}
