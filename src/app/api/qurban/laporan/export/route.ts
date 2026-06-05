import { NextRequest, NextResponse } from 'next/server';

import { error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { findActiveEdisi, findEdisiById } from '@/lib/qurban/edisi-repo';
import { evaluatePesertaEdisiGate } from '@/lib/qurban/peserta-context';
import { listPesertaByEdisi } from '@/lib/qurban/peserta-repo';
import { listDaftarHewanByEdisi } from '@/lib/qurban/daftar-hewan-repo';
import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';
import { listPembayaranByEdisi } from '@/lib/qurban/pembayaran-repo';

import { isEdisiArsip, buildDashboard } from '@/lib/qurban/laporan-dashboard';
import { buildLaporanHewan } from '@/lib/qurban/laporan-hewan';
import { buildLaporanKeuangan } from '@/lib/qurban/laporan-keuangan';
import {
  buildExportTabel,
  isValidColumnId,
  type ExportTabelConfig,
} from '@/lib/qurban/export-tabel';
import {
  getRowLevelPreset,
  getSummaryPreset,
  isSummaryPreset,
} from '@/lib/qurban/export-presets';
import {
  buildSummaryExecutive,
  buildSummaryInventaris,
  buildSummaryKeuangan,
  type SummaryDoc,
} from '@/lib/qurban/export-summary';
import { renderTabelExcel, renderTabelPdf, type ExportDocMeta } from '@/lib/qurban/export-render-tabel';
import { renderSummaryExcel, renderSummaryPdf } from '@/lib/qurban/export-render-summary';

const READ_ROLES = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
];

const DEFAULT_MASJID = 'Masjid Al Jabar Jatinegara Baru';
const MAX_MANUAL_COLUMNS = 6;

