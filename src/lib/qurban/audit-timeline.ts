import type { AuditEntry } from '@/lib/api/audit-read';

/**
 * Pure presentation logic for the "Riwayat Perubahan" audit timeline (F4c-A).
 *
 * Dependency-free (the `AuditEntry` import is type-only, erased at build) so it
 * runs in client components and unit tests. Maps an audit `event_type` to a
 * subtle tone (green = positive, red = negative, yellow = modification, gray =
 * neutral) and a human Indonesian label. Built around the F4a `peserta.*`
 * events but the shape is reusable for other entitas — extend the maps below.
 */

export type AuditTone = 'positive' | 'negative' | 'modification' | 'neutral';

const EVENT_LABELS: Record<string, string> = {
  'peserta.created': 'Peserta didaftarkan',
  'peserta.updated': 'Data peserta diperbarui',
  'peserta.status_changed': 'Status pendaftaran diubah',
  'peserta.harga_changed': 'Harga disepakati diperbarui',
  'peserta.wa_sent_success': 'Notifikasi WhatsApp terkirim',
  'peserta.wa_sent_failed': 'Notifikasi WhatsApp gagal',
};

const BASE_TONES: Record<string, AuditTone> = {
  'peserta.created': 'positive',
  'peserta.updated': 'modification',
  'peserta.harga_changed': 'modification',
  'peserta.wa_sent_success': 'positive',
  'peserta.wa_sent_failed': 'negative',
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/**
 * Tone for an event. `status_changed` is direction-sensitive: → BATAL is
 * negative, anything else (e.g. reactivation) reads as positive.
 */
export function auditEventTone(eventType: string, after?: unknown): AuditTone {
  if (eventType === 'peserta.status_changed') {
    const next = asRecord(after)?.status_pendaftaran;
    return next === 'BATAL' ? 'negative' : 'positive';
  }
  return BASE_TONES[eventType] ?? 'neutral';
}

/** Human label; falls back to the raw event_type (or `'Perubahan'`). */
export function auditEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] || eventType || 'Perubahan';
}

/** Convenience for components rendering a whole entry. */
export function auditEntryTone(entry: Pick<AuditEntry, 'event_type' | 'after'>): AuditTone {
  return auditEventTone(entry.event_type, entry.after);
}
