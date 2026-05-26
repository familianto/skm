import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPendaftaranStatus,
  isPendaftaranOpen,
  wibDateString,
} from '../publik-pendaftaran-window';
import type { Edisi } from '../edisi-repo';

function mkEdisi(p: Partial<Edisi> = {}): Edisi {
  return {
    id: 'EDS-1',
    tahun_hijriah: '1448 H',
    tahun_masehi: 2027,
    tanggal_idul_adha: '2027-05-27',
    tanggal_pendaftaran_buka: '2027-03-01',
    tanggal_pendaftaran_tutup: '2027-05-01',
    status: 'AKTIF',
    parent_edisi_id: '',
    cloned_at: '',
    created_at: '',
    updated_at: '',
    created_by: '',
    ...p,
  } as Edisi;
}

const at = (iso: string) => new Date(iso);

test('BELUM_BUKA before the buka date', () => {
  assert.equal(getPendaftaranStatus(mkEdisi(), at('2027-02-15T05:00:00Z')), 'BELUM_BUKA');
});

test('BUKA inside the window when edisi AKTIF', () => {
  assert.equal(getPendaftaranStatus(mkEdisi(), at('2027-04-01T05:00:00Z')), 'BUKA');
  assert.equal(isPendaftaranOpen(mkEdisi(), at('2027-04-01T05:00:00Z')), true);
});

test('TUTUP after the tutup date', () => {
  assert.equal(getPendaftaranStatus(mkEdisi(), at('2027-06-01T05:00:00Z')), 'TUTUP');
});

test('non-AKTIF edisi is always TUTUP, even inside the window', () => {
  assert.equal(getPendaftaranStatus(mkEdisi({ status: 'DRAFT' }), at('2027-04-01T05:00:00Z')), 'TUTUP');
  assert.equal(getPendaftaranStatus(mkEdisi({ status: 'SELESAI' }), at('2027-04-01T05:00:00Z')), 'TUTUP');
});

test('buka boundary is inclusive (today === buka → BUKA)', () => {
  assert.equal(getPendaftaranStatus(mkEdisi(), at('2027-03-01T05:00:00Z')), 'BUKA');
});

test('tutup boundary is inclusive (today === tutup → BUKA)', () => {
  assert.equal(getPendaftaranStatus(mkEdisi(), at('2027-05-01T05:00:00Z')), 'BUKA');
});

test('empty buka/tutup dates → AKTIF edisi is BUKA', () => {
  const e = mkEdisi({ tanggal_pendaftaran_buka: '', tanggal_pendaftaran_tutup: '' });
  assert.equal(getPendaftaranStatus(e, at('2027-04-01T05:00:00Z')), 'BUKA');
});

test('wibDateString shifts UTC by +7h (can roll to next day)', () => {
  assert.equal(wibDateString(at('2027-03-01T20:00:00Z')), '2027-03-02');
  assert.equal(wibDateString(at('2027-03-01T05:00:00Z')), '2027-03-01');
});
