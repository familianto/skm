import { writeAuditLog } from '@/lib/api/audit';
import { AuditAksi } from '@/types';
import type { QurbanMuqorib } from './muqorib-repo';

/**
 * Audit emitters for the PUBLIC qurban pendaftaran flow (F4b B1).
 *
 * Mirrors `peserta-audit.ts`. The actor is the anonymous public, so:
 *   - `user_id`   = 'PUBLIK' (non-anggota sentinel)
 *   - `user_info` = '' (explicit → skips the anggota-name lookup in writeAuditLog)
 *   - `ip_address` = client IP (best-effort, via getClientIp)
 *
 * `aksi` stays `CREATE` for the whole flow (every event happens inside the
 * public *create* attempt); `event_type` is the canonical discriminator.
 * `writeAuditLog` is non-blocking — a failed audit never breaks the request.
 *
 * Events: publik.daftar_attempted | publik.daftar_succeeded |
 *   publik.daftar_duplicate_detected | publik.daftar_captcha_failed |
 *   publik.daftar_rate_limited | publik.daftar_muqorib_inactive |
 *   publik.wa_sent_success | publik.wa_sent_failed |
 *   publik.lookup_attempted | publik.lookup_matched | publik.lookup_not_found |
 *   publik.lookup_rate_limited | publik.lookup_captcha_failed |
 *   muqorib.auto_created_from_publik | muqorib.data_conflict_detected
 */

const PUBLIK_USER_ID = 'PUBLIK';

export interface PublikActor {
  ip_address: string;
}

function emit(params: {
  entitas: string;
  entitas_id: string;
  event_type: string;
  actor: PublikActor;
  after?: unknown;
  before?: unknown;
  notes?: string;
}): Promise<void> {
  return writeAuditLog({
    aksi: AuditAksi.CREATE,
    entitas: params.entitas,
    entitas_id: params.entitas_id,
    event_type: params.event_type,
    after: params.after,
    before: params.before,
    notes: params.notes,
    user_id: PUBLIK_USER_ID,
    user_info: '',
    ip_address: params.actor.ip_address,
  });
}

export function auditPublikDaftarAttempted(
  actor: PublikActor,
  summary: Record<string, unknown>
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.daftar_attempted', actor, after: summary });
}

export function auditPublikDaftarSucceeded(
  actor: PublikActor,
  summary: { muqorib_id: string; edisi_id: string; kode_bayar: string; jumlah_slot: number }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: summary.muqorib_id, event_type: 'publik.daftar_succeeded', actor, after: summary });
}

export function auditPublikDaftarDuplicate(
  actor: PublikActor,
  detail: { muqorib_id: string; edisi_id: string; existing_kode_bayar: string[] }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: detail.muqorib_id, event_type: 'publik.daftar_duplicate_detected', actor, after: detail });
}

export function auditPublikDaftarCaptchaFailed(actor: PublikActor): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.daftar_captcha_failed', actor });
}

export function auditPublikDaftarRateLimited(
  actor: PublikActor,
  detail: { endpoint: string; limit?: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.daftar_rate_limited', actor, after: detail });
}

export function auditPublikDaftarMuqoribInactive(
  actor: PublikActor,
  detail: { muqorib_id: string; no_hp_masked?: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: detail.muqorib_id, event_type: 'publik.daftar_muqorib_inactive', actor, after: detail });
}

export function auditPublikWaSent(
  actor: PublikActor,
  detail: { muqorib_id: string; kode_bayar: string; mock?: boolean }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: detail.muqorib_id, event_type: 'publik.wa_sent_success', actor, after: detail });
}

export function auditPublikWaFailed(
  actor: PublikActor,
  detail: { muqorib_id: string; reason: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: detail.muqorib_id, event_type: 'publik.wa_sent_failed', actor, after: detail });
}

// --- F4d — PB2 phone-primary lookup audits ---------------------------------

/** PB2 `attempted` — emitted after rate-limit + honeypot pass, before lookup. */
export function auditPublikLookupAttempted(
  actor: PublikActor,
  detail: { no_hp_masked: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.lookup_attempted', actor, after: detail });
}

export function auditPublikLookupMatched(
  actor: PublikActor,
  detail: { muqorib_id: string; no_hp_masked: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: detail.muqorib_id, event_type: 'publik.lookup_matched', actor, after: detail });
}

export function auditPublikLookupNotFound(
  actor: PublikActor,
  detail: { no_hp_masked: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.lookup_not_found', actor, after: detail });
}

export function auditPublikLookupRateLimited(
  actor: PublikActor,
  detail: { endpoint: string; limit?: string }
): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.lookup_rate_limited', actor, after: detail });
}

export function auditPublikLookupCaptchaFailed(actor: PublikActor): Promise<void> {
  return emit({ entitas: 'publik', entitas_id: '—', event_type: 'publik.lookup_captcha_failed', actor });
}

export function auditMuqoribAutoCreated(actor: PublikActor, muqorib: QurbanMuqorib): Promise<void> {
  return emit({
    entitas: 'muqorib',
    entitas_id: muqorib.id,
    event_type: 'muqorib.auto_created_from_publik',
    actor,
    after: { id: muqorib.id, nama_lengkap: muqorib.nama_lengkap, rt: muqorib.rt, no_hp: muqorib.no_hp },
  });
}

export function auditMuqoribDataConflict(
  actor: PublikActor,
  detail: { muqorib_id: string; existing: Record<string, unknown>; submitted: Record<string, unknown> }
): Promise<void> {
  return emit({
    entitas: 'muqorib',
    entitas_id: detail.muqorib_id,
    event_type: 'muqorib.data_conflict_detected',
    actor,
    before: detail.existing,
    after: detail.submitted,
    notes: 'Data dari form publik berbeda dari record muqorib; record existing dipertahankan.',
  });
}
