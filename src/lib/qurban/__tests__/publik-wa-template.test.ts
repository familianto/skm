import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPendaftaranPublikMessage,
  buildPendaftaranPanitiaMessage,
  shouldSendPendaftaranWA,
  type PendaftaranWAData,
} from '../publik-wa-template';

const data: PendaftaranWAData = {
  nama: 'Hopy',
  tahun_hijriah: '1448 H',
  hewan_label: 'Sapi Kelas A',
  tipe_qurban: 'BELI',
  jumlah_slot: 2,
  // F4c-C: one registration = one kode_bayar (shared across all slots).
  kode_bayar: 'QRB-1448-007',
  total_harga: 6_000_000,
  nominal_transfer: 6_000_004,
  rekening: [{ nama_bank: 'BSI', nomor_rekening: '1234567890', atas_nama: 'Masjid Al Jabar' }],
};

test('publik message: name, single kode_bayar, nominal, bank, berita instruction', () => {
  const t = buildPendaftaranPublikMessage(data);
  assert.match(t, /Hopy/);
  assert.match(t, /Kode Bayar: \*QRB-1448-007\*/);
  assert.match(t, /6\.000\.004/); // formatRupiah(nominal_transfer)
  assert.match(t, /BSI/);
  assert.match(t, /berita/i);
  assert.match(t, /tercatat/);
});

test('panitia message uses the panitia framing but same core data', () => {
  const t = buildPendaftaranPanitiaMessage(data);
  assert.match(t, /dicatat oleh panitia/);
  assert.match(t, /QRB-1448-007/);
  assert.match(t, /6\.000\.004/);
});

test('multi-slot still renders exactly one kode bayar line', () => {
  const t = buildPendaftaranPublikMessage({ ...data, jumlah_slot: 7, kode_bayar: 'QRB-1448-007' });
  assert.match(t, /Kode Bayar: \*QRB-1448-007\*/);
  // No bullet-list of multiple codes.
  assert.doesNotMatch(t, /•/);
});

test('empty rekening list degrades gracefully', () => {
  const t = buildPendaftaranPublikMessage({ ...data, rekening: [] });
  assert.match(t, /Info rekening menyusul/);
});

test('F6 D1 — TRANSFER branch: nominal_transfer (suffix), rekening, berita instruction', () => {
  const t = buildPendaftaranPublikMessage({ ...data, metode: 'TRANSFER' });
  assert.match(t, /Transfer/);
  assert.match(t, /6\.000\.004/); // nominal_transfer (dengan suffix)
  assert.match(t, /BSI/);
  assert.match(t, /berita/i);
  assert.match(t, /3 digit terakhir/);
  // tidak ada instruksi "datang ke masjid".
  assert.doesNotMatch(t, /datang ke masjid/i);
});

test('F6 D1 — TUNAI branch: nominal_total tanpa suffix, instruksi datang, tanpa rekening/berita', () => {
  const t = buildPendaftaranPublikMessage({ ...data, metode: 'TUNAI' });
  assert.match(t, /Cash · Datang Langsung/);
  assert.match(t, /6\.000\.000/); // total_harga (tanpa suffix)
  assert.match(t, /datang ke masjid/i);
  assert.match(t, /panitia/i);
  // TUNAI tidak memuat nominal-ber-suffix, rekening, atau instruksi berita transfer.
  assert.doesNotMatch(t, /6\.000\.004/);
  assert.doesNotMatch(t, /BSI/);
  assert.doesNotMatch(t, /berita\/keterangan transfer/i);
});

test('F6 D1 — default (tanpa metode) = TRANSFER (back-compat)', () => {
  const t = buildPendaftaranPanitiaMessage(data);
  assert.match(t, /Transfer/);
  assert.match(t, /6\.000\.004/);
});

test('F6 D1 — TRANSFER rekeningBlock menyaring Kas Tunai', () => {
  const t = buildPendaftaranPublikMessage({
    ...data,
    metode: 'TRANSFER',
    rekening: [
      { nama_bank: 'Bank Muamalat Indonesia', nomor_rekening: '111', atas_nama: 'Masjid' },
      { nama_bank: 'Kas Tunai', nomor_rekening: '-', atas_nama: 'Masjid' },
    ],
  });
  assert.match(t, /Bank Muamalat Indonesia/);
  assert.doesNotMatch(t, /Kas Tunai/);
});

test('shouldSendPendaftaranWA gates on flag AND no_hp', () => {
  assert.equal(shouldSendPendaftaranWA({ wa_send_on_pendaftaran: true }, '628226083451'), true);
  assert.equal(shouldSendPendaftaranWA({ wa_send_on_pendaftaran: false }, '628226083451'), false);
  assert.equal(shouldSendPendaftaranWA({ wa_send_on_pendaftaran: true }, '   '), false);
  assert.equal(shouldSendPendaftaranWA(null, '628226083451'), false);
  assert.equal(shouldSendPendaftaranWA(undefined, '628226083451'), false);
});
