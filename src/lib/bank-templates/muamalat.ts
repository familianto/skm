import { TransaksiJenis } from '@/types';
import type {
  BankTemplate,
  ParsedBankRow,
  CategorizedRow,
  KategoriResolver,
  ImportStatus,
} from './types';

// ============================================================
// Pattern Rules — Bank Muamalat
// ============================================================
//
// Rules di bawah menggunakan **nama kategori** (bukan ID) agar template
// portabel antar environment. ID kategori resolved di runtime via
// `resolveKategori(nama, jenis)` yang di-inject dari UI import.
//
// Jika kategori dengan nama yang disebut belum ada di sheet `kategori`,
// rule akan auto-downgrade ke status `review` dengan suggestion agar
// user tahu kategori tersebut perlu dibuat dulu.
//
// Urutan rule PENTING: first-match-wins. Rule yang lebih spesifik harus
// berada di atas rule yang lebih generik.

interface PatternRule {
  /** Regex / string match on keterangan (dan optional jumlah) */
  match: (keterangan: string, jumlah: number) => boolean;
  /** Nama kategori tujuan — harus persis sama dengan `nama` di sheet `kategori` */
  kategoriName: string;
  /** Status default untuk rule ini. 'review' harus dibarengi `reviewSuggestion`. */
  status: ImportStatus;
  /** Custom review suggestion (hanya dipakai kalau status='review') */
  reviewSuggestion?: string;
}

