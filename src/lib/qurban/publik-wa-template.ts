import { formatRupiah } from '@/lib/utils';
import type { TipeQurban } from './peserta-types';

/**
 * Pure WhatsApp message builders for qurban pendaftaran (F4b C1; F6 D1 per-metode).
 * Data → string, no I/O — sending is the caller's job (via `@/lib/fonnte`). Two
 * framing variants (publik vs panitia) share the same payment body, which now
 * branches per `metode`:
 *   - TRANSFER → nominal-ber-suffix + rekening + "tulis kode bayar di berita".
 *   - TUNAI    → nominal bulat (nominal_total, tanpa suffix) + "datang ke masjid,
 *                bayar ke panitia"; tanpa instruksi transfer.
 */

export type MetodePendaftaranWA = 'TRANSFER' | 'TUNAI';

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
  /** total_harga + payment_suffix — nominal yang harus ditransfer (TRANSFER). */
  nominal_transfer: number;
  rekening: RekeningInfo[];
  /** F6 D1: metode terpilih saat pendaftaran. Default TRANSFER (back-compat). */
  metode?: MetodePendaftaranWA;
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

/** Rekening transfer — Kas Tunai (cash) tidak relevan untuk instruksi transfer. */
function rekeningBlock(rek: RekeningInfo[]): string {
  const transferable = rek.filter((r) => !/kas tunai/i.test(r.nama_bank));
  if (transferable.length === 0) return '_(Info rekening menyusul dari panitia.)_\n';
  return transferable.map((r) => `*${r.nama_bank}* ${r.nomor_rekening}\na.n. ${r.atas_nama}`).join('\n\n') + '\n';
}

function paymentSectionTransfer(data: PendaftaranWAData): string {
  let t = '';
  t += `\u{1F404} ${data.hewan_label} · ${tipeLabel(data.tipe_qurban)} · ${data.jumlah_slot} slot\n\n`;
  t += '\u{1F4B3} *Pembayaran — Transfer*\n';
  t += `Total: ${formatRupiah(data.total_harga)}\n`;
  t += `Nominal transfer: *${formatRupiah(data.nominal_transfer)}*\n`;
  t += '_Mohon transfer TEPAT sesuai nominal di atas (3 digit terakhir adalah kode unik)._\n\n';
  t += kodeBayarBlock(data.kode_bayar) + '\n';
  t += 'Transfer ke:\n';
  t += rekeningBlock(data.rekening) + '\n';
  t += '⚠️ Tulis *kode bayar* Anda pada berita/keterangan transfer.\n';
  return t;
}

function paymentSectionTunai(data: PendaftaranWAData): string {
  let t = '';
  t += `\u{1F404} ${data.hewan_label} · ${tipeLabel(data.tipe_qurban)} · ${data.jumlah_slot} slot\n\n`;
  t += '\u{1F4B5} *Pembayaran — Cash · Datang Langsung*\n';
  t += `Total: *${formatRupiah(data.total_harga)}*\n\n`;
  t += kodeBayarBlock(data.kode_bayar) + '\n';
  t += '\u{1F54C} Silakan *datang ke masjid* dan serahkan pembayaran ke *panitia*.\n';
  t += '_Sebutkan kode bayar di atas kepada panitia saat membayar._\n';
  return t;
}

function paymentSection(data: PendaftaranWAData): string {
  return data.metode === 'TUNAI' ? paymentSectionTunai(data) : paymentSectionTransfer(data);
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

/** Data minimal untuk konfirmasi pembayaran LUNAS (F6 D2). */
export interface PembayaranConfirmedWAData {
  nama: string;
  tahun_hijriah: string;
  kode_bayar: string;
  /** Jumlah yang dicatat lunas (nominal_total). */
  jumlah: number;
  /** Metode pelunasan — memengaruhi framing kalimat. */
  metode?: MetodePendaftaranWA;
}

/**
 * Pesan konfirmasi pembayaran LUNAS (F6 D2). Dikirim saat pembayaran ber-status
 * LUNAS lewat PY3 (TUNAI) atau rekonsiliasi (TRANSFER), gated
 * `wa_send_on_pembayaran_confirmed`. Ringkas, senada gaya pesan pendaftaran.
 */
export function buildPembayaranConfirmedMessage(data: PembayaranConfirmedWAData): string {
  const cara = data.metode === 'TUNAI' ? 'tunai' : 'transfer';
  let t = '';
  t += '\u{2705} *Pembayaran Qurban Diterima*\n';
  t += `Edisi ${data.tahun_hijriah}\n\n`;
  t += `Assalamu'alaikum ${data.nama},\n`;
  t += `Alhamdulillah, pembayaran qurban Anda (${cara}) telah *kami terima* dan tercatat *LUNAS*.\n\n`;
  t += kodeBayarBlock(data.kode_bayar);
  t += `Jumlah: *${formatRupiah(data.jumlah)}*\n\n`;
  t += 'Semoga menjadi amal jariyah yang diterima. Jazakumullah khairan \u{1F319}';
  return t;
}
