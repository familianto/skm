import { sheetsService } from '@/lib/google-sheets';

/**
 * ID generation per Tahap 3.E §2.4.
 *
 * Format: `{PREFIX}-{YYYYMMDD-WIB}-{NNNN}`
 * - PREFIX  = 3-letter resource code (ANG, EDS, MQR, ...)
 * - YYYYMMDD = today's date in WIB (Asia/Jakarta, UTC+7) for human readability
 * - NNNN    = sequential 4-digit, max(existing for today) + 1
 *
 * NOTE: existing `sheetsService.getNextId()` uses UTC date for backward compat
 * with IDs already generated pre-F1. New code (F1+) MUST use `generateId()` from
 * here so audit log + new resources follow the WIB convention. F2+ may migrate
 * existing call sites incrementally.
 */

/** Today's date in WIB as YYYYMMDD. */
export function getTodayWIB(): string {
  // Shift UTC by +7h then take date portion. Avoids Intl APIs for edge runtime safety.
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Generate next sequential ID for `prefix` against `sheetName`.
 *
 * Best-effort optimistic concurrency: F1 single-writer per masjid makes
 * collision unlikely. If a future fase needs strict guarantees, layer a
 * retry-on-duplicate around this.
 */
export async function generateId(prefix: string, sheetName: string): Promise<string> {
  const today = getTodayWIB();
  const prefixPattern = `${prefix}-${today}-`;

  const rows = await sheetsService.getRows(sheetName);
  let maxCounter = 0;
  for (const row of rows) {
    const id = row[0];
    if (id?.startsWith(prefixPattern)) {
      const counter = parseInt(id.slice(prefixPattern.length), 10);
      if (!isNaN(counter) && counter > maxCounter) maxCounter = counter;
    }
  }
  return `${prefixPattern}${String(maxCounter + 1).padStart(4, '0')}`;
}
