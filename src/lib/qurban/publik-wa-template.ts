import { formatRupiah } from '@/lib/utils';
import type { TipeQurban } from './peserta-types';

/**
 * Pure WhatsApp message builders for qurban pendaftaran (F4b C1). Data → string,
 * no I/O — sending is the caller's job (via `@/lib/fonnte`). Two variants share
 * the same payment/kode body but differ in framing:
 *   - pendaftaran_publik  → dikirim setelah PB3 (form publik) sukses
 *   - pendaftaran_panitia → dikirim setelah PS2 (input panitia) sukses
 */

export interface RekeningInfo {
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
}

export interface PendaftaranWAData {
  nama: string;
  tahun_hijriah: string;
  hewan_label: string; // mis. "Sapi Kelas A"
  tipe_qurban: TipeQurban;
  jumlah_slot: number;
  /** F4c-C: satu pendaftaran = satu kode bayar (semua slot berbagi kode ini). */
  kode_bayar: string;
  total_harga: number;
  /** total_harga + payment_suffix — nominal yang harus ditransfer. */
  nominal_transfer: number;
  rekening: RekeningInfo[];
}

/**
 * Gate untuk pengiriman WA pendaftaran: flag config aktif DAN no_hp terisi.
 * Pure agar bisa dites; dipakai PB3 & PS2.
 */
export function shouldSendPendaftaranWA(
  konfig: { wa_send_on_pendaftaran: boolean } | null | undefined,
  no_hp: string
): boolean {
  return !!konfig?.wa_send_on_pendaftaran && !!(no_hp || '').trim();
}

function tipeLabel(t: TipeQurban): string {
  return t === 'BAWA_SENDIRI' ? 'Bawa Sendiri' : 'Beli (disediakan panitia)';
}

function kodeBayarBlock(kode: string): string {
  return `Kode Bayar: *${kode || '-'}*\n`;
}

function rekeningBlock(rek: RekeningInfo[]): string {
  if (rek.length === 0) return '_(Info rekening menyusul dari panitia.)_\n';
  return rek.map((r) => `*${r.nama_bank}* ${r.nomor_rekening}\na.n. ${r.atas_nama}`).join('\n\n') + '\n';
}

function paymentSection(data: PendaftaranWAData): string {
  let t = '';
  t += `\u{1F404} ${data.hewan_label} · ${tipeLabel(data.tipe_qurban)} · ${data.jumlah_slot} slot\n\n`;
  t += '\u{1F4B3} *Pembayaran*\n';
  t += `Total: ${formatRupiah(data.total_harga)}\n`;
  t += `Nominal transfer: *${formatRupiah(data.nominal_transfer)}*\n`;
  t += '_Mohon transfer TEPAT sesuai nominal di atas (3 digit terakhir adalah kode unik)._\n\n';
  t += kodeBayarBlock(data.kode_bayar) + '\n';
  t += 'Transfer ke:\n';
  t += rekeningBlock(data.rekening) + '\n';
  t += '⚠️ Tulis *kode bayar* Anda pada berita/keterangan transfer.\n';
  return t;
}

function buildMessage(data: PendaftaranWAData, intro: string): string {
  let t = '';
  t += '\u{1F54C} *Konfirmasi Pendaftaran Qurban*\n';
  t += `Edisi ${data.tahun_hijriah}\n\n`;
  t += `Assalamu'alaikum ${data.nama},\n`;
  t += `${intro}\n\n`;
  t += paymentSection(data);
  t += '\nJazakumullah khairan \u{1F319}';
  return t;
}

export function buildPendaftaranPublikMessage(data: PendaftaranWAData): string {
  return buildMessage(data, 'Alhamdulillah, pendaftaran qurban Anda telah *tercatat*. Berikut detailnya:');
}

export function buildPendaftaranPanitiaMessage(data: PendaftaranWAData): string {
  return buildMessage(data, 'Pendaftaran qurban Anda telah *dicatat oleh panitia*. Berikut detailnya:');
}
