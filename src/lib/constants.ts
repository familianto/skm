// Sheet names — must match exactly (case-sensitive) with Google Sheets tabs
export const SHEET_NAMES = {
  MASTER: 'master',
  TRANSAKSI: 'transaksi',
  KATEGORI: 'kategori',
  REKENING_BANK: 'rekening_bank',
  AUDIT_LOG: 'audit_log',
  ANGGOTA: 'anggota',
  REKONSILIASI: 'rekonsiliasi',
  DONATUR: 'donatur',
  REMINDER: 'reminder',
  KELOMPOK: 'kelompok',
} as const;

// ID prefixes for each entity
export const ID_PREFIXES = {
  MASTER: 'MST',
  TRANSAKSI: 'TRX',
  KATEGORI: 'KAT',
  REKENING_BANK: 'REK',
  AUDIT_LOG: 'LOG',
  ANGGOTA: 'ANG',
  REKONSILIASI: 'RKN',
  DONATUR: 'DON',
  REMINDER: 'RMD',
  KELOMPOK: 'KEL',
} as const;

// Sheet headers — order must match column positions (A, B, C, ...)
export const SHEET_HEADERS: Record<string, string[]> = {
  [SHEET_NAMES.MASTER]: [
    'id', 'nama_masjid', 'alamat', 'kota', 'provinsi', 'telepon',
    'email', 'pin_hash', 'logo_url', 'tahun_buku_aktif', 'mata_uang',
    'created_at', 'updated_at',
  ],
  [SHEET_NAMES.TRANSAKSI]: [
    'id', 'tanggal', 'jenis', 'kategori_id', 'deskripsi', 'jumlah',
    'rekening_id', 'bukti_url', 'status', 'void_reason', 'void_date',
    'koreksi_dari_id', 'created_by', 'created_at', 'updated_at', 'mutasi_ref',
  ],
  [SHEET_NAMES.KATEGORI]: [
    'id', 'nama', 'jenis', 'deskripsi', 'is_active', 'created_at',
  ],
  [SHEET_NAMES.REKENING_BANK]: [
    'id', 'nama_bank', 'nomor_rekening', 'atas_nama', 'saldo_awal',
    'is_active', 'created_at', 'updated_at',
  ],
  [SHEET_NAMES.AUDIT_LOG]: [
    'id', 'timestamp', 'aksi', 'entitas', 'entitas_id', 'detail', 'user_info',
  ],
  [SHEET_NAMES.ANGGOTA]: [
    'id', 'nama', 'telepon', 'email', 'peran', 'is_active', 'created_at',
  ],
  [SHEET_NAMES.REKONSILIASI]: [
    'id', 'rekening_id', 'tanggal', 'saldo_bank', 'saldo_sistem',
    'selisih', 'status', 'catatan', 'created_at',
  ],
  [SHEET_NAMES.DONATUR]: [
    'id', 'nama', 'telepon', 'alamat', 'kelompok',
    'jumlah_komitmen', 'catatan', 'is_active', 'created_at', 'updated_at',
  ],
  [SHEET_NAMES.REMINDER]: [
    'id', 'donatur_id', 'tipe', 'pesan', 'nomor_tujuan',
    'status', 'response', 'sent_at', 'created_at',
  ],
  [SHEET_NAMES.KELOMPOK]: [
    'id', 'nama', 'deskripsi', 'warna',
    'kategori_masuk', 'kategori_keluar',
    'created_at', 'updated_at',
  ],
};

// Default categories to seed
export const DEFAULT_CATEGORIES = {
  MASUK: [
    { nama: 'Infaq Jumat', deskripsi: 'Infaq mingguan hari Jumat' },
    { nama: 'Infaq Harian', deskripsi: 'Infaq harian kotak amal' },
    { nama: 'Zakat', deskripsi: 'Penerimaan zakat' },
    { nama: 'Donasi', deskripsi: 'Donasi dari jamaah atau pihak lain' },
    { nama: 'Lain-lain Masuk', deskripsi: 'Pemasukan lainnya' },
  ],
  KELUAR: [
    { nama: 'Listrik & Air', deskripsi: 'Pembayaran listrik dan air' },
    { nama: 'Kebersihan', deskripsi: 'Biaya kebersihan dan perawatan' },
    { nama: 'Honorarium Imam/Khatib', deskripsi: 'Honor imam dan khatib' },
    { nama: 'Perbaikan/Renovasi', deskripsi: 'Biaya perbaikan dan renovasi' },
    { nama: 'Kegiatan Ramadhan', deskripsi: 'Biaya kegiatan Ramadhan' },
    { nama: 'Kegiatan Sosial', deskripsi: 'Biaya kegiatan sosial' },
    { nama: 'ATK & Perlengkapan', deskripsi: 'Alat tulis dan perlengkapan' },
    { nama: 'Lain-lain Keluar', deskripsi: 'Pengeluaran lainnya' },
  ],
};

// Rate limiting config
export const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  WARNING_THRESHOLD: 3, // Show remaining attempts after this many failures
} as const;

// App config
export const APP_CONFIG = {
  NAME: 'SKM',
  VERSION: '2.1.0',
  CURRENCY: 'IDR',
  DEFAULT_TAHUN_BUKU: new Date().getFullYear().toString(),
  PAGINATION_LIMIT: 20,
  MAX_FILE_SIZE_MB: 1, // Max file size after compression
} as const;
