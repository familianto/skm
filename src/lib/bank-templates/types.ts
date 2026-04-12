import { TransaksiJenis } from '@/types';

// ============================================================
// Bank Template Types
// ============================================================

/**
 * Resolve nama kategori → ID kategori berdasarkan jenis (MASUK/KELUAR).
 * Dipanggil oleh `template.categorize()` saat import untuk mapping
 * nama kategori (di pattern rules) ke ID actual di sheet `kategori`.
 *
 * Return string kosong jika kategori dengan nama+jenis tersebut belum ada.
 */
export type KategoriResolver = (nama: string, jenis: TransaksiJenis) => string;

export interface BankTemplate {
  bankId: string;
  bankName: string;
  /** Number of header rows to skip in CSV */
  headerRowsToSkip: number;
  /** Nomor rekening bank di SKM */
  rekeningId: string;
  /** Parse a raw CSV row into a normalized transaction row */
  parseRow: (row: string[]) => ParsedBankRow | null;
  /**
   * Apply pattern rules to categorize a parsed row.
   *
   * `resolveKategori` dipakai untuk menukar nama kategori yang tertera di
   * rule menjadi ID real dari sheet `kategori`. Optional — bila tidak
   * diberikan, semua baris akan berstatus review karena `kategori_id`
   * tidak bisa di-resolve.
   */
  categorize: (row: ParsedBankRow, resolveKategori?: KategoriResolver) => CategorizedRow;
  /**
   * Keywords yang akan di-highlight di kolom keterangan untuk membantu user
   * memahami alasan auto-categorize. Dipisah per jenis MASUK/KELUAR.
   */
  highlightKeywords: {
    masuk: string[];
    keluar: string[];
  };
  /**
   * Hasilkan teks saran (kenapa perlu review) untuk transaksi berstatus 'review'.
   * Dipanggil oleh UI per row. Return null jika tidak ada saran spesifik.
   */
  getReviewSuggestion?: (row: ParsedBankRow) => string | null;
  /**
   * Deteksi keyword relevan di keterangan — dipakai UI saat user klik
   * "Split" manual pada row MASUK non-SETOR-TUNAI untuk pre-fill split
   * form. Return list keyword urut berdasar posisi kemunculan.
   */
  detectKeywords?: (keterangan: string) => string[];
}

export interface ParsedBankRow {
  tanggal: string; // YYYY-MM-DD
  keterangan: string;
  debit: number;
  kredit: number;
  saldo: number;
  referensi: string;
}

export type ImportStatus = 'auto' | 'review' | 'split';

export interface CategorizedRow {
  tanggal: string;
  keterangan: string;
  jumlah: number;
  jenis: TransaksiJenis;
  kategori_id: string;
  status: ImportStatus;
  /** For display in the preview table */
  kategoriLabel: string;
  /**
   * Nomor referensi dari CSV bank (kolom pertama). Dipakai sebagai
   * `bank_ref` saat insert ke sheet transaksi untuk deteksi duplikat
   * pada import ulang. Diteruskan dari `ParsedBankRow.referensi`.
   */
  referensi: string;
  /** Optional suggestion text for status='review' rows */
  reviewSuggestion?: string;
  /** True when row is SETOR TUNAI and must be split by user */
  isCashDeposit?: boolean;
  /** Keywords detected in keterangan, used to pre-fill split form */
  detectedKeywords?: string[];
}

export interface ImportRow extends CategorizedRow {
  /** Unique key for React rendering */
  key: string;
  /** Whether this row is a duplicate of existing data */
  isDuplicate: boolean;
  /**
   * If this row is a child of a split operation, this holds the info needed
   * to undo the split (restore the original row) and display split-child UI.
   */
  splitParent?: SplitParentInfo;
}

/**
 * Saved on each split-child ImportRow so the UI can show "split of …" label
 * and support undo back to the original row.
 */
export interface SplitParentInfo {
  /** React key of the original (pre-split) row */
  originalKey: string;
  /** Snapshot of the original row, restored on Undo */
  originalData: CategorizedRow & { key: string; isDuplicate: boolean };
  /** Index of this child within the split (1-based, for display) */
  splitIndex: number;
  /** Total number of splits created from the original */
  splitCount: number;
}

/**
 * Working draft row used inside the Split form. Does NOT participate in
 * the main rows[] state until user clicks Simpan.
 */
export interface SplitDraftRow {
  key: string;
  kategori_id: string;
  jumlah: number;
  deskripsi: string;
}
