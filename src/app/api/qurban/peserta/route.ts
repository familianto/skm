import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { sendWhatsApp } from '@/lib/fonnte';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import {
  listPeserta,
  insertPeserta,
  findDuplikatTerdaftar,
  type PesertaFilter,
} from '@/lib/qurban/peserta-repo';
import {
  validatePesertaCreate,
  isValidStatusPendaftaran,
  isValidSumberPendaftaran,
} from '@/lib/qurban/peserta-validators';
import { isValidTipePembelian } from '@/lib/qurban/validators';
import { getMuqoribById } from '@/lib/qurban/muqorib-repo';
import { lookupHargaDisepakati } from '@/lib/qurban/peserta-pricing';
import { autoAssignSlots } from '@/lib/qurban/peserta-slot-assignment';
import { nextKodeBayar } from '@/lib/qurban/peserta-kode-bayar';
import { generatePesertaIds, generatePembayaranId } from '@/lib/qurban/id-generator';
import { auditPesertaCreated, auditPesertaWaSent, auditPesertaWaFailed } from '@/lib/qurban/peserta-audit';
import { findKonfigurasiByEdisiId } from '@/lib/qurban/konfigurasi-repo';
import { computePembayaran, listRekeningPublik } from '@/lib/qurban/publik-pembayaran';
import { insertPembayaran } from '@/lib/qurban/pembayaran-repo';
import { buildPembayaranFromPendaftaran, resolveMetodePembayaranInput } from '@/lib/qurban/pembayaran-create';
import { auditPembayaranCreated } from '@/lib/qurban/pembayaran-audit';
import { buildPendaftaranPanitiaMessage, shouldSendPendaftaranWA } from '@/lib/qurban/publik-wa-template';
import type { QurbanPeserta, SumberPendaftaran, StatusPendaftaran, TipeQurban } from '@/lib/qurban/peserta-types';

const READ_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];
const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * PS1 — GET /api/qurban/peserta?edisi_id=EDS-...&status_pendaftaran=&hewan_id=
 *        &muqorib_id=&tipe_qurban=&sumber_pendaftaran=
 *
 * List peserta untuk edisi terpilih, urut tanggal_daftar ASC. Panitia
 * (PENDAFTARAN) hanya boleh edisi AKTIF (gate).
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, {});
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const url = new URL(request.url);
    const status = (url.searchParams.get('status_pendaftaran') || '').trim().toUpperCase();
    const hewanId = (url.searchParams.get('hewan_id') || '').trim();
    const muqoribId = (url.searchParams.get('muqorib_id') || '').trim();
    const tipe = (url.searchParams.get('tipe_qurban') || '').trim().toUpperCase();
    const sumber = (url.searchParams.get('sumber_pendaftaran') || '').trim().toUpperCase();

    if (status && !isValidStatusPendaftaran(status)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'status_pendaftaran tidak valid (TERDAFTAR | BATAL).', 400, { field: 'status_pendaftaran' });
    }
    if (tipe && !isValidTipePembelian(tipe)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'tipe_qurban tidak valid (BELI | BAWA_SENDIRI).', 400, { field: 'tipe_qurban' });
    }
    if (sumber && !isValidSumberPendaftaran(sumber)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'sumber_pendaftaran tidak valid.', 400, { field: 'sumber_pendaftaran' });
    }

    const filter: PesertaFilter = { edisi_id: edisiId };
    if (status) filter.status_pendaftaran = status as StatusPendaftaran;
    if (hewanId) filter.hewan_id = hewanId;
    if (muqoribId) filter.muqorib_id = muqoribId;
    if (tipe) filter.tipe_qurban = tipe as TipeQurban;
    if (sumber) filter.sumber_pendaftaran = sumber as SumberPendaftaran;

    const items = await listPeserta(filter);
    items.sort((a, b) => {
      if (a.tanggal_daftar !== b.tanggal_daftar) return a.tanggal_daftar < b.tanggal_daftar ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return success(items, {
      total: items.length,
      filters_applied: {
        edisi_id: edisiId,
        status_pendaftaran: status || null,
        hewan_id: hewanId || null,
        muqorib_id: muqoribId || null,
        tipe_qurban: tipe || null,
        sumber_pendaftaran: sumber || null,
      },
    });
  } catch (err) {
    console.error('[GET /api/qurban/peserta] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat daftar peserta.', 500);
  }
}

