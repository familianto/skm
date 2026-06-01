import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canTerimaPanitia,
  canLunaskan,
  canReadPembayaran,
  statusPembayaranLabel,
  statusPembayaranBadgeClass,
  metodePembayaranLabel,
  transferHintForStatus,
  filterPembayaran,
  isMixedKategoriUnresolved,
  type PembayaranRow,
} from '../pembayaran-display';

function row(over: Partial<PembayaranRow>): PembayaranRow {
  return {
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    nominal_total: 1_500_000, nominal_transfer: 1_500_003, metode: 'TUNAI', status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '', bank_ref: '',
    skm_transaksi_id: '', bukti_url: '', match_metadata: '', notes: '',
    created_at: '', updated_at: '', created_by: 'ANG-1', muqorib_nama: 'Fulan', jumlah_slot: 1, ...over,
  };
}

test('canTerimaPanitia: TUNAI+BELUM_BAYAR untuk [SA,AQ,PD], BD ditolak', () => {
  for (const p of ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN']) {
    assert.equal(canTerimaPanitia(p, 'TUNAI', 'BELUM_BAYAR'), true);
  }
  assert.equal(canTerimaPanitia('BENDAHARA', 'TUNAI', 'BELUM_BAYAR'), false);
  assert.equal(canTerimaPanitia('DISTRIBUSI', 'TUNAI', 'BELUM_BAYAR'), false);
  // metode/status salah → false.
  assert.equal(canTerimaPanitia('SUPER_ADMIN', 'TRANSFER', 'BELUM_BAYAR'), false);
  assert.equal(canTerimaPanitia('SUPER_ADMIN', 'TUNAI', 'TERIMA_PANITIA'), false);
});

test('canLunaskan: TUNAI+TERIMA_PANITIA untuk [SA,BD], peran lain ditolak', () => {
  assert.equal(canLunaskan('SUPER_ADMIN', 'TUNAI', 'TERIMA_PANITIA'), true);
  assert.equal(canLunaskan('BENDAHARA', 'TUNAI', 'TERIMA_PANITIA'), true);
  assert.equal(canLunaskan('ADMIN_QURBAN', 'TUNAI', 'TERIMA_PANITIA'), false);
  assert.equal(canLunaskan('PENDAFTARAN', 'TUNAI', 'TERIMA_PANITIA'), false);
  assert.equal(canLunaskan('SUPER_ADMIN', 'TUNAI', 'BELUM_BAYAR'), false);
  assert.equal(canLunaskan('SUPER_ADMIN', 'TRANSFER', 'TERIMA_PANITIA'), false);
});

test('canReadPembayaran: SA/BD/AQ/PD ya, DISTRIBUSI/undefined tidak', () => {
  for (const p of ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN']) {
    assert.equal(canReadPembayaran(p), true);
  }
  assert.equal(canReadPembayaran('DISTRIBUSI'), false);
  assert.equal(canReadPembayaran(undefined), false);
});

test('label & badge per status', () => {
  assert.equal(statusPembayaranLabel('TERIMA_PANITIA'), 'Diterima Panitia');
  assert.equal(statusPembayaranLabel('LUNAS'), 'Lunas');
  assert.match(statusPembayaranBadgeClass('TERIMA_PANITIA'), /amber/);
  assert.match(statusPembayaranBadgeClass('LUNAS'), /emerald/);
  assert.match(statusPembayaranBadgeClass('BATAL'), /red/);
  assert.equal(metodePembayaranLabel('TUNAI'), 'Cash · Datang Langsung');
});

test('transferHintForStatus: TRANSFER+BELUM_BAYAR → hint; selain itu null', () => {
  assert.match(transferHintForStatus('TRANSFER', 'BELUM_BAYAR') ?? '', /rekonsiliasi/i);
  assert.equal(transferHintForStatus('TRANSFER', 'LUNAS'), null);
  assert.equal(transferHintForStatus('TUNAI', 'BELUM_BAYAR'), null);
});

test('isMixedKategoriUnresolved: mixed true & belum resolved → true', () => {
  assert.equal(isMixedKategoriUnresolved(JSON.stringify({ mixed: true })), true);
  assert.equal(isMixedKategoriUnresolved(JSON.stringify({ mixed: true, kategori_resolved: true })), false);
  assert.equal(isMixedKategoriUnresolved(JSON.stringify({ layer: 'AUTO' })), false);
  assert.equal(isMixedKategoriUnresolved(''), false);
  assert.equal(isMixedKategoriUnresolved('bukan json'), false);
});

test('filterPembayaran: status + metode + query', () => {
  const rows = [
    row({ id: 'A', status: 'LUNAS', metode: 'TUNAI', kode_bayar: 'QRB-1448-001', muqorib_nama: 'Ahmad' }),
    row({ id: 'B', status: 'BELUM_BAYAR', metode: 'TRANSFER', kode_bayar: 'QRB-1448-002', muqorib_nama: 'Budi' }),
  ];
  assert.deepEqual(filterPembayaran(rows, { status: 'LUNAS', metode: 'ALL', q: '' }).map((r) => r.id), ['A']);
  assert.deepEqual(filterPembayaran(rows, { status: 'ALL', metode: 'TRANSFER', q: '' }).map((r) => r.id), ['B']);
  assert.deepEqual(filterPembayaran(rows, { status: 'ALL', metode: 'ALL', q: 'budi' }).map((r) => r.id), ['B']);
  assert.deepEqual(filterPembayaran(rows, { status: 'ALL', metode: 'ALL', q: '002' }).map((r) => r.id), ['B']);
  assert.equal(filterPembayaran(rows, { status: 'ALL', metode: 'ALL', q: 'zzz' }).length, 0);
});
