import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getClientIp } from '@/lib/api/rate-limit';
import { checkPublikRateLimit } from '@/lib/qurban/publik-rate-limit';

import { listPeserta } from '@/lib/qurban/peserta-repo';
import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';
import { normalizeNoHp } from '@/lib/qurban/validators';
import { buildCekStatusEntry } from '@/lib/qurban/publik-status';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

/**
 * PB4 — GET /api/publik/qurban/cek-status?kode_bayar=… | ?no_hp=…  (30/menit)
 *
 * Tidak di-gate window — cek status jalan kapan pun. Salah satu query wajib
 * (`kode_bayar` diprioritaskan). Nama muqorib di-mask; `no_hp` TIDAK pernah
 * dikembalikan. Pencarian lintas-edisi (kode_bayar unik global; no_hp lewat
 * muqorib lintas-edisi).
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = checkPublikRateLimit('cek-status', ip);
  if (!rl.allowed) {
    return error(
      ErrorCodes.RATE_LIMITED,
      'Terlalu banyak permintaan. Coba lagi nanti.',
      429,
      { retry_after_sec: rl.retryAfterSec, limit: rl.blockedBy?.label },
      { headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const url = new URL(request.url);
    const kodeBayar = (url.searchParams.get('kode_bayar') || '').trim();
    const noHpRaw = (url.searchParams.get('no_hp') || '').trim();
    if (!kodeBayar && !noHpRaw) {
      return error(ErrorCodes.VALIDATION_REQUIRED, 'Sertakan kode_bayar atau no_hp.', 400, { field: 'kode_bayar' });
    }

    const [allPeserta, allMuqorib] = await Promise.all([listPeserta({}), listAllMuqorib()]);
    const nameById = new Map(allMuqorib.map((m) => [m.id, m.nama_lengkap]));

    let matches: QurbanPeserta[];
    if (kodeBayar) {
      matches = allPeserta.filter((p) => p.kode_bayar === kodeBayar);
    } else {
      const target = normalizeNoHp(noHpRaw);
      const ids = new Set(allMuqorib.filter((m) => normalizeNoHp(m.no_hp) === target).map((m) => m.id));
      matches = ids.size === 0 ? [] : allPeserta.filter((p) => ids.has(p.muqorib_id));
    }

    const entries = matches
      .map((p) => buildCekStatusEntry(p, nameById.get(p.muqorib_id) || ''))
      .sort((a, b) => (a.kode_bayar < b.kode_bayar ? -1 : a.kode_bayar > b.kode_bayar ? 1 : 0));

    return success(entries, { total: entries.length });
  } catch (err) {
    console.error('[GET /api/publik/qurban/cek-status] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat status pendaftaran.', 500);
  }
}
