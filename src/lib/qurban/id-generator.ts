import { generateId, generateIds } from '@/lib/api/id-gen';
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

export function generateMuqoribId(): Promise<string> {
  return generateId('MQR', QURBAN_SHEETS.MUQORIB);
}

export function generateMasterHewanId(): Promise<string> {
  return generateId('MHW', QURBAN_SHEETS.MASTER_HEWAN);
}

export function generateDaftarHewanId(): Promise<string> {
  return generateId('HWN', QURBAN_SHEETS.DAFTAR_HEWAN);
}

export function generatePesertaId(): Promise<string> {
  return generateId('PST', QURBAN_SHEETS.PESERTA);
}

/** N id PST- berurutan dalam satu read — untuk batch insert PS2 multi-slot. */
export function generatePesertaIds(count: number): Promise<string[]> {
  return generateIds('PST', QURBAN_SHEETS.PESERTA, count);
}

/**
 * Format `kode_bayar` peserta: `QRB-{tahun}-{NNN}` (mis. `QRB-1448-007`).
 *
 * Fungsi murni — `tahun` (tahun Hijriah) dan `urutan` (nomor urut per-edisi)
 * adalah parameter. Sumber `tahun` (dari edisi) dan komputasi `urutan` adalah
 * tanggung jawab Milestone B; di sini hanya formatting + pad 3 digit.
 */
export function formatKodeBayar(tahun: number | string, urutan: number): string {
  return `QRB-${tahun}-${String(urutan).padStart(3, '0')}`;
}
