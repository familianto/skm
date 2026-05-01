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
  const sapiRegular = sapiAll.filter(h => !h.is_penitipan);
  const sapiPenitipan = sapiAll.filter(h => h.is_penitipan);

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F404} *DETAIL SAPI*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

  for (const h of sapiRegular) {
    if (h.terisi === 0) continue;
    t += `*${h.id_hewan}* _(Kelas ${h.tipe} \u00b7 ${formatRupiah(h.harga_per_orang)}/slot)_\n`;
    for (const p of h.peserta) {
      const status = p.status_bayar === 'Lunas' ? '\u2705' : '\u2014';
      t += `${p.slot}. ${p.nama} ${status}\n`;
    }
    t += '\n';
  }

  if (sapiPenitipan.length > 0) {
    t += '\u{1F3F7}\uFE0F *Sapi Penitipan*\n';
    for (const h of sapiPenitipan) {
      if (h.terisi === 0) continue;
      const names = h.peserta
        .map(p => `${p.nama} ${p.status_bayar === 'Lunas' ? '\u2705' : '\u2014'}`)
        .join(', ');
      t += `\u2022 ${h.id_hewan} \u2014 ${names}\n`;
    }
    t += '\n';
  }

  // Detail Kambing
  const kambingAll = hewan.filter(h => h.jenis === 'Kambing');
  const kambingRegular = kambingAll.filter(h => !h.is_penitipan);
  const kambingPenitipan = kambingAll.filter(h => h.is_penitipan);

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F410} *DETAIL KAMBING*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

  const kambingByTipe = new Map<string, typeof kambingRegular>();
  for (const h of kambingRegular) {
    const list = kambingByTipe.get(h.tipe) || [];
    list.push(h);
    kambingByTipe.set(h.tipe, list);
  }

  for (const [tipe, list] of Array.from(kambingByTipe.entries()).sort()) {
    const price = list[0]?.harga_per_orang || 0;
    t += `*Kelas ${tipe}* _(${formatRupiah(price)}/ekor)_\n`;
    let num = 1;
    for (const h of list) {
      for (const p of h.peserta) {
        const status = p.status_bayar === 'Lunas' ? '\u2705' : '\u2014';
        t += `${num}. ${p.nama} ${status}\n`;
        num++;
      }
    }
    t += '\n';
  }

  if (kambingPenitipan.length > 0) {
    t += '\u{1F3F7}\uFE0F *Kambing Penitipan*\n';
    for (const h of kambingPenitipan) {
      if (h.terisi === 0) continue;
      const names = h.peserta
        .map(p => `${p.nama} ${p.status_bayar === 'Lunas' ? '\u2705' : '\u2014'}`)
        .join(', ');
      t += `\u2022 ${h.id_hewan} \u2014 ${names}\n`;
    }
    t += '\n';
  }

  // Payment
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F4B3} *CARA PEMBAYARAN*\n';
  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
  t += 'Transfer ke:\n';
  t += `*${payment.bank_name} ${payment.account_number}*\n`;
  t += `a.n. ${payment.account_holder}\n\n`;
  t += '\u26A0\uFE0F *PENTING*\n';
  t += 'Isi kolom Berita/Keterangan:\n';
  t += '*QRB [Nama Anda] atau QURBAN [Nama Anda]*\n\n';
  t += 'Contoh: QRB Fulan, atau QURBAN Fulan\n\n';
  if (payment.panitia_hp) {
    t += `_Jika ATM tanpa keterangan, kirim bukti ke: ${payment.panitia_hp}_\n\n`;
  }
  
  t += '*Konfirmasi Pembayaran*\n';
  t += 'Konfirmasi via WhatsApp dan tunggu verifikasi dari panitia\n\n';
  
  t += 'https://wa.me/6282320873017 (PIC. Ust. Bayu)\n\n';

  t += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
  t += '\u{1F4F1} Info lengkap:\n';
  t += `${pageUrl}\n\n`;
  t += 'Jazakumullah khairan \u{1F319}';

  return t;
}