// --- MASUK (Kredit) rules ---
//
// NOTE: SETOR TUNAI tidak ditangani di sini — rule SETOR TUNAI di-intercept
// di `categorize()` sebelum rules diiterasi dan selalu di-force ke status
// 'split' untuk diproses manual oleh user di Split form.
//
// Urutan (Part D): specific → generic, dengan fallback terakhir
// `Lain-lain Masuk` berstatus review.
const masukRules: PatternRule[] = [
  // 1. QRIS (merchant code QRIS) → Infaq & Sedekah
  {
    match: (k) => /PURCHASE QRIS ACQ|MERCHANT QRIS/i.test(k),
    kategoriName: 'Infaq & Sedekah',
    status: 'auto',
  },

  // 2. Setoran Infaq + Tarawih → Infaq Ramadhan
  {
    match: (k) =>
      /SETORAN.*INFA[QK].*TARAWIH/i.test(k) ||
      /INFA[QK]\s*PERPEKAN.*TARAWIH/i.test(k),
    kategoriName: 'Infaq Ramadhan',
    status: 'auto',
  },

  // 3. Setoran mengandung Zakat Mal → review (setoran campuran)
  //    Regex baru: ZAKAT MAL / MAAL / MALL
  {
    match: (k) => /SETORAN.*ZAKAT\s+MA+L+/i.test(k),
    kategoriName: 'Infaq Ramadhan',
    status: 'review',
    reviewSuggestion: 'Setoran campuran — pertimbangkan split manual',
  },

  // 4. CDT TRF BENFC (BIFAST/BERSAMA) + KARPET/WAKAF → Donasi & Wakaf Pembangunan
  {
    match: (k) =>
      /CDT TRF BENFC\s+(BIFAST|BERSAMA)/i.test(k) &&
      /KARPET|WAKAF|WAQAF/i.test(k),
    kategoriName: 'Donasi & Wakaf Pembangunan',
    status: 'auto',
  },

  // 5. CDT TRF BENFC (BIFAST/BERSAMA) umum → Infaq & Sedekah
  {
    match: (k) => /CDT TRF BENFC\s+(BIFAST|BERSAMA)/i.test(k),
    kategoriName: 'Infaq & Sedekah',
    status: 'auto',
  },

  // 6. INTERNAL TRANSFER MOBILE BANKING + KARPET/WAKAF → Donasi & Wakaf Pembangunan
  {
    match: (k) =>
      /INTERNAL TRANSFER MOBILE BANKING/i.test(k) &&
      /KARPET|WAKAF|WAQAF/i.test(k),
    kategoriName: 'Donasi & Wakaf Pembangunan',
    status: 'auto',
  },

  // 7. INTERNAL TRANSFER MOBILE BANKING + ZAKAT MAL → Zakat Mal
  //    Regex baru: MAL / MAAL / MALL
  {
    match: (k) =>
      /INTERNAL TRANSFER MOBILE BANKING/i.test(k) && /ZAKAT\s+MA+L+/i.test(k),
    kategoriName: 'Zakat Mal',
    status: 'auto',
  },

  // 8. INTERNAL TRANSFER MOBILE BANKING + TPQ/Fatih → Lain-lain Masuk
  {
    match: (k) =>
      /INTERNAL TRANSFER MOBILE BANKING/i.test(k) && /TPQ|Fatih/i.test(k),
    kategoriName: 'Lain-lain Masuk',
    status: 'auto',
  },

  // 9. INTERNAL TRANSFER MOBILE BANKING + Infaq/Infak → Infaq & Sedekah
  {
    match: (k) =>
      /INTERNAL TRANSFER MOBILE BANKING/i.test(k) && /INFA[QK]/i.test(k),
    kategoriName: 'Infaq & Sedekah',
    status: 'auto',
  },

  // 10. INTERNAL TRANSFER MOBILE BANKING umum → review
  {
    match: (k) => /INTERNAL TRANSFER MOBILE BANKING/i.test(k),
    kategoriName: 'Infaq & Sedekah',
    status: 'review',
    reviewSuggestion: 'Transfer internal — verifikasi jenis penerimaan',
  },

  // 11. FLIPTECH + TPQ → Lain-lain Masuk
  {
    match: (k) => /FLIPTECH(\s+LENTERA)?/i.test(k) && /TPQ/i.test(k),
    kategoriName: 'Lain-lain Masuk',
    status: 'auto',
  },

  // 12. FLIPTECH + zakat → Zakat Mal
  {
    match: (k) => /FLIPTECH(\s+LENTERA)?/i.test(k) && /zakat/i.test(k),
    kategoriName: 'Zakat Mal',
    status: 'auto',
  },

  // 13. Infaq Jumat (NON setor tunai) — weekly infaq via teller/transfer
  //     Fix 1 regex: tangkap "SETORAN INFAQ PER PEKAN", "INFAQ PER PEKAN",
  //     "PER PEKAN / INFAQ", dan "SETORAN PER PEKAN" (semua tanpa tarawih).
  {
    match: (k) =>
      (/(?:SETORAN\s+)?(?:INFAQ|INFAK)\s+PER\s*PEKAN|PER\s*PEKAN\s*[/]?\s*(?:INFAQ|INFAK)|SETORAN\s+PER\s*PEKAN/i.test(
        k
      )) &&
      !/TARAWIH|RAMADHAN|ZAKAT/i.test(k),
    kategoriName: 'Infaq Jumat',
    status: 'auto',
  },

  // 14. Catch-all fallback → Lain-lain Masuk (review)
  {
    match: () => true,
    kategoriName: 'Lain-lain Masuk',
    status: 'review',
    reviewSuggestion: 'Tidak cocok pattern otomatis — pilih kategori manual',
  },
];

