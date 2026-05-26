import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS } from '@/lib/constants';
import { computeNominalTransfer } from './publik-nominal';

/**
 * Payment data for the public flow (F4b B2): the bank accounts the registrant
 * transfers to, plus the nominal-ber-suffix computation. WA template rendering
 * (Milestone C) consumes these; PB3 returns them in its success payload.
 */

export interface RekeningPublik {
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
}

export interface Pembayaran {
  jumlah_slot: number;
  harga_per_slot: number;
  total_harga: number;
  payment_suffix: number;
  /** total_harga + payment_suffix (last digit = suffix for round prices). */
  nominal_transfer: number;
}

/** Pure: one transfer for the whole submission; suffix added once to the total. */
export function computePembayaran(
  hargaPerSlot: number,
  jumlahSlot: number,
  paymentSuffix: number | string
): Pembayaran {
  const total_harga = hargaPerSlot * jumlahSlot;
  const suffixNum =
    typeof paymentSuffix === 'number' ? paymentSuffix : parseInt(String(paymentSuffix), 10);
  return {
    jumlah_slot: jumlahSlot,
    harga_per_slot: hargaPerSlot,
    total_harga,
    payment_suffix: Number.isFinite(suffixNum) ? suffixNum : 0,
    nominal_transfer: computeNominalTransfer(total_harga, paymentSuffix),
  };
}

/** Active bank accounts, public-safe fields only. Defensive: `[]` on failure. */
export async function listRekeningPublik(): Promise<RekeningPublik[]> {
  try {
    const rows = await sheetsService.getRows(SHEET_NAMES.REKENING_BANK);
    const headers = SHEET_HEADERS[SHEET_NAMES.REKENING_BANK];
    const col = (h: string) => headers.indexOf(h);
    const [idIdx, activeIdx, bankIdx, noIdx, anIdx] = [
      col('id'), col('is_active'), col('nama_bank'), col('nomor_rekening'), col('atas_nama'),
    ];
    return rows
      .filter((r) => r[idIdx] && String(r[activeIdx] ?? '').toUpperCase() === 'TRUE')
      .map((r) => ({
        nama_bank: String(r[bankIdx] ?? ''),
        nomor_rekening: String(r[noIdx] ?? ''),
        atas_nama: String(r[anIdx] ?? ''),
      }));
  } catch (err) {
    console.error('[publik-pembayaran.listRekeningPublik] failed:', err);
    return [];
  }
}
