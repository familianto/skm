import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { getClientIp } from '@/lib/api/rate-limit';
import { nowISO } from '@/lib/utils';

import { checkPublikRateLimit } from '@/lib/qurban/publik-rate-limit';
import { isHoneypotTriggered } from '@/lib/qurban/publik-honeypot';
import { validatePublikDaftar } from '@/lib/qurban/publik-validators';
import { findActiveEdisi } from '@/lib/qurban/edisi-repo';
import { getPendaftaranStatus } from '@/lib/qurban/publik-pendaftaran-window';
import {
  getMuqoribById,
  listAllMuqorib,
  appendMuqorib,
  type QurbanMuqorib,
} from '@/lib/qurban/muqorib-repo';
import { findMuqoribByNoHp, muqoribDataDiffers } from '@/lib/qurban/publik-muqorib';
import { generateMuqoribId, generatePesertaIds } from '@/lib/qurban/id-generator';
import { findDuplikatTerdaftar, insertPeserta } from '@/lib/qurban/peserta-repo';
import { lookupHargaDisepakati } from '@/lib/qurban/peserta-pricing';
import { autoAssignSlots } from '@/lib/qurban/peserta-slot-assignment';
import { nextKodeBayarSequence } from '@/lib/qurban/peserta-kode-bayar';
import { auditPesertaCreated } from '@/lib/qurban/peserta-audit';
import { findKonfigurasiByEdisiId } from '@/lib/qurban/konfigurasi-repo';
import { computePembayaran, listRekeningPublik } from '@/lib/qurban/publik-pembayaran';
import {
  auditPublikDaftarAttempted,
  auditPublikDaftarSucceeded,
  auditPublikDaftarDuplicate,
  auditPublikDaftarCaptchaFailed,
  auditPublikDaftarRateLimited,
  auditMuqoribAutoCreated,
  auditMuqoribDataConflict,
} from '@/lib/qurban/publik-audit';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