// --- KELUAR (Debit) rules ---
const keluarRules: PatternRule[] = [
  // ----- Hadiah Kajian -----
  // Taraweh version (specific first) → Kegiatan Ramadhan
  {
    match: (k) => /Hadiah Kajian Taraweh MAJ/i.test(k),
    kategoriName: 'Kegiatan Ramadhan',
    status: 'auto',
  },
  // Hadiah Kajian MAJ (tanpa Taraweh) → Honorarium Pemateri Kajian
  {
    match: (k) =>
      /Hadiah Kajian MAJ/i.test(k) && !/Taraweh/i.test(k),
    kategoriName: 'Honorarium Pemateri Kajian',
    status: 'auto',
  },
  // Honor Cash Ustadz Tabligh Akbar → Honorarium Pemateri Kajian
  {
    match: (k) => /Honor Cash Ustadz Tabligh Akbar/i.test(k),
    kategoriName: 'Honorarium Pemateri Kajian',
    status: 'auto',
  },

  // ----- MAJ Honor / Mukafaah / THR (ordered specific → generic) -----
  // THR patterns first
  {
    match: (k) => /MAJ THR|THR Mushrif|THR Mukafaah/i.test(k),
    kategoriName: 'Honorarium Marbot/Petugas',
    status: 'auto',
  },
  // MAJ Honor Mushrif → Honorarium Marbot/Petugas
  {
    match: (k) => /MAJ Honor Mushrif/i.test(k),
    kategoriName: 'Honorarium Marbot/Petugas',
    status: 'auto',
  },
  // MAJ Mukafaah → Honorarium Imam/Khatib
  {
    match: (k) => /MAJ Mukafaah/i.test(k),
    kategoriName: 'Honorarium Imam/Khatib',
    status: 'auto',
  },
  // MAJ Honor [bulan] (generic, EXCLUDE Mushrif/Mukafaah/THR)
  {
    match: (k) =>
      /MAJ Honor/i.test(k) &&
      !/MAJ Honor Mushrif|MAJ Mukafaah|MAJ THR/i.test(k),
    kategoriName: 'Honorarium Marbot/Petugas',
    status: 'auto',
  },

  // MAJ Biaya Perawatan Santri → Kegiatan Sosial
  {
    match: (k) => /MAJ Biaya Perawatan Santri/i.test(k),
    kategoriName: 'Kegiatan Sosial',
    status: 'auto',
  },

  // ----- Payroll & fees (fee rules first so honor payroll tidak ikut match) -----
  {
    match: (k) => /Fee Payroll|CMS BIAYA PAYROLL/i.test(k),
    kategoriName: 'Biaya Admin Bank',
    status: 'auto',
  },
  {
    match: (k) => /BULK TXN CMS FILE\s*payrollMAJ/i.test(k),
    kategoriName: 'Honorarium Marbot/Petugas',
    status: 'auto',
  },

  // Biaya Adm Pengajian Ibu-Ibu MAJ → Operasional Masjid
  {
    match: (k) => /Biaya Adm Pengajian Ibu-Ibu MAJ/i.test(k),
    kategoriName: 'Operasional Masjid',
    status: 'auto',
  },

  // HONOR GURU TPQ → Honorarium Marbot/Petugas
  {
    match: (k) => /HONOR GURU TPQ/i.test(k),
    kategoriName: 'Honorarium Marbot/Petugas',
    status: 'auto',
  },

  // Honor Bantuan Operasional Ramadhan → Kegiatan Ramadhan
  {
    match: (k) => /Honor Bantuan Operasional Ramadhan/i.test(k),
    kategoriName: 'Kegiatan Ramadhan',
    status: 'auto',
  },

  // ----- Perbaikan / Renovasi (must come before generic "Pengadaan") -----
  // Perbaikan umum: Plafon/Gudang/Kubah/pintu, Pemindahan, Lampu Injeksi/Dinding
  {
    match: (k) =>
      /Perbaikan|Pemindahan(?:\s+tempat)?|Lampu Injeksi|Lampu Dinding/i.test(k),
    kategoriName: 'Perbaikan/Renovasi',
    status: 'auto',
  },
  // Listrik ringan: Pasang Kabel / Lampu area / kontak / Ganti Lampu
  {
    match: (k) =>
      /Pasang Kabel|Lampu area|kontak Lampu|Ganti kontak dan Lampu|Pasang Ganti Lampu/i.test(
        k
      ),
    kategoriName: 'Perbaikan/Renovasi',
    status: 'auto',
  },
  // Pengecatan → Perbaikan/Renovasi
  {
    match: (k) => /Pengecatan|pengecatan dinding/i.test(k),
    kategoriName: 'Perbaikan/Renovasi',
    status: 'auto',
  },
  // Biaya buat pagar → Perbaikan/Renovasi
  {
    match: (k) => /Biaya buat pagar/i.test(k),
    kategoriName: 'Perbaikan/Renovasi',
    status: 'auto',
  },
  // Service AC / Perbaikan AC → Perbaikan/Renovasi
  {
    match: (k) => /Service AC|Perbaikan AC/i.test(k),
    kategoriName: 'Perbaikan/Renovasi',
    status: 'auto',
  },

  // Tebang Pohon → Kebersihan
  {
    match: (k) => /Tebang Pohon/i.test(k),
    kategoriName: 'Kebersihan',
    status: 'auto',
  },

  // ----- CCTV: purchase vs jasa pasang -----
  // Pembelian CCTV / CCTV Kabel / peralatan digital → Pengadaan Aset
  {
    match: (k) =>
      /Pembelian CCTV|CCTV Kabel|Peralatan Digital|Beli 2 Unit TV|Bracket/i.test(
        k
      ),
    kategoriName: 'Pengadaan Aset',
    status: 'auto',
  },
  // Jasa Pasang CCTV / Pasang CCTV (tanpa Pembelian/Kabel) → Operasional Masjid
  {
    match: (k) =>
      /Jasa Pasang CCTV|Pasang CCTV/i.test(k) &&
      !/Pembelian|Kabel/i.test(k),
    kategoriName: 'Operasional Masjid',
    status: 'auto',
  },

  // Beli Dispenser → ATK & Perlengkapan
  {
    match: (k) => /Beli Dispenser/i.test(k),
    kategoriName: 'ATK & Perlengkapan',
    status: 'auto',
  },

  // ----- Karpet (hanya di KELUAR → Pengadaan Aset) -----
  {
    match: (k) => /Karpet|Alas Lantai/i.test(k),
    kategoriName: 'Pengadaan Aset',
    status: 'auto',
  },

  // Beli Voucher Listrik → Listrik & Air
  {
    match: (k) => /Beli Voucher Listrik|Voucher Listrik/i.test(k),
    kategoriName: 'Listrik & Air',
    status: 'auto',
  },

  // Rak Buku / Beli keset → ATK & Perlengkapan
  {
    match: (k) => /Rak Buku|Beli keset/i.test(k),
    kategoriName: 'ATK & Perlengkapan',
    status: 'auto',
  },

  // Tenda dan Paket Ambulan / Tenda → Kegiatan Sosial
  {
    match: (k) => /Tenda dan Paket Ambulan|Tenda/i.test(k),
    kategoriName: 'Kegiatan Sosial',
    status: 'auto',
  },

  // Santunan Anak Yatim / SANTUNAN → Kegiatan Sosial
  {
    match: (k) => /Santunan Anak Yatim|SANTUNAN/i.test(k),
    kategoriName: 'Kegiatan Sosial',
    status: 'auto',
  },

  // Pembagian Zakat Fitrah / PEMBAGIAN ZAKAT → Pengeluaran Zakat (BARU)
  {
    match: (k) => /Pembagian Zakat Fitrah|PEMBAGIAN ZAKAT/i.test(k),
    kategoriName: 'Pengeluaran Zakat',
    status: 'auto',
  },

  // Konsumsi Itikaf Ramadhan → Kegiatan Ramadhan (specific first)
  {
    match: (k) => /Konsumsi Itikaf Ramadhan/i.test(k),
    kategoriName: 'Kegiatan Ramadhan',
    status: 'auto',
  },
  // Konsumsi Tabligh Akbar → Konsumsi
  {
    match: (k) => /Konsumsi Tabligh Akbar/i.test(k),
    kategoriName: 'Konsumsi',
    status: 'auto',
  },

  // KEPERLUAN MAJ → Operasional Masjid
  {
    match: (k) => /KEPERLUAN MAJ/i.test(k),
    kategoriName: 'Operasional Masjid',
    status: 'auto',
  },

  // ----- Bank transfer charges (always Biaya Admin Bank) -----
  {
    match: (k, j) =>
      /DBT TRF CHARGE BERSAMA|CHARGE DBT TRF BIFAST|DBT TRF CHARGE PRIMA|DBT TRF CHARGE/i.test(
        k
      ) || (/BIFAST/i.test(k) && j === 2500),
    kategoriName: 'Biaya Admin Bank',
    status: 'auto',
  },

  // INTERNAL TRANSFER CMS (keluar) → review
  {
    match: (k) => /INTERNAL TRANSFER CMS/i.test(k),
    kategoriName: '',
    status: 'review',
    reviewSuggestion: 'Transfer CMS keluar — pilih kategori sesuai tujuan',
  },
];

