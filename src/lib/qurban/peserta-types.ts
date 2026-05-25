import type { TipePembelian } from './daftar-hewan-types';

/**
 * Type definitions for `qurban_peserta` — pendaftaran peserta qurban (F4a).
 *
 * Pendekatan "1 baris = 1 slot": satu sapi 7-slot yang penuh = 7 baris peserta
 * berbeda. Soft-delete via `status_pendaftaran = 'BATAL'` (TIDAK ada kolom
 * `is_active`). Nama label diturunkan dari `muqorib_id` (FK lintas-edisi) atau
 * `nama_atas_nama` bila diisi — tidak ada kolom `nama` di sheet.
 *
 * Milestone A: tipe + konstanta + ID generator saja. Repository (row↔object
 * mappers + CRUD) dan endpoint PS1–PS8 menyusul di Milestone B — akan mirror
 * `daftar-hewan-repo.ts` dengan urutan kolom sama persis seperti
 * `scripts/migrate_F4a.gs` (17 kolom).
 */

/** Asal pendaftaran: lewat form publik, di-input panitia, atau impor 1447H. */
export type SumberPendaftaran = 'PUBLIK' | 'PANITIA' | 'IMPORT_1447H';

/** Status pendaftaran satu slot. Soft-delete = BATAL (bukan is_active). */
export type StatusPendaftaran = 'TERDAFTAR' | 'BATAL';

/**
 * Tipe qurban — snapshot dari `tipe_pembelian` hewan saat pendaftaran.
 * Reuse sumber tunggal F5a (`daftar-hewan-types.ts`); jangan duplikasi semantik.
 */
export type TipeQurban = TipePembelian; // 'BELI' | 'BAWA_SENDIRI'

/** Pendaftaran peserta qurban — PER-SLOT, per-edisi. */
export interface QurbanPeserta {
  id: string;                          // PST-YYYYMMDD-NNNN, permanen
  edisi_id: string;                    // FK qurban_edisi.id
  muqorib_id: string;                  // FK qurban_muqorib.id (lintas-edisi)
  hewan_id: string;                    // FK qurban_daftar_hewan.id — mutable (drag-drop F5b)
  slot_number: number;                 // 1..kapasitas_slot — mutable
  tipe_qurban: TipeQurban;             // snapshot dari hewan
  nama_atas_nama: string;              // optional; label override, '' = pakai nama muqorib
  keterangan_bagian: string;           // optional; mis. "Daging+Jeroan" untuk label
  harga_disepakati: number;            // frozen saat pendaftaran
  kode_bayar: string;                  // unik per edisi, QRB-{tahun}-{NNN}
  sumber_pendaftaran: SumberPendaftaran;
  status_pendaftaran: StatusPendaftaran;
  tanggal_daftar: string;              // ISO 8601 + Z
  notes: string;                       // optional
  created_at: string;                  // ISO 8601 + Z
  updated_at: string;                  // ISO 8601 + Z
  created_by: string;                  // FK anggota.id
}
