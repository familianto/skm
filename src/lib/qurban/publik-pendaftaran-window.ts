import { type Edisi } from './edisi-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * Pendaftaran-window status for the PUBLIC qurban endpoints (F4b B1).
 *
 * Pure decision over a `qurban_edisi` row. Unlike the panitia gate
 * (`peserta-context.ts`, which only checks `status === AKTIF`), the public
 * surface ALSO honours the registration window dates set on the edisi:
 *
 *   BELUM_BUKA — today is before `tanggal_pendaftaran_buka`
 *   BUKA       — today is within [buka, tutup] AND edisi `status === AKTIF`
 *   TUTUP      — today is after `tanggal_pendaftaran_tutup`, OR edisi not AKTIF
 *
 * Precedence: a non-AKTIF edisi is always TUTUP (it cannot accept public
 * registration regardless of dates). Dates are compared as `YYYY-MM-DD`
 * strings in WIB (Asia/Jakarta, UTC+7) — same convention as `id-gen`'s
 * `getTodayWIB`. `now` is injectable for deterministic tests.
 */

export type PendaftaranStatus = 'BELUM_BUKA' | 'BUKA' | 'TUTUP';

/** Today's date in WIB as `YYYY-MM-DD` (dashed, for comparison with sheet dates). */
export function wibDateString(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

export function getPendaftaranStatus(edisi: Edisi, now: Date = new Date()): PendaftaranStatus {
  if (edisi.status !== EDISI_STATUS.AKTIF) return 'TUTUP';

  const today = wibDateString(now);
  const buka = (edisi.tanggal_pendaftaran_buka || '').trim();
  const tutup = (edisi.tanggal_pendaftaran_tutup || '').trim();

  if (buka && today < buka) return 'BELUM_BUKA';
  if (tutup && today > tutup) return 'TUTUP';
  return 'BUKA';
}

export function isPendaftaranOpen(edisi: Edisi, now: Date = new Date()): boolean {
  return getPendaftaranStatus(edisi, now) === 'BUKA';
}
