import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import { HEWAN_STATUS } from './hewan-state-machine';
import type { QurbanDaftarHewan } from './daftar-hewan-types';

/**
 * Audit emitters for `qurban_daftar_hewan` (F5a). Event names per prompt §6.2:
 *   hewan.created | hewan.updated | hewan.nomor_urut_changed |
 *   hewan.status_changed | hewan.batch_terpotong | hewan.cancelled
 */

const ENTITAS = 'daftar_hewan';

interface Actor {
  user_id: string;
  ip_address: string;
}

export function auditHewanCreated(
  record: QurbanDaftarHewan,
  actor: Actor
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.CREATE,
    entitas: ENTITAS,
    entitas_id: record.id,
    event_type: 'hewan.created',
    after: record,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditHewanUpdated(
  id: string,
  before: Partial<QurbanDaftarHewan>,
  after: Partial<QurbanDaftarHewan>,
  actor: Actor
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'hewan.updated',
    before,
    after,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditHewanNomorUrutChanged(
  id: string,
  from: number,
  to: number,
  actor: Actor
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'hewan.nomor_urut_changed',
    before: { nomor_urut: from },
    after: { nomor_urut: to },
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

/**
 * AKTIF → TERPOTONG emits `hewan.batch_terpotong` (with `tanggal_pemotongan` in
 * metadata — Opsi A, no column); every other transition emits
 * `hewan.status_changed`.
 */
export function auditHewanStatusChanged(
  id: string,
  from: string,
  to: string,
  actor: Actor,
  opts?: { tanggal_pemotongan?: string; notes?: string }
): Promise<void> {
  if (to === HEWAN_STATUS.TERPOTONG) {
    return writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: ENTITAS,
      entitas_id: id,
      event_type: 'hewan.batch_terpotong',
      before: { status: from },
      after: { status: to, tanggal_pemotongan: opts?.tanggal_pemotongan ?? '' },
      notes: opts?.notes,
      user_id: actor.user_id,
      ip_address: actor.ip_address,
    });
  }
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'hewan.status_changed',
    before: { status: from },
    after: { status: to },
    notes: opts?.notes,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}

export function auditHewanCancelled(
  id: string,
  from: string,
  actor: Actor,
  notes?: string
): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.UPDATE,
    entitas: ENTITAS,
    entitas_id: id,
    event_type: 'hewan.cancelled',
    before: { status: from },
    after: { status: HEWAN_STATUS.BATAL },
    notes,
    user_id: actor.user_id,
    ip_address: actor.ip_address,
  });
}
