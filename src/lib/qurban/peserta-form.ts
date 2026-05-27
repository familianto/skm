import type { MasterHewan } from './master-hewan-display';
import type { TipeQurban } from './peserta-types';

/**
 * Pure, dependency-free logic for the F4c-B panitia registration form
 * (`/qurban/peserta/baru`). No server imports (the `MasterHewan` import is
 * type-only) so it runs in the client form and in unit tests.
 *
 * Pricing mirrors the server formula in `peserta-pricing.ts`
 * (`harga_penuh ÷ kapasitas_slot`, rounded). The preview here is advisory only
 * — PS2 (create) re-derives and FREEZES `harga_disepakati` server-side, which
 * stays authoritative. Kept in sync deliberately; both cite HANDOFF_TAHAP_2 §4.4.
 */

export const TIPE_QURBAN_OPTIONS: { value: TipeQurban; label: string }[] = [
  { value: 'BELI', label: 'Beli' },
  { value: 'BAWA_SENDIRI', label: 'Bawa Sendiri' },
];

// ── Pricing preview ────────────────────────────────────────────────────────

/** Harga 1 ekor penuh untuk tipe terpilih (mirror `selectHargaPenuh`). */
export function hargaPenuhForTipe(
  master: Pick<MasterHewan, 'harga_beli' | 'harga_bawa_sendiri'>,
  tipe: TipeQurban
): number {
  return tipe === 'BELI' ? master.harga_beli : master.harga_bawa_sendiri;
}

/** Harga per-slot = harga_penuh / kapasitas_slot, integer Rupiah (mirror server). */
export function hargaPerSlot(hargaPenuh: number, kapasitasSlot: number): number {
  if (!Number.isFinite(kapasitasSlot) || kapasitasSlot <= 0) return 0;
  return Math.round(hargaPenuh / kapasitasSlot);
}

export interface HargaPreview {
  per_slot: number;
  total: number;
}

/** Per-slot harga × jumlah slot for the Bagian 1 / Bagian 4 summary. */
export function computeHargaPreview(
  master: Pick<MasterHewan, 'harga_beli' | 'harga_bawa_sendiri' | 'kapasitas_slot'> | null,
  tipe: TipeQurban | '',
  jumlahSlot: number
): HargaPreview {
  if (!master || !tipe) return { per_slot: 0, total: 0 };
  const perSlot = hargaPerSlot(hargaPenuhForTipe(master, tipe), master.kapasitas_slot);
  const slots = Number.isFinite(jumlahSlot) && jumlahSlot > 0 ? jumlahSlot : 0;
  return { per_slot: perSlot, total: perSlot * slots };
}

// ── Hewan option transforms ──────────────────────────────────────────────────

/** Distinct jenis present among the (active) master hewan, sorted. */
export function jenisOptions(masters: MasterHewan[]): string[] {
  return Array.from(new Set(masters.map((m) => m.jenis))).sort();
}

/** Masters of a given jenis, sorted by kelas — the kelas dropdown source. */
export function kelasOptionsForJenis(masters: MasterHewan[], jenis: string): MasterHewan[] {
  return masters
    .filter((m) => m.jenis === jenis)
    .sort((a, b) => (a.kelas < b.kelas ? -1 : a.kelas > b.kelas ? 1 : 0));
}

/** Resolve the single master for a (jenis, kelas) pair — unique per edisi (F03). */
export function findMaster(
  masters: MasterHewan[],
  jenis: string,
  kelas: string
): MasterHewan | undefined {
  return masters.find((m) => m.jenis === jenis && m.kelas === kelas);
}

// ── Duplicate classification (B2) ────────────────────────────────────────────

/**
 * `terdaftar` → muqorib already has a TERDAFTAR registration (banner + blocking
 * modal). `batal_only` → only cancelled history (info-only banner). `none` →
 * silent.
 */
export type DuplicateKind = 'none' | 'terdaftar' | 'batal_only';

export function classifyDuplicate(terdaftarCount: number, batalCount: number): DuplicateKind {
  if (terdaftarCount > 0) return 'terdaftar';
  if (batalCount > 0) return 'batal_only';
  return 'none';
}

// ── Form validation (pure) ───────────────────────────────────────────────────

export interface PesertaFormValidationInput {
  /** Resolved master id for (jenis, kelas) — '' when nothing valid is picked. */
  masterHewanId: string;
  tipe: TipeQurban | '';
  jumlahSlot: number;
  /** Available slots reported by PS8 for the chosen master+tipe. */
  availableSlots: number;
  /** Selected existing muqorib id, or '' (new-muqorib path resolves later). */
  muqoribId: string;
  /** True when the user is on the "buat muqorib baru" path. */
  creatingMuqorib: boolean;
  confirmed: boolean;
}

export interface FormError {
  field: string;
  message: string;
}

/** Pre-submit gate for the peserta form. Empty array = ready to submit. */
export function validatePesertaForm(input: PesertaFormValidationInput): FormError[] {
  const errors: FormError[] = [];

  if (!input.masterHewanId || !input.tipe) {
    errors.push({ field: 'hewan', message: 'Pilih jenis, kelas, dan tipe hewan.' });
  }

  if (!Number.isInteger(input.jumlahSlot) || input.jumlahSlot < 1) {
    errors.push({ field: 'jumlah_slot', message: 'Jumlah slot minimal 1.' });
  } else if (input.availableSlots <= 0) {
    errors.push({
      field: 'jumlah_slot',
      message: 'Tidak ada slot tersedia untuk kombinasi ini.',
    });
  } else if (input.jumlahSlot > input.availableSlots) {
    errors.push({
      field: 'jumlah_slot',
      message: `Hanya ${input.availableSlots} slot tersedia.`,
    });
  }

  // On the existing path a muqorib must be selected; the new path validates its
  // own fields separately (and resolves the id at submit time).
  if (!input.creatingMuqorib && !input.muqoribId) {
    errors.push({ field: 'muqorib', message: 'Pilih atau buat muqorib.' });
  }

  if (!input.confirmed) {
    errors.push({ field: 'confirm', message: 'Centang konfirmasi sebelum menyimpan.' });
  }

  return errors;
}

/** Build the `nama_atas_nama_per_slot` array PS2 expects (length = jumlahSlot). */
export function buildNamaAtasNamaPerSlot(atasNama: string, jumlahSlot: number): string[] {
  const v = atasNama.trim();
  return new Array(Math.max(0, jumlahSlot)).fill(v);
}
