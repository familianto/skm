import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCekStatusEntry } from '../publik-status';
import type { QurbanPeserta } from '../peserta-types';

function mkPeserta(p: Partial<QurbanPeserta> = {}): QurbanPeserta {
  return {
    id: 'PST-1',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 3,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 3_000_000,
    kode_bayar: 'QRB-1448-007',
    sumber_pendaftaran: 'PUBLIK',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: '',
    notes: '',
    created_at: '',
    updated_at: '',
    created_by: 'PUBLIK',
    ...p,
  };
}

test('buildCekStatusEntry masks the muqorib name and omits no_hp', () => {
  const entry = buildCekStatusEntry(mkPeserta(), 'Hopy Familianto');
  assert.equal(entry.nama, 'Ho** Fa********');
  assert.equal(entry.kode_bayar, 'QRB-1448-007');
  assert.equal(entry.status_pendaftaran, 'TERDAFTAR');
  assert.equal(entry.harga_disepakati, 3_000_000);
  assert.ok(!('no_hp' in entry));
});

test('buildCekStatusEntry falls back to nama_atas_nama when no muqorib name', () => {
  const entry = buildCekStatusEntry(mkPeserta({ nama_atas_nama: 'Almarhumah Ibu' }), '');
  assert.equal(entry.nama, 'Al******** Ib*');
});
