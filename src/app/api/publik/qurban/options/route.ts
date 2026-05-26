import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getClientIp } from '@/lib/api/rate-limit';
import { checkPublikRateLimit } from '@/lib/qurban/publik-rate-limit';

import { findActiveEdisi } from '@/lib/qurban/edisi-repo';
import { getPendaftaranStatus } from '@/lib/qurban/publik-pendaftaran-window';
import { listMasterHewanByEdisi } from '@/lib/qurban/master-hewan-repo';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import { getOccupancyByHewan } from '@/lib/qurban/peserta-occupancy';
import { occupiedSetsFrom } from '@/lib/qurban/peserta-slot-assignment';
import { HEWAN_STATUS } from '@/lib/qurban/hewan-state-machine';
import { buildTipeOptions, type OptionHewan } from '@/lib/qurban/publik-options';
import { listRekeningPublik } from '@/lib/qurban/publik-pembayaran';

/**
 * PB1 — GET /api/publik/qurban/options  (publik, tanpa-auth; 30/menit)
 *
 * Info edisi + status pendaftaran. Saat status `BUKA`: tambah daftar tipe hewan
 * yang masih bisa dibooking (harga per slot + slot tersedia) dan rekening
 * pembayaran. Selain `BUKA` → `options: null`.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = checkPublikRateLimit('options', ip);
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
    if (!edisi) {
      return success({ edisi: null, status_pendaftaran: 'TUTUP', options: null });
    }

    const status = getPendaftaranStatus(edisi);
    const edisiInfo = {
      id: edisi.id,
      tahun_hijriah: edisi.tahun_hijriah,
      tahun_masehi: edisi.tahun_masehi,
      tanggal_idul_adha: edisi.tanggal_idul_adha,
      tanggal_pendaftaran_buka: edisi.tanggal_pendaftaran_buka,
      tanggal_pendaftaran_tutup: edisi.tanggal_pendaftaran_tutup,
    };

    if (status !== 'BUKA') {
      return success({ edisi: edisiInfo, status_pendaftaran: status, options: null });
    }

    const [masters, hewan, occ, rekening] = await Promise.all([
      listMasterHewanByEdisi(edisi.id),
      listDaftarHewanByEdisi(edisi.id),
      getOccupancyByHewan(edisi.id),
      listRekeningPublik(),
    ]);

    const activeMasters = masters.filter((m) => m.is_active);
    const activeHewan: OptionHewan[] = hewan
      .filter((h) => h.status === HEWAN_STATUS.AKTIF)
      .map((h) => ({
        id: h.id,
        master_hewan_id: h.master_hewan_id,
        tipe_pembelian: h.tipe_pembelian,
        kapasitas_slot: h.kapasitas_slot,
      }));
    const occupiedByHewan = occupiedSetsFrom(occ, activeHewan.map((h) => h.id));

    return success({
      edisi: edisiInfo,
      status_pendaftaran: status,
      options: {
        tipe_hewan: buildTipeOptions(activeMasters, activeHewan, occupiedByHewan),
        rekening,
      },
    });
  } catch (err) {
    console.error('[GET /api/publik/qurban/options] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat data pendaftaran.', 500);
  }
}
