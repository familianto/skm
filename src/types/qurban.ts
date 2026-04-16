export interface QurbanHewanSlot {
  slot: number;
  nama: string;
  status_bayar: string;
  tipe_qurban: string;
}

export interface QurbanHewanItem {
  id_hewan: string;
  jenis: 'Sapi' | 'Kambing';
  tipe: string;
  berat_rata2: string;
  kuota: number;
  terisi: number;
  is_penitipan: boolean;
  harga_per_orang: number;
  harga_qurban: number;
  bop_per_ekor: number;
  peserta: QurbanHewanSlot[];
}

export interface QurbanSummary {
  total_sapi: number;
  total_kambing: number;
  sapi_breakdown: Record<string, number>;
  kambing_breakdown: Record<string, number>;
  sapi_penitipan: number;
  kambing_penitipan: number;
  total_muqorib: number;
  total_lunas: number;
  total_belum: number;
}

export interface QurbanPaymentInfo {
  bank_name: string;
  account_number: string;
  account_holder: string;
  panitia_hp: string;
}

export interface QurbanPublikResponse {
  updated_at: string;
  summary: QurbanSummary;
  hewan: QurbanHewanItem[];
  payment: QurbanPaymentInfo;
}
