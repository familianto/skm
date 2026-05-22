import { QURBAN_SHEETS } from './sheets';

/**
 * Repository for `qurban_muqorib` — master jamaah qurban LINTAS-EDISI.
 *
 * Milestone A: skeleton only — sheet-name constant + row↔object mappers.
 * Fungsi CRUD (list/find/create/update/deactivate) menyusul di Milestone B.
 *
 * Column order MUST mirror migrate_F03's qurban_muqorib sheet (11 cols):
 *   0:id  1:nama_lengkap  2:alamat  3:rt  4:no_hp  5:is_active
 *   6:data_induk_ref_1447h  7:notes  8:created_at  9:created_by  10:updated_at
 */

export const MUQORIB_SHEET = QURBAN_SHEETS.MUQORIB;

/** Master jamaah qurban — LINTAS-EDISI (tidak ada edisi_id, sengaja). */
export interface QurbanMuqorib {
  id: string;                    // MQR-YYYYMMDD-NNNN
  nama_lengkap: string;          // wajib
  alamat: string;                // wajib
  rt: string;                    // '001'..'006' | 'Lainnya'
  no_hp: string;                 // ter-normalisasi '628...'
  is_active: boolean;            // soft-delete (Sheet menyimpan 'TRUE'/'FALSE')
  data_induk_ref_1447h: string;  // opsional; '' kalau kosong
  notes: string;                 // opsional; '' kalau kosong
  created_at: string;            // ISO 8601 + Z
  created_by: string;            // FK anggota.id
  updated_at: string;            // ISO 8601 + Z
}

export function mapRowToMuqorib(row: unknown[]): QurbanMuqorib {
  const s = (v: unknown): string => (v == null ? '' : String(v));
  return {
    id: s(row[0]),
    nama_lengkap: s(row[1]),
    alamat: s(row[2]),
    rt: s(row[3]),
    no_hp: s(row[4]),
    is_active: s(row[5]).toUpperCase() === 'TRUE',
    data_induk_ref_1447h: s(row[6]),
    notes: s(row[7]),
    created_at: s(row[8]),
    created_by: s(row[9]),
    updated_at: s(row[10]),
  };
}

export function mapMuqoribToRow(m: QurbanMuqorib): unknown[] {
  return [
    m.id,
    m.nama_lengkap,
    m.alamat,
    m.rt,
    m.no_hp,
    m.is_active ? 'TRUE' : 'FALSE',
    m.data_induk_ref_1447h,
    m.notes,
    m.created_at,
    m.created_by,
    m.updated_at,
  ];
}
