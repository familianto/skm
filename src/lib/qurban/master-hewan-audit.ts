import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import type { QurbanMasterHewan } from './master-hewan-repo';

/**
 * Emit per-field-group audit entries for a master_hewan update (shared by MH3
 * PATCH and MH5 bulk-upsert).
 *
 * The audit catalog has no generic `master_hewan.updated` event — price and
 * capacity changes are tracked separately:
 *   - harga_beli / harga_bawa_sendiri changed → `master_hewan.harga_updated`
 *   - kapasitas_slot changed                 → `master_hewan.kapasitas_updated`
 * A patch touching both writes two entries.
 */
export async function auditMasterHewanUpdate(params: {
  id: string;
  before: QurbanMasterHewan;
  after: QurbanMasterHewan;
  user_id: string;
  ip_address: string;
}): Promise<void> {
  const { id, before, after, user_id, ip_address } = params;

  const hargaBefore: Record<string, unknown> = {};
  const hargaAfter: Record<string, unknown> = {};
  for (const k of ['harga_beli', 'harga_bawa_sendiri'] as const) {
    if (before[k] !== after[k]) {
      hargaBefore[k] = before[k];
      hargaAfter[k] = after[k];
    }
  }
  if (Object.keys(hargaAfter).length > 0) {
    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'master_hewan',
      entitas_id: id,
      event_type: 'master_hewan.harga_updated',
      before: hargaBefore,
      after: hargaAfter,
      user_id,
      ip_address,
    });
  }

  if (before.kapasitas_slot !== after.kapasitas_slot) {
    await writeAuditLog({
      aksi: AuditAksi.UPDATE,
      entitas: 'master_hewan',
      entitas_id: id,
      event_type: 'master_hewan.kapasitas_updated',
      before: { kapasitas_slot: before.kapasitas_slot },
      after: { kapasitas_slot: after.kapasitas_slot },
      user_id,
      ip_address,
    });
  }
}
