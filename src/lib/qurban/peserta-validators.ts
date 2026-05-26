import { isValidTipePembelian, type ValidationResult, type ValidationError } from './validators';
import type { TipeQurban } from './peserta-types';

/**
 * Pure validators for `qurban_peserta` write endpoints (PS2 create, PS4 patch,
 * PS5 cancel). Side-effect-free — mirror the `validators.ts` ValidationResult
 * contract so route handlers map `errors[0]` → 422.
 */

export const STATUS_PENDAFTARAN = ['TERDAFTAR', 'BATAL'] as const;
export const SUMBER_PENDAFTARAN = ['PUBLIK', 'PANITIA', 'IMPORT_1447H'] as const;

export function isValidStatusPendaftaran(v: string): boolean {
  return (STATUS_PENDAFTARAN as readonly string[]).includes(v);
}
export function isValidSumberPendaftaran(v: string): boolean {
  return (SUMBER_PENDAFTARAN as readonly string[]).includes(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function nonEmptyString(v: unknown): string | null {
  if (!isString(v)) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export interface PesertaCreateInput {
  muqorib_id: string;
  master_hewan_id: string;
  tipe_qurban: TipeQurban;
  jumlah_slot: number;
  /** Length === jumlah_slot. `''` (kosong) berarti pakai nama muqorib. */
  nama_atas_nama_per_slot: string[];
  keterangan_bagian: string;
  allow_additional_qurban: boolean;
}

/** Validate PS2 create payload (multi-slot). */
export function validatePesertaCreate(
  input: unknown
): ValidationResult<PesertaCreateInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  const muqorib_id = nonEmptyString(raw.muqorib_id);
  if (muqorib_id === null) {
    errors.push({ field: 'muqorib_id', message: 'muqorib_id wajib diisi.' });
  }

  const master_hewan_id = nonEmptyString(raw.master_hewan_id);
  if (master_hewan_id === null) {
    errors.push({ field: 'master_hewan_id', message: 'master_hewan_id wajib diisi.' });
  }

  let tipe: TipeQurban | null = null;
  if (!isString(raw.tipe_qurban) || !isValidTipePembelian(raw.tipe_qurban)) {
    errors.push({ field: 'tipe_qurban', message: 'tipe_qurban tidak valid (BELI | BAWA_SENDIRI).' });
  } else {
    tipe = raw.tipe_qurban as TipeQurban;
  }

  if (!isPositiveInt(raw.jumlah_slot)) {
    errors.push({ field: 'jumlah_slot', message: 'jumlah_slot harus bilangan bulat > 0.' });
  }
  const jumlah_slot = isPositiveInt(raw.jumlah_slot) ? raw.jumlah_slot : 0;

  // nama_atas_nama_per_slot: optional; default ke array kosong sepanjang slot.
  // Tiap entri null/'' → '' (pakai nama muqorib). Panjang harus = jumlah_slot.
  let nama_atas_nama_per_slot: string[] = [];
  if (raw.nama_atas_nama_per_slot === undefined || raw.nama_atas_nama_per_slot === null) {
    nama_atas_nama_per_slot = new Array(jumlah_slot).fill('');
  } else if (!Array.isArray(raw.nama_atas_nama_per_slot)) {
    errors.push({
      field: 'nama_atas_nama_per_slot',
      message: 'nama_atas_nama_per_slot harus berupa array.',
    });
  } else {
    const arr = raw.nama_atas_nama_per_slot;
    if (jumlah_slot > 0 && arr.length !== jumlah_slot) {
      errors.push({
        field: 'nama_atas_nama_per_slot',
        message: `nama_atas_nama_per_slot harus berisi ${jumlah_slot} entri (sesuai jumlah_slot).`,
      });
    } else if (!arr.every((x) => x === null || x === undefined || isString(x))) {
      errors.push({
        field: 'nama_atas_nama_per_slot',
        message: 'Tiap entri nama_atas_nama_per_slot harus string atau null.',
      });
    } else {
      nama_atas_nama_per_slot = arr.map((x) => (isString(x) ? x.trim() : ''));
    }
  }

  let keterangan_bagian = '';
  if (raw.keterangan_bagian !== undefined && raw.keterangan_bagian !== null) {
    if (!isString(raw.keterangan_bagian)) {
      errors.push({ field: 'keterangan_bagian', message: 'keterangan_bagian harus berupa string.' });
    } else {
      keterangan_bagian = raw.keterangan_bagian.trim();
    }
  }

  let allow_additional_qurban = false;
  if (raw.allow_additional_qurban !== undefined && raw.allow_additional_qurban !== null) {
    if (typeof raw.allow_additional_qurban !== 'boolean') {
      errors.push({ field: 'allow_additional_qurban', message: 'allow_additional_qurban harus boolean.' });
    } else {
      allow_additional_qurban = raw.allow_additional_qurban;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      muqorib_id: muqorib_id as string,
      master_hewan_id: master_hewan_id as string,
      tipe_qurban: tipe as TipeQurban,
      jumlah_slot,
      nama_atas_nama_per_slot,
      keterangan_bagian,
      allow_additional_qurban,
    },
  };
}

export interface PesertaPatchInput {
  nama_atas_nama?: string;
  keterangan_bagian?: string;
  notes?: string;
}

const PESERTA_PATCHABLE = ['nama_atas_nama', 'keterangan_bagian', 'notes'] as const;

/** Field yang TIDAK boleh di-PATCH lewat PS4 (ditolak bila dikirim). */
const PESERTA_IMMUTABLE = [
  'id', 'edisi_id', 'muqorib_id', 'hewan_id', 'slot_number', 'tipe_qurban',
  'harga_disepakati', 'kode_bayar', 'sumber_pendaftaran', 'status_pendaftaran',
  'tanggal_daftar', 'created_at', 'updated_at', 'created_by',
] as const;

/** Validate PS4 patch — hanya nama_atas_nama / keterangan_bagian / notes. */
export function validatePesertaPatch(
  input: unknown
): ValidationResult<PesertaPatchInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    errors.push({ field: '_', message: 'Body wajib berupa object.' });
    return { ok: false, errors };
  }
  const raw = input as Record<string, unknown>;

  for (const immutable of PESERTA_IMMUTABLE) {
    if (raw[immutable] !== undefined) {
      errors.push({ field: immutable, message: `${immutable} tidak dapat diubah lewat endpoint ini.` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const present = PESERTA_PATCHABLE.filter((f) => raw[f] !== undefined);
  if (present.length === 0) {
    errors.push({ field: '_', message: 'Minimal satu field wajib diberikan untuk update.' });
    return { ok: false, errors };
  }

  const value: PesertaPatchInput = {};
  for (const field of present) {
    const v = raw[field];
    if (v !== null && !isString(v)) {
      errors.push({ field, message: `${field} harus berupa string.` });
      continue;
    }
    const str = v === null ? '' : (v as string);
    value[field] = field === 'notes' ? str : str.trim();
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value };
}

export interface PesertaCancelInput {
  alasan: string;
  refund_handling: string;
}

/** Validate PS5 cancel payload. `alasan` & `refund_handling` opsional (string). */
export function validatePesertaCancel(
  input: unknown
): ValidationResult<PesertaCancelInput> {
  const errors: ValidationError[] = [];
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  let alasan = '';
  if (raw.alasan !== undefined && raw.alasan !== null) {
    if (!isString(raw.alasan)) {
      errors.push({ field: 'alasan', message: 'alasan harus berupa string.' });
    } else {
      alasan = raw.alasan.trim();
    }
  }

  let refund_handling = '';
  if (raw.refund_handling !== undefined && raw.refund_handling !== null) {
    if (!isString(raw.refund_handling)) {
      errors.push({ field: 'refund_handling', message: 'refund_handling harus berupa string.' });
    } else {
      refund_handling = raw.refund_handling.trim();
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { alasan, refund_handling } };
}
