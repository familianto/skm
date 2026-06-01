import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { findKonfigurasiByEdisiId } from '@/lib/qurban/konfigurasi-repo';
import { applyMatch } from '@/lib/qurban/rekonsiliasi-apply';
import { buildRekonContext, buildSuggestionBuckets } from '@/lib/qurban/rekonsiliasi-report';

// Rekonsiliasi = domain finansial → SA + BD.
const REKON_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];

/**
 * PY5 — POST /api/qurban/pembayaran/rekonsiliasi?edisi_id=EDS-...
 *
 * Pass rekonsiliasi TRANSFER. AUTO-apply Layer 1 (kode cocok + jumlah ∈
 * {nominal_total, nominal_transfer}, mencakup "lupa suffix"); kode-off & tanpa
 * kode (skor Layer 2 ≥ ambang) jadi `suggestions` (dikonfirmasi BD via PY6).
 * Idempoten (transaksi ter-link dilewati). Pass TERPISAH yang MEMBACA sheet
 * transaksi — TIDAK menyentuh alur import.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, REKON_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const konfig = await findKonfigurasiByEdisiId(edisiId);
    const payment_suffix = konfig?.payment_suffix ?? 0;

    const ctx = await buildRekonContext({ edisiId, payment_suffix });

    // AUTO-apply yang AUTO_MATCH (Layer 1).
    const auto_lunas: Array<{ transaksi_id: string; pembayaran_id: string; kode_bayar: string; via_nominal: string; kategori_corrected: boolean; mixed: boolean }> = [];
    const applyFailed: Array<{ transaksi_id: string; kode_bayar: string; alasan: string }> = [];

    for (const { transaksi: t, result: c } of ctx.classified) {
      if (c.kind !== 'auto') continue;
      const r = await applyMatch(c.pembayaran.id, t, { layer: 'AUTO', via: 'rekonsiliasi', edisiId, actor });
      if (r.ok) {
        auto_lunas.push({
          transaksi_id: t.id,
          pembayaran_id: c.pembayaran.id,
          kode_bayar: c.kode_bayar,
          via_nominal: c.via_nominal,
          kategori_corrected: r.kategori_corrected,
          mixed: r.mixed,
        });
      } else {
        applyFailed.push({ transaksi_id: t.id, kode_bayar: c.kode_bayar, alasan: r.reason });
      }
    }

    const { suggestions, anomali, unmatched } = buildSuggestionBuckets(ctx, { payment_suffix });

    return success(
      { auto_lunas, suggestions, anomali: [...anomali, ...applyFailed], unmatched },
      { total: ctx.classified.length, filters_applied: { edisi_id: edisiId, rekening_ids: ctx.rekeningIds } }
    );
  } catch (err) {
    console.error('[POST /api/qurban/pembayaran/rekonsiliasi] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal menjalankan rekonsiliasi.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
