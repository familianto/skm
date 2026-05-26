import { maskNama } from './publik-masking';
import type { QurbanPeserta } from './peserta-types';

/**
 * Pure shaping for PB4 cek-status (F4b B2). One peserta slot → one public-safe
 * status entry. The muqorib name is masked (`maskNama`); `no_hp` is NEVER
 * included in the public status response.
 */

export interface CekStatusEntry {
  kode_bayar: string;
  nama: string; // masked
  tipe_qurban: string;
  hewan_id: string;
  slot_number: number;
  harga_disepakati: number;
  status_pendaftaran: string;
}

export function buildCekStatusEntry(
  peserta: QurbanPeserta,
  namaMuqorib: string
): CekStatusEntry {
  return {
    kode_bayar: peserta.kode_bayar,
    nama: maskNama(namaMuqorib || peserta.nama_atas_nama || ''),
    tipe_qurban: peserta.tipe_qurban,
    hewan_id: peserta.hewan_id,
    slot_number: peserta.slot_number,
    harga_disepakati: peserta.harga_disepakati,
    status_pendaftaran: peserta.status_pendaftaran,
  };
}
