import type { QurbanPublikResponse } from '@/types/qurban';
import { formatRupiah } from '@/lib/utils';

export function generateQurbanWAText(data: QurbanPublikResponse, pageUrl: string): string {
  const { summary, hewan, payment } = data;
  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  let t = '';
  t += '\u{1F54C} *LAPORAN QURBAN 1447H*\n';
  t += 'Masjid Al Jabar Jatinegara Baru\n';
  t += `_Update: ${tanggal} \u00b7 ${jam} WIB_\n\n`;

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F4CA} *RINGKASAN*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';

  t += `\u{1F404} Sapi: *${summary.total_sapi} ekor*\n`;
  for (const [tipe, count] of Object.entries(summary.sapi_breakdown).sort()) {
    t += `   \u2022 Kelas ${tipe}: ${count} ekor\n`;
  }
  if (summary.sapi_penitipan > 0) {
    t += `   \u2022 Penitipan: ${summary.sapi_penitipan} ekor\n`;
  }
  t += '\n';

  t += `\u{1F410} Kambing: *${summary.total_kambing} ekor*\n`;
  for (const [tipe, count] of Object.entries(summary.kambing_breakdown).sort()) {
    t += `   \u2022 Kelas ${tipe}: ${count} ekor\n`;
  }
  if (summary.kambing_penitipan > 0) {
    t += `   \u2022 Penitipan: ${summary.kambing_penitipan} ekor\n`;
  }
  t += '\n';

  t += `Total muqorib: *${summary.total_muqorib} orang*\n`;
  t += `\u2705 Lunas: ${summary.total_lunas} \u00b7 \u23F3 Belum: ${summary.total_belum}\n\n`;

  // Detail Sapi
  const sapiAll = hewan.filter(h => h.jenis === 'Sapi');

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F404} *DETAIL SAPI*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

  for (const h of sapiAll) {
    if (h.terisi === 0) continue;
    if (h.is_penitipan) {
      t += `*${h.id_hewan}* _(Kelas ${h.tipe} \u00b7 Penitipan \u00b7 BOP ${formatRupiah(h.bop_per_ekor)}/ekor)_\n`;
    } else {
      t += `*${h.id_hewan}* _(Kelas ${h.tipe} \u00b7 ${formatRupiah(h.harga_per_orang)}/slot)_\n`;
    }
    for (const p of h.peserta) {
      const status = p.status_bayar === 'Lunas' ? '\u2705' : '\u2014';
      t += `${p.slot}. ${p.nama} ${status}\n`;
    }
    t += '\n';
  }

  // Detail Kambing
  const kambingAll = hewan.filter(h => h.jenis === 'Kambing');

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F410} *DETAIL KAMBING*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

  for (const h of kambingAll) {
    if (h.terisi === 0) continue;
    if (h.is_penitipan) {
      t += `*${h.id_hewan}* _(Kelas ${h.tipe} \u00b7 Penitipan \u00b7 BOP ${formatRupiah(h.bop_per_ekor)}/ekor)_\n`;
    } else {
      t += `*${h.id_hewan}* _(Kelas ${h.tipe} \u00b7 ${formatRupiah(h.harga_per_orang)}/ekor)_\n`;
    }
    for (const p of h.peserta) {
      const status = p.status_bayar === 'Lunas' ? '\u2705' : '\u2014';
      t += `${p.slot}. ${p.nama} ${status}\n`;
    }
    t += '\n';
  }

  t += '\u26a0\ufe0f _Penomoran dan pengelompokan muqorib bersifat sementara. Panitia dapat mengatur ulang untuk kebutuhan operasional._\n\n';

  // Payment
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F4B3} *CARA PEMBAYARAN*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
  t += 'Transfer ke:\n';
  t += `*${payment.bank_name} ${payment.account_number}*\n`;
  t += `a.n. ${payment.account_holder}\n\n`;
  t += '\u26A0\uFE0F *PENTING*\n';
  t += 'Isi kolom Berita/Keterangan:\n';
  t += '*QRB [NAMA ANDA]*\n\n';
  t += 'Contoh: QRB FULAN\n\n';
  if (payment.panitia_hp) {
    t += `_Jika ATM tanpa keterangan, kirim bukti ke: ${payment.panitia_hp}_\n\n`;
  }

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F4F1} Info lengkap:\n';
  t += `${pageUrl}\n\n`;
  t += 'Jazakumullah khairan \u{1F319}';

  return t;
}
