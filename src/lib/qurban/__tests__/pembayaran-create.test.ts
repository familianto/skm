import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMetodePembayaranInput,
  buildPembayaranFromPendaftaran,
} from '../pembayaran-create';

const NOW = '2026-05-31T03:00:00.000Z';

test('resolveMetodePembayaranInput: kosong/undefined → default TRANSFER', () => {
  for (const raw of [undefined, null, '', '   ']) {
    const r = resolveMetodePembayaranInput(raw);
    assert.deepEqual(r, { ok: true, metode: 'TRANSFER' });
  }
});

test('resolveMetodePembayaranInput: TRANSFER/TUNAI (case-insensitive) diterima', () => {
  assert.deepEqual(resolveMetodePembayaranInput('tunai'), { ok: true, metode: 'TUNAI' });
  assert.deepEqual(resolveMetodePembayaranInput(' Transfer '), { ok: true, metode: 'TRANSFER' });
});

test('resolveMetodePembayaranInput: VA ditolak "segera hadir"', () => {
  const r = resolveMetodePembayaranInput('VA');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'COMING_SOON');
});

test('resolveMetodePembayaranInput: nilai tak dikenal → INVALID', () => {
  const r = resolveMetodePembayaranInput('CASH');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'INVALID');
});

test('buildPembayaranFromPendaftaran: nominal_total = Σ slot, transfer = total + suffix', () => {
  const p = buildPembayaranFromPendaftaran({
    id: 'BYR-20260531-0001',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1448-007',
    muqorib_id: 'MQR-1',
    slot_harga: [1_500_000, 1_500_000, 1_500_000], // 1 sapi, 3 slot @1.5jt
    payment_suffix: 3,
    metode: 'TRANSFER',
    created_by: 'ANG-1',
    now: NOW,
  });
  assert.equal(p.nominal_total, 4_500_000);
  assert.equal(p.nominal_transfer, 4_500_003); // suffix ditambah SEKALI ke total
  assert.equal(p.status, 'BELUM_BAYAR');
  assert.equal(p.metode, 'TRANSFER');
  assert.equal(p.created_at, NOW);
  assert.equal(p.updated_at, NOW);
  // Kolom yang baru diisi di milestone berikutnya tetap kosong.
  assert.equal(p.bank_ref, '');
  assert.equal(p.skm_transaksi_id, '');
  assert.equal(p.tanggal_terima_panitia, '');
});

test('buildPembayaranFromPendaftaran: suffix string ditoleransi; suffix 0 → transfer = total', () => {
  const a = buildPembayaranFromPendaftaran({
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    slot_harga: [2_000_000], payment_suffix: '4', metode: 'TUNAI', created_by: 'ANG-1', now: NOW,
  });
  assert.equal(a.nominal_transfer, 2_000_004);
  const b = buildPembayaranFromPendaftaran({
    id: 'BYR-2', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-002', muqorib_id: 'MQR-1',
    slot_harga: [2_000_000], payment_suffix: 0, metode: 'TUNAI', created_by: 'ANG-1', now: NOW,
  });
  assert.equal(b.nominal_transfer, 2_000_000);
});
