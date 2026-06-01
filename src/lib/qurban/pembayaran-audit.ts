import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import type { Pembayaran } from './pembayaran-repo';

/**
 * Audit emitters untuk `qurban_pembayaran` (F6). Event names:
 *   pembayaran.created | pembayaran.batal (M-A) |
 *   pembayaran.terima_panitia | pembayaran.lunas (M-B, TUNAI Model A)
 *
 * Pencocokan TRANSFER (pembayaran.matched) menyusul di Milestone C. Mengikuti
 * pola `peserta-audit.ts` (memanggil `writeAuditLog`, `entitas='pembayaran'`).
 */

const ENTITAS = 'pembayaran';

interface Actor {
  user_id: string;
  ip_address: string;
}

export function auditPembayaranCreated(record: Pembayaran, actor: Actor): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.CREATE,
    entitas: ENTITAS,
    entitas_id: record.id,
    event_type: 'pembayaran.created',
    after: record,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPembayaranTerimaPanitia(
  record: Pembayaran,
  actor: Actor,
  detail: { panitia_terima_id: string; tanggal_terima_panitia: string }
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: record.id,
    event_type: 'pembayaran.terima_panitia',
    before: { status: 'BELUM_BAYAR' },
    after: {
      status: 'TERIMA_PANITIA',
      kode_bayar: record.kode_bayar,
      panitia_terima_id: detail.panitia_terima_id,
      tanggal_terima_panitia: detail.tanggal_terima_panitia,
    },
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPembayaranLunas(
  record: Pembayaran,
  actor: Actor,
  detail: { skm_transaksi_id: string; tanggal_lunas: string; jumlah: number }
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: record.id,
    event_type: 'pembayaran.lunas',
    before: { status: 'TERIMA_PANITIA' },
    after: {
      status: 'LUNAS',
      kode_bayar: record.kode_bayar,
      skm_transaksi_id: detail.skm_transaksi_id,
      tanggal_lunas: detail.tanggal_lunas,
      jumlah: detail.jumlah,
    },
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPembayaranLunasViaRekonsiliasi(
  record: Pembayaran,
  actor: Actor,
  detail: { layer: string; via: string; skm_transaksi_id: string; bank_ref: string; amount_ok: boolean }
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: record.id,
    event_type: 'pembayaran.lunas_via_rekonsiliasi',
    before: { status: 'BELUM_BAYAR' },
    after: {
      status: 'LUNAS',
      kode_bayar: record.kode_bayar,
      layer: detail.layer,
      via: detail.via,
      skm_transaksi_id: detail.skm_transaksi_id,
      bank_ref: detail.bank_ref,
      amount_ok: detail.amount_ok,
    },
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPembayaranBatal(
  id: string,
  from: string,
  actor: Actor,
  opts?: { alasan?: string; kode_bayar?: string }
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'pembayaran.batal',
    before: { status: from },
    after: {
      status: 'BATAL',
      ...(opts?.kode_bayar ? { kode_bayar: opts.kode_bayar } : {}),
      ...(opts?.alasan ? { alasan: opts.alasan } : {}),
    },
    notes: opts?.alasan,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}