// ============================================================
// Highlight keywords (untuk UI highlight di kolom Keterangan)
// ============================================================

const HIGHLIGHT_KEYWORDS = {
  masuk: [
    // QRIS
    'PURCHASE QRIS ACQ',
    'MERCHANT QRIS',
    // Setoran teller
    'SETORAN INFAQ',
    'SETORAN INFAK',
    'PER PEKAN',
    'PERPEKAN',
    'TARAWIH',
    'RAMADHAN',
    'ZAKAT MAL',
    'ZAKAT MAAL',
    'ZAKAT MALL',
    'PEMBANGUNAN',
    'DONASI',
    'Donasi',
    // Setor tunai
    'SETOR TUNAI',
    // Transfer masuk
    'CDT TRF BENFC BIFAST',
    'CDT TRF BENFC BERSAMA',
    'INTERNAL TRANSFER MOBILE BANKING',
    // Payment aggregator
    'FLIPTECH LENTERA',
    'FLIPTECH',
    // Keyword donasi
    'KARPET',
    'karpet',
    'WAKAF',
    'wakaf',
    'WAQAF',
    'waqaf',
    'ZAKAT',
    'zakat',
    'TPQ',
    'Fatih',
    'Infaq',
    'Infak',
    'infaq',
  ],
  keluar: [
    // Honor
    'Hadiah Kajian Taraweh MAJ',
    'Hadiah Kajian MAJ',
    'Honor Cash Ustadz Tabligh Akbar',
    'MAJ Honor Mushrif',
    'MAJ Honor',
    'MAJ Mukafaah',
    'MAJ THR',
    'THR Mushrif',
    'THR Mukafaah',
    'HONOR GURU TPQ',
    'Honor Bantuan Operasional Ramadhan',
    // Santri / sosial
    'MAJ Biaya Perawatan Santri',
    'Santunan Anak Yatim',
    'SANTUNAN',
    'Tenda dan Paket Ambulan',
    'Tenda',
    // Payroll
    'BULK TXN CMS FILE',
    'payrollMAJ',
    'Fee Payroll',
    'CMS BIAYA PAYROLL',
    // Perbaikan
    'Perbaikan',
    'Pemindahan',
    'Pengecatan',
    'Lampu Injeksi',
    'Lampu Dinding',
    'Pasang Kabel',
    'Ganti Lampu',
    'Biaya buat pagar',
    'Service AC',
    'Perbaikan AC',
    'Tebang Pohon',
    // Pengadaan
    'Pembelian CCTV',
    'CCTV Kabel',
    'Jasa Pasang CCTV',
    'Pasang CCTV',
    'Peralatan Digital',
    'Beli 2 Unit TV',
    'Bracket',
    'Beli Dispenser',
    'DP Karpet',
    'Pelunasan Karpet',
    'Setup Karpet',
    'Karpet',
    'Alas Lantai',
    'Rak Buku',
    'Beli keset',
    'Beli Voucher Listrik',
    'Voucher Listrik',
    // Zakat distribusi
    'Pembagian Zakat Fitrah',
    'PEMBAGIAN ZAKAT',
    // Konsumsi
    'Konsumsi Itikaf Ramadhan',
    'Konsumsi Tabligh Akbar',
    // Operasional
    'KEPERLUAN MAJ',
    'Biaya Adm Pengajian Ibu-Ibu MAJ',
    // Transfer charges
    'DBT TRF CHARGE BERSAMA',
    'DBT TRF CHARGE PRIMA',
    'CHARGE DBT TRF BIFAST',
    'DBT TRF CHARGE',
    'BIFAST',
    // CMS out
    'INTERNAL TRANSFER CMS',
  ],
};

