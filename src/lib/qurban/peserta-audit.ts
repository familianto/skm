import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import type { QurbanPeserta } from './peserta-types';

/**
 * Audit emitters for `qurban_peserta` (F4a). Event names:
 *   peserta.created | peserta.updated | peserta.status_changed |
 *   peserta.harga_changed
 */

const ENTITAS = 'peserta';

interface Actor {
  user_id: string;
  ip_address: string;
}

export function auditPesertaCreated(
  record: QurbanPeserta,
  actor: Actor,
  opts?: { is_additional_qurban?: boolean }
): Promise<void> {
  const after = opts?.is_additional_qurban
    ? { ...record, is_additional_qurban: true }
    : record;
  return writeAuditLog({
    aksi: AuditAksi.CREATE,
    entitas: ENTITAS,
    entitas_id: record.id,
    event_type: 'peserta.created',
    after,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPesertaUpdated(
  id: string,
  before: Partial<QurbanPeserta>,
  after: Partial<QurbanPeserta>,
  actor: Actor
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'peserta.updated',
    before,
    after,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPesertaHargaChanged(
  id: string,
  from: number,
  to: number,
  actor: Actor
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'peserta.harga_changed',
    before: { harga_disepakati: from },
    after: { harga_disepakati: to },
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditPesertaStatusChanged(
  id: string,
  from: string,
  to: string,
  actor: Actor,
  opts?: { alasan?: string; refund_handling?: string; notes?: string }
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'peserta.status_changed',
    before: { status_pendaftaran: from },
    after: {
      status_pendaftaran: to,
      ...(opts?.alasan ? { alasan: opts.alasan } : {}),
      ...(opts?.refund_handling ? { refund_handling: opts.refund_handling } : {}),
    },
    notes: opts?.notes,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}
