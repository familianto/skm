import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import type { Operation } from './pemetaan-validators';

/**
 * Audit emitter Pemetaan F5b A2. Konvensi sesuai docs 3.E §9.4:
 *   `pemetaan.batch_save` — satu event per PM1 sukses, `operations` array di
 *   `detail.after`, `entitas_id = edisi_id`.
 *
 * Non-blocking (`writeAuditLog` sendiri swallow error) — kegagalan tulis
 * audit TIDAK boleh menggagalkan respons sukses PM1.
 */

const ENTITAS = 'pemetaan';

interface Actor {
  user_id: string;
  user_info?: string;
  ip_address: string;
}

export function writePemetaanBatchSaveAudit(params: {
  edisi_id: string;
  version_before: string;
  version_after: string;
  operations: Operation[];
  audit_notes?: string;
  actor: Actor;
}): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: params.edisi_id,
    event_type: 'pemetaan.batch_save',
    after: {
      version_before: params.version_before,
      version_after: params.version_after,
      operations: params.operations,
      audit_notes: params.audit_notes ?? '',
    },
    notes: params.audit_notes,
    user_id: params.actor.user_id,
    user_info: params.actor.user_info,
    ip_address: params.actor.ip_address,
  });
}