// ============================================================
// SETOR TUNAI keyword detector
// ============================================================
//
// Untuk row SETOR TUNAI kita deteksi keyword yang muncul di keterangan
// beserta posisinya, lalu urutkan berdasar posisi kemunculan. Hasilnya
// dipakai oleh UI import untuk pre-fill Split form dengan daftar
// kategori yang sesuai.

const CASH_DEPOSIT_KEYWORDS: Array<{ key: string; regex: RegExp }> = [
  // ZAKAT MAL harus dicek lebih dulu dari ZAKAT biasa
  { key: 'ZAKAT MAL', regex: /ZAKAT\s+MA+L+/i },
  { key: 'DONASI', regex: /\bDONASI\b/i },
  { key: 'INFAQ', regex: /\bINFA[QK]\b/i },
  { key: 'PER PEKAN', regex: /PER\s*PEKAN/i },
  { key: 'TARAWIH', regex: /\bTARAWIH\b/i },
  { key: 'RAMADHAN', regex: /\bRAMADHAN\b/i },
  { key: 'KARPET', regex: /\bKARPET\b/i },
  { key: 'WAKAF', regex: /\bWA[KQ]AF\b/i },
  { key: 'PEMBANGUNAN', regex: /\bPEMBANGUNAN\b/i },
];

