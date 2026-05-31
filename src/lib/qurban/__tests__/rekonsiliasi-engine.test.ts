import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractKodeBayar,
  classifyTransaksi,
  indexPembayaranByKode,
} from '../rekonsiliasi-engine';
import type { Pembayaran } from '../pembayaran-repo';

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    nominal_total: 1_500_000, nominal_transfer: 1_500_003, metode: 'TRANSFER', status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '', bank_ref: '',
    skm_transaksi_id: '', bukti_url: '', match_metadata: '', notes: '',
    created_at: '', updated_at: '', created_by: 'ANG-1', ...over,
  };
}

test('extractKodeBayar: hit di tengah berita, miss bila tak ada', () => {
  assert.equal(extractKodeBayar('TRF QRB-1448-007 an Fulan'), 'QRB-1448-007');
  assert.equal(extractKodeBayar('QRB-1448-012'), 'QRB-1448-012');
  assert.equal(extractKodeBayar('Infaq jumat tanpa kode'), null);
  assert.equal(extractKodeBayar('QRB-148-7 format salah'), null);
  assert.equal(extractKodeBayar(''), null);
});

test('classifyTransaksi: AUTO bila kode unik + TRANSFER + BELUM_BAYAR + nominal pas', () => {
  const idx = indexPembayaranByKode([pay({})]);
  const c = classifyTransaksi({ deskripsi: 'QRB-1448-001', jumlah: 1_500_003 }, idx);
  assert.equal(c.kind, 'auto');
  if (c.kind === 'auto') assert.equal(c.pembayaran.id, 'BYR-1');
});

test('classifyTransaksi: ANOMALI bila nominal beda / sudah LUNAS / metode TUNAI', () => {
  const beda = classifyTransaksi({ deskripsi: 'QRB-1448-001', jumlah: 1_500_000 }, indexPembayaranByKode([pay({})]));
  assert.equal(beda.kind, 'anomali');
  if (beda.kind === 'anomali') assert.match(beda.alasan, /nominal/);

  const lunas = classifyTransaksi({ deskripsi: 'QRB-1448-001', jumlah: 1_500_003 }, indexPembayaranByKode([pay({ status: 'LUNAS' })]));
  assert.equal(lunas.kind, 'anomali');
  if (lunas.kind === 'anomali') assert.match(lunas.alasan, /LUNAS/);

  const tunai = classifyTransaksi({ deskripsi: 'QRB-1448-001', jumlah: 1_500_003 }, indexPembayaranByKode([pay({ metode: 'TUNAI' })]));
  assert.equal(tunai.kind, 'anomali');
  if (tunai.kind === 'anomali') assert.match(tunai.alasan, /TRANSFER/);
});

test('classifyTransaksi: UNMATCHED bila tanpa kode / kode tak punya pembayaran', () => {
  const idx = indexPembayaranByKode([pay({})]);
  assert.equal(classifyTransaksi({ deskripsi: 'tanpa kode', jumlah: 100 }, idx).kind, 'unmatched');
  const c = classifyTransaksi({ deskripsi: 'QRB-1448-999', jumlah: 100 }, idx);
  assert.equal(c.kind, 'unmatched');
  if (c.kind === 'unmatched') assert.equal(c.kode_bayar, 'QRB-1448-999');
});
