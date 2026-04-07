import { z } from 'zod';
import { TransaksiJenis, UserPeran, DonaturKelompok, ReminderTipe } from '@/types';

// ============================================================
// Auth
// ============================================================

export const loginSchema = z.object({
  pin: z.string().min(4, 'PIN minimal 4 digit').max(6, 'PIN maksimal 6 digit').regex(/^\d+$/, 'PIN harus berupa angka'),
});

// ============================================================
// Kategori
// ============================================================

export const kategoriCreateSchema = z.object({
  nama: z.string().min(1, 'Nama kategori wajib diisi').max(100),
  jenis: z.nativeEnum(TransaksiJenis, { error: 'Jenis harus MASUK atau KELUAR' }),
  deskripsi: z.string().max(255).default(''),
});

export const kategoriUpdateSchema = z.object({
  nama: z.string().min(1, 'Nama kategori wajib diisi').max(100).optional(),
  jenis: z.nativeEnum(TransaksiJenis).optional(),
  deskripsi: z.string().max(255).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Rekening Bank
// ============================================================

export const rekeningCreateSchema = z.object({
  nama_bank: z.string().min(1, 'Nama bank wajib diisi').max(100),
  nomor_rekening: z.string().min(1, 'Nomor rekening wajib diisi').max(50),
  atas_nama: z.string().min(1, 'Atas nama wajib diisi').max(100),
  saldo_awal: z.number().int('Saldo harus bilangan bulat').min(0, 'Saldo tidak boleh negatif'),
});

export const rekeningUpdateSchema = z.object({
  nama_bank: z.string().min(1).max(100).optional(),
  nomor_rekening: z.string().min(1).max(50).optional(),
  atas_nama: z.string().min(1).max(100).optional(),
  saldo_awal: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Anggota
// ============================================================

export const anggotaCreateSchema = z.object({
  nama: z.string().min(1, 'Nama wajib diisi').max(100),
  telepon: z.string().max(20).default(''),
  email: z.string().email('Email tidak valid').or(z.literal('')).default(''),
  peran: z.nativeEnum(UserPeran, { error: 'Peran harus BENDAHARA, PENGURUS, atau VIEWER' }),
});

export const anggotaUpdateSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  telepon: z.string().max(20).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  peran: z.nativeEnum(UserPeran).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Transaksi
// ============================================================

export const transaksiCreateSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD'),
  jenis: z.nativeEnum(TransaksiJenis, { error: 'Jenis harus MASUK atau KELUAR' }),
  kategori_id: z.string().min(1, 'Kategori wajib dipilih'),
  deskripsi: z.string().min(1, 'Deskripsi wajib diisi').max(255),
  jumlah: z.number().int('Jumlah harus bilangan bulat').positive('Jumlah harus lebih dari 0'),
  rekening_id: z.string().min(1, 'Rekening wajib dipilih'),
});

export const transaksiMutasiCreateSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD'),
  deskripsi: z.string().min(1, 'Deskripsi wajib diisi').max(255),
  jumlah: z.number().int('Jumlah harus bilangan bulat').positive('Jumlah harus lebih dari 0'),
  dari_rekening_id: z.string().min(1, 'Rekening asal wajib dipilih'),
  ke_rekening_id: z.string().min(1, 'Rekening tujuan wajib dipilih'),
}).refine((d) => d.dari_rekening_id !== d.ke_rekening_id, {
  message: 'Rekening asal dan tujuan tidak boleh sama',
  path: ['ke_rekening_id'],
});

export const transaksiUpdateSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD').optional(),
  jenis: z.nativeEnum(TransaksiJenis).optional(),
  kategori_id: z.string().min(1).optional(),
  deskripsi: z.string().min(1).max(255).optional(),
  jumlah: z.number().int().positive().optional(),
  rekening_id: z.string().min(1).optional(),
});

// ============================================================
// Donatur
// ============================================================

export const donaturCreateSchema = z.object({
  nama: z.string().min(1, 'Nama donatur wajib diisi').max(100),
  telepon: z.string().min(1, 'Nomor telepon wajib diisi').max(20).regex(/^[0-9+\-\s]+$/, 'Nomor telepon tidak valid'),
  alamat: z.string().max(255).default(''),
  kelompok: z.nativeEnum(DonaturKelompok, { error: 'Kelompok harus TETAP atau INSIDENTAL' }),
  jumlah_komitmen: z.number().int('Jumlah harus bilangan bulat').min(0, 'Jumlah tidak boleh negatif').default(0),
  catatan: z.string().max(255).default(''),
});

export const donaturUpdateSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  telepon: z.string().min(1).max(20).regex(/^[0-9+\-\s]+$/).optional(),
  alamat: z.string().max(255).optional(),
  kelompok: z.nativeEnum(DonaturKelompok).optional(),
  jumlah_komitmen: z.number().int().min(0).optional(),
  catatan: z.string().max(255).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Reminder
// ============================================================

export const reminderCreateSchema = z.object({
  donatur_id: z.string().min(1, 'Donatur wajib dipilih'),
  tipe: z.nativeEnum(ReminderTipe, { error: 'Tipe reminder tidak valid' }),
  pesan: z.string().min(1, 'Pesan wajib diisi').max(1000),
});

export const reminderBulkSchema = z.object({
  donatur_ids: z.array(z.string().min(1)).min(1, 'Pilih minimal 1 donatur'),
  tipe: z.nativeEnum(ReminderTipe, { error: 'Tipe reminder tidak valid' }),
  pesan: z.string().min(1, 'Pesan wajib diisi').max(1000),
});

// ============================================================
// Void Transaksi
// ============================================================

export const voidTransaksiSchema = z.object({
  reason: z.string().min(1, 'Alasan void wajib diisi').max(255),
});

// ============================================================
// Koreksi Transaksi
// ============================================================

export const koreksiTransaksiSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD'),
  jenis: z.nativeEnum(TransaksiJenis, { error: 'Jenis harus MASUK atau KELUAR' }),
  kategori_id: z.string().min(1, 'Kategori wajib dipilih'),
  deskripsi: z.string().min(1, 'Deskripsi wajib diisi').max(255),
  jumlah: z.number().int('Jumlah harus bilangan bulat').positive('Jumlah harus lebih dari 0'),
  rekening_id: z.string().min(1, 'Rekening wajib dipilih'),
  void_original: z.boolean().default(false),
});

// ============================================================
// Rekonsiliasi
// ============================================================

export const rekonsiliasiCreateSchema = z.object({
  rekening_id: z.string().min(1, 'Rekening wajib dipilih'),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD'),
  saldo_bank: z.number().int('Saldo harus bilangan bulat').min(0, 'Saldo tidak boleh negatif'),
  catatan: z.string().max(255).default(''),
});
