import { TransaksiJenis } from '@/types';

// ============================================================
// Bank Template Types
// ============================================================

export interface BankTemplate {
  bankId: string;
  bankName: string;
  /** Number of header rows to skip in CSV */
  headerRowsToSkip: number;
  /** Nomor rekening bank di SKM */
  rekeningId: string;
  /** Parse a raw CSV row into a normalized transaction row */
  parseRow: (row: string[]) => ParsedBankRow | null;
  /** Apply pattern rules to categorize a parsed row */
  categorize: (row: ParsedBankRow) => CategorizedRow;
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
  /** Optional suggestion text for status='review' rows */
  reviewSuggestion?: string;
}

export interface ImportRow extends CategorizedRow {
  /** Unique key for React rendering */
  key: string;
  /** Whether this row is a duplicate of existing data */
  isDuplicate: boolean;
  /** Split sub-rows (for SETOR TUNAI etc.) */
  splitRows?: SplitRow[];
}

export interface SplitRow {
  key: string;
  kategori_id: string;
  kategoriLabel: string;
  jumlah: number;
}
