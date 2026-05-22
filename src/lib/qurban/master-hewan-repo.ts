import { QURBAN_SHEETS } from './sheets';

/**
 * Repository for `qurban_master_hewan` — katalog tipe hewan qurban PER-EDISI.
 *
 * Milestone A: skeleton only — sheet-name constant + row↔object mappers.
 * Fungsi CRUD (list/find/create/update/deactivate) menyusul di Milestone C.
 *
 * Column order MUST mirror migrate_F03's qurban_master_hewan sheet (11 cols):
 *   0:id  1:edisi_id  2:jenis  3:kelas  4:kapasitas_slot  5:harga_beli
 *   6:harga_bawa_sendiri  7:is_active  8:created_at  9:updated_at  10:created_by
 */

export const MASTER_HEWAN_SHEET = QURBAN_SHEETS.MASTER_HEWAN;

/** Katalog tipe hewan qurban — PER-EDISI. */
export interface QurbanMasterHewan {
  id: string;                    // MHW-YYYYMMDD-NNNN
  edisi_id: string;              // FK qurban_edisi.id
  jenis: 'SAPI' | 'KAMBING';
  kelas: 'A' | 'B' | 'C' | 'D';
  kapasitas_slot: number;        // integer > 0 (Sapi umumnya 7, Kambing 1)
  harga_beli: number;            // >= 0 — harga 1 ekor utuh (BELI)
  harga_bawa_sendiri: number;    // >= 0 — jasa penitipan & potong (BAWA_SENDIRI)
  is_active: boolean;            // soft-delete
  created_at: string;            // ISO 8601 + Z
  updated_at: string;            // ISO 8601 + Z
  created_by: string;            // FK anggota.id
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapRowToMasterHewan(row: unknown[]): QurbanMasterHewan {
  const s = (v: unknown): string => (v == null ? '' : String(v));
  const rawJenis = s(row[2]).toUpperCase();
  const jenis: QurbanMasterHewan['jenis'] = rawJenis === 'KAMBING' ? 'KAMBING' : 'SAPI';
  const rawKelas = s(row[3]).toUpperCase();
  const kelas: QurbanMasterHewan['kelas'] =
    rawKelas === 'B' ? 'B' :
    rawKelas === 'C' ? 'C' :
    rawKelas === 'D' ? 'D' :
    'A';
  return {
    id: s(row[0]),
    edisi_id: s(row[1]),
    jenis,
    kelas,
    kapasitas_slot: toNum(row[4]),
    harga_beli: toNum(row[5]),
    harga_bawa_sendiri: toNum(row[6]),
    is_active: s(row[7]).toUpperCase() === 'TRUE',
    created_at: s(row[8]),
    updated_at: s(row[9]),
    created_by: s(row[10]),
  };
}

export function mapMasterHewanToRow(m: QurbanMasterHewan): unknown[] {
  return [
    m.id,
    m.edisi_id,
    m.jenis,
    m.kelas,
    m.kapasitas_slot,
    m.harga_beli,
    m.harga_bawa_sendiri,
    m.is_active ? 'TRUE' : 'FALSE',
    m.created_at,
    m.updated_at,
    m.created_by,
  ];
}