/**
 * PS2 — POST /api/qurban/peserta?edisi_id=EDS-...
 *
 * Create multi-slot: validasi → deteksi duplikat → auto-assign slot → bekukan
 * harga → generate kode_bayar → insert N baris (batch) → audit per peserta.
 * Edisi WAJIB AKTIF (gate requireAktif).
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireAktif: true });
    if (!gate.ok) return gate.response;
    const edisi = gate.edisi;

    const body = await request.json().catch(() => ({}));
    const parsed = validatePesertaCreate(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const input = parsed.value;

    // F6: metode pembayaran (default TRANSFER). Tolak VA / nilai tak dikenal
    // SEBELUM menulis peserta agar tidak meninggalkan baris peserta yatim.
    const metodeRes = resolveMetodePembayaranInput((body as Record<string, unknown>).metode_pembayaran);
    if (!metodeRes.ok) {
      return error(ErrorCodes.VALIDATION_FAILED, metodeRes.message, 422, { field: 'metode_pembayaran' });
    }

    // FK muqorib harus ada & aktif (soft-delete via is_active).
    const muqorib = await getMuqoribById(input.muqorib_id);
    if (!muqorib) {
      return error(ErrorCodes.VALIDATION_FAILED, 'muqorib_id tidak ditemukan.', 422, { field: 'muqorib_id' });
    }
    if (!muqorib.is_active) {
      return error(ErrorCodes.VALIDATION_FAILED, 'muqorib nonaktif tidak dapat didaftarkan.', 422, { field: 'muqorib_id' });
    }

    // Deteksi duplikat (Layer 1).
    const dup = await findDuplikatTerdaftar(edisi.id, input.muqorib_id);
    if (dup.length > 0 && !input.allow_additional_qurban) {
      return error(
        ErrorCodes.DUPLICATE_PESERTA,
        'Muqorib sudah terdaftar pada edisi ini. Set allow_additional_qurban=true untuk qurban tambahan.',
        409,
        { existing: dup }
      );
    }

    // Lookup + bekukan harga (validasi master_hewan: ada, aktif, edisi sama).
    const harga = await lookupHargaDisepakati(edisi.id, input.master_hewan_id, input.tipe_qurban);
    if (!harga) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'master_hewan_id tidak valid (tidak ditemukan, nonaktif, atau beda edisi).',
        422,
        { field: 'master_hewan_id' }
      );
    }

    // F4c-C: satu pendaftaran ≤ satu ekor. jumlah_slot tidak boleh melebihi
    // kapasitas satu hewan (mau lebih → pendaftaran terpisah).
    if (input.jumlah_slot > harga.master.kapasitas_slot) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        `Jumlah slot (${input.jumlah_slot}) melebihi kapasitas satu ekor (${harga.master.kapasitas_slot}).`,
        422,
        { field: 'jumlah_slot', max: harga.master.kapasitas_slot }
      );
    }

    // Auto-assign slot.
    const assign = await autoAssignSlots(edisi.id, input.master_hewan_id, input.tipe_qurban, input.jumlah_slot);
    if (!assign.ok) {
      return error(
        ErrorCodes.BUSINESS_INSUFFICIENT_SLOTS,
        `Slot tersedia (${assign.available}) kurang dari yang diminta (${assign.needed}).`,
        409,
        { available: assign.available, needed: assign.needed }
      );
    }

    // SATU kode_bayar per pendaftaran (dibagi semua baris) + N id sekaligus.
    const [kode, ids] = await Promise.all([
      nextKodeBayar(edisi),
      generatePesertaIds(input.jumlah_slot),
    ]);

    const now = new Date().toISOString();
    const records: QurbanPeserta[] = assign.assignments.map((a, i) => ({
      id: ids[i],
      edisi_id: edisi.id,
      muqorib_id: input.muqorib_id,
      hewan_id: a.hewan_id,
      slot_number: a.slot_number,
      tipe_qurban: input.tipe_qurban,
      nama_atas_nama: input.nama_atas_nama_per_slot[i] ?? '',
      keterangan_bagian: input.keterangan_bagian,
      harga_disepakati: harga.harga_disepakati,
      kode_bayar: kode,
      sumber_pendaftaran: 'PANITIA',
      status_pendaftaran: 'TERDAFTAR',
      tanggal_daftar: now,
      notes: '',
      created_at: now,
      updated_at: now,
      created_by: guard.session.user_id,
    }));

    await insertPeserta(records);

    const isAdditional = dup.length > 0 && input.allow_additional_qurban;
    for (const rec of records) {
      await auditPesertaCreated(rec, actor, { is_additional_qurban: isAdditional });
    }

    // Konfigurasi edisi (payment_suffix) dibaca sekali — dipakai oleh
    // auto-create pembayaran (F6) DAN gating WA di bawah.
    const konfig = await findKonfigurasiByEdisiId(edisi.id);

    // F6 Milestone A: auto-create SATU baris pembayaran per pendaftaran
    // (kode_bayar), status BELUM_BAYAR. Peserta sudah tertulis; bila pencatatan
    // pembayaran gagal, gagalkan request dengan pesan jelas (backfill di M-C).
    try {
      const pembayaran = buildPembayaranFromPendaftaran({
        id: await generatePembayaranId(),
        edisi_id: edisi.id,
        kode_bayar: kode,
        muqorib_id: input.muqorib_id,
        slot_harga: records.map((r) => r.harga_disepakati),
        payment_suffix: konfig?.payment_suffix ?? 0,
        metode: metodeRes.metode,
        created_by: guard.session.user_id,
        now,
      });
      await insertPembayaran(pembayaran);
      await auditPembayaranCreated(pembayaran, actor);
    } catch (e) {
      console.error('[POST /api/qurban/peserta] gagal auto-create pembayaran:', e);
      const msg = e instanceof Error ? e.message : 'unknown';
      return error(
        ErrorCodes.INTERNAL_ERROR,
        `Peserta dibuat tetapi pencatatan pembayaran gagal: ${msg}. Hubungi admin untuk backfill.`,
        500
      );
    }

    // F4b-C: notifikasi WA panitia (gated `wa_send_on_pendaftaran`). Di-await
    // tetapi error ditangkap — kegagalan WA TIDAK menggagalkan response PS2.
    if (shouldSendPendaftaranWA(konfig, muqorib.no_hp)) {
      try {
        const pembayaran = computePembayaran(harga.harga_disepakati, input.jumlah_slot, konfig?.payment_suffix ?? 0);
        const rekening = await listRekeningPublik();
        const waRes = await sendWhatsApp({
          target: muqorib.no_hp,
          message: buildPendaftaranPanitiaMessage({
            nama: muqorib.nama_lengkap,
            tahun_hijriah: edisi.tahun_hijriah,
            hewan_label: `${harga.master.jenis} Kelas ${harga.master.kelas}`,
            tipe_qurban: input.tipe_qurban,
            jumlah_slot: input.jumlah_slot,
            kode_bayar: kode,
            total_harga: pembayaran.total_harga,
            nominal_transfer: pembayaran.nominal_transfer,
            rekening,
          }),
        });
        if (waRes.success) {
          await auditPesertaWaSent(muqorib.id, actor, { kode_bayar: kode, mock: waRes.mock });
        } else {
          await auditPesertaWaFailed(muqorib.id, actor, { reason: waRes.detail });
        }
      } catch (e) {
        await auditPesertaWaFailed(muqorib.id, actor, { reason: e instanceof Error ? e.message : 'unknown' });
      }
    }

    return success(records, { total: records.length }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/peserta] error:', err);
    const message =
      err instanceof Error && err.message ? `Gagal membuat peserta: ${err.message}` : 'Gagal membuat peserta.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
