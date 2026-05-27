/**
 * Pure validators for Qurban resources.
 *
 * Side-effect-free predicates extracted from the route handlers so they can
 * be unit-tested in isolation (no Sheets I/O, no `next/headers`). Route
 * handlers import these to enforce the same invariants the tests cover.
 */

import { UserPeran } from '@/types';
import { jaroWinkler } from './jaro-winkler';

/**
 * Peran yang boleh ditugaskan sebagai panitia.
 *
 * BENDAHARA secara eksplisit dikecualikan — peran SKM-only tidak terlibat
 * dalam operasional Qurban. Diekspos sebagai readonly array supaya route
 * handler dapat menyertakannya di `details.allowed_peran` saat menolak.
 */
export const ALLOWED_PANITIA_PERAN: readonly string[] = [
  UserPeran.SUPER_ADMIN,
  UserPeran.ADMIN_QURBAN,
  UserPeran.PENDAFTARAN,
  UserPeran.DISTRIBUSI,
];

export function isAllowedPanitiaPeran(peran: string): boolean {
  return ALLOWED_PANITIA_PERAN.includes(peran);
}

/**
 * Distribusi date range — start must be ≤ end when both are provided.
 *
 * Either side empty is treated as "not yet set" and returns `true` so the
 * UI/route accepts partial saves while the user is still filling the form.
 * The route's cross-field check runs on the MERGED row, so a missing field
 * only matters after merge.
 */
export function isValidDistribusiDateRange(start: string, end: string): boolean {
  if (!start || !end) return true;
  return start <= end;
}

/** `payment_suffix` is an integer in 0–9 inclusive. */
export function isValidPaymentSuffix(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 9;
}

// ---------------------------------------------------------------------------
// F03 — Master Qurban (Muqorib + Master Hewan) primitives.
// ---------------------------------------------------------------------------

/** RT yang valid untuk muqorib (lingkup masjid). */
export const RT_VALUES = ['001', '002', '003', '004', '005', '006', 'Lainnya'] as const;

/** Jenis hewan qurban yang didukung. */
export const JENIS_HEWAN = ['SAPI', 'KAMBING'] as const;

/**
 * Kapasitas slot per jenis hewan — KONSTANTA fiqh qurban, bukan bebas-input.
 *
 * Kambing = 1 (perseorangan); Sapi = 7 (patungan). Inilah satu-satunya sumber
 * kebenaran untuk kapasitas slot: form menurunkan & mengunci nilai dari sini,
 * dan guard backend menolak nilai yang tidak cocok. Untuk menambah jenis baru
 * nanti, cukup tambahkan satu baris (mis. `DOMBA: 1`, `KERBAU: 7`).
 */
export const KAPASITAS_SLOT_BY_JENIS: Readonly<Record<string, number>> = {
  KAMBING: 1,
  SAPI: 7,
};

/** Kapasitas slot baku untuk `jenis`, atau `undefined` bila jenis tak dikenal. */
export function kapasitasSlotForJenis(jenis: string): number | undefined {
  return KAPASITAS_SLOT_BY_JENIS[jenis];
}

/** `true` bila `kapasitas` cocok dengan kapasitas baku untuk `jenis`. */
export function isKapasitasSlotValidForJenis(jenis: string, kapasitas: number): boolean {
  const expected = KAPASITAS_SLOT_BY_JENIS[jenis];
  return expected !== undefined && kapasitas === expected;
}

/** Kelas/tier hewan qurban (membedakan bobot/harga di dalam satu jenis). */
export const KELAS_HEWAN = ['A', 'B', 'C', 'D'] as const;

/**
 * Normalisasi nomor telepon ke format `628xxxxxxxxxx`.
 *
 * - Buang semua karakter non-digit.
 * - `0xxx` → `62xxx`.
 * - `8xxx` → `628xxx`.
 * - `62xxx` → biarkan.
 * - Selain itu → kembalikan apa adanya (biarkan `isValidNoHp` yang menolak).
 * - String kosong → `''`.
 */
