import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import {
  appendMasterHewan,
  findMasterHewanByJenisKelas,
  updateMasterHewan,
  type QurbanMasterHewan,
} from '@/lib/qurban/master-hewan-repo';
import { auditMasterHewanUpdate } from '@/lib/qurban/master-hewan-audit';
import { generateMasterHewanId } from '@/lib/qurban/id-generator';
import { validateMasterHewanCreate } from '@/lib/qurban/validators';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

/**
 * MH5 — POST /api/qurban/master-hewan/bulk-upsert?edisi_id=EDS-...
 *
 * Batch initial setup. DRAFT-only (AKTIF/SELESAI → BUSINESS_EDISI_LOCKED).
 * All-or-nothing validation: any invalid item rejects the whole batch before
 * any write. Per-item match on `(edisi_id, jenis, kelas)` → update or create.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const ip = getClientIp(request.headers);

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();
    if (!edisiId) {
      return error(
        ErrorCodes.VALIDATION_REQUIRED,
        'Query param `edisi_id` wajib diisi.',
        400,
        { field: 'edisi_id' }
      );
    }

    const edisi = await findEdisiById(edisiId);
    if (!edisi) {
      return error(ErrorCodes.NOT_FOUND, 'Edisi tidak ditemukan.', 404);
    }
    if (edisi.status !== EDISI_STATUS.DRAFT) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Bulk-upsert master hewan hanya dapat dilakukan saat edisi berstatus DRAFT.',
        422,
        { edisi_status: edisi.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        '`items` wajib berupa array tidak kosong.',
        422,
        { field: 'items' }
      );
    }

    // All-or-nothing: validate every item up front; reject the whole batch on
    // the first invalid item (with its index) before any write.
    const validated = items.map((item) => validateMasterHewanCreate(item));
    const badIndex = validated.findIndex((v) => !v.ok);
    if (badIndex !== -1) {
      const bad = validated[badIndex];
      const first = bad.errors[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        `Item index ${badIndex} tidak valid: ${first.message}`,
        422,
        { index: badIndex, field: first.field, errors: bad.errors }
      );
    }

    // Reject intra-batch duplicates on the natural key so two items don't
    // race to create/update the same (jenis, kelas).
    const seen = new Set<string>();
    for (let i = 0; i < validated.length; i++) {
      const v = validated[i].value!;
      const key = `${v.jenis}|${v.kelas}`;
      if (seen.has(key)) {
        return error(
          ErrorCodes.VALIDATION_FAILED,
          `Item index ${i} duplikat (jenis ${v.jenis} kelas ${v.kelas}) dalam batch.`,
          422,
          { index: i, jenis: v.jenis, kelas: v.kelas }
        );
      }
      seen.add(key);
    }

    let created = 0;
    let updated = 0;
    const results: QurbanMasterHewan[] = [];

    for (const v of validated) {
      const input = v.value!;
      const now = new Date().toISOString();
      const existing = await findMasterHewanByJenisKelas(edisiId, input.jenis, input.kelas);

      if (existing) {
        const merged: QurbanMasterHewan = {
          ...existing,
          kapasitas_slot: input.kapasitas_slot,
          harga_beli: input.harga_beli,
          harga_bawa_sendiri: input.harga_bawa_sendiri,
        };
        const changed =
          merged.kapasitas_slot !== existing.kapasitas_slot ||
          merged.harga_beli !== existing.harga_beli ||
          merged.harga_bawa_sendiri !== existing.harga_bawa_sendiri;

        if (changed) {
          merged.updated_at = now;
          await updateMasterHewan(merged);
          await auditMasterHewanUpdate({
            id: merged.id,
            before: existing,
            after: merged,
            user_id: guard.session.user_id,
            ip_address: ip,
          });
          updated++;
          results.push(merged);
        } else {
          // No change → no write, no audit (idempotent), but still report it.
          results.push(existing);
        }
        continue;
      }

      const id = await generateMasterHewanId();
      const record: QurbanMasterHewan = {
        id,
        edisi_id: edisiId,
        jenis: input.jenis as QurbanMasterHewan['jenis'],
        kelas: input.kelas as QurbanMasterHewan['kelas'],
        kapasitas_slot: input.kapasitas_slot,
        harga_beli: input.harga_beli,
        harga_bawa_sendiri: input.harga_bawa_sendiri,
        is_active: true,
        created_at: now,
        updated_at: now,
        created_by: guard.session.user_id,
      };
      await appendMasterHewan(record);
      await writeAuditLog({
        aksi: AuditAksi.CREATE,
        entitas: 'master_hewan',
        entitas_id: id,
        event_type: 'master_hewan.created',
        after: record,
        user_id: guard.session.user_id,
        ip_address: ip,
      });
      created++;
      results.push(record);
    }

    return success({ created, updated, items: results });
  } catch (err) {
    console.error('[POST /api/qurban/master-hewan/bulk-upsert] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal melakukan bulk-upsert master hewan: ${err.message}`
        : 'Gagal melakukan bulk-upsert master hewan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
