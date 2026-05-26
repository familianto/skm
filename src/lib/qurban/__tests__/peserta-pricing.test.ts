import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selectHargaPenuh, hargaPerSlot } from '../peserta-pricing';
import type { QurbanMasterHewan } from '../master-hewan-repo';

function master(p: Partial<QurbanMasterHewan>): QurbanMasterHewan {
  return {
    id: 'MHW-1', edisi_id: 'EDS-1', jenis: 'SAPI', kelas: 'A', kapasitas_slot: 7,
    harga_beli: 21000000, harga_bawa_sendiri: 700000, is_active: true,
    created_at: '', updated_at: '', created_by: '',
    ...p,
  };
}

test('selectHargaPenuh: BELI → harga_beli, BAWA_SENDIRI → harga_bawa_sendiri', () => {
  const m = master({});
  assert.equal(selectHargaPenuh(m, 'BELI'), 21000000);
  assert.equal(selectHargaPenuh(m, 'BAWA_SENDIRI'), 700000);
});

test('hargaPerSlot: sapi 7-slot membagi rata (21jt/7 = 3jt)', () => {
  assert.equal(hargaPerSlot(21000000, 7), 3000000);
});

test('hargaPerSlot: kambing kapasitas 1 → harga utuh', () => {
  assert.equal(hargaPerSlot(2500000, 1), 2500000);
});

test('hargaPerSlot: pembagian tak bulat dibulatkan (Math.round)', () => {
  assert.equal(hargaPerSlot(20000000, 7), 2857143); // 2857142.857 → round
});

test('hargaPerSlot: kapasitas <= 0 atau non-finite → 0 (tidak NaN/Infinity)', () => {
  assert.equal(hargaPerSlot(1000, 0), 0);
  assert.equal(hargaPerSlot(1000, -1), 0);
  assert.equal(hargaPerSlot(1000, NaN), 0);
});

test('full-animal registration totals back to harga_penuh (7 × per-slot)', () => {
  const perSlot = hargaPerSlot(21000000, 7);
  assert.equal(perSlot * 7, 21000000);
});
