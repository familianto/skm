import { NextRequest } from 'next/server';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { parseAuditRow } from '@/lib/api/audit-read';

import { findActiveEdisi, findEdisiById } from '@/lib/qurban/edisi-repo';
import { evaluatePesertaEdisiGate } from '@/lib/qurban/peserta-context';
import { listPesertaByEdisi } from '@/lib/qurban/peserta-repo';
import { listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import {
  buildDashboard,
  selectRecentQurbanActivity,
} from '@/lib/qurban/laporan-dashboard';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

/**
 * LP5 — GET /api/qurban/laporan/dashboard?edisi_id=EDS-...
 *
 * Agregasi read-only untuk Dashboard Qurban (F8 Milestone A). Semua role login
 * boleh. `edisi_id` opsional → default ke edisi AKTIF. Panitia
 * (PENDAFTARAN/DISTRIBUSI) hanya boleh edisi AKTIF (gate `peserta-context`).
 *
 * TIDAK menulis apa pun & TIDAK memanggil withAuditLog. Membaca 4 sheet secara
 * paralel (peserta/pembayaran/daftar_hewan/audit_log) lalu menyerahkan agregasi
 * ke modul pur `laporan-dashboard.ts`.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);
    const edisiId = (url.searchParams.get('edisi_id') || '').trim();

    // Resolusi edisi: param eksplisit, else default AKTIF.
    const edisi = edisiId ? await findEdisiById(edisiId) : await findActiveEdisi();

    // Gate baca (sama dengan peserta read): 404 bila tak ada, 403 bila panitia
    // mengakses edisi non-AKTIF.
    const decision = evaluatePesertaEdisiGate(edisi, guard.session.peran, {});
    if (!decision.ok) {
      return error(decision.code, decision.message, decision.status, decision.details);
    }
    const resolved = edisi!;

    const [peserta, pembayaran, hewan, auditRows] = await Promise.all([
      listPesertaByEdisi(resolved.id),
      listPembayaranByEdisi(resolved.id),
      listDaftarHewanByEdisi(resolved.id),
      readAuditRows(),
    ]);

    const aktivitas = selectRecentQurbanActivity(
      auditRows.map(parseAuditRow),
      { edisiId: resolved.id, limit: 5 }
    );

    const today = new Date().toISOString().slice(0, 10);
    const dashboard = buildDashboard({
      edisi: resolved,
      peserta,
      pembayaran,
      hewan,
      aktivitas,
      today,
    });

    return success(dashboard, { generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /api/qurban/laporan/dashboard] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat dashboard qurban.', 500);
  }
}

/** Baca audit_log defensif: sheet hilang → `[]` (jangan gagalkan dashboard). */
async function readAuditRows(): Promise<unknown[][]> {
  try {
    return await sheetsService.getRows(SHEET_NAMES.AUDIT_LOG);
  } catch (err) {
    console.error('[GET /api/qurban/laporan/dashboard] gagal baca audit_log:', err);
    return [];
  }
}
