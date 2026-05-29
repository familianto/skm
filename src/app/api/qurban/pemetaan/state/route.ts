import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { resolveEdisiForPemetaan } from '@/lib/qurban/pemetaan-context';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import { listPeserta } from '@/lib/qurban/peserta-repo';
import { listMasterHewanByEdisi } from '@/lib/qurban/master-hewan-repo';
import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';
import {
  buildPemetaanSnapshot,
  type SnapshotMasterInfo,
} from '@/lib/qurban/pemetaan-snapshot';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * PM2 — GET /api/qurban/pemetaan/state?edisi_id=EDS-...
 *
 * Snapshot read-only papan pemetaan: daftar hewan AKTIF dengan slot 1..N,
 * tiap slot ter-isi atau kosong, plus `version` (= `qurban_edisi.pemetaan_version`)
 * untuk optimistic concurrency token PM1 di Milestone A2.
 *
 * Role: SA/BD/AQ/PD/DS. Edisi gate sama dengan pola read PS (panitia
 * PENDAFTARAN/DISTRIBUSI → hanya AKTIF; SA/BD/AQ → status apa pun) — konsisten
 * dengan `peserta-context.evaluatePesertaEdisiGate({})`.
 *
 * Logika:
 *   1. Resolve edisi via `?edisi_id=`.
 *   2. Baca hewan + peserta untuk edisi paralel.
 *   3. Bangun lookup master (`master_hewan_id → jenis/kelas`) untuk
 *      sintesis `nama_tipe`.
 *   4. Bangun lookup nama muqorib (`muqorib_id → nama_lengkap`) — lintas-edisi.
 *   5. Delegasi rakit snapshot ke `buildPemetaanSnapshot` (fungsi murni).
 *   6. `version = edisi.pemetaan_version`.
 *
 * Tidak ada audit, tidak ada penulisan.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const gate = await resolveEdisiForPemetaan(request, guard.session.peran);
    if (!gate.ok) return gate.response;
    const edisi = gate.edisi;

    const [hewanRows, pesertaRows, masterRows, muqoribRows] = await Promise.all([
      listDaftarHewanByEdisi(edisi.id),
      listPeserta({ edisi_id: edisi.id }),
      listMasterHewanByEdisi(edisi.id),
      listAllMuqorib(),
    ]);

    const masterInfo = new Map<string, SnapshotMasterInfo>();
    for (const m of masterRows) {
      masterInfo.set(m.id, {
        jenis: m.jenis,
        kelas: m.kelas,
        harga_beli: m.harga_beli,
        kapasitas_slot: m.kapasitas_slot,
      });
    }
    const muqoribNameById = new Map<string, string>();
    for (const mu of muqoribRows) {
      muqoribNameById.set(mu.id, mu.nama_lengkap);
    }

    const snapshot = buildPemetaanSnapshot(
      hewanRows,
      pesertaRows,
      masterInfo,
      muqoribNameById,
      edisi.id,
      edisi.pemetaan_version
    );

    return success(snapshot);
  } catch (err) {
    console.error('[GET /api/qurban/pemetaan/state] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal memuat state pemetaan: ${err.message}`
        : 'Gagal memuat state pemetaan.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
