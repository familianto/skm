import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import type { Pembayaran } from './pembayaran-repo';

/**
 * Audit emitters untuk `qurban_pembayaran` (F6). Event names:
 *   pembayaran.created | pembayaran.batal
 *
 * Transisi status lain (pembayaran.terima_panitia, pembayaran.lunas,
 * pembayaran.matched) menyusul di Milestone B/C. Mengikuti pola
 * `peserta-audit.ts` (memanggil `writeAuditLog`, `entitas='pembayaran'`).
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
