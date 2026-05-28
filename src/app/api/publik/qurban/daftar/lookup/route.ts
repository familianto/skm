import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getClientIp } from '@/lib/api/rate-limit';
import { checkPublikRateLimit } from '@/lib/qurban/publik-rate-limit';

import { findActiveEdisi } from '@/lib/qurban/edisi-repo';
import { getPendaftaranStatus } from '@/lib/qurban/publik-pendaftaran-window';
import { lookupMuqoribByPhone } from '@/lib/qurban/publik-muqorib';
import { validatePublikLookup } from '@/lib/qurban/publik-validators';
import { isHoneypotTriggered } from '@/lib/qurban/publik-honeypot';
import { maskAlamat, maskNama, maskNoHp } from '@/lib/qurban/publik-masking';
import {
  auditPublikLookupAttempted,
  auditPublikLookupCaptchaFailed,
  auditPublikLookupMatched,
  auditPublikLookupNotFound,
  auditPublikLookupRateLimited,
} from '@/lib/qurban/publik-audit';

/**
 * PB2 — POST /api/publik/qurban/daftar/lookup  (publik, tanpa-auth; 20/menit · 60/jam)
 *
 * **F4d revision — phone-primary, masked response.** Sebelum F4d kontraknya
 * `{nama_lengkap, no_hp}` (strict 2-faktor; balas muqorib PENUH). Sekarang:
 * request `{no_hp, email?}` (`email` = honeypot, wajib kosong); cari muqorib
 * dengan HP ter-normalisasi (1 HP = 1 muqorib by grain) dan balas **identitas
 * tersamar** untuk dikonfirmasi visual oleh jamaah. HP-saja < HP+nama, jadi
 * balasan TIDAK pernah memuat PII penuh — masking-lah faktor-kedua barunya.
 *
 * Hanya dilayani saat pendaftaran `BUKA`. Honeypot terisi → balas `{found:false}`
 * (silent) + audit. Rate-limit terlampaui → 429 generik + audit.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const actor = { ip_address: ip };

  // 1. Rate-limit (per-IP). Audit on block + return generic 429.
  const rl = checkPublikRateLimit('lookup', ip);
  if (!rl.allowed) {
    await auditPublikLookupRateLimited(actor, { endpoint: 'lookup', limit: rl.blockedBy?.label });
    return error(
      ErrorCodes.RATE_LIMITED,
      'Terlalu banyak permintaan. Coba lagi nanti.',
      429,
      { retry_after_sec: rl.retryAfterSec, limit: rl.blockedBy?.label },
      { headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));

    // 2. Honeypot — silently behave as "not found" so bots learn nothing.
    if (isHoneypotTriggered(body)) {
      await auditPublikLookupCaptchaFailed(actor);
      return success({ found: false });
    }

    // 3. Gate: edisi AKTIF + window pendaftaran BUKA.
    const edisi = await findActiveEdisi();
    const status = edisi ? getPendaftaranStatus(edisi) : 'TUTUP';
    if (status !== 'BUKA') {
      return error(ErrorCodes.BUSINESS_EDISI_NOT_AKTIF, 'Pendaftaran sedang tidak dibuka.', 422, {
        status_pendaftaran: status,
      });
    }

    // 4. Validate payload (no_hp only).
    const parsed = validatePublikLookup(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const { no_hp } = parsed.value;
    const noHpMasked = maskNoHp(no_hp);

    // 5. Audit attempt (masked HP only — never raw PII).
    await auditPublikLookupAttempted(actor, { no_hp_masked: noHpMasked });

    // 6. Lookup. `lookupMuqoribByPhone` ignores inactive records.
    const result = await lookupMuqoribByPhone(no_hp);
    if (!result) {
      await auditPublikLookupNotFound(actor, { no_hp_masked: noHpMasked });
      return success({ found: false });
    }

    const { muqorib } = result;
    await auditPublikLookupMatched(actor, { muqorib_id: muqorib.id, no_hp_masked: noHpMasked });

    // 7. MASKED response — never the raw nama/alamat/no_hp.
    return success({
      found: true,
      muqorib_id: muqorib.id,
      nama_masked: maskNama(muqorib.nama_lengkap),
      alamat_masked: maskAlamat(muqorib.alamat),
      rt: muqorib.rt,
    });
  } catch (err) {
    console.error('[POST /api/publik/qurban/daftar/lookup] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memproses pencarian.', 500);
  }
}
