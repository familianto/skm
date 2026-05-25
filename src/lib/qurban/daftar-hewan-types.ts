import { JENIS_HEWAN, KELAS_HEWAN } from './validators';

/**
 * Type definitions for `qurban_daftar_hewan` — inventaris fisik per-ekor (F5a).
 *
 * 1 baris = 1 ekor hewan nyata. Melengkapi katalog tipe (`qurban_master_hewan`,
 * F03): `jenis`/`kelas`/`kapasitas_slot` di sini didenormalisasi dari master
 * agar laporan tak perlu join saat master diubah/dinonaktifkan.
 *
 * Milestone A: tipe + konstanta saja. Repository (row↔object mappers + CRUD)
 * menyusul di Milestone B — akan mirror `master-hewan-repo.ts` dengan urutan
 * kolom yang sama persis seperti `scripts/migrate_F5a.gs` (17 kolom).
 */

/** Jenis hewan — reuse sumber tunggal dari F03 (`validators.ts`). */
export type JenisHewan = (typeof JENIS_HEWAN)[number]; // 'SAPI' | 'KAMBING'

/** Kelas/tier hewan — reuse sumber tunggal dari F03 (`validators.ts`). */
export type KelasHewan = (typeof KELAS_HEWAN)[number]; // 'A' | 'B' | 'C' | 'D'

/** Status lifecycle satu ekor hewan fisik. */
export type StatusHewan = 'DRAFT' | 'AKTIF' | 'TERPOTONG' | 'BATAL';

/** Asal-usul hewan: dibeli masjid vs dititipkan muqorib (bawa sendiri). */
export type TipePembelian = 'BELI' | 'BAWA_SENDIRI';

/** Inventaris fisik hewan qurban — PER-EKOR, per-edisi. */
export interface QurbanDaftarHewan {
  id: string;                       // HWN-YYYYMMDD-NNNN, permanen (target FK)
  edisi_id: string;                 // FK qurban_edisi.id
  master_hewan_id: string;          // FK qurban_master_hewan.id
  jenis: JenisHewan;                // denormalisasi dari master
  kelas: KelasHewan;                // denormalisasi dari master
  nomor_urut: number;               // mutable — urutan dalam grup (jenis, kelas)
  kapasitas_slot: number;           // denormalisasi dari master (Sapi=7, Kambing=1)
  tipe_pembelian: TipePembelian;
  vendor_nama: string;              // free text (MVP — normalisasi vendor ditunda)
  harga_beli_aktual: number;        // cost riil ke masjid; 0 untuk BAWA_SENDIRI
  tanggal_pembelian: string;        // YYYY-MM-DD
  status: StatusHewan;
  notes: string;                    // optional
  // Diisi oleh F7 (urutan penyembelihan). Kode F5a TIDAK pernah baca/tulis ini —
  // kolom dibuat sekarang agar F7 tak perlu migrasi sheet lagi.
  nomor_urut_pemotongan: number | null;
  created_at: string;               // ISO 8601 + ms + Z
  updated_at: string;               // ISO 8601 + ms + Z
  created_by: string;               // FK anggota.id
}
