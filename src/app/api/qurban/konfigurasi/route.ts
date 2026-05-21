import { NextRequest } from 'next/server';
import { z } from 'zod';

import { success, error } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole, requireSession } from '@/lib/api/guards';
import { writeAuditLog } from '@/lib/api/audit';
import { getClientIp } from '@/lib/api/rate-limit';
import { PERAN } from '@/lib/api/permissions';
import { AuditAksi } from '@/types';

import { findEdisiById } from '@/lib/qurban/edisi-repo';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import {
  createKonfigurasi,
  findKonfigurasiByEdisiId,
  findKonfigurasiRecord,
  updateKonfigurasiAt,
  type Konfigurasi,
} from '@/lib/qurban/konfigurasi-repo';
import { generateKonfigurasiId } from '@/lib/qurban/id-generator';

const WRITE_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN];

function isPanitiaRole(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

/**
 * K1 — GET /api/qurban/konfigurasi?edisi_id=EDS-...
 *
 * Returns the konfigurasi row for `edisi_id`, or `data: null` if none exists
 * yet (the form renders defaults in that case).
 *
 * PENDAFTARAN / DISTRIBUSI may only read konfigurasi for the AKTIF edisi →
 * 403 FORBIDDEN_EDISI on non-AKTIF.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

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

    if (isPanitiaRole(guard.session.peran) && edisi.status !== EDISI_STATUS.AKTIF) {
      return error(
        ErrorCodes.FORBIDDEN_EDISI,
        'Anda hanya dapat mengakses konfigurasi edisi yang berstatus AKTIF.',
        403,
        { edisi_status: edisi.status }
      );
    }

    const k = await findKonfigurasiByEdisiId(edisiId);
    return success(k);
  } catch (err) {
    console.error('[GET /api/qurban/konfigurasi] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal memuat konfigurasi.', 500);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD');
const nonNegative = (label: string) =>
  z
    .number({ message: `${label} harus berupa angka.` })
    .int(`${label} harus bilangan bulat.`)
    .min(0, `${label} tidak boleh negatif.`);

const upsertSchema = z
  .object({
    bop_per_ekor_sapi: nonNegative('BOP per ekor sapi').optional(),
    bop_per_ekor_kambing: nonNegative('BOP per ekor kambing').optional(),
    target_bungkus_total: nonNegative('Target bungkus total').optional(),
    berat_target_per_bungkus: nonNegative('Berat target per bungkus').optional(),
    tanggal_distribusi_mulai: dateField.optional().or(z.literal('')),
    tanggal_distribusi_selesai: dateField.optional().or(z.literal('')),
    payment_suffix: z
      .number({ message: 'Payment suffix harus berupa angka.' })
      .int('Payment suffix harus bilangan bulat.')
      .min(0, 'Payment suffix harus 0–9.')
      .max(9, 'Payment suffix harus 0–9.')
      .optional(),
    wa_send_on_pendaftaran: z.boolean().optional(),
    wa_send_on_pembayaran_confirmed: z.boolean().optional(),
    notes: z.string().max(500, 'Catatan maksimal 500 karakter.').optional(),
  })
  .superRefine((v, ctx) => {
    const m = v.tanggal_distribusi_mulai;
    const s = v.tanggal_distribusi_selesai;
    if (m && s && m > s) {
      ctx.addIssue({
        code: 'custom',
        message: 'Tanggal distribusi selesai harus ≥ tanggal mulai.',
        path: ['tanggal_distribusi_selesai'],
      });
    }
  });

/**
 * K2 — PUT /api/qurban/konfigurasi?edisi_id=EDS-...
 *
 * Upsert (single row per edisi):
 *   - row exists → UPDATE, refresh updated_at
 *   - row missing → INSERT new (KFG-…) with created_at/created_by
 *
 * Locks:
 *   - Edisi SELESAI → 422 BUSINESS_EDISI_LOCKED.
 *   - DRAFT / AKTIF → proceed.
 *
 * Defaults applied on INSERT only when fields omitted:
 *   payment_suffix = 3
 *   wa_send_on_pendaftaran = true
 *   wa_send_on_pembayaran_confirmed = true
 */
export async function PUT(request: NextRequest) {
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

    if (edisi.status === EDISI_STATUS.SELESAI) {
      return error(
        ErrorCodes.BUSINESS_EDISI_LOCKED,
        'Edisi sudah SELESAI. Konfigurasi tidak dapat diubah.',
        422,
        { edisi_status: edisi.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return error(
        ErrorCodes.VALIDATION_FAILED,
        issue.message,
        422,
        { field: issue.path.join('.') }
      );
    }
    const patch = parsed.data;

    const existing = await findKonfigurasiRecord(edisiId);
    const now = new Date().toISOString();

    if (existing) {
      // UPDATE — overlay patch values onto the current row.
      const merged: Konfigurasi = {
        ...existing.konfigurasi,
        bop_per_ekor_sapi: patch.bop_per_ekor_sapi ?? existing.konfigurasi.bop_per_ekor_sapi,
        bop_per_ekor_kambing:
          patch.bop_per_ekor_kambing ?? existing.konfigurasi.bop_per_ekor_kambing,
        target_bungkus_total:
          patch.target_bungkus_total ?? existing.konfigurasi.target_bungkus_total,
        berat_target_per_bungkus:
          patch.berat_target_per_bungkus ?? existing.konfigurasi.berat_target_per_bungkus,
        tanggal_distribusi_mulai:
          patch.tanggal_distribusi_mulai ?? existing.konfigurasi.tanggal_distribusi_mulai,
        tanggal_distribusi_selesai:
          patch.tanggal_distribusi_selesai ?? existing.konfigurasi.tanggal_distribusi_selesai,
        payment_suffix: patch.payment_suffix ?? existing.konfigurasi.payment_suffix,
        wa_send_on_pendaftaran:
          patch.wa_send_on_pendaftaran ?? existing.konfigurasi.wa_send_on_pendaftaran,
        wa_send_on_pembayaran_confirmed:
          patch.wa_send_on_pembayaran_confirmed ??
          existing.konfigurasi.wa_send_on_pembayaran_confirmed,
        notes: patch.notes ?? existing.konfigurasi.notes,
        updated_at: now,
      };

      // Cross-field re-check on the merged row (covers patch that only
      // moves one end of the date range).
      if (
        merged.tanggal_distribusi_mulai &&
        merged.tanggal_distribusi_selesai &&
        merged.tanggal_distribusi_mulai > merged.tanggal_distribusi_selesai
      ) {
        return error(
          ErrorCodes.VALIDATION_FAILED,
          'Tanggal distribusi selesai harus ≥ tanggal mulai.',
          422,
          { field: 'tanggal_distribusi_selesai' }
        );
      }

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const k of [
        'bop_per_ekor_sapi',
        'bop_per_ekor_kambing',
        'target_bungkus_total',
        'berat_target_per_bungkus',
        'tanggal_distribusi_mulai',
        'tanggal_distribusi_selesai',
        'payment_suffix',
        'wa_send_on_pendaftaran',
        'wa_send_on_pembayaran_confirmed',
        'notes',
      ] as const) {
        if (existing.konfigurasi[k] !== merged[k]) {
          before[k] = existing.konfigurasi[k];
          after[k] = merged[k];
        }
      }

      if (Object.keys(after).length === 0) {
        // Idempotent no-op — skip the sheet write and the audit entry.
        return success(existing.konfigurasi);
      }

      await updateKonfigurasiAt(existing.rowIndex, merged);
      await writeAuditLog({
        aksi: AuditAksi.UPDATE,
        entitas: 'konfigurasi',
        entitas_id: merged.id,
        event_type: 'konfigurasi.updated',
        before,
        after,
        user_id: guard.session.user_id,
        ip_address: ip,
      });

      return success(merged);
    }

    // INSERT — first-time setup, apply documented defaults for omitted fields.
    const id = await generateKonfigurasiId();
    const newKfg: Konfigurasi = {
      id,
      edisi_id: edisiId,
      bop_per_ekor_sapi: patch.bop_per_ekor_sapi ?? 0,
      bop_per_ekor_kambing: patch.bop_per_ekor_kambing ?? 0,
      target_bungkus_total: patch.target_bungkus_total ?? 0,
      berat_target_per_bungkus: patch.berat_target_per_bungkus ?? 0,
      tanggal_distribusi_mulai: patch.tanggal_distribusi_mulai ?? '',
      tanggal_distribusi_selesai: patch.tanggal_distribusi_selesai ?? '',
      payment_suffix: patch.payment_suffix ?? 3,
      wa_send_on_pendaftaran: patch.wa_send_on_pendaftaran ?? true,
      wa_send_on_pembayaran_confirmed: patch.wa_send_on_pembayaran_confirmed ?? true,
      notes: patch.notes ?? '',
      created_at: now,
      updated_at: now,
      created_by: guard.session.user_id,
    };

    if (
      newKfg.tanggal_distribusi_mulai &&
      newKfg.tanggal_distribusi_selesai &&
      newKfg.tanggal_distribusi_mulai > newKfg.tanggal_distribusi_selesai
    ) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'Tanggal distribusi selesai harus ≥ tanggal mulai.',
        422,
        { field: 'tanggal_distribusi_selesai' }
      );
    }

    await createKonfigurasi(newKfg);
    await writeAuditLog({
      aksi: AuditAksi.CREATE,
      entitas: 'konfigurasi',
      entitas_id: newKfg.id,
      event_type: 'konfigurasi.created',
      after: newKfg,
      user_id: guard.session.user_id,
      ip_address: ip,
    });

    return success(newKfg, undefined, { status: 201 });
  } catch (err) {
    console.error('[PUT /api/qurban/konfigurasi] error:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Gagal menyimpan konfigurasi.', 500);
  }
}
