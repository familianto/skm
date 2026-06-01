import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapRowToPembayaran,
  mapPembayaranToRow,
  isValidMetode,
  isValidStatus,
  type Pembayaran,
} from '../pembayaran-repo';

function mk(p: Partial<Pembayaran> = {}): Pembayaran {
  return {
    id: 'BYR-20260531-0001',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1448-007',
    muqorib_id: 'MQR-1',
    nominal_total: 4_500_000,
    nominal_transfer: 4_500_003,
    metode: 'TRANSFER',
    status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: '',
    bank_ref: '',
    skm_transaksi_id: '',
    bukti_url: '',
    match_metadata: '',
    notes: 'catatan',
    created_at: '2026-05-31T03:00:00.000Z',
    updated_at: '2026-05-31T03:00:00.000Z',
    created_by: 'ANG-1',
    ...p,
  };
}

test('mapPembayaranToRow → mapRowToPembayaran round-trip preserves all fields', () => {
  const p = mk();
  const row = mapPembayaranToRow(p);
  assert.equal(row.length, 19);
  assert.deepEqual(mapRowToPembayaran(row), p);
});

test('mapPembayaranToRow places cells in the migrate_F6A column order', () => {
  const row = mapPembayaranToRow(mk());
  assert.equal(row[0], 'BYR-20260531-0001'); // id
  assert.equal(row[1], 'EDS-1'); // edisi_id
  assert.equal(row[2], 'QRB-1448-007'); // kode_bayar
  assert.equal(row[3], 'MQR-1'); // muqorib_id
  assert.equal(row[4], 4_500_000); // nominal_total
  assert.equal(row[5], 4_500_003); // nominal_transfer
  assert.equal(row[6], 'TRANSFER'); // metode
  assert.equal(row[7], 'BELUM_BAYAR'); // status
  assert.equal(row[18], 'ANG-1'); // created_by
});

test('mapRowToPembayaran coerces numerics + uppercases enums, blanks → empty string', () => {
  const row = mapPembayaranToRow(mk());
  row[4] = '4500000'; // nominal_total as string from sheet
  row[5] = '4500003';
  row[6] = 'tunai'; // lowercase enum
  row[7] = 'lunas';
  const back = mapRowToPembayaran(row);
  assert.equal(back.nominal_total, 4_500_000);
  assert.equal(back.nominal_transfer, 4_500_003);
  assert.equal(back.metode, 'TUNAI');
  assert.equal(back.status, 'LUNAS');
});

test('isValidMetode / isValidStatus accept canonical values, reject junk', () => {
  for (const m of ['TRANSFER', 'TUNAI', 'VA', 'IMPORT_1447H']) assert.ok(isValidMetode(m));
  assert.equal(isValidMetode('CASH'), false);
  for (const s of ['BELUM_BAYAR', 'TERIMA_PANITIA', 'LUNAS', 'BATAL']) assert.ok(isValidStatus(s));
  assert.equal(isValidStatus('PENDING'), false);
});
