import { sheetsService } from '@/lib/google-sheets';
import { QURBAN_SHEETS } from './sheets';

/**
 * Minimal repository for `qurban_konfigurasi_edisi`. Milestone B needs this
 * helper only for two flows:
 *   - E5 activate pre-flight: "does this edisi have a konfigurasi row?"
 *   - E2 create-with-clone: read source konfigurasi, write a copy for the
 *     new edisi (ID/edisi_id/timestamps regenerated).
 *
 * Full K1/K2 endpoint + read side ships with Milestone C.
 *
 * Column order MUST mirror migrate_F02's qurban_konfigurasi_edisi sheet
 * (15 cols):
 *   0:id  1:edisi_id  2:bop_per_ekor_sapi  3:bop_per_ekor_kambing
 *   4:target_bungkus_total  5:berat_target_per_bungkus
 *   6:tanggal_distribusi_mulai  7:tanggal_distribusi_selesai
 *   8:payment_suffix  9:wa_send_on_pendaftaran  10:wa_send_on_pembayaran_confirmed
 *   11:notes  12:created_at  13:updated_at  14:created_by
 */

export interface Konfigurasi {
  id: string;
  edisi_id: string;
  bop_per_ekor_sapi: number;
  bop_per_ekor_kambing: number;
  target_bungkus_total: number;
  berat_target_per_bungkus: number;
  tanggal_distribusi_mulai: string;
  tanggal_distribusi_selesai: string;
  payment_suffix: number;
  wa_send_on_pendaftaran: boolean;
  wa_send_on_pembayaran_confirmed: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

function toBool(v: string | undefined): boolean {
  return (v || '').toUpperCase() === 'TRUE';
}

function toInt(v: string | undefined, fallback = 0): number {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function rowToKonfigurasi(row: string[]): Konfigurasi {
  return {
    id: row[0] || '',
    edisi_id: row[1] || '',
    bop_per_ekor_sapi: toInt(row[2]),
    bop_per_ekor_kambing: toInt(row[3]),
    target_bungkus_total: toInt(row[4]),
    berat_target_per_bungkus: toInt(row[5]),
    tanggal_distribusi_mulai: row[6] || '',
    tanggal_distribusi_selesai: row[7] || '',
    payment_suffix: toInt(row[8], 3),
    wa_send_on_pendaftaran: toBool(row[9]),
    wa_send_on_pembayaran_confirmed: toBool(row[10]),
    notes: row[11] || '',
    created_at: row[12] || '',
    updated_at: row[13] || '',
    created_by: row[14] || '',
  };
}

export function konfigurasiToRow(k: Konfigurasi): string[] {
  return [
    k.id,
    k.edisi_id,
    String(k.bop_per_ekor_sapi),
    String(k.bop_per_ekor_kambing),
    String(k.target_bungkus_total),
    String(k.berat_target_per_bungkus),
    k.tanggal_distribusi_mulai,
    k.tanggal_distribusi_selesai,
    String(k.payment_suffix),
    k.wa_send_on_pendaftaran ? 'TRUE' : 'FALSE',
    k.wa_send_on_pembayaran_confirmed ? 'TRUE' : 'FALSE',
    k.notes,
    k.created_at,
    k.updated_at,
    k.created_by,
  ];
}

/** Defensive list — returns [] on missing sheet so layouts don't crash. */
async function listKonfigurasi(): Promise<Konfigurasi[]> {
  try {
    const rows = await sheetsService.getRows(QURBAN_SHEETS.KONFIGURASI_EDISI);
    return rows.filter((r) => r[0]).map(rowToKonfigurasi);
  } catch (err) {
    console.error('[konfigurasi-repo.listKonfigurasi] failed:', err);
    return [];
  }
}

export async function findKonfigurasiByEdisiId(
  edisiId: string
): Promise<Konfigurasi | null> {
  if (!edisiId) return null;
  const all = await listKonfigurasi();
  return all.find((k) => k.edisi_id === edisiId) ?? null;
}

export async function hasKonfigurasi(edisiId: string): Promise<boolean> {
  return (await findKonfigurasiByEdisiId(edisiId)) !== null;
}

export async function createKonfigurasi(k: Konfigurasi): Promise<void> {
  await sheetsService.appendRow(QURBAN_SHEETS.KONFIGURASI_EDISI, konfigurasiToRow(k));
}
