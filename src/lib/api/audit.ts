import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES } from '@/lib/constants';
import { generateId } from './id-gen';
import { getNamaByUserId } from './anggota-repo';

/**
 * Audit log writer per Tahap 3.E §2.9 + Tahap 4 §2.3 (Choice B Minimal Extension).
 *
 * Sheet `audit_log` post-F1 schema (9 columns):
 *   id | timestamp | aksi | entitas | entitas_id | detail | user_info | user_id | ip_address
 *
 * `detail` is a JSON string with the canonical shape:
 *   { event_type?, before?, after?, notes? }
 *
 * Non-blocking: errors are logged to console but never thrown — audit failure
 * MUST NOT break the underlying mutation. (Same convention as the existing
 * `logAudit()` in `@/lib/audit`.)
 *
 * Coexistence: the older `logAudit()` writes 7 columns (cols 8–9 left empty);
 * `writeAuditLog()` writes all 9. Both are safe against the migrated sheet.
 * F2+ may migrate older callsites to use this writer for richer entries.
 *
 * Canonical event_type names live in Tahap 3.E §9. F1 emits:
 *   auth.login_success | auth.login_failed | auth.locked | auth.unlocked_manual
 *   auth.logout | auth.pin_changed | auth.pin_reset_by_admin
 *   anggota.created | anggota.updated | anggota.peran_changed
 *   anggota.deactivated | anggota.reactivated
 */

export interface AuditLogParams {
  /** UPPERCASE verb for backwards compat (LOGIN | LOGOUT | CREATE | UPDATE | ...). */
  aksi: string;
  /** snake_case entity name (auth | anggota | ...). */
  entitas: string;
  /** Resource id, or 'auth' / '—' for system events. */
  entitas_id: string;
  /** Canonical `entity.action` per §9, embedded in detail JSON. */
  event_type?: string;
  before?: unknown;
  after?: unknown;
  notes?: string;
  /** anggota.id, or 'SYSTEM' / 'LEGACY' for non-anggota actors. */
  user_id: string;
  /** Display name (snapshot) for backwards compat with col 7. */
  user_info?: string;
  /** Client IP for auth + publik events. Empty string allowed. */
  ip_address?: string;
}

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const id = await generateId('LOG', SHEET_NAMES.AUDIT_LOG);
    const timestamp = new Date().toISOString();

    const detailObj: Record<string, unknown> = {};
    if (params.event_type) detailObj.event_type = params.event_type;
    if (params.before !== undefined) detailObj.before = params.before;
    if (params.after !== undefined) detailObj.after = params.after;
    if (params.notes) detailObj.notes = params.notes;
    const detail = JSON.stringify(detailObj);

    // user_info = display name snapshot. If caller provided it (e.g., login
    // handler that already loaded the anggota row), use it directly. Else
    // resolve via anggota-repo lookup — handles 'SYSTEM' / 'LEGACY' specials
    // and silently degrades to '' on lookup failure (audit must not block).
    const userInfo =
      params.user_info !== undefined
        ? params.user_info
        : await getNamaByUserId(params.user_id);

    await sheetsService.appendRow(SHEET_NAMES.AUDIT_LOG, [
      id,
      timestamp,
      params.aksi,
      params.entitas,
      params.entitas_id,
      detail,
      userInfo,
      params.user_id,
      params.ip_address ?? '',
    ]);
  } catch (err) {
    // Audit must never break the main op.
    console.error('[writeAuditLog] failed:', err);
  }
}
