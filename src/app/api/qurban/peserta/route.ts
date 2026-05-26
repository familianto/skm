import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

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
import { nextKodeBayarSequence } from '@/lib/qurban/peserta-kode-bayar';
import { generatePesertaIds } from '@/lib/qurban/id-generator';
import { auditPesertaCreated } from '@/lib/qurban/peserta-audit';
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

    // FK muqorib harus ada.
    const muqorib = await getMuqoribById(input.muqorib_id);
    if (!muqorib) {
      return error(ErrorCodes.VALIDATION_FAILED, 'muqorib_id tidak ditemukan.', 422, { field: 'muqorib_id' });
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

    // kode_bayar berurutan + N id sekaligus.
    const [kodes, ids] = await Promise.all([
      nextKodeBayarSequence(edisi, input.jumlah_slot),
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
      kode_bayar: kodes[i],
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

    return success(records, { total: records.length }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/peserta] error:', err);
    const message =
      err instanceof Error && err.message ? `Gagal membuat peserta: ${err.message}` : 'Gagal membuat peserta.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
