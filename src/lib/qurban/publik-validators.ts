import {
  isValidTipePembelian,
  normalizeNoHp,
  isValidNoHp,
  validateMuqoribCreate,
  type ValidationResult,
  type ValidationError,
  type MuqoribCreateInput,
} from './validators';
import type { TipeQurban } from './peserta-types';

/**
 * Pure validators for the PUBLIC qurban endpoints (F4b B2). Mirror the
 * `ValidationResult` contract from `validators.ts` so route handlers map
 * `errors[0]` → 422. Side-effect-free; `no_hp` is normalized to `628...`.
 */

/**
 * Upper bound on slots a single public submission may request. Inventory
 * availability is the real gate (PB3 rejects with INSUFFICIENT_SLOTS); this is
 * just a sanity cap on untrusted input. Panitia (PS2) is uncapped.
 */
export const MAX_PUBLIK_SLOT = 50;

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

// --- PB2 lookup -------------------------------------------------------------

export interface PublikLookupInput {
  nama_lengkap: string;
  no_hp: string; // normalized 628...
}

/** Validate PB2 lookup — both `nama_lengkap` and `no_hp` required. */
export function validatePublikLookup(input: unknown): ValidationResult<PublikLookupInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: [{ field: '_', message: 'Body wajib berupa object.' }] };
  }
  const raw = input as Record<string, unknown>;

  const nama = nonEmptyString(raw.nama_lengkap);
  if (nama === null) errors.push({ field: 'nama_lengkap', message: 'nama_lengkap wajib diisi.' });

  let no_hp = '';
  const rawHp = nonEmptyString(raw.no_hp);
  if (rawHp === null) {
    errors.push({ field: 'no_hp', message: 'no_hp wajib diisi.' });
  } else {
    no_hp = normalizeNoHp(rawHp);
    if (!isValidNoHp(no_hp)) {
      errors.push({ field: 'no_hp', message: 'no_hp tidak valid (format: 628xxxxxxxxxx).' });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { nama_lengkap: nama as string, no_hp } };
}

// --- PB3 daftar -------------------------------------------------------------

export interface PublikDaftarInput {
  /** Exactly one of these is set. */
  muqorib_id: string | null;
  muqorib_data: MuqoribCreateInput | null;
  master_hewan_id: string;
  tipe_qurban: TipeQurban;
  jumlah_slot: number;
  /** Applies to ALL slots; '' = pakai nama muqorib. */
  nama_atas_nama: string;
  keterangan_bagian: string;
}

/**
 * Validate PB3 daftar payload. The honeypot field is checked separately by the
 * route (`isHoneypotTriggered`) before this runs.
 */
export function validatePublikDaftar(input: unknown): ValidationResult<PublikDaftarInput> {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: [{ field: '_', message: 'Body wajib berupa object.' }] };
  }
  const raw = input as Record<string, unknown>;

  // Identity: exactly one of muqorib_id / muqorib_data.
  const muqoribId = nonEmptyString(raw.muqorib_id);
  const hasMuqoribData = raw.muqorib_data !== undefined && raw.muqorib_data !== null;
  let muqorib_data: MuqoribCreateInput | null = null;

  if (!muqoribId && !hasMuqoribData) {
    errors.push({ field: 'muqorib_id', message: 'Wajib mengirim muqorib_id (dari lookup) atau muqorib_data.' });
  } else if (muqoribId && hasMuqoribData) {
    errors.push({ field: 'muqorib_id', message: 'Kirim salah satu saja: muqorib_id ATAU muqorib_data.' });
  } else if (hasMuqoribData) {
    const m = validateMuqoribCreate(raw.muqorib_data);
    if (!m.ok || !m.value) {
      for (const e of m.errors) errors.push({ field: `muqorib_data.${e.field}`, message: e.message });
    } else {
      muqorib_data = m.value;
    }
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
  } else if (raw.jumlah_slot > MAX_PUBLIK_SLOT) {
    errors.push({ field: 'jumlah_slot', message: `jumlah_slot maksimal ${MAX_PUBLIK_SLOT} per pendaftaran.` });
  }
  const jumlah_slot = isPositiveInt(raw.jumlah_slot) ? raw.jumlah_slot : 0;

  let nama_atas_nama = '';
  if (raw.nama_atas_nama !== undefined && raw.nama_atas_nama !== null) {
    if (!isString(raw.nama_atas_nama)) {
      errors.push({ field: 'nama_atas_nama', message: 'nama_atas_nama harus berupa string.' });
    } else {
      nama_atas_nama = raw.nama_atas_nama.trim();
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

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      muqorib_id: muqoribId,
      muqorib_data,
      master_hewan_id: master_hewan_id as string,
      tipe_qurban: tipe as TipeQurban,
      jumlah_slot,
      nama_atas_nama,
      keterangan_bagian,
    },
  };
}
