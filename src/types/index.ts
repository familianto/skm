// ============================================================
// Enums
// ============================================================

export enum TransaksiJenis {
  MASUK = 'MASUK',
  KELUAR = 'KELUAR',
}

export enum TransaksiStatus {
  AKTIF = 'AKTIF',
  VOID = 'VOID',
}

export enum UserPeran {
  BENDAHARA = 'BENDAHARA',
  PENGURUS = 'PENGURUS',
  VIEWER = 'VIEWER',
}

export enum AuditAksi {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VOID = 'VOID',
  KOREKSI = 'KOREKSI',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXPORT = 'EXPORT',
}

export enum RekonsiliasiStatus {
  SESUAI = 'SESUAI',
  TIDAK_SESUAI = 'TIDAK_SESUAI',
}

// ============================================================
// Interfaces
// ============================================================

export interface Master {
  id: string;
  nama_masjid: string;
  alamat: string;
  kota: string;
  provinsi: string;
  telepon: string;
  email: string;
  pin_hash: string;
  logo_url: string;
  tahun_buku_aktif: string;
  mata_uang: string;
  created_at: string;
  updated_at: string;
}

export interface Transaksi {
  id: string;
  tanggal: string;
  jenis: TransaksiJenis;
  kategori_id: string;
  deskripsi: string;
  jumlah: number;
  rekening_id: string;
  bukti_url: string;
  status: TransaksiStatus;
  void_reason: string;
  void_date: string;
  koreksi_dari_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Kategori {
  id: string;
  nama: string;
  jenis: TransaksiJenis;
  deskripsi: string;
  is_active: boolean;
  created_at: string;
}

export interface RekeningBank {
  id: string;
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
  saldo_awal: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  aksi: AuditAksi;
  entitas: string;
  entitas_id: string;
  detail: string;
  user_info: string;
}

export interface Anggota {
  id: string;
  nama: string;
  telepon: string;
  email: string;
  peran: UserPeran;
  is_active: boolean;
  created_at: string;
}

export interface Rekonsiliasi {
  id: string;
  rekening_id: string;
  tanggal: string;
  saldo_bank: number;
  saldo_sistem: number;
  selisih: number;
  status: RekonsiliasiStatus;
  catatan: string;
  created_at: string;
}

// ============================================================
// Session
// ============================================================

export interface SessionData {
  role: string;
  masjidName: string;
}

// ============================================================
// API Response
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}
