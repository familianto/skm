import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSlotAssignment, type AssignableHewan } from '../peserta-slot-assignment';

const sapi = (id: string, nomor_urut: number): AssignableHewan => ({ id, nomor_urut, kapasitas_slot: 7 });

test('single hewan kosong: isi slot terkecil dulu', () => {
  const res = computeSlotAssignment([sapi('HWN-1', 1)], new Map(), 3);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.assignments, [
      { hewan_id: 'HWN-1', slot_number: 1 },
      { hewan_id: 'HWN-1', slot_number: 2 },
      { hewan_id: 'HWN-1', slot_number: 3 },
    ]);
  }
});

test('lewati slot yang sudah terisi, ambil yang kosong terkecil', () => {
  const occupied = new Map([['HWN-1', new Set([1, 3])]]);
  const res = computeSlotAssignment([sapi('HWN-1', 1)], occupied, 2);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.assignments, [
      { hewan_id: 'HWN-1', slot_number: 2 },
      { hewan_id: 'HWN-1', slot_number: 4 },
    ]);
  }
});

test('auto-split lintas hewan mengikuti urutan nomor_urut ASC', () => {
  // HWN-2 punya nomor_urut lebih kecil → didahulukan. Sisa 5 slot, minta 7 →
  // 5 dari HWN-2 lalu 2 dari HWN-5.
  const occupied = new Map([['HWN-2', new Set([1, 2])]]);
  const res = computeSlotAssignment([sapi('HWN-5', 5), sapi('HWN-2', 2)], occupied, 7);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.assignments.length, 7);
    assert.deepEqual(res.assignments.slice(0, 5).map((a) => a.slot_number), [3, 4, 5, 6, 7]);
    assert.ok(res.assignments.slice(0, 5).every((a) => a.hewan_id === 'HWN-2'));
    assert.deepEqual(res.assignments.slice(5), [
      { hewan_id: 'HWN-5', slot_number: 1 },
      { hewan_id: 'HWN-5', slot_number: 2 },
    ]);
  }
});

test('slot tersedia < diminta → ok:false dengan available/needed', () => {
  const occupied = new Map([['HWN-1', new Set([1, 2, 3, 4, 5, 6])]]);
  const res = computeSlotAssignment([sapi('HWN-1', 1)], occupied, 3);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.available, 1);
    assert.equal(res.needed, 3);
  }
});

test('tidak ada hewan kandidat → ok:false available 0', () => {
  const res = computeSlotAssignment([], new Map(), 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.available, 0);
});

test('kambing kapasitas 1: tepat satu slot per ekor', () => {
  const kambing = (id: string, n: number): AssignableHewan => ({ id, nomor_urut: n, kapasitas_slot: 1 });
  const res = computeSlotAssignment([kambing('K-1', 1), kambing('K-2', 2)], new Map(), 2);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.assignments, [
      { hewan_id: 'K-1', slot_number: 1 },
      { hewan_id: 'K-2', slot_number: 1 },
    ]);
  }
});
