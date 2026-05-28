'use client';

import { useState } from 'react';

import { formatTimestamp } from '@/lib/utils';
import type { AuditEntry } from '@/lib/api/audit-read';
import { auditEntryTone, auditEventLabel, type AuditTone } from '@/lib/qurban/audit-timeline';

/**
 * Reusable "Riwayat Perubahan" timeline (F4c-A, A3).
 *
 * Vertical timeline, newest-first. Shows the 5 latest entries by default with
 * a "Tampilkan semua" toggle. Each node is colour-coded by tone (green =
 * positive, red = negative, yellow = modification, gray = neutral). Entry
 * payloads (`before`/`after`/`notes`) are rendered generically so the same
 * component serves any entitas — F4c-A wires it for `peserta`.
 */

const DEFAULT_VISIBLE = 5;

const DOT_CLASS: Record<AuditTone, string> = {
  positive: 'bg-emerald-500 ring-emerald-100',
  negative: 'bg-red-500 ring-red-100',
  modification: 'bg-amber-500 ring-amber-100',
  neutral: 'bg-gray-400 ring-gray-100',
};

interface Props {
  entries: AuditEntry[];
  loading?: boolean;
  error?: string | null;
}

export function AuditTimeline({ entries, loading, error }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return <p className="text-sm text-gray-500 py-2">Memuat riwayat…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600 py-2">{error}</p>;
  }
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-2">Belum ada riwayat perubahan.</p>
    );
  }

  const visible = expanded ? entries : entries.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = entries.length - visible.length;

  return (
    <div>
      <ol className="relative ml-1">
        {visible.map((entry, i) => {
          const tone = auditEntryTone(entry);
          const isLast = i === visible.length - 1;
          return (
            <li key={entry.id || i} className="relative pl-6 pb-5 last:pb-0">
              {/* Rail */}
              {!isLast && (
                <span
                  className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200"
                  aria-hidden="true"
                />
              )}
              {/* Dot */}
              <span
                className={`absolute left-0 top-1 w-[11px] h-[11px] rounded-full ring-4 ${DOT_CLASS[tone]}`}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-gray-900">
                  {auditEventLabel(entry.event_type)}
                </p>
                <ChangeSummary entry={entry} />
                {entry.notes && (
                  <p className="text-xs text-gray-500 italic">“{entry.notes}”</p>
                )}
                <p className="text-xs text-gray-400">
                  {formatTimestamp(entry.timestamp)}
                  {entry.user_info && (
                    <span className="ml-1">
                      · oleh{' '}
                      {entry.user_id === 'SYSTEM_BOOTSTRAP' || entry.user_id === 'SYSTEM'
                        ? 'SYSTEM'
                        : entry.user_info}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
        >
          Tampilkan semua ({entries.length})
        </button>
      )}
      {expanded && entries.length > DEFAULT_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          Sembunyikan
        </button>
      )}
    </div>
  );
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('id-ID');
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Generic before→after diff over the changed primitive fields of an entry. */
function ChangeSummary({ entry }: { entry: AuditEntry }) {
  const before = entry.before && typeof entry.before === 'object'
    ? (entry.before as Record<string, unknown>)
    : null;
  const after = entry.after && typeof entry.after === 'object'
    ? (entry.after as Record<string, unknown>)
    : null;

  // Only meaningful for update-style events that carry both sides.
  if (!before || !after) return null;

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes = keys.filter((k) => formatValue(before[k]) !== formatValue(after[k]));
  if (changes.length === 0) return null;

  return (
    <ul className="text-xs text-gray-600 space-y-0.5">
      {changes.map((k) => (
        <li key={k}>
          <span className="text-gray-500">{humanizeKey(k)}:</span>{' '}
          <span className="line-through text-gray-400">{formatValue(before[k])}</span>{' '}
          <span aria-hidden="true">→</span>{' '}
          <span className="text-gray-800">{formatValue(after[k])}</span>
        </li>
      ))}
    </ul>
  );
}
