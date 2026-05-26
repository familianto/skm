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
  kode_bayar: ['QRB-1448-007', 'QRB-1448-008'],
  total_harga: 6_000_000,
  nominal_transfer: 6_000_004,
  rekening: [{ nama_bank: 'BSI', nomor_rekening: '1234567890', atas_nama: 'Masjid Al Jabar' }],
};

test('publik message: name, all kode_bayar, nominal, bank, berita instruction', () => {
  const t = buildPendaftaranPublikMessage(data);
  assert.match(t, /Hopy/);
  assert.match(t, /QRB-1448-007/);
  assert.match(t, /QRB-1448-008/);
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

test('single-slot renders an inline kode bayar (no bullet list)', () => {
  const t = buildPendaftaranPublikMessage({ ...data, jumlah_slot: 1, kode_bayar: ['QRB-1448-007'] });
  assert.match(t, /Kode Bayar: \*QRB-1448-007\*/);
});

test('empty rekening list degrades gracefully', () => {
  const t = buildPendaftaranPublikMessage({ ...data, rekening: [] });
  assert.match(t, /Info rekening menyusul/);
});

test('shouldSendPendaftaranWA gates on flag AND no_hp', () => {
  assert.equal(shouldSendPendaftaranWA({ wa_send_on_pendaftaran: true }, '628226083451'), true);
  assert.equal(shouldSendPendaftaranWA({ wa_send_on_pendaftaran: false }, '628226083451'), false);
  assert.equal(shouldSendPendaftaranWA({ wa_send_on_pendaftaran: true }, '   '), false);
  assert.equal(shouldSendPendaftaranWA(null, '628226083451'), false);
  assert.equal(shouldSendPendaftaranWA(undefined, '628226083451'), false);
});