/**
 * LP6 — POST /api/qurban/laporan/export
 *
 * Export read-only bentuk **Tabel** (F8 Milestone E): config → PDF/Excel.
 * Semua role login. Tidak menulis sheet & tidak withAuditLog. Bentuk Rekap (F)
 * & Kartu/Label (G) DITOLAK (400) — milestone ini hanya "tabel".
 *
 * Preset ringkasan (rekap_executive/inventaris_hewan/ringkasan_keuangan) →
 * reuse modul LP (LP5/LP2/LP4) lalu render section. Preset baris-level / config
 * kustom → mesin pur `buildExportTabel`.
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(request, READ_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Shape: milestone E hanya "tabel".
    const shape = (typeof body.shape === 'string' ? body.shape : 'tabel').toLowerCase();
    if (shape !== 'tabel') {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        `Bentuk "${shape}" belum didukung. Milestone ini hanya mendukung bentuk Tabel.`,
        400,
        { field: 'shape' }
      );
    }

    const format = (typeof body.format === 'string' ? body.format : 'pdf').toLowerCase();
    if (format !== 'pdf' && format !== 'xlsx') {
      return error(ErrorCodes.VALIDATION_FAILED, 'format harus "pdf" atau "xlsx".', 400, { field: 'format' });
    }

    const presetId = typeof body.preset === 'string' ? body.preset : '';

    // Resolusi + gate edisi.
    const edisiId = typeof body.edisi_id === 'string' ? body.edisi_id.trim() : '';
    const edisi = edisiId ? await findEdisiById(edisiId) : await findActiveEdisi();
    const decision = evaluatePesertaEdisiGate(edisi, guard.session.peran, {});
    if (!decision.ok) {
      return error(decision.code, decision.message, decision.status, decision.details);
    }
    const resolved = edisi!;

    const masjidName = (guard.session.masjidName || '').trim() || DEFAULT_MASJID;
    const generatedAt = new Date();
    const stamp = fileStamp(generatedAt);
    const today = generatedAt.toISOString().slice(0, 10);

    // ── Preset RINGKASAN (reuse LP, layout tetap) ──────────────────────────
    if (presetId && isSummaryPreset(presetId)) {
      const sp = getSummaryPreset(presetId)!;
      const [peserta, hewan, pembayaran] = await Promise.all([
        listPesertaByEdisi(resolved.id),
        listDaftarHewanByEdisi(resolved.id),
        listPembayaranByEdisi(resolved.id),
      ]);
      const isArsip = isEdisiArsip(resolved, pembayaran, today);

      let docSummary: SummaryDoc;
      if (sp.source === 'LP5') {
        docSummary = buildSummaryExecutive(
          buildDashboard({ edisi: resolved, peserta, pembayaran, hewan, aktivitas: [], today })
        );
      } else if (sp.source === 'LP2') {
        docSummary = buildSummaryInventaris(buildLaporanHewan({ edisi: resolved, isArsip, hewan }));
      } else {
        docSummary = buildSummaryKeuangan(
          buildLaporanKeuangan({ edisi: resolved, isArsip, pembayaran, peserta, hewan })
        );
      }

      const meta: ExportDocMeta = {
        title: sp.label,
        edisiNama: resolved.tahun_hijriah,
        masjidName,
        generatedAt,
      };
      const filename = `${presetId}_Qurban_${slug(resolved.tahun_hijriah)}_${stamp}.${format}`;
      if (format === 'xlsx') {
        return fileResponse(await renderSummaryExcel(docSummary, meta), 'xlsx', filename);
      }
      return fileResponse(Buffer.from(renderSummaryPdf(docSummary, meta)), 'pdf', filename);
    }

    // ── Bentuk TABEL (preset baris-level / kustom) ─────────────────────────
    const config = resolveTabelConfig(body, presetId);
    if (config.columns.length === 0) {
      return error(ErrorCodes.VALIDATION_FAILED, 'Pilih minimal satu kolom.', 400, { field: 'columns' });
    }

    const [peserta, hewan, muqorib, pembayaran] = await Promise.all([
      listPesertaByEdisi(resolved.id),
      listDaftarHewanByEdisi(resolved.id),
      listAllMuqorib(),
      listPembayaranByEdisi(resolved.id),
    ]);

    const built = buildExportTabel({
      peserta,
      muqoribById: new Map(muqorib.map((m) => [m.id, m])),
      hewanById: new Map(hewan.map((h) => [h.id, h])),
      pembayaranByKode: new Map(pembayaran.map((p) => [p.kode_bayar, p])),
      config,
    });

    const presetLabel = presetId ? getRowLevelPreset(presetId)?.label : undefined;
    const meta: ExportDocMeta = {
      title: presetLabel || 'Tabel Kustom',
      edisiNama: resolved.tahun_hijriah,
      masjidName,
      generatedAt,
    };
    const filename = `${presetId || 'tabel_kustom'}_Qurban_${slug(resolved.tahun_hijriah)}_${stamp}.${format}`;

    if (format === 'xlsx') {
      return fileResponse(await renderTabelExcel(built, meta), 'xlsx', filename);
    }
    return fileResponse(Buffer.from(renderTabelPdf(built, meta)), 'pdf', filename);
  } catch (err) {
    console.error('[POST /api/qurban/laporan/export] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal membuat file export.', 500);
  }
}

/**
 * Gabungkan preset baris-level (bila ada) sebagai basis, override dengan field
 * di body. Sanitasi kolom & manual_columns.
 */
function resolveTabelConfig(body: Record<string, unknown>, presetId: string): ExportTabelConfig {
  const preset = presetId ? getRowLevelPreset(presetId) : undefined;

  const rawColumns = Array.isArray(body.columns)
    ? (body.columns as unknown[]).filter((c): c is string => typeof c === 'string')
    : preset?.columns ?? [];
  const columns = rawColumns.filter((c) => isValidColumnId(c));

  const rawManual = Array.isArray(body.manual_columns)
    ? (body.manual_columns as unknown[]).filter((c): c is string => typeof c === 'string')
    : preset?.manual_columns ?? [];
  const manual_columns = rawManual
    .map((s) => sanitizeManual(s))
    .filter((s) => s.length > 0)
    .slice(0, MAX_MANUAL_COLUMNS);

  const filter =
    body.filter && typeof body.filter === 'object'
      ? (body.filter as ExportTabelConfig['filter'])
      : preset?.filter;

  const sort =
    typeof body.sort === 'string'
      ? (body.sort as ExportTabelConfig['sort'])
      : preset?.sort ?? 'jenis_urut_slot';

  return { columns, manual_columns, filter, sort };
}

/** Buang karakter kontrol & batasi panjang nama kolom isi-tangan. */
function sanitizeManual(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);
}

function slug(s: string): string {
  return s.replace(/\s+/g, '');
}

function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function fileResponse(buffer: Buffer, ext: 'pdf' | 'xlsx', filename: string): NextResponse {
  const contentType =
    ext === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
