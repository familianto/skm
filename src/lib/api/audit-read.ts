/**
 * Read-side helpers for the `audit_log` sheet (F4c-A).
 *
 * The write side lives in `audit.ts` (`writeAuditLog`). This module is the
 * first READ surface: pure, dependency-free row parsing + selection so any
 * detail page can render a "Riwayat Perubahan" timeline. The route handler
 * supplies the raw rows (via `sheetsService.getRows`) and calls
 * `selectAuditEntries` — keeping this module free of server-only imports so it
 * stays unit-testable and reusable for other entitas later.
 *
 * `audit_log` column order (matches `SHEET_HEADERS['audit_log']`, 9 cols):
 *   id | timestamp | aksi | entitas | entitas_id | detail | user_info |
 *   user_id | ip_address
 *
 * `detail` is a JSON string: `{ event_type?, before?, after?, notes? }`.
 */

export interface AuditDetail {
  event_type?: string;
  before?: unknown;
  after?: unknown;
  notes?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  aksi: string;
  entitas: string;
  entitas_id: string;
  event_type: string;
  before: unknown;
  after: unknown;
  notes: string;
  user_info: string;
  user_id: string;
}

const COL = {
  id: 0,
  timestamp: 1,
  aksi: 2,
  entitas: 3,
  entitas_id: 4,
  detail: 5,
  user_info: 6,
  user_id: 7,
  ip_address: 8,
} as const;

function s(v: unknown): string {
  return v == null ? '' : String(v);
}

function parseDetail(raw: string): AuditDetail {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? (obj as AuditDetail) : {};
  } catch {
    // Corrupt / legacy non-JSON detail — surface nothing rather than crash.
    return {};
  }
}

/** Map one raw sheet row → `AuditEntry` (detail JSON expanded). */
export function parseAuditRow(row: unknown[]): AuditEntry {
  const detail = parseDetail(s(row[COL.detail]));
  return {
    id: s(row[COL.id]),
    timestamp: s(row[COL.timestamp]),
    aksi: s(row[COL.aksi]),
    entitas: s(row[COL.entitas]),
    entitas_id: s(row[COL.entitas_id]),
    event_type: s(detail.event_type),
    before: detail.before,
    after: detail.after,
    notes: s(detail.notes),
    user_info: s(row[COL.user_info]),
    user_id: s(row[COL.user_id]),
  };
}

export interface AuditQuery {
  entitas: string;
  entitas_id: string;
}

/**
 * Filter rows to one `(entitas, entitas_id)` and return parsed entries sorted
 * newest-first (timestamp desc, tiebreak id desc). Pure — caller provides rows.
 */
export function selectAuditEntries(
  rows: unknown[][],
  query: AuditQuery
): AuditEntry[] {
  const entries = rows
    .filter(
      (r) =>
        s(r[COL.entitas]) === query.entitas &&
        s(r[COL.entitas_id]) === query.entitas_id
    )
    .map(parseAuditRow);

  entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  return entries;
}
