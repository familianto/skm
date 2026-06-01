import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import {
  getPesertaRecordById,
  updatePesertaAt,
  listPeserta,
  STATUS_TERDAFTAR,
  STATUS_BATAL,
} from '@/lib/qurban/peserta-repo';
import { validatePesertaCancel } from '@/lib/qurban/peserta-validators';
import { auditPesertaStatusChanged } from '@/lib/qurban/peserta-audit';
import {
  findPembayaranRecordByKodeBayar,
  updatePembayaranAt,
  BLOCKING_STATUSES,
} from '@/lib/qurban/pembayaran-repo';
import { auditPembayaranBatal } from '@/lib/qurban/pembayaran-audit';
import { findKonfigurasiByEdisiId } from '@/lib/qurban/konfigurasi-repo';
import { computeNominalTransfer } from '@/lib/qurban/publik-nominal';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

// PS5 = SA, AQ only.
const CANCEL_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * F6: pembayaran ber-grain `kode_bayar` (BUKAN per-peserta). Slot tidak boleh
 * dibatalkan bila pembayaran pendaftarannya sudah "jalan" (TERIMA_PANITIA /
 * LUNAS). Tahan-banting bila sheet `qurban_pembayaran` belum ada (return null).
 */
async function findBlockingPembayaran(
  edisiId: string,
  kodeBayar: string
): Promise<{ id: string; status: string } | null> {
  const rec = await findPembayaranRecordByKodeBayar(edisiId, kodeBayar);
  if (!rec) return null;
  if ((BLOCKING_STATUSES as readonly string[]).includes(rec.pembayaran.status)) {
    return { id: rec.pembayaran.id, status: rec.pembayaran.status };
  }
  return null;
}

/**
 * PS5 — POST /api/qurban/peserta/[id]/cancel?edisi_id=EDS-...
 *
 * TERDAFTAR → BATAL. Slot otomatis kosong (computed via okupansi). Bila
 * pembayaran pendaftaran (kode_bayar) sudah TERIMA_PANITIA/LUNAS → tolak
 * (refund ditangani di luar sistem). Kaskade (F6): bila setelah pembatalan tak
 * ada lagi slot TERDAFTAR untuk kode_bayar itu dan pembayaran masih
 * BELUM_BAYAR, pembayaran di-set BATAL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, CANCEL_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    const rec = await getPesertaRecordById(id);
    if (!rec || rec.peserta.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Peserta tidak ditemukan.', 404);
    }
    const current = rec.peserta;

    if (current.status_pendaftaran !== STATUS_TERDAFTAR) {
      return error(
        ErrorCodes.BUSINESS_PESERTA_NOT_TERDAFTAR,
        `Peserta berstatus ${current.status_pendaftaran} tidak dapat dibatalkan.`,
        422,
        { status_pendaftaran: current.status_pendaftaran }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validatePesertaCancel(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const { alasan, refund_handling } = parsed.value;

    // F6: blokir pembatalan bila uang sudah jalan (cek SEBELUM mutasi).
    const blocking = await findBlockingPembayaran(gate.edisi.id, current.kode_bayar);
    if (blocking) {
      return error(
        ErrorCodes.BUSINESS_PEMBAYARAN_EXISTS,
        `Pendaftaran ini memiliki pembayaran berstatus ${blocking.status}. Pembatalan tidak diizinkan; tangani refund di luar sistem.`,
        409,
        { pembayaran_id: blocking.id, pembayaran_status: blocking.status, kode_bayar: current.kode_bayar }
      );
    }

    const updated: QurbanPeserta = {
      ...current,
      status_pendaftaran: STATUS_BATAL,
      updated_at: new Date().toISOString(),
    };
    await updatePesertaAt(rec.rowIndex, updated);
    await auditPesertaStatusChanged(id, current.status_pendaftaran, STATUS_BATAL, actor, {
      alasan,
      refund_handling,
      notes: alasan || undefined,
    });

    // F6 kaskade (A-6 + B-6): pembayaran BELUM_BAYAR mengikuti slot tersisa.
    //  - Tak ada slot TERDAFTAR tersisa → pembayaran BATAL.
    //  - Masih ada slot tersisa → recompute nominal_total (Σ harga slot aktif) +
    //    nominal_transfer (=total+suffix) agar tidak basi sebelum rekonsiliasi.
    let kaskade: 'batal' | 'recompute' | null = null;
    try {
      const sisaAktif = (
        await listPeserta({ edisi_id: gate.edisi.id, status_pendaftaran: STATUS_TERDAFTAR })
      ).filter((p) => p.kode_bayar === current.kode_bayar && p.id !== id);

      const payRec = await findPembayaranRecordByKodeBayar(gate.edisi.id, current.kode_bayar);
      if (payRec && payRec.pembayaran.status === 'BELUM_BAYAR') {
        if (sisaAktif.length === 0) {
          await updatePembayaranAt(payRec.rowIndex, {
            ...payRec.pembayaran,
            status: 'BATAL',
            notes: alasan || payRec.pembayaran.notes,
            updated_at: new Date().toISOString(),
          });
          await auditPembayaranBatal(payRec.pembayaran.id, payRec.pembayaran.status, actor, {
            alasan,
            kode_bayar: current.kode_bayar,
          });
          kaskade = 'batal';
        } else {
          const nominalTotal = sisaAktif.reduce((sum, p) => sum + p.harga_disepakati, 0);
          const konfig = await findKonfigurasiByEdisiId(gate.edisi.id);
          const nominalTransfer = computeNominalTransfer(nominalTotal, konfig?.payment_suffix ?? 0);
          if (
            nominalTotal !== payRec.pembayaran.nominal_total ||
            nominalTransfer !== payRec.pembayaran.nominal_transfer
          ) {
            await updatePembayaranAt(payRec.rowIndex, {
              ...payRec.pembayaran,
              nominal_total: nominalTotal,
              nominal_transfer: nominalTransfer,
              updated_at: new Date().toISOString(),
            });
            kaskade = 'recompute';
          }
        }
      }
    } catch (e) {
      // Kaskade best-effort — kegagalan tidak membatalkan pembatalan peserta.
      console.error('[POST /api/qurban/peserta/[id]/cancel] kaskade pembayaran gagal:', e);
    }

    const meta =
      kaskade === 'batal'
        ? { warning: 'Pembayaran (BELUM_BAYAR) untuk pendaftaran ini ikut dibatalkan otomatis.' }
        : kaskade === 'recompute'
        ? { warning: 'Nominal pembayaran (BELUM_BAYAR) dihitung ulang mengikuti slot tersisa.' }
        : undefined;

    return success(updated, meta);
  } catch (err) {
    console.error('[POST /api/qurban/peserta/[id]/cancel] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal membatalkan peserta.', 500);
  }
}
