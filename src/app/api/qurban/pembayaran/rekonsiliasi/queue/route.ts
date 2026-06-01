import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { findKonfigurasiByEdisiId } from '@/lib/qurban/konfigurasi-repo';
import { buildRekonContext, buildSuggestionBuckets } from '@/lib/qurban/rekonsiliasi-report';

// Antrian rekonsiliasi = domain finansial → SA + BD.
const QUEUE_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];

/**
 * PY7 — GET /api/qurban/pembayaran/rekonsiliasi/queue?edisi_id=EDS-...
 *
 * Antrian rekonsiliasi READ-ONLY (untuk tab triase M-D). Tidak meng-apply apa
 * pun. Struktur sama dengan PY5 MINUS `auto_lunas`: transfer Bank Muamalat
 * MASUK/AKTIF yang belum ter-link → `suggestions` (skor Layer 2 + kode-off
 * high) + `anomali` + `unmatched`. Transaksi AUTO_MATCH yang belum di-apply
 * tetap ditandai agar BD tahu "jalankan rekonsiliasi" akan menuntaskannya.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, QUEUE_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const konfig = await findKonfigurasiByEdisiId(edisiId);
    const payment_suffix = konfig?.payment_suffix ?? 0;

    const ctx = await buildRekonContext({ edisiId, payment_suffix });
    const { suggestions, anomali, unmatched } = buildSuggestionBuckets(ctx, { payment_suffix });

    // AUTO_MATCH yang belum di-apply — informasional (PY7 tidak menulis).
    const pending_auto = ctx.classified
      .filter((c) => c.result.kind === 'auto')
      .map(({ transaksi: t, result }) => ({
        transaksi_id: t.id,
        pembayaran_id: result.kind === 'auto' ? result.pembayaran.id : '',
        kode_bayar: result.kind === 'auto' ? result.kode_bayar : '',
      }));

    return success(
      { pending_auto, suggestions, anomali, unmatched },
      { total: ctx.classified.length, filters_applied: { edisi_id: edisiId, rekening_ids: ctx.rekeningIds } }
    );
  } catch (err) {
    console.error('[GET /api/qurban/pembayaran/rekonsiliasi/queue] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal memuat antrian rekonsiliasi.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
