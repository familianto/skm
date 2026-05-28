import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseKodeBayarSuffix,
  nextKodeBayarNumber,
  resolveTahunHijriah,
} from '../peserta-kode-bayar';
import type { Edisi } from '../edisi-repo';

test('parseKodeBayarSuffix membaca NNN trailing', () => {
  assert.equal(parseKodeBayarSuffix('QRB-1448-007'), 7);
  assert.equal(parseKodeBayarSuffix('QRB-1448-123'), 123);
  assert.equal(parseKodeBayarSuffix('QRB-1448-1000'), 1000);
});

test('parseKodeBayarSuffix → null untuk format tak terbaca', () => {
  assert.equal(parseKodeBayarSuffix(''), null);
  assert.equal(parseKodeBayarSuffix('QRB-1448-'), null);
  assert.equal(parseKodeBayarSuffix('bukan-kode'), null);
});

test('nextKodeBayarNumber = max suffix + 1; default 1 kalau kosong', () => {
  assert.equal(nextKodeBayarNumber([]), 1);
  assert.equal(nextKodeBayarNumber(['QRB-1448-001', 'QRB-1448-007', 'QRB-1448-003']), 8);
});

test('nextKodeBayarNumber menghitung kode lintas status (BATAL ikut, tak pakai-ulang)', () => {
  // Kode 5 milik peserta BATAL tetap dihitung → berikutnya 6, bukan mengisi gap.
  assert.equal(nextKodeBayarNumber(['QRB-1448-005']), 6);
});

test('nextKodeBayarNumber: kode dibagi banyak baris tak menggelembungkan counter (F4c-C)', () => {
  // Satu pendaftaran 7-slot berbagi SATU kode (QRB-1448-003) di 7 baris →
  // berikutnya tetap 4 (max+1), bukan 10. Counter naik per pendaftaran.
  assert.equal(
    nextKodeBayarNumber(['QRB-1448-003', 'QRB-1448-003', 'QRB-1448-003', 'QRB-1448-003']),
    4
  );
});

test('nextKodeBayarNumber abaikan kode tak terbaca', () => {
  assert.equal(nextKodeBayarNumber(['', 'QRB-1448-002', 'rusak']), 3);
});

function edisi(tahun: string): Edisi {
  return {
    id: 'EDS-1', tahun_hijriah: tahun, tahun_masehi: 2026, tanggal_idul_adha: '',
    tanggal_pendaftaran_buka: '', tanggal_pendaftaran_tutup: '', status: 'AKTIF',
    parent_edisi_id: '', cloned_at: '', created_at: '', updated_at: '', created_by: '',
    pemetaan_version: '',
  };
}

test('resolveTahunHijriah ambil digit-run pertama', () => {
  assert.equal(resolveTahunHijriah(edisi('1448')), '1448');
  assert.equal(resolveTahunHijriah(edisi('1448 H')), '1448');
  assert.equal(resolveTahunHijriah(edisi('1448H')), '1448');
});
