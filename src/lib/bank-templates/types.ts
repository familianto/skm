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
