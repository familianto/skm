import { TransaksiJenis } from '@/types';
import type { BankTemplate, ParsedBankRow, CategorizedRow } from './types';

// ============================================================
// Pattern Rules — Bank Muamalat
// ============================================================

const REKENING_MUAMALAT = '3200028199';

interface PatternRule {
  /** Regex or string match on keterangan */
  match: (keterangan: string, jumlah: number) => boolean;
  kategori_id: string;
  kategoriLabel: string;
  status: 'auto' | 'review' | 'split';
}

// --- MASUK (Kredit) rules ---
const masukRules: PatternRule[] = [
  {
    match: (k) => /PURCHASE QRIS ACQ/i.test(k),
    kategori_id: 'KAT-20260406-0002',
    kategoriLabel: 'Infaq Harian',
    status: 'auto',
  },
  {
    match: (k) => /SETOR TUNAI/i.test(k),
    kategori_id: 'KAT-20260406-0002',
    kategoriLabel: 'Infaq Harian',
    status: 'split',
  },
  {
    match: (k) => /zakat/i.test(k),
    kategori_id: 'KAT-20260406-0011',
    kategoriLabel: 'Zakat Mal',
    status: 'auto',
  },
  {
    match: (k) => /TPQ/i.test(k),
    kategori_id: 'KAT-20260406-0002',
    kategoriLabel: 'Infaq Harian',
    status: 'auto',
  },
  {
    match: (k) => /karpet|waqaf|wakaf/i.test(k),
    kategori_id: 'KAT-20260406-0001',
    kategoriLabel: 'Donasi',
    status: 'auto',
  },
  {
    match: (k) => /CDT TRF BENFC BIFAST|TRANSFER DARI/i.test(k),
    kategori_id: 'KAT-20260406-0001',
    kategoriLabel: 'Donasi',
    status: 'auto',
  },
  {
    match: (k) => /INTERNAL TRANSFER/i.test(k) && k.includes(`Ke ${REKENING_MUAMALAT}`),
    kategori_id: 'KAT-20260406-0001',
    kategoriLabel: 'Donasi',
    status: 'auto',
  },
  {
    match: (k) => /ATMOFFUS/i.test(k),
    kategori_id: 'KAT-20260406-0001',
    kategoriLabel: 'Donasi',
    status: 'auto',
  },
  {
    match: (k) => /FLIPTECH LENTERA INSPIRASI/i.test(k),
    kategori_id: 'KAT-20260406-0001',
    kategoriLabel: 'Donasi',
    status: 'auto',
  },
];

// --- KELUAR (Debit) rules ---
const keluarRules: PatternRule[] = [
  {
    match: (k) => /A IMRON ROSADI/i.test(k) && /DBT TRF CHARGE/i.test(k),
    kategori_id: 'KAT-20260406-0015',
    kategoriLabel: 'Biaya Admin Bank',
    status: 'auto',
  },
  {
    match: (k, j) => /DBT TRF CHARGE/i.test(k) || (/BIFAST/i.test(k) && j === 2500),
    kategori_id: 'KAT-20260406-0015',
    kategoriLabel: 'Biaya Admin Bank',
    status: 'auto',
  },
  {
    match: (k) => /PAYROLL|TRANSAKSI PAYROLL BMI/i.test(k),
    kategori_id: 'KAT-20260406-0017',
    kategoriLabel: 'Honorarium Marbot/Petugas',
    status: 'auto',
  },
  {
    match: (k) => /BMICMS01/i.test(k),
    kategori_id: '',
    kategoriLabel: '',
    status: 'review',
  },
  {
    match: (k) => /TRANSFER DARI.*MUABIDJA.*KE.*IDJA/i.test(k),
    kategori_id: '',
    kategoriLabel: '',
    status: 'review',
  },
  {
    match: (k) => /A IMRON ROSADI/i.test(k) && /DBT TRF PRIMA/i.test(k),
    kategori_id: '',
    kategoriLabel: '',
    status: 'review',
  },
];

// ============================================================
// Parser
// ============================================================

function parseDate(dateStr: string): string {
  // Input: "DD/MM/YYYY" → Output: "YYYY-MM-DD"
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return dateStr;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function parseAmount(val: string): number {
  if (!val || val.trim() === '') return 0;
  // Remove thousand separators (comma) and parse
  const cleaned = val.replace(/,/g, '').replace(/\s/g, '');
  return parseFloat(cleaned) || 0;
}

// ============================================================
// Bank Muamalat Template
// ============================================================

export const muamalatTemplate: BankTemplate = {
  bankId: 'muamalat',
  bankName: 'Bank Muamalat',
  headerRowsToSkip: 8,
  rekeningId: '', // will be resolved at import time from SKM rekening data

  parseRow(row: string[]): ParsedBankRow | null {
    // CSV columns: Nomor Referensi, Tgl Transaksi, Tgl Efektif, Debit, Kredit, Saldo, Keterangan
    if (!row || row.length < 7) return null;

    const referensi = (row[0] || '').trim();
    const tglTransaksi = (row[1] || '').trim();
    const debit = parseAmount(row[3] || '');
    const kredit = parseAmount(row[4] || '');
    const saldo = parseAmount(row[5] || '');
    const keterangan = (row[6] || '').trim();

    // Skip empty rows or summary rows
    if (!tglTransaksi || !keterangan) return null;
    // Must have at least debit or kredit
    if (debit === 0 && kredit === 0) return null;

    return {
      tanggal: parseDate(tglTransaksi),
      keterangan,
      debit,
      kredit,
      saldo,
      referensi,
    };
  },

  categorize(row: ParsedBankRow): CategorizedRow {
    const isKredit = row.kredit > 0;
    const jenis = isKredit ? TransaksiJenis.MASUK : TransaksiJenis.KELUAR;
    const jumlah = isKredit ? row.kredit : row.debit;
    const rules = isKredit ? masukRules : keluarRules;

    for (const rule of rules) {
      if (rule.match(row.keterangan, jumlah)) {
        return {
          tanggal: row.tanggal,
          keterangan: row.keterangan,
          jumlah,
          jenis,
          kategori_id: rule.kategori_id,
          status: rule.status,
          kategoriLabel: rule.kategoriLabel,
        };
      }
    }

    // No pattern matched → review
    return {
      tanggal: row.tanggal,
      keterangan: row.keterangan,
      jumlah,
      jenis,
      kategori_id: '',
      status: 'review',
      kategoriLabel: '',
    };
  },
};