export function normalizeNoHp(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

/** `true` kalau cocok pola nomor seluler Indonesia ter-normalisasi. */
export function isValidNoHp(value: string): boolean {
  return /^628\d{7,12}$/.test(value);
}

export function isValidRt(value: string): boolean {
  return (RT_VALUES as readonly string[]).includes(value);
}

export function isValidJenisHewan(value: string): boolean {
  return (JENIS_HEWAN as readonly string[]).includes(value);
}

export function isValidKelasHewan(value: string): boolean {
  return (KELAS_HEWAN as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Muqorib — composite payload validators.
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  errors: ValidationError[];
  /** Normalized values (no_hp normalized, strings trimmed). Only set when `ok`. */
  value?: T;
}

export interface MuqoribCreateInput {
  nama_lengkap: string;
  alamat: string;
  rt: string;
  no_hp: string;
  notes?: string;
}

export type MuqoribPatchInput = Partial<MuqoribCreateInput>;

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function nonEmptyString(v: unknown): string | null {
  if (!isString(v)) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateField(
  errors: ValidationError[],
  field: string,
  raw: unknown,
  out: Record<string, string>
): void {
  if (field === 'nama_lengkap' || field === 'alamat') {
    const v = nonEmptyString(raw);
    if (v === null) {
      errors.push({ field, message: `${field} wajib diisi.` });
      return;
    }
    out[field] = v;
    return;
  }
  if (field === 'rt') {
    if (!isString(raw)) {
      errors.push({ field, message: 'rt wajib diisi.' });
      return;
    }
    if (!isValidRt(raw)) {
      errors.push({ field, message: 'rt tidak valid.' });
      return;
    }
    out.rt = raw;
    return;
  }
  if (field === 'no_hp') {
    if (!isString(raw)) {
      errors.push({ field, message: 'no_hp wajib diisi.' });
      return;
    }
    const normalized = normalizeNoHp(raw);
    if (!isValidNoHp(normalized)) {
      errors.push({ field, message: 'no_hp tidak valid (format: 628xxxxxxxxxx).' });
      return;
    }
    out.no_hp = normalized;
    return;
  }
  if (field === 'notes') {
    if (raw === undefined || raw === null) {
      out.notes = '';
      return;
    }
    if (!isString(raw)) {
      errors.push({ field, message: 'notes harus berupa string.' });
      return;
    }
    out.notes = raw;
    return;
  }
}

/**
 * Validate the create payload for `POST /api/qurban/muqorib`.
 *
 * Returns the normalized values (with `no_hp` already in `628...` form and
 * trimmed strings) so the route handler doesn't have to re-do normalization.
 */
export function validateMuqoribCreate(
  input: unknown
): ValidationResult<MuqoribCreateInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of ['nama_lengkap', 'alamat', 'rt', 'no_hp', 'notes'] as const) {
    if (field === 'notes' && raw[field] === undefined) {
      out.notes = '';
      continue;
    }
    if (raw[field] === undefined) {
      errors.push({ field, message: `${field} wajib diisi.` });
      continue;
    }
    validateField(errors, field, raw[field], out);
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      nama_lengkap: out.nama_lengkap,
      alamat: out.alamat,
      rt: out.rt,
      no_hp: out.no_hp,
      notes: out.notes,
    },
  };
}

const PATCHABLE_FIELDS = ['nama_lengkap', 'alamat', 'rt', 'no_hp', 'notes'] as const;

/**
 * Validate the patch payload for `PATCH /api/qurban/muqorib/[id]`.
 *
 * Requires at least one patchable field; validates only the fields actually
 * present. Returns the normalized subset.
 */
export function validateMuqoribPatch(
  input: unknown
): ValidationResult<MuqoribPatchInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;
  const present = PATCHABLE_FIELDS.filter((f) => raw[f] !== undefined);
  if (present.length === 0) {
    errors.push({ field: '_', message: 'Minimal satu field wajib diberikan untuk update.' });
    return { ok: false, errors };
  }
  const out: Record<string, string> = {};
  for (const field of present) {
    validateField(errors, field, raw[field], out);
  }
  if (errors.length > 0) return { ok: false, errors };
  const value: MuqoribPatchInput = {};
  for (const field of present) {
    (value as Record<string, string>)[field] = out[field];
  }
  return { ok: true, errors: [], value };
}

