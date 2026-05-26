import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapRowToPeserta, mapPesertaToRow, applyPesertaFilter } from '../peserta-repo';
import type { QurbanPeserta } from '../peserta-types';

function mk(p: Partial<QurbanPeserta>): QurbanPeserta {
  return {
    id: 'PST-20260520-0001',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 3,
    tipe_qurban: 'BELI',
    nama_atas_nama: 'Almarhumah Ibu',
    keterangan_bagian: 'Daging+Jeroan',
    harga_disepakati: 3000000,
    kode_bayar: 'QRB-1448-007',
    sumber_pendaftaran: 'PANITIA',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: '2026-05-20T03:00:00.000Z',
    notes: 'catatan',
    created_at: '2026-05-20T03:00:00.000Z',
    updated_at: '2026-05-20T03:00:00.000Z',
    created_by: 'ANG-1',
    ...p,
  };
}

test('mapPesertaToRow → mapRowToPeserta round-trip preserves all fields', () => {
  const p = mk({});
  const row = mapPesertaToRow(p);
  assert.equal(row.length, 17);
  const back = mapRowToPeserta(row);
  assert.deepEqual(back, p);
});

test('mapPesertaToRow places cells in the migrate_F4a column order', () => {
  const row = mapPesertaToRow(mk({}));
  assert.equal(row[0], 'PST-20260520-0001'); // id
  assert.equal(row[1], 'EDS-1'); // edisi_id
  assert.equal(row[2], 'MQR-1'); // muqorib_id
  assert.equal(row[3], 'HWN-1'); // hewan_id
  assert.equal(row[4], 3); // slot_number
  assert.equal(row[5], 'BELI'); // tipe_qurban
  assert.equal(row[9], 'QRB-1448-007'); // kode_bayar
  assert.equal(row[11], 'TERDAFTAR'); // status_pendaftaran
});

test('mapRowToPeserta coerces numeric + uppercases enums, blanks → empty string', () => {
  const row = mapPesertaToRow(mk({}));
  row[4] = '5'; // slot_number as string from sheet
  row[8] = '3000000';
  row[5] = 'beli'; // lowercase enum
  const back = mapRowToPeserta(row);
  assert.equal(back.slot_number, 5);
  assert.equal(back.harga_disepakati, 3000000);
  assert.equal(back.tipe_qurban, 'BELI');
});

test('applyPesertaFilter matches each criterion', () => {
  const list = [
    mk({ id: 'A', status_pendaftaran: 'TERDAFTAR', hewan_id: 'HWN-1', muqorib_id: 'MQR-1', tipe_qurban: 'BELI', sumber_pendaftaran: 'PANITIA' }),
    mk({ id: 'B', status_pendaftaran: 'BATAL', hewan_id: 'HWN-2', muqorib_id: 'MQR-2', tipe_qurban: 'BAWA_SENDIRI', sumber_pendaftaran: 'PUBLIK' }),
  ];
  assert.deepEqual(applyPesertaFilter(list, { status_pendaftaran: 'TERDAFTAR' }).map((p) => p.id), ['A']);
  assert.deepEqual(applyPesertaFilter(list, { hewan_id: 'HWN-2' }).map((p) => p.id), ['B']);
  assert.deepEqual(applyPesertaFilter(list, { tipe_qurban: 'BELI' }).map((p) => p.id), ['A']);
  assert.deepEqual(applyPesertaFilter(list, { sumber_pendaftaran: 'PUBLIK' }).map((p) => p.id), ['B']);
  assert.deepEqual(applyPesertaFilter(list, {}).map((p) => p.id), ['A', 'B']);
  assert.deepEqual(applyPesertaFilter(list, { edisi_id: 'EDS-1', muqorib_id: 'MQR-1' }).map((p) => p.id), ['A']);
});
