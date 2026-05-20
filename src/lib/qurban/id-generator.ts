import { generateId } from '@/lib/api/id-gen';
import { QURBAN_SHEETS } from './sheets';

/**
 * Qurban ID generation per F02 schema.
 *
 * Re-exports the generic F1 generator (`lib/api/id-gen.ts`) which already
 * accepts `(prefix, sheetName)` and uses WIB date — no refactor needed. The
 * convenience wrappers below scope the prefix/sheet pairing per resource so
 * route handlers don't have to repeat it.
 *
 * Format: `{PREFIX}-{YYYYMMDD-WIB}-{NNNN}`
 */

export function generateEdisiId(): Promise<string> {
  return generateId('EDS', QURBAN_SHEETS.EDISI);
}

export function generateKonfigurasiId(): Promise<string> {
  return generateId('KFG', QURBAN_SHEETS.KONFIGURASI_EDISI);
}

export function generatePanitiaId(): Promise<string> {
  return generateId('PNT', QURBAN_SHEETS.PANITIA);
}