export function detectCashDepositKeywords(keterangan: string): string[] {
  const found: Array<{ key: string; pos: number }> = [];

  // 1) Cek ZAKAT MAL / MAAL / MALL (specific)
  const zakatMalMatch = /ZAKAT\s+MA+L+/i.exec(keterangan);
  if (zakatMalMatch) {
    found.push({ key: 'ZAKAT MAL', pos: zakatMalMatch.index });
  }

  // 2) Cek ZAKAT generik — tapi skip kalau ini bagian dari ZAKAT MAL
  const zakatMatch = /\bZAKAT\b/i.exec(keterangan);
  if (zakatMatch && zakatMatch.index !== zakatMalMatch?.index) {
    found.push({ key: 'ZAKAT', pos: zakatMatch.index });
  }

  // 3) Keyword lain — cek satu per satu, catat posisi kemunculan pertama
  for (const p of CASH_DEPOSIT_KEYWORDS) {
    if (p.key === 'ZAKAT MAL') continue; // sudah di-handle di atas
    const m = p.regex.exec(keterangan);
    if (m) {
      found.push({ key: p.key, pos: m.index });
    }
  }

  // Urutkan berdasar posisi kemunculan di string
  found.sort((a, b) => a.pos - b.pos);
  return found.map((f) => f.key);
}

// ============================================================
// Review suggestion (untuk row yang tidak match pattern manapun)
// ============================================================

function getReviewSuggestion(row: ParsedBankRow): string | null {
  const k = row.keterangan;

  if (row.debit > 0) {
    if (/INTERNAL TRANSFER CMS/i.test(k)) {
      return 'Transfer CMS keluar — pilih kategori sesuai tujuan';
    }
    if (/BMICMS01/i.test(k)) {
      return 'Mengandung BMICMS01 — kemungkinan transfer CMS keluar';
    }
    if (/A IMRON ROSADI/i.test(k)) {
      return 'Mengandung A IMRON ROSADI — perlu verifikasi tujuan transfer';
    }
    if (/BIFAST/i.test(k)) {
      return 'Transfer BiFast keluar — pilih kategori yang sesuai';
    }
  }

  return 'Tidak cocok pattern otomatis — pilih kategori manual';
}

// ============================================================
// Parser
// ============================================================

// Map month abbreviations (English + Indonesian) to 1-based month numbers
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', mei: '05',
  jun: '06', jul: '07', aug: '08', agu: '08', ags: '08', sep: '09',
  oct: '10', okt: '10', nov: '11', dec: '12', des: '12',
};

