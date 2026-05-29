import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { sheetsService } from '@/lib/google-sheets';

import { resolveEdisiRecordForPemetaanWrite } from '@/lib/qurban/pemetaan-context';
import {
  PEMETAAN_BATCH_SAVE_SCHEMA,
  type PemetaanBatchSaveRequest,
} from '@/lib/qurban/pemetaan-validators';
import {
  buildSimulateState,
  simulateBatch,
  masterHargaPerSlot,
  type MasterIndexEntry,
} from '@/lib/qurban/pemetaan-engine';
import {
  listPesertaRecordsByEdisi,
  mapPesertaToRow,
  STATUS_TERDAFTAR,
} from '@/lib/qurban/peserta-repo';
import {
  listDaftarHewanRecordsByEdisi,
  mapDaftarHewanToRow,
} from '@/lib/qurban/daftar-hewan-repo';
import { listMasterHewanByEdisi } from '@/lib/qurban/master-hewan-repo';
import { HEWAN_STATUS } from '@/lib/qurban/hewan-state-machine';
import { edisiToRow } from '@/lib/qurban/edisi-repo';
import { writePemetaanBatchSaveAudit } from '@/lib/qurban/pemetaan-audit';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

/**
 * PM1 — POST /api/qurban/pemetaan/batch-save
 *
 * Apply batch operasi pemetaan (move/swap/renumber) secara atomik dengan
 * optimistic concurrency via `qurban_edisi.pemetaan_version`.
 *
 * Algoritma:
 *   1. Validasi Zod body.
 *   2. Resolve edisi (writable): tolak DRAFT (422 BUSINESS_EDISI_NOT_AKTIF),
 *      SELESAI (422 BUSINESS_EDISI_LOCKED).
 *   3. Cek `pemetaan_version === expected_version`. Mismatch → 409
 *      CONFLICT_VERSION. Tidak ada penulisan.
 *   4. Re-read state SEGAR (peserta TERDAFTAR + hewan AKTIF + master harga)
 *      untuk dijadikan basis simulasi (bukan dari snapshot client — itu bisa
 *      stale walaupun version cocok karena PS2/PS5 tidak bump version).
 *   5. Simulasi batch via fungsi murni `simulateBatch`. Gagal → 422
 *      BUSINESS_PEMETAAN_INVALID (+ failedOpIndex). Tidak ada penulisan.
 *   6. Susun list update untuk peserta-changed + hewan-changed + bump edisi.
 *   7. `sheetsService.batchUpdateRanges(...)` — 1 HTTP call, atomik di sisi
 *      Google.
 *   8. Audit `pemetaan.batch_save` (non-blocking).
 *   9. Return lean: `{version, applied, affected_peserta_ids, affected_hewan_ids}`.
 *
 * Race PS2/PS5: PM1 TIDAK menyentuh PS2/PS4/PS5. Race window dijaga oleh
 * re-read state segar di langkah 4 — kalau slot target ternyata sudah ke-isi
 * peserta baru via PS2, simulator menolak op tsb → 422 atomik, tidak ada
 * partial write.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, WRITE_ROLES);
  if (!guard.ok) return guard.response;
  const actor = {
    user_id: guard.session.user_id,
    ip_address: getClientIp(request.headers),
  };

  try {
    // 1. Schema-level validasi.
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        400,
        { field: issue.path.join('.') }
      );
    }
    const req: PemetaanBatchSaveRequest = parsed.data;

    // 2. Edisi gate (writable + AKTIF).
    const gate = await resolveEdisiRecordForPemetaanWrite(req.edisi_id, guard.session.peran);
    if (!gate.ok) return gate.response;
    const edisiRecord = gate.record;

    // 3. Version check.
    if (edisiRecord.edisi.pemetaan_version !== req.expected_version) {
      return error(
        ErrorCodes.CONFLICT_VERSION,
        'Versi pemetaan sudah berubah; muat ulang papan dan coba lagi.',
        409,
        {
          current_version: edisiRecord.edisi.pemetaan_version,
          expected_version: req.expected_version,
        }
      );
    }

    // 4. Re-read state SEGAR.
    const [pesertaRecords, hewanRecords, masterRows] = await Promise.all([
      listPesertaRecordsByEdisi(edisiRecord.edisi.id, { status_pendaftaran: STATUS_TERDAFTAR }),
      listDaftarHewanRecordsByEdisi(edisiRecord.edisi.id),
      listMasterHewanByEdisi(edisiRecord.edisi.id),
    ]);

    // Filter hewan AKTIF untuk simulator (tapi pertahankan rowIndex map untuk write-back).
    const hewanRowIndexById = new Map<string, number>();
    const hewanForState = hewanRecords
      .filter((r) => r.hewan.status === HEWAN_STATUS.AKTIF)
      .map((r) => {
        hewanRowIndexById.set(r.hewan.id, r.rowIndex);
        return r.hewan;
      });
    const pesertaRowIndexById = new Map<string, number>();
    const pesertaForState = pesertaRecords.map((r) => {
      pesertaRowIndexById.set(r.peserta.id, r.rowIndex);
      return r.peserta;
    });

    // Master index: kapasitas/harga per master_hewan_id. Harga "per slot" =
    // ronde frozen-time match (sama dengan PS2 freeze): master ÷ kapasitas.
    // tipe pembelian peserta sumber sudah ter-snapshot di `tipe_qurban`, tapi
    // PM1 use_new memakai harga di sisi hewan TARGET — kita pakai `harga_beli`
    // sebagai default (BELI mendominasi qurban masjid). use_existing_target
    // di swap tidak butuh master.
    const masterIndex = new Map<string, MasterIndexEntry>();
    for (const m of masterRows) {
      masterIndex.set(m.id, { harga: masterHargaPerSlot(m.harga_beli, m.kapasitas_slot) });
    }

    // 5. Simulate.
    const initial = buildSimulateState(pesertaForState, hewanForState);
    const sim = simulateBatch(initial, masterIndex, req.operations);
    if (!sim.ok) {
      return error(
        ErrorCodes.BUSINESS_PEMETAAN_INVALID,
        sim.message,
        422,
        { failed_op_index: sim.failedOpIndex, error_code: sim.errorCode }
      );
    }

    const versionBefore = edisiRecord.edisi.pemetaan_version;
    const now = new Date().toISOString();
    const versionAfter = now;

    // 6. Susun updates.
    const updates: Array<{
      sheetName: string;
      rowIndex: number;
      values: (string | number | boolean)[];
    }> = [];

    // Peserta-changed: merge field hasil simulasi ke baris asli + updated_at.
    const pesertaOrigById = new Map(pesertaRecords.map((r) => [r.peserta.id, r.peserta]));
    for (const id of sim.changes.pesertaIds) {
      const changed = sim.state.peserta.get(id);
      const orig = pesertaOrigById.get(id);
      const rowIndex = pesertaRowIndexById.get(id);
      if (!changed || !orig || !rowIndex) continue; // defensif; tidak mungkin terjadi
      const merged = {
        ...orig,
        hewan_id: changed.hewan_id,
        slot_number: changed.slot_number,
        harga_disepakati: changed.harga_disepakati,
        updated_at: now,
      };
      updates.push({
        sheetName: QURBAN_SHEETS.PESERTA,
        rowIndex,
        values: mapPesertaToRow(merged),
      });
    }

    // Hewan-changed.
    const hewanOrigById = new Map(hewanRecords.map((r) => [r.hewan.id, r.hewan]));
    for (const id of sim.changes.hewanIds) {
      const changed = sim.state.hewan.get(id);
      const orig = hewanOrigById.get(id);
      const rowIndex = hewanRowIndexById.get(id);
      if (!changed || !orig || !rowIndex) continue;
      const merged = {
        ...orig,
        nomor_urut: changed.nomor_urut,
        updated_at: now,
      };
      updates.push({
        sheetName: QURBAN_SHEETS.DAFTAR_HEWAN,
        rowIndex,
        values: mapDaftarHewanToRow(merged),
      });
    }

    // Edisi bump (selalu, walaupun changes peserta+hewan kosong — operasi
    // no-op tetap valid request dan tetap meng-invalidate snapshot lama).
    const edisiMerged = {
      ...edisiRecord.edisi,
      pemetaan_version: versionAfter,
      updated_at: now,
    };
    updates.push({
      sheetName: QURBAN_SHEETS.EDISI,
      rowIndex: edisiRecord.rowIndex,
      values: edisiToRow(edisiMerged),
    });

    // 7. Atomic batch write.
    await sheetsService.batchUpdateRanges(updates);

    // 8. Audit (non-blocking).
    await writePemetaanBatchSaveAudit({
      edisi_id: edisiRecord.edisi.id,
      version_before: versionBefore,
      version_after: versionAfter,
      operations: req.operations,
      audit_notes: req.audit_notes,
      actor,
    });

    // 9. Response lean.
    return success({
      version: versionAfter,
      applied: req.operations.length,
      affected_peserta_ids: sim.changes.pesertaIds,
      affected_hewan_ids: sim.changes.hewanIds,
    });
  } catch (err) {
    console.error('[POST /api/qurban/pemetaan/batch-save] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal menyimpan pemetaan: ${err.message}`
        : 'Gagal menyimpan pemetaan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