/**
 * PB3 — POST /api/publik/qurban/daftar  (publik, tanpa-auth; 5/mnt·20/jam·50/hari)
 *
 * Analog publik dari PS2: memakai ulang helper F4a (duplikat → harga → auto-assign
 * → kode_bayar → insert batch → audit per peserta). Tambahan publik: rate-limit,
 * honeypot, gating window pendaftaran, dan auto-create muqorib dari `muqorib_data`.
 *
 * Urutan duplikat → harga → assign mengikuti PS2 (kontrak in-repo) — bukan urutan
 * literal di prompt — agar error "jenis hewan tidak valid" muncul sebelum
 * komputasi slot. Notifikasi WA DITUNDA ke Milestone C; response sudah memuat
 * semua data yang dibutuhkan template (kode_bayar, nominal-ber-suffix, rekening).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const actor = { ip_address: ip };

  // 1. Rate limit (cascading).
  const rl = checkPublikRateLimit('daftar', ip);
  if (!rl.allowed) {
    await auditPublikDaftarRateLimited(actor, { endpoint: 'daftar', limit: rl.blockedBy?.label });
    return error(
      ErrorCodes.RATE_LIMITED,
      'Terlalu banyak permintaan pendaftaran. Coba lagi nanti.',
      429,
      { retry_after_sec: rl.retryAfterSec, limit: rl.blockedBy?.label },
      { headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const raw = (body ?? {}) as Record<string, unknown>;

    // 2. Honeypot — filled = bot. Reject with a GENERIC error (never mention "honeypot").
    if (isHoneypotTriggered(body)) {
      await auditPublikDaftarCaptchaFailed(actor);
      return error(ErrorCodes.VALIDATION_FAILED, 'Permintaan tidak dapat diproses.', 400);
    }

    // 3. Attempt audit.
    await auditPublikDaftarAttempted(actor, {
      has_muqorib_id: typeof raw.muqorib_id === 'string' && raw.muqorib_id.trim().length > 0,
      has_muqorib_data: raw.muqorib_data != null,
    });

    // 4. Validate payload.
    const parsed = validatePublikDaftar(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, { field: first.field, errors: parsed.errors });
    }
    const input = parsed.value;

    // 4b. Gate: edisi AKTIF + window pendaftaran BUKA.
    const edisi = await findActiveEdisi();
    if (!edisi) {
      return error(ErrorCodes.BUSINESS_EDISI_NOT_AKTIF, 'Pendaftaran sedang tidak tersedia.', 422, {
        status_pendaftaran: 'TUTUP',
      });
    }
    const status = getPendaftaranStatus(edisi);
    if (status !== 'BUKA') {
      return error(ErrorCodes.BUSINESS_EDISI_NOT_AKTIF, 'Pendaftaran sedang tidak dibuka.', 422, {
        status_pendaftaran: status,
      });
    }

    // 5. Resolve muqorib (existing by id / by phone, or auto-create).
    let muqorib: QurbanMuqorib;
    if (input.muqorib_id) {
      const found = await getMuqoribById(input.muqorib_id);
      if (!found) {
        return error(ErrorCodes.VALIDATION_FAILED, 'Data jamaah tidak ditemukan.', 422, { field: 'muqorib_id' });
      }
      if (!found.is_active) {
        return error(ErrorCodes.VALIDATION_FAILED, 'Data jamaah nonaktif.', 422, { field: 'muqorib_id' });
      }
      muqorib = found;
    } else {
      const data = input.muqorib_data!;
      const existing = findMuqoribByNoHp(await listAllMuqorib(), data.no_hp);
      if (existing) {
        if (muqoribDataDiffers(existing, data)) {
          await auditMuqoribDataConflict(actor, {
            muqorib_id: existing.id,
            existing: { nama_lengkap: existing.nama_lengkap, alamat: existing.alamat, rt: existing.rt },
            submitted: { nama_lengkap: data.nama_lengkap, alamat: data.alamat, rt: data.rt },
          });
        }
        muqorib = existing; // existing record kept as-is; public input never overwrites it
      } else {
        const ts = nowISO();
        const newMuqorib: QurbanMuqorib = {
          id: await generateMuqoribId(),
          nama_lengkap: data.nama_lengkap,
          alamat: data.alamat,
          rt: data.rt,
          no_hp: data.no_hp,
          is_active: true,
          data_induk_ref_1447h: '',
          notes: '',
          created_at: ts,
          created_by: 'PUBLIK',
          updated_at: ts,
        };
        await appendMuqorib(newMuqorib);
        await auditMuqoribAutoCreated(actor, newMuqorib);
        muqorib = newMuqorib;
      }
    }

    // 6. Duplicate detection (Layer 1). Publik tidak punya override allow_additional.
    const dup = await findDuplikatTerdaftar(edisi.id, muqorib.id);
    if (dup.length > 0) {
      await auditPublikDaftarDuplicate(actor, {
        muqorib_id: muqorib.id,
        edisi_id: edisi.id,
        existing_kode_bayar: dup.map((d) => d.kode_bayar),
      });
      return error(
        ErrorCodes.DUPLICATE_PESERTA,
        'Anda sudah terdaftar pada edisi ini. Gunakan fitur cek status untuk melihat pendaftaran Anda.',
        409,
        { kode_bayar: dup.map((d) => d.kode_bayar) }
      );
    }

    // 7. Freeze harga (validasi master_hewan: ada, aktif, edisi sama).
    const harga = await lookupHargaDisepakati(edisi.id, input.master_hewan_id, input.tipe_qurban);
    if (!harga) {
      return error(ErrorCodes.VALIDATION_FAILED, 'Jenis hewan tidak valid atau tidak tersedia.', 422, {
        field: 'master_hewan_id',
      });
    }

    // 8. Auto-assign slot.
    const assign = await autoAssignSlots(edisi.id, input.master_hewan_id, input.tipe_qurban, input.jumlah_slot);
    if (!assign.ok) {
      return error(
        ErrorCodes.BUSINESS_INSUFFICIENT_SLOTS,
        `Slot tersedia (${assign.available}) kurang dari yang diminta (${assign.needed}).`,
        409,
        { available: assign.available, needed: assign.needed }
      );
    }

    // 9. kode_bayar berurutan + N id sekaligus.
    const [kodes, ids] = await Promise.all([
      nextKodeBayarSequence(edisi, input.jumlah_slot),
      generatePesertaIds(input.jumlah_slot),
    ]);

    const ts = nowISO();
    const records: QurbanPeserta[] = assign.assignments.map((a, i) => ({
      id: ids[i],
      edisi_id: edisi.id,
      muqorib_id: muqorib.id,
      hewan_id: a.hewan_id,
      slot_number: a.slot_number,
      tipe_qurban: input.tipe_qurban,
      nama_atas_nama: input.nama_atas_nama,
      keterangan_bagian: input.keterangan_bagian,
      harga_disepakati: harga.harga_disepakati,
      kode_bayar: kodes[i],
      sumber_pendaftaran: 'PUBLIK',
      status_pendaftaran: 'TERDAFTAR',
      tanggal_daftar: ts,
      notes: '',
      created_at: ts,
      updated_at: ts,
      created_by: 'PUBLIK',
    }));

    await insertPeserta(records);

    const pesertaActor = { user_id: 'PUBLIK', ip_address: ip };
    for (const rec of records) await auditPesertaCreated(rec, pesertaActor);
    await auditPublikDaftarSucceeded(actor, {
      muqorib_id: muqorib.id,
      edisi_id: edisi.id,
      kode_bayar: kodes,
      jumlah_slot: input.jumlah_slot,
    });

    // 12. Payment payload (WA dikirim di Milestone C, bukan di sini).
    const konfig = await findKonfigurasiByEdisiId(edisi.id);
    const pembayaran = computePembayaran(harga.harga_disepakati, input.jumlah_slot, konfig?.payment_suffix ?? 0);
    const rekening = await listRekeningPublik();

    return success(
      {
        edisi: { id: edisi.id, tahun_hijriah: edisi.tahun_hijriah, tanggal_idul_adha: edisi.tanggal_idul_adha },
        muqorib: { id: muqorib.id, nama_lengkap: muqorib.nama_lengkap, no_hp: muqorib.no_hp },
        peserta: records.map((r) => ({
          id: r.id,
          kode_bayar: r.kode_bayar,
          hewan_id: r.hewan_id,
          slot_number: r.slot_number,
          tipe_qurban: r.tipe_qurban,
          harga_disepakati: r.harga_disepakati,
        })),
        pembayaran: { ...pembayaran, rekening, catatan: 'Cantumkan kode bayar pada berita transfer.' },
      },
      { total: records.length },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/publik/qurban/daftar] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memproses pendaftaran.', 500);
  }
}
