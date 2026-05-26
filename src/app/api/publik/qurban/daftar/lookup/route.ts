import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getClientIp } from '@/lib/api/rate-limit';
import { checkPublikRateLimit } from '@/lib/qurban/publik-rate-limit';

import { findActiveEdisi } from '@/lib/qurban/edisi-repo';
import { getPendaftaranStatus } from '@/lib/qurban/publik-pendaftaran-window';
import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';
import { normalizeNoHp } from '@/lib/qurban/validators';
import { validatePublikLookup } from '@/lib/qurban/publik-validators';
import { maskNoHp } from '@/lib/qurban/publik-masking';

/**
 * PB2 — POST /api/publik/qurban/daftar/lookup  (publik, tanpa-auth; 20/menit)
 *
 * Strict (exact) match ke `qurban_muqorib` pada `nama_lengkap` + `no_hp`
 * (keduanya wajib). Bukan fuzzy, bukan pencarian nama-saja. Hanya dilayani saat
 * pendaftaran `BUKA`. `no_hp` di response di-mask.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = checkPublikRateLimit('lookup', ip);
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
    const edisi = await findActiveEdisi();
    const status = edisi ? getPendaftaranStatus(edisi) : 'TUTUP';
    if (status !== 'BUKA') {
      return error(ErrorCodes.BUSINESS_EDISI_NOT_AKTIF, 'Pendaftaran sedang tidak dibuka.', 422, {
        status_pendaftaran: status,
      });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validatePublikLookup(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const { nama_lengkap, no_hp } = parsed.value;

    const all = await listAllMuqorib();
    const norm = (s: string) => s.trim().toLowerCase();
    const match = all.find(
      (m) => m.is_active && normalizeNoHp(m.no_hp) === no_hp && norm(m.nama_lengkap) === norm(nama_lengkap)
    );

    if (!match) return success({ matched: false });

    return success({
      matched: true,
      muqorib: {
        id: match.id,
        nama_lengkap: match.nama_lengkap,
        alamat: match.alamat,
        rt: match.rt,
        no_hp: maskNoHp(match.no_hp),
      },
    });
  } catch (err) {
    console.error('[POST /api/publik/qurban/daftar/lookup] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memproses pencarian.', 500);
  }
}
