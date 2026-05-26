import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterPeserta,
  formatPesertaDateID,
  hewanSlotLabel,
  pesertaDisplayNama,
  statusPendaftaranLabel,
  sumberPendaftaranLabel,
  tipeQurbanLabel,
  type PesertaListRow,
} from '@/lib/qurban/peserta-display';

/**
 * Pure display + filter logic for the F4c-A Peserta UI. Route pages aren't
 * unit-tested (repo convention) — these lock the label/badge/format/filter
 * helpers the list & detail views depend on.
 */

test('statusPendaftaranLabel maps known statuses', () => {
  assert.equal(statusPendaftaranLabel('TERDAFTAR'), 'Terdaftar');
  assert.equal(statusPendaftaranLabel('BATAL'), 'Batal');
  assert.equal(statusPendaftaranLabel(''), '—');
  assert.equal(statusPendaftaranLabel('WAT'), 'WAT');
});

test('tipeQurbanLabel maps BELI / BAWA_SENDIRI', () => {
  assert.equal(tipeQurbanLabel('BELI'), 'Beli');
  assert.equal(tipeQurbanLabel('BAWA_SENDIRI'), 'Bawa Sendiri');
  assert.equal(tipeQurbanLabel(''), '—');
});

test('sumberPendaftaranLabel maps all three sources', () => {
  assert.equal(sumberPendaftaranLabel('PUBLIK'), 'Pendaftaran Publik');
  assert.equal(sumberPendaftaranLabel('PANITIA'), 'Input Panitia');
  assert.equal(sumberPendaftaranLabel('IMPORT_1447H'), 'Impor 1447H');
});

test('pesertaDisplayNama prefers nama_atas_nama then muqorib nama', () => {
  assert.equal(pesertaDisplayNama('Hamba Allah', 'Budi'), 'Hamba Allah');
  assert.equal(pesertaDisplayNama('', 'Budi'), 'Budi');
  assert.equal(pesertaDisplayNama('   ', 'Budi'), 'Budi');
  assert.equal(pesertaDisplayNama(null, null), '—');
  assert.equal(pesertaDisplayNama(undefined, undefined), '—');
});

test('hewanSlotLabel composes label + slot, falls back to id', () => {
  assert.equal(hewanSlotLabel('Sapi-A-01', 3), 'Sapi-A-01 · Slot 3');
  assert.equal(hewanSlotLabel('', 2, 'HWN-1'), 'HWN-1 · Slot 2');
  assert.equal(hewanSlotLabel(undefined, 1, undefined), '— · Slot 1');
});

test('formatPesertaDateID handles invalid / empty input', () => {
  assert.equal(formatPesertaDateID(''), '—');
  assert.equal(formatPesertaDateID('not-a-date'), '—');
  assert.equal(formatPesertaDateID(null), '—');
  // Valid ISO produces a non-dash string (locale-formatted).
  assert.notEqual(formatPesertaDateID('2026-05-26T00:00:00.000Z'), '—');
});

function row(partial: Partial<PesertaListRow>): PesertaListRow {
  return {
    id: 'PST-1',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQB-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 1000000,
    kode_bayar: 'QRB-1448-001',
    sumber_pendaftaran: 'PANITIA',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: '2026-05-01T00:00:00.000Z',
    notes: '',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: 'AGT-1',
    display_nama: 'Budi',
    hewan_label: 'Sapi-A-01 · Slot 1',
    ...partial,
  };
}

test('filterPeserta status=ALL passes everything', () => {
  const rows = [
    row({ id: 'a', status_pendaftaran: 'TERDAFTAR' }),
    row({ id: 'b', status_pendaftaran: 'BATAL' }),
  ];
  assert.equal(filterPeserta(rows, { status: 'ALL', search: '' }).length, 2);
});

test('filterPeserta filters by status', () => {
  const rows = [
    row({ id: 'a', status_pendaftaran: 'TERDAFTAR' }),
    row({ id: 'b', status_pendaftaran: 'BATAL' }),
  ];
  const out = filterPeserta(rows, { status: 'BATAL', search: '' });
  assert.deepEqual(out.map((r) => r.id), ['b']);
});

test('filterPeserta searches display_nama and kode_bayar, case-insensitive', () => {
  const rows = [
    row({ id: 'a', display_nama: 'Budi Santoso', kode_bayar: 'QRB-1448-001' }),
    row({ id: 'b', display_nama: 'Siti', kode_bayar: 'QRB-1448-099' }),
  ];
  assert.deepEqual(filterPeserta(rows, { status: 'ALL', search: 'budi' }).map((r) => r.id), ['a']);
  assert.deepEqual(filterPeserta(rows, { status: 'ALL', search: '099' }).map((r) => r.id), ['b']);
  assert.equal(filterPeserta(rows, { status: 'ALL', search: 'zzz' }).length, 0);
});

test('filterPeserta combines status + search', () => {
  const rows = [
    row({ id: 'a', display_nama: 'Budi', status_pendaftaran: 'TERDAFTAR' }),
    row({ id: 'b', display_nama: 'Budi', status_pendaftaran: 'BATAL' }),
  ];
  const out = filterPeserta(rows, { status: 'TERDAFTAR', search: 'budi' });
  assert.deepEqual(out.map((r) => r.id), ['a']);
});
