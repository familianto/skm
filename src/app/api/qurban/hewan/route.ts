import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole, requireSession } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForHewan } from '@/lib/qurban/daftar-hewan-context';
import {
  appendDaftarHewan,
  listDaftarHewanByEdisi,
  listDaftarHewanRecordsByEdisi,
  updateDaftarHewanAt,
  namaDisplay,
} from '@/lib/qurban/daftar-hewan-repo';
import { computeAutoNumber, type NumberingRow } from '@/lib/qurban/daftar-hewan-numbering';
import { getMasterHewanById } from '@/lib/qurban/master-hewan-repo';
import { generateDaftarHewanId } from '@/lib/qurban/id-generator';
import { validateDaftarHewanCreate, isValidJenisHewan, isValidKelasHewan } from '@/lib/qurban/validators';
import { isValidHewanStatus } from '@/lib/qurban/hewan-state-machine';
import { getOccupancyByHewan, slotTerisi } from '@/lib/qurban/peserta-occupancy';
import { auditHewanCreated, auditHewanNomorUrutChanged } from '@/lib/qurban/daftar-hewan-audit';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

// PENDAFTARAN sengaja punya akses tulis inventaris fisik (beda dari katalog
// Master Hewan F03 yang SA/AQ-only) — flow F1.5 "Input inventory hewan fisik".
const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * H1 — GET /api/qurban/hewan?edisi_id=EDS-...&jenis=&kelas=&status=
 *
 * List inventaris fisik untuk edisi terpilih, urut (jenis, kelas, nomor_urut).
 * Tiap baris diperkaya: nama_display, slot_terisi (0 selama qurban_peserta
 * belum ada), kapasitas_slot. Mirror gate MH1 (requireSession + panitia lock).
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForHewan(request, guard.session.peran, {
      requireWritable: false,
    });
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const url = new URL(request.url);
    const jenis = (url.searchParams.get('jenis') || '').trim().toUpperCase();
    const kelas = (url.searchParams.get('kelas') || '').trim().toUpperCase();
    const status = (url.searchParams.get('status') || '').trim().toUpperCase();

    if (jenis && !isValidJenisHewan(jenis)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'jenis tidak valid (SAPI | KAMBING).', 400, { field: 'jenis' });
    }
    if (kelas && !isValidKelasHewan(kelas)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'kelas tidak valid (A | B | C | D).', 400, { field: 'kelas' });
    }
    if (status && !isValidHewanStatus(status)) {
      return error(ErrorCodes.VALIDATION_FAILED, 'status tidak valid.', 400, { field: 'status' });
    }

    let items = await listDaftarHewanByEdisi(edisiId);
    if (jenis) items = items.filter((h) => h.jenis === jenis);
    if (kelas) items = items.filter((h) => h.kelas === kelas);
    if (status) items = items.filter((h) => h.status === status);

    items = [...items].sort((a, b) => {
      if (a.jenis !== b.jenis) return a.jenis < b.jenis ? -1 : 1;
      if (a.kelas !== b.kelas) return a.kelas < b.kelas ? -1 : 1;
      return a.nomor_urut - b.nomor_urut;
    });

    const occ = await getOccupancyByHewan(edisiId);
    const enriched = items.map((h) => ({
      ...h,
      nama_display: namaDisplay(h.jenis, h.kelas, h.nomor_urut),
      slot_terisi: slotTerisi(occ, h.id),
      kapasitas_slot: h.kapasitas_slot,
    }));

    return success(enriched, {
      total: enriched.length,
      filters_applied: { edisi_id: edisiId, jenis: jenis || null, kelas: kelas || null, status: status || null },
    });
  } catch (err) {
    console.error('[GET /api/qurban/hewan] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat inventaris hewan: ${err.message}`
        : 'Gagal memuat inventaris hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}

/**
 * H2 — POST /api/qurban/hewan?edisi_id=EDS-...
 *
 * Create satu ekor hewan fisik + auto-numbering. jenis/kelas/kapasitas_slot
 * didenormalisasi dari master_hewan rujukan. BAWA_SENDIRI → harga dipaksa 0 &
 * digeser ke depan grup. Edisi SELESAI → ditolak.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);
  const actor = { user_id: guard.session.user_id, ip_address: ip };

  try {
    const gate = await resolveEdisiForHewan(request, guard.session.peran, {
      requireWritable: true,
    });
    if (!gate.ok) return gate.response;
    const edisiId = gate.edisi.id;

    const body = await request.json().catch(() => ({}));
    const parsed = validateDaftarHewanCreate(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, {
        field: first.field,
        errors: parsed.errors,
      });
    }
    const input = parsed.value;

    // master_hewan rujukan harus ada, aktif, & di edisi yang sama.
    const master = await getMasterHewanById(input.master_hewan_id);
    if (!master || master.edisi_id !== edisiId || !master.is_active) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'master_hewan_id tidak valid (tidak ditemukan, nonaktif, atau beda edisi).',
        422,
        { field: 'master_hewan_id' }
      );
    }

    const hargaBeliAktual = input.tipe_pembelian === 'BAWA_SENDIRI' ? 0 : input.harga_beli_aktual;

    // Auto-numbering grup (edisi, jenis, kelas) — semua status dihitung.
    const records = await listDaftarHewanRecordsByEdisi(edisiId);
    const groupRecords = records.filter(
      (r) => r.hewan.jenis === master.jenis && r.hewan.kelas === master.kelas
    );
    const group: NumberingRow[] = groupRecords.map((r) => ({
      id: r.hewan.id,
      tipe_pembelian: r.hewan.tipe_pembelian,
      nomor_urut: r.hewan.nomor_urut,
    }));
    const { nomor_urut_baru, shifted } = computeAutoNumber(group, input.tipe_pembelian);

    const now = new Date().toISOString();
    const id = await generateDaftarHewanId();
    const record: QurbanDaftarHewan = {
      id,
      edisi_id: edisiId,
      master_hewan_id: master.id,
      jenis: master.jenis,
      kelas: master.kelas,
      nomor_urut: nomor_urut_baru,
      kapasitas_slot: master.kapasitas_slot,
      tipe_pembelian: input.tipe_pembelian,
      vendor_nama: input.vendor_nama,
      harga_beli_aktual: hargaBeliAktual,
      tanggal_pembelian: input.tanggal_pembelian,
      status: input.status,
      notes: input.notes,
      nomor_urut_pemotongan: null,
      created_at: now,
      updated_at: now,
      created_by: guard.session.user_id,
    };

    // Apply shifts first (BELI rows bumped +1), then append the new row.
    // No true transaction (single-writer per masjid); validation already done.
    for (const sh of shifted) {
      const rec = groupRecords.find((r) => r.hewan.id === sh.id);
      if (!rec) continue;
      const before = rec.hewan.nomor_urut;
      const updated: QurbanDaftarHewan = {
        ...rec.hewan,
        nomor_urut: sh.nomor_urut,
        updated_at: now,
      };
      await updateDaftarHewanAt(rec.rowIndex, updated);
      await auditHewanNomorUrutChanged(rec.hewan.id, before, sh.nomor_urut, actor);
    }

    await appendDaftarHewan(record);
    await auditHewanCreated(record, actor);

    const data = {
      ...record,
      nama_display: namaDisplay(record.jenis, record.kelas, record.nomor_urut),
    };
    return success(data, undefined, { status: 201 });
  } catch (err) {
    console.error('[POST /api/qurban/hewan] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal membuat hewan: ${err.message}`
        : 'Gagal membuat hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
