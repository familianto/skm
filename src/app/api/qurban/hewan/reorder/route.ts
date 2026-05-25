import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForHewan } from '@/lib/qurban/daftar-hewan-context';
import {
  listDaftarHewanRecordsByEdisi,
  updateDaftarHewanAt,
} from '@/lib/qurban/daftar-hewan-repo';
import { isValidPermutation } from '@/lib/qurban/daftar-hewan-numbering';
import { validateReorderPayload } from '@/lib/qurban/validators';
import { auditHewanNomorUrutChanged } from '@/lib/qurban/daftar-hewan-audit';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * H5 — POST /api/qurban/hewan/reorder?edisi_id=EDS-...
 *
 * Batch reorder dalam satu grup (edisi, jenis, kelas). `ordered_hewan_ids`
 * WAJIB permutasi lengkap grup. Assign nomor_urut = 1..N. Tidak menegakkan
 * invariant BAWA_SENDIRI-sebelum-BELI (operasi manual). Edisi SELESAI ditolak.
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
    const parsed = validateReorderPayload(body);
    if (!parsed.ok || !parsed.value) {
      const first = parsed.errors[0];
      return error(ErrorCodes.VALIDATION_FAILED, first.message, 422, {
        field: first.field,
        errors: parsed.errors,
      });
    }
    const { jenis, kelas, ordered_hewan_ids } = parsed.value;

    const records = await listDaftarHewanRecordsByEdisi(edisiId);
    const groupRecords = records.filter(
      (r) => r.hewan.jenis === jenis && r.hewan.kelas === kelas
    );
    const groupIds = groupRecords.map((r) => r.hewan.id);

    if (!isValidPermutation(groupIds, ordered_hewan_ids)) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'ordered_hewan_ids harus permutasi lengkap grup (jenis, kelas) — tanpa kurang, lebih, atau duplikat.',
        422,
        { field: 'ordered_hewan_ids', expected_ids: groupIds, got_ids: ordered_hewan_ids }
      );
    }

    const byId = new Map(groupRecords.map((r) => [r.hewan.id, r]));
    const now = new Date().toISOString();
    let changed = 0;

    for (let i = 0; i < ordered_hewan_ids.length; i++) {
      const rec = byId.get(ordered_hewan_ids[i])!;
      const newNomor = i + 1;
      if (rec.hewan.nomor_urut === newNomor) continue; // unchanged → skip
      const before = rec.hewan.nomor_urut;
      const updated: QurbanDaftarHewan = {
        ...rec.hewan,
        nomor_urut: newNomor,
        updated_at: now,
      };
      await updateDaftarHewanAt(rec.rowIndex, updated);
      await auditHewanNomorUrutChanged(rec.hewan.id, before, newNomor, actor);
      changed++;
    }

    return success({ jenis, kelas, count: ordered_hewan_ids.length, changed });
  } catch (err) {
    console.error('[POST /api/qurban/hewan/reorder] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal mengurutkan ulang hewan.', 500);
  }
}
