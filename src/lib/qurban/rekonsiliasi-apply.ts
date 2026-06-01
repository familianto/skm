import { nowISO } from '@/lib/utils';

import {
  getPembayaranRecordById,
  updatePembayaranAt,
  type Pembayaran,
} from './pembayaran-repo';
import { listPesertaByEdisi, STATUS_TERDAFTAR } from './peserta-repo';
import { getDaftarHewanById } from './daftar-hewan-repo';
import {
  decideKategoriNama,
  resolveKategoriIdByNama,
  correctTransaksiKategori,
  type KategoriDecision,
  type SlotTipe,
  type TransaksiLite,
} from './skm-bridge';
import { auditPembayaranLunasViaRekonsiliasi } from './pembayaran-audit';
import { notifyPembayaranLunas } from './pembayaran-notify';

/**
 * Apply-match TRANSFER (F6 M-C) — dipakai bersama oleh pass auto-rekonsiliasi
 * (Layer 1) dan link manual (PY6). Mengoreksi kategori transaksi yang match,
 * lalu menandai pembayaran LUNAS + link ke transaksi.
 */

/**
 * Resolusi kategori untuk seluruh slot TERDAFTAR satu `kode_bayar`.
 * `null` = tak ada slot aktif atau hewan tak terbaca (kategori tak bisa
 * diresolusi → caller lewati koreksi kategori, uang tetap dicatat LUNAS).
 */
export async function resolveKodeBayarKategori(
  edisiId: string,
  kodeBayar: string
): Promise<KategoriDecision | null> {
  const slotsPeserta = (await listPesertaByEdisi(edisiId)).filter(
    (p) => p.kode_bayar === kodeBayar && p.status_pendaftaran === STATUS_TERDAFTAR
  );
  if (slotsPeserta.length === 0) return null;

  const jenisCache = new Map<string, string | null>();
  const slots: SlotTipe[] = [];
  for (const p of slotsPeserta) {
    let jenis = jenisCache.get(p.hewan_id);
    if (jenis === undefined) {
      const hewan = await getDaftarHewanById(p.hewan_id);
      jenis = hewan ? hewan.jenis : null;
      jenisCache.set(p.hewan_id, jenis);
    }
    if (jenis === null) return null; // hewan tak terbaca → tak bisa resolusi
    slots.push({ jenisHewan: jenis as SlotTipe['jenisHewan'], tipePembelian: p.tipe_qurban });
  }
  return decideKategoriNama(slots);
}

export interface ApplyMatchOpts {
  layer: 'AUTO' | 'MANUAL';
  via: string;
  edisiId: string;
  actor: { user_id: string; ip_address: string };
}

export type ApplyMatchOutcome =
  | {
      ok: true;
      pembayaran: Pembayaran;
      kategori_corrected: boolean;
      mixed: boolean;
      amount_ok: boolean;
      transaksi_id: string;
    }
  | { ok: false; code: string; reason: string };

/** `YYYY-MM-DD[...]` (format SKM) → ISO-8601 Z (konvensi qurban). */
function tanggalToIsoZ(tanggal: string): string {
  return `${tanggal.slice(0, 10)}T00:00:00.000Z`;
}

/**
 * Re-baca pembayaran → gate (TRANSFER + BELUM_BAYAR + belum ter-link) →
 * koreksi kategori transaksi (skip bila campur/tak-resolusi, flag di metadata) →
 * set LUNAS + link + bank_ref + match_metadata → audit.
 */
export async function applyMatch(
  pembayaranId: string,
  transaksi: TransaksiLite,
  opts: ApplyMatchOpts
): Promise<ApplyMatchOutcome> {
  // (1) Re-baca + gate (cegah dobel).
  const rec = await getPembayaranRecordById(pembayaranId);
  if (!rec) return { ok: false, code: 'NOT_FOUND', reason: 'Pembayaran tidak ditemukan.' };
  const p = rec.pembayaran;
  if (p.metode !== 'TRANSFER') return { ok: false, code: 'CONFLICT', reason: `metode ${p.metode}, bukan TRANSFER` };
  if (p.status !== 'BELUM_BAYAR') return { ok: false, code: 'CONFLICT', reason: `status ${p.status}, bukan BELUM_BAYAR` };
  if (p.skm_transaksi_id) return { ok: false, code: 'CONFLICT', reason: `sudah ter-link ke ${p.skm_transaksi_id}` };

  // (2) Koreksi kategori transaksi per-tipe (kecuali campur / tak terresolusi).
  const decision = await resolveKodeBayarKategori(opts.edisiId, p.kode_bayar);
  let kategori_corrected = false;
  const mixed = !!decision && decision.mixed;
  if (decision && !decision.mixed) {
    const kategoriId = await resolveKategoriIdByNama(decision.nama);
    const res = await correctTransaksiKategori(transaksi.id, kategoriId, opts.actor.user_id);
    kategori_corrected = res.changed;
  }

  // (3) Update pembayaran LUNAS + link.
  const amount_ok = transaksi.jumlah === p.nominal_transfer;
  const match_metadata = JSON.stringify({
    layer: opts.layer,
    via: opts.via,
    matched_at: nowISO(),
    amount_ok,
    ...(amount_ok ? {} : { selisih: transaksi.jumlah - p.nominal_transfer }),
    ...(mixed ? { mixed: true, note: 'kategori perlu review manual' } : {}),
  });
  const updated: Pembayaran = {
    ...p,
    status: 'LUNAS',
    tanggal_lunas: tanggalToIsoZ(transaksi.tanggal),
    skm_transaksi_id: transaksi.id,
    bank_ref: transaksi.bank_ref,
    match_metadata,
    updated_at: nowISO(),
  };
  await updatePembayaranAt(rec.rowIndex, updated);

  // (4) Audit.
  await auditPembayaranLunasViaRekonsiliasi(updated, opts.actor, {
    layer: opts.layer,
    via: opts.via,
    skm_transaksi_id: transaksi.id,
    bank_ref: transaksi.bank_ref,
    amount_ok,
  });

  // (5) F6 D2: WA "pembayaran confirmed" (gated). Best-effort — tak menggagalkan.
  await notifyPembayaranLunas(updated);

  return { ok: true, pembayaran: updated, kategori_corrected, mixed, amount_ok, transaksi_id: transaksi.id };
}