// ---------------------------------------------------------------------------
// Muqorib smart-lookup (M7) — phone masking + scoring.
// ---------------------------------------------------------------------------

/**
 * Mask a phone number for autocomplete responses. `6281234567890` →
 * `628****7890`. Numbers shorter than 7 chars are fully masked.
 */
export function maskNoHp(s: string): string {
  if (s.length >= 7) {
    return s.slice(0, 3) + '****' + s.slice(-4);
  }
  return '*'.repeat(s.length);
}

/** Minimal shape `scoreLookupCandidate` needs from a muqorib row. */
export interface LookupCandidate {
  nama_lengkap: string;
  no_hp: string;
  alamat: string;
  rt: string;
}

/**
 * Pure scoring for M7. `q` is the RAW query (digits extracted internally for
 * the phone boost); `qn` is the pre-normalized `q.trim().toLowerCase()`.
 *
 * Base name score (exact 1.0 / substring 0.85 / else Jaro-Winkler), plus a
 * +0.2 phone last-4 boost and a +0.05 address/RT boost, capped at 1.0.
 */
export function scoreLookupCandidate(
  q: string,
  qn: string,
  candidate: LookupCandidate
): number {
  const nameL = candidate.nama_lengkap.trim().toLowerCase();

  let base: number;
  if (nameL === qn) base = 1.0;
  else if (qn.length > 0 && nameL.includes(qn)) base = 0.85;
  else base = jaroWinkler(qn, nameL);

  let score = base;

  // Phone last-4 boost.
  const digits = q.replace(/\D+/g, '');
  if (digits.length >= 4) {
    const hpDigits = candidate.no_hp.replace(/\D+/g, '');
    if (hpDigits.length >= 4 && digits.slice(-4) === hpDigits.slice(-4)) {
      score += 0.2;
    }
  }

  // Address / RT boost.
  if (
    qn.length >= 3 &&
    (candidate.alamat.toLowerCase().includes(qn) ||
      qn === candidate.rt.toLowerCase())
  ) {
    score += 0.05;
  }

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Master Hewan — composite payload validators.
// ---------------------------------------------------------------------------

export interface MasterHewanCreateInput {
  jenis: string;
  kelas: string;
  kapasitas_slot: number;
  harga_beli: number;
  harga_bawa_sendiri: number;
}

export interface MasterHewanPatchInput {
  kapasitas_slot?: number;
  harga_beli?: number;
  harga_bawa_sendiri?: number;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function validateMasterHewanNumericField(
  errors: ValidationError[],
  field: 'kapasitas_slot' | 'harga_beli' | 'harga_bawa_sendiri',
  raw: unknown,
  out: Record<string, number>
): void {
  if (field === 'kapasitas_slot') {
    if (!isPositiveInt(raw)) {
      errors.push({ field, message: 'kapasitas_slot harus bilangan bulat > 0.' });
      return;
    }
    out.kapasitas_slot = raw;
    return;
  }
  // harga_beli | harga_bawa_sendiri
  if (!isNonNegativeNumber(raw)) {
    errors.push({ field, message: `${field} harus angka ≥ 0.` });
    return;
  }
  out[field] = raw;
}

export function validateMasterHewanCreate(
  input: unknown
): ValidationResult<MasterHewanCreateInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  const strOut: Record<string, string> = {};
  if (!isString(raw.jenis) || !isValidJenisHewan(raw.jenis)) {
    errors.push({ field: 'jenis', message: 'jenis tidak valid (SAPI | KAMBING).' });
  } else {
    strOut.jenis = raw.jenis;
  }
  if (!isString(raw.kelas) || !isValidKelasHewan(raw.kelas)) {
    errors.push({ field: 'kelas', message: 'kelas tidak valid (A | B | C | D).' });
  } else {
    strOut.kelas = raw.kelas;
  }

  const numOut: Record<string, number> = {};
  for (const field of ['kapasitas_slot', 'harga_beli', 'harga_bawa_sendiri'] as const) {
    validateMasterHewanNumericField(errors, field, raw[field], numOut);
  }

  // Kapasitas slot dikunci ke jenis (Kambing 1, Sapi 7) — tolak yang tidak cocok.
  // Hanya cek silang saat jenis & kapasitas masing-masing sudah valid.
  if (strOut.jenis !== undefined && numOut.kapasitas_slot !== undefined) {
    const expected = kapasitasSlotForJenis(strOut.jenis);
    if (expected !== undefined && numOut.kapasitas_slot !== expected) {
      errors.push({
        field: 'kapasitas_slot',
        message: `kapasitas_slot untuk ${strOut.jenis} harus ${expected}.`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      jenis: strOut.jenis,
      kelas: strOut.kelas,
      kapasitas_slot: numOut.kapasitas_slot,
      harga_beli: numOut.harga_beli,
      harga_bawa_sendiri: numOut.harga_bawa_sendiri,
    },
  };
}

const MASTER_HEWAN_PATCHABLE = [
  'kapasitas_slot',
  'harga_beli',
  'harga_bawa_sendiri',
] as const;

export function validateMasterHewanPatch(
  input: unknown
): ValidationResult<MasterHewanPatchInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  // jenis/kelas are immutable — reject if present at all.
  for (const immutable of ['jenis', 'kelas'] as const) {
    if (raw[immutable] !== undefined) {
      errors.push({ field: immutable, message: `${immutable} tidak dapat diubah.` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const present = MASTER_HEWAN_PATCHABLE.filter((f) => raw[f] !== undefined);
  if (present.length === 0) {
    errors.push({ field: '_', message: 'Minimal satu field wajib diberikan untuk update.' });
    return { ok: false, errors };
  }

  const numOut: Record<string, number> = {};
  for (const field of present) {
    validateMasterHewanNumericField(errors, field, raw[field], numOut);
  }
  if (errors.length > 0) return { ok: false, errors };

  const value: MasterHewanPatchInput = {};
  for (const field of present) {
    (value as Record<string, number>)[field] = numOut[field];
  }
  return { ok: true, errors: [], value };
}

// ---------------------------------------------------------------------------
// Daftar Hewan (F5a) — inventaris fisik per-ekor. Payload validators.
// ---------------------------------------------------------------------------

export const TIPE_PEMBELIAN = ['BELI', 'BAWA_SENDIRI'] as const;
/** Status yang boleh dikirim operator saat CREATE (DRAFT/AKTIF saja). */
export const STATUS_HEWAN_CREATABLE = ['DRAFT', 'AKTIF'] as const;
/** Status target yang sah untuk batch-status (H6). */
export const STATUS_HEWAN_TARGET = ['AKTIF', 'TERPOTONG', 'BATAL'] as const;

export function isValidTipePembelian(value: string): boolean {
  return (TIPE_PEMBELIAN as readonly string[]).includes(value);
}

/** Strict `YYYY-MM-DD` calendar date. */
export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map((p) => parseInt(p, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export interface DaftarHewanCreateInput {
  master_hewan_id: string;
  tipe_pembelian: 'BELI' | 'BAWA_SENDIRI';
  vendor_nama: string;
  harga_beli_aktual: number;
  tanggal_pembelian: string;
  notes: string;
  status: 'DRAFT' | 'AKTIF';
}

export function validateDaftarHewanCreate(
  input: unknown
): ValidationResult<DaftarHewanCreateInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  const master_hewan_id = nonEmptyString(raw.master_hewan_id);
  if (master_hewan_id === null) {
    errors.push({ field: 'master_hewan_id', message: 'master_hewan_id wajib diisi.' });
  }

  let tipe: 'BELI' | 'BAWA_SENDIRI' | null = null;
  if (!isString(raw.tipe_pembelian) || !isValidTipePembelian(raw.tipe_pembelian)) {
    errors.push({
      field: 'tipe_pembelian',
      message: 'tipe_pembelian tidak valid (BELI | BAWA_SENDIRI).',
    });
  } else {
    tipe = raw.tipe_pembelian as 'BELI' | 'BAWA_SENDIRI';
  }

  let vendor_nama = '';
  if (raw.vendor_nama !== undefined && raw.vendor_nama !== null) {
    if (!isString(raw.vendor_nama)) {
      errors.push({ field: 'vendor_nama', message: 'vendor_nama harus berupa string.' });
    } else {
      vendor_nama = raw.vendor_nama.trim();
    }
  }

  let harga_beli_aktual = 0;
  if (raw.harga_beli_aktual !== undefined && raw.harga_beli_aktual !== null) {
    if (!isNonNegativeNumber(raw.harga_beli_aktual)) {
      errors.push({ field: 'harga_beli_aktual', message: 'harga_beli_aktual harus angka ≥ 0.' });
    } else {
      harga_beli_aktual = raw.harga_beli_aktual;
    }
  }

  let tanggal_pembelian = '';
  if (raw.tanggal_pembelian !== undefined && raw.tanggal_pembelian !== null && raw.tanggal_pembelian !== '') {
    if (!isString(raw.tanggal_pembelian) || !isValidYmd(raw.tanggal_pembelian)) {
      errors.push({ field: 'tanggal_pembelian', message: 'tanggal_pembelian harus format YYYY-MM-DD.' });
    } else {
      tanggal_pembelian = raw.tanggal_pembelian;
    }
  }

  let notes = '';
  if (raw.notes !== undefined && raw.notes !== null) {
    if (!isString(raw.notes)) {
      errors.push({ field: 'notes', message: 'notes harus berupa string.' });
    } else {
      notes = raw.notes;
    }
  }

  let status: 'DRAFT' | 'AKTIF' = 'AKTIF';
  if (raw.status !== undefined && raw.status !== null && raw.status !== '') {
    if (!isString(raw.status) || !(STATUS_HEWAN_CREATABLE as readonly string[]).includes(raw.status)) {
      errors.push({ field: 'status', message: 'status saat create hanya boleh DRAFT atau AKTIF.' });
    } else {
      status = raw.status as 'DRAFT' | 'AKTIF';
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      master_hewan_id: master_hewan_id as string,
      tipe_pembelian: tipe as 'BELI' | 'BAWA_SENDIRI',
      vendor_nama,
      harga_beli_aktual,
      tanggal_pembelian,
      notes,
      status,
    },
  };
}

export interface DaftarHewanPatchInput {
  vendor_nama?: string;
  harga_beli_aktual?: number;
  tanggal_pembelian?: string;
  notes?: string;
}

const DAFTAR_HEWAN_PATCHABLE = [
  'vendor_nama',
  'harga_beli_aktual',
  'tanggal_pembelian',
  'notes',
] as const;

/** Field yang TIDAK boleh di-PATCH lewat H4 (ditolak bila dikirim). */
const DAFTAR_HEWAN_IMMUTABLE = [
  'id',
  'edisi_id',
  'master_hewan_id',
  'jenis',
  'kelas',
  'kapasitas_slot',
  'nomor_urut',
  'tipe_pembelian',
  'status',
  'nomor_urut_pemotongan',
  'created_at',
  'updated_at',
  'created_by',
] as const;

export function validateDaftarHewanPatch(
  input: unknown
): ValidationResult<DaftarHewanPatchInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  for (const immutable of DAFTAR_HEWAN_IMMUTABLE) {
    if (raw[immutable] !== undefined) {
      errors.push({ field: immutable, message: `${immutable} tidak dapat diubah lewat endpoint ini.` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const present = DAFTAR_HEWAN_PATCHABLE.filter((f) => raw[f] !== undefined);
  if (present.length === 0) {
    errors.push({ field: '_', message: 'Minimal satu field wajib diberikan untuk update.' });
    return { ok: false, errors };
  }

  const value: DaftarHewanPatchInput = {};
  for (const field of present) {
    const v = raw[field];
    if (field === 'harga_beli_aktual') {
      if (!isNonNegativeNumber(v)) {
        errors.push({ field, message: 'harga_beli_aktual harus angka ≥ 0.' });
        continue;
      }
      value.harga_beli_aktual = v;
    } else if (field === 'tanggal_pembelian') {
      if (v === '' || v === null) {
        value.tanggal_pembelian = '';
      } else if (!isString(v) || !isValidYmd(v)) {
        errors.push({ field, message: 'tanggal_pembelian harus format YYYY-MM-DD.' });
        continue;
      } else {
        value.tanggal_pembelian = v;
      }
    } else {
      // vendor_nama | notes
      if (v !== null && !isString(v)) {
        errors.push({ field, message: `${field} harus berupa string.` });
        continue;
      }
      value[field] = v === null ? '' : (field === 'vendor_nama' ? (v as string).trim() : (v as string));
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value };
}

export interface ReorderInput {
  jenis: string;
  kelas: string;
  ordered_hewan_ids: string[];
}

export function validateReorderPayload(
  input: unknown
): ValidationResult<ReorderInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  if (!isString(raw.jenis) || !isValidJenisHewan(raw.jenis)) {
    errors.push({ field: 'jenis', message: 'jenis tidak valid (SAPI | KAMBING).' });
  }
  if (!isString(raw.kelas) || !isValidKelasHewan(raw.kelas)) {
    errors.push({ field: 'kelas', message: 'kelas tidak valid (A | B | C | D).' });
  }
  if (
    !Array.isArray(raw.ordered_hewan_ids) ||
    raw.ordered_hewan_ids.length === 0 ||
    !raw.ordered_hewan_ids.every((x) => isString(x) && x.trim().length > 0)
  ) {
    errors.push({
      field: 'ordered_hewan_ids',
      message: 'ordered_hewan_ids wajib berupa array id tidak kosong.',
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      jenis: raw.jenis as string,
      kelas: raw.kelas as string,
      ordered_hewan_ids: raw.ordered_hewan_ids as string[],
    },
  };
}

export interface BatchStatusInput {
  hewan_ids: string[];
  target_status: 'AKTIF' | 'TERPOTONG' | 'BATAL';
  tanggal_pemotongan: string;
  notes: string;
}

export function validateBatchStatusPayload(
  input: unknown
): ValidationResult<BatchStatusInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  if (
    !Array.isArray(raw.hewan_ids) ||
    raw.hewan_ids.length === 0 ||
    !raw.hewan_ids.every((x) => isString(x) && x.trim().length > 0)
  ) {
    errors.push({ field: 'hewan_ids', message: 'hewan_ids wajib berupa array id tidak kosong.' });
  }

  let target: 'AKTIF' | 'TERPOTONG' | 'BATAL' | null = null;
  if (!isString(raw.target_status) || !(STATUS_HEWAN_TARGET as readonly string[]).includes(raw.target_status)) {
    errors.push({
      field: 'target_status',
      message: 'target_status tidak valid (AKTIF | TERPOTONG | BATAL).',
    });
  } else {
    target = raw.target_status as 'AKTIF' | 'TERPOTONG' | 'BATAL';
  }

  let tanggal_pemotongan = '';
  if (target === 'TERPOTONG') {
    if (!isString(raw.tanggal_pemotongan) || !isValidYmd(raw.tanggal_pemotongan)) {
      errors.push({
        field: 'tanggal_pemotongan',
        message: 'tanggal_pemotongan wajib (format YYYY-MM-DD) saat target_status TERPOTONG.',
      });
    } else {
      tanggal_pemotongan = raw.tanggal_pemotongan;
    }
  }

  let notes = '';
  if (raw.notes !== undefined && raw.notes !== null) {
    if (!isString(raw.notes)) {
      errors.push({ field: 'notes', message: 'notes harus berupa string.' });
    } else {
      notes = raw.notes;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      hewan_ids: raw.hewan_ids as string[],
      target_status: target as 'AKTIF' | 'TERPOTONG' | 'BATAL',
      tanggal_pemotongan,
      notes,
    },
  };
}