function parseDate(dateStr: string): string {
  const s = dateStr.trim();

  // "DD/MM/YYYY" → "YYYY-MM-DD"
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    const [dd, mm, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Dash-separated: handle DD-MM-YYYY (numeric) and DD-MMM-YYYY (text month)
  const dashParts = s.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    const [dd, mid, yyyy] = dashParts;
    // DD-MM-YYYY (numeric month)
    if (/^\d+$/.test(mid)) {
      return `${yyyy}-${mid.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    // DD-MMM-YYYY (text month, e.g. "02-Mar-2026")
    const monthNum = MONTH_MAP[mid.toLowerCase()];
    if (monthNum) {
      return `${yyyy}-${monthNum}-${dd.padStart(2, '0')}`;
    }
  }

  // Already "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" — return date part only
  if (dashParts.length >= 3 && dashParts[0].length === 4) {
    return s.slice(0, 10);
  }

  // Fallback: native Date parsing using LOCAL components (not toISOString — which is UTC)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return s;
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
  highlightKeywords: HIGHLIGHT_KEYWORDS,
  getReviewSuggestion,
  detectKeywords: detectCashDepositKeywords,

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

  categorize(row: ParsedBankRow, resolveKategori?: KategoriResolver): CategorizedRow {
    const isKredit = row.kredit > 0;
    const jenis = isKredit ? TransaksiJenis.MASUK : TransaksiJenis.KELUAR;
    const jumlah = isKredit ? row.kredit : row.debit;

    // ---- Step 0: SETOR TUNAI selalu SPLIT ----
    // Transaksi kredit yang mengandung "SETOR TUNAI" TIDAK PERNAH
    // di-auto-map — user harus manual memecah ke beberapa kategori via
    // Split form di UI. Kita attach `detectedKeywords` agar UI bisa
    // pre-fill form dengan kategori yang relevan.
    if (isKredit && /SETOR TUNAI/i.test(row.keterangan)) {
      return {
        tanggal: row.tanggal,
        keterangan: row.keterangan,
        jumlah,
        jenis,
        kategori_id: '',
        status: 'split',
        kategoriLabel: '',
        isCashDeposit: true,
        detectedKeywords: detectCashDepositKeywords(row.keterangan),
        reviewSuggestion:
          'Setor tunai — pecah ke beberapa kategori sebelum import',
      };
    }

    const rules = isKredit ? masukRules : keluarRules;

    for (const rule of rules) {
      if (!rule.match(row.keterangan, jumlah)) continue;

      // Resolve nama → ID kategori
      const kategori_id =
        rule.kategoriName && resolveKategori
          ? resolveKategori(rule.kategoriName, jenis)
          : '';

      // Kalau rule punya kategoriName tapi resolver gagal, downgrade ke review
      const hasUnresolvedKategori =
        rule.kategoriName !== '' && kategori_id === '';
      const status: ImportStatus = hasUnresolvedKategori ? 'review' : rule.status;

      let reviewSuggestion: string | undefined;
      if (status === 'review') {
        if (hasUnresolvedKategori) {
          reviewSuggestion = `Kategori "${rule.kategoriName}" belum ada di sheet — buat dulu di halaman Kategori`;
        } else {
          reviewSuggestion =
            rule.reviewSuggestion ?? getReviewSuggestion(row) ?? undefined;
        }
      }

      return {
        tanggal: row.tanggal,
        keterangan: row.keterangan,
        jumlah,
        jenis,
        kategori_id,
        status,
        kategoriLabel: rule.kategoriName,
        reviewSuggestion,
      };
    }

    // No pattern matched → review with generic suggestion
    return {
      tanggal: row.tanggal,
      keterangan: row.keterangan,
      jumlah,
      jenis,
      kategori_id: '',
      status: 'review',
      kategoriLabel: '',
      reviewSuggestion: getReviewSuggestion(row) ?? undefined,
    };
  },
};
