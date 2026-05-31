import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPeserta } from '@/lib/qurban/peserta-context';
import { getPembayaranRecordById, updatePembayaranAt } from '@/lib/qurban/pembayaran-repo';
import { auditPembayaranLunas } from '@/lib/qurban/pembayaran-audit';
import { listPesertaByEdisi, STATUS_TERDAFTAR } from '@/lib/qurban/peserta-repo';
import { getDaftarHewanById } from '@/lib/qurban/daftar-hewan-repo';
import { getMuqoribById } from '@/lib/qurban/muqorib-repo';
import {
  decideKategoriNama,
  resolveKategoriIdByNama,
  resolveRekeningByNama,
  createTransaksiPemasukanQurban,
  REKENING_KAS_TUNAI,
  type SlotTipe,
} from '@/lib/qurban/skm-bridge';
import type { JenisHewan } from '@/lib/qurban/daftar-hewan-types';

// PY3 — setor ke Kas (Model A) menulis transaksi keuangan → ketat.
const LUNASKAN_ROLES = [PERAN.SUPER_ADMIN, PERAN.BENDAHARA];

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * PY3 — PATCH /api/qurban/pembayaran/[id]/lunaskan?edisi_id=EDS-...
 *
 * TUNAI Model A: `TERIMA_PANITIA → LUNAS`. Transaksi-first:
 *   (1) re-baca + gate idempotensi (TUNAI, TERIMA_PANITIA, belum ada transaksi);
 *   (2) buat transaksi pemasukan ke Kas Tunai (`jumlah = nominal_total`, BULAT);
 *   (3) update pembayaran LUNAS + `skm_transaksi_id`.
 * Kegagalan langkah 3 setelah transaksi terbuat → error LOUD (jaring rekonsiliasi
 * di M-C).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, LUNASKAN_ROLES);
  if (!guard.ok) return guard.response;
  const actor = { user_id: guard.session.user_id, ip_address: getClientIp(request.headers) };

  try {
    const { id } = await params;
    const gate = await resolveEdisiForPeserta(request, guard.session.peran, { requireWritable: true });
    if (!gate.ok) return gate.response;

    // (1) Re-baca + gate.
    const rec = await getPembayaranRecordById(id);
    if (!rec || rec.pembayaran.edisi_id !== gate.edisi.id) {
      return error(ErrorCodes.NOT_FOUND, 'Pembayaran tidak ditemukan.', 404);
    }
    const current = rec.pembayaran;

    if (current.metode !== 'TUNAI') {
      return error(ErrorCodes.CONFLICT, `Jalur LUNAS ini hanya untuk TUNAI (metode: ${current.metode}). TRANSFER lunas via rekonsiliasi (M-C).`, 409, { metode: current.metode });
    }
    if (current.status !== 'TERIMA_PANITIA') {
      return error(ErrorCodes.CONFLICT, `Pembayaran berstatus ${current.status} tidak dapat dilunaskan (harus TERIMA_PANITIA).`, 409, { status: current.status });
    }
    if (current.skm_transaksi_id) {
      return error(ErrorCodes.CONFLICT, `Pembayaran sudah tertaut transaksi ${current.skm_transaksi_id} — cegah dobel-create.`, 409, { skm_transaksi_id: current.skm_transaksi_id });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tanggalRaw = typeof body.tanggal_lunas === 'string' ? body.tanggal_lunas.trim() : '';
    const tanggal_lunas = tanggalRaw || new Date().toISOString();
    if (!ISO_Z.test(tanggal_lunas)) {
      return error(ErrorCodes.VALIDATION_FORMAT, 'tanggal_lunas harus ISO-8601 Z.', 422, { field: 'tanggal_lunas' });
    }

    // Resolusi kategori per-tipe dari slot peserta `kode_bayar` ini.
    const slotsPeserta = (await listPesertaByEdisi(gate.edisi.id)).filter(
      (p) => p.kode_bayar === current.kode_bayar && p.status_pendaftaran === STATUS_TERDAFTAR
    );
    if (slotsPeserta.length === 0) {
      return error(ErrorCodes.CONFLICT, 'Tidak ada slot TERDAFTAR untuk pendaftaran ini; tidak dapat dilunaskan.', 409, { kode_bayar: current.kode_bayar });
    }

    // jenis hewan per slot (cache per hewan_id).
    const jenisCache = new Map<string, JenisHewan>();
    const slots: SlotTipe[] = [];
    for (const p of slotsPeserta) {
      let jenis = jenisCache.get(p.hewan_id);
      if (jenis === undefined) {
        const hewan = await getDaftarHewanById(p.hewan_id);
        if (!hewan) {
          return error(ErrorCodes.CONFLICT, `Hewan ${p.hewan_id} untuk slot ${p.id} tidak ditemukan; resolusi kategori gagal.`, 409, { hewan_id: p.hewan_id });
        }
        jenis = hewan.jenis;
        jenisCache.set(p.hewan_id, jenis);
      }
      slots.push({ jenisHewan: jenis, tipePembelian: p.tipe_qurban });
    }

    const decision = decideKategoriNama(slots);
    if (decision.mixed) {
      // Defensif (mungkin pasca-pemetaan dipindah ke hewan beda jenis):
      // JANGAN auto-create transaksi campur. Tandai notes + minta manual.
      const note = `[F6] Kategori campur (${decision.nama.join(' + ')}) — pelunasan butuh penanganan manual.`;
      await updatePembayaranAt(rec.rowIndex, { ...current, notes: note, updated_at: new Date().toISOString() });
      return error(ErrorCodes.BUSINESS_PEMBAYARAN_MIXED_KATEGORI, note, 409, { kategori: decision.nama });
    }

    const kategori_id = await resolveKategoriIdByNama(decision.nama);
    const rekening_id = await resolveRekeningByNama(REKENING_KAS_TUNAI);
    const muqorib = await getMuqoribById(current.muqorib_id);
    const namaMuqorib = muqorib?.nama_lengkap || current.muqorib_id;

    const deskripsi = `Qurban ${gate.edisi.tahun_hijriah} - ${current.kode_bayar} - ${namaMuqorib} (Cash/Datang Langsung)`;

    // (2) Transaksi-first. `jumlah = nominal_total` (BULAT, tanpa suffix).
    const trxId = await createTransaksiPemasukanQurban({
      kategori_id,
      rekening_id,
      jumlah: current.nominal_total,
      tanggal: tanggal_lunas.slice(0, 10), // ISO-Z → YYYY-MM-DD (format SKM-core)
      deskripsi,
      bukti_url: current.bukti_url || undefined,
      created_by: guard.session.user_id,
    });

    // (3) Update pembayaran → LUNAS + link. Gagal di sini = LOUD.
    const updated = {
      ...current,
      status: 'LUNAS' as const,
      tanggal_lunas,
      skm_transaksi_id: trxId,
      updated_at: new Date().toISOString(),
    };
    try {
      await updatePembayaranAt(rec.rowIndex, updated);
    } catch (e) {
      console.error('[PY3 lunaskan] update pembayaran gagal SETELAH transaksi dibuat:', e);
      return error(
        ErrorCodes.INTERNAL_ERROR,
        `Transaksi ${trxId} SUDAH dibuat tetapi pembayaran ${id} belum ter-update LUNAS. JANGAN ulangi — verifikasi manual (rekonsiliasi M-C akan mendeteksi).`,
        500,
        { skm_transaksi_id: trxId, pembayaran_id: id }
      );
    }

    await auditPembayaranLunas(updated, actor, {
      skm_transaksi_id: trxId,
      tanggal_lunas,
      jumlah: current.nominal_total,
    });

    return success(updated);
  } catch (err) {
    console.error('[POST /api/qurban/pembayaran/[id]/lunaskan] error:', err);
    const msg = err instanceof Error && err.message ? err.message : 'Gagal melunaskan pembayaran.';
    return error(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
}
