import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMoveLocal,
  applyRenumberLocal,
  applySwapLocal,
  buildRenumberOps,
  classifyDrop,
  isCrossClass,
  isCrossTipe,
  isSameClass,
  moveHargaOptions,
  swapHargaOptions,
  type HewanLite,
} from '../pemetaan-board-logic';
import type { SnapshotHewan } from '../pemetaan-snapshot';

const SAPI_A_BELI: HewanLite = { jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BELI' };
const SAPI_B_BELI: HewanLite = { jenis: 'SAPI', kelas: 'B', tipe_pembelian: 'BELI' };
const SAPI_A_BAWA: HewanLite = { jenis: 'SAPI', kelas: 'A', tipe_pembelian: 'BAWA_SENDIRI' };
const KAMBING_A_BELI: HewanLite = { jenis: 'KAMBING', kelas: 'A', tipe_pembelian: 'BELI' };

// ---------------------------------------------------------------------------
// isSameClass / isCrossClass / isCrossTipe
// ---------------------------------------------------------------------------

test('same (jenis, kelas) → same-class', () => {
  assert.equal(isSameClass(SAPI_A_BELI, SAPI_A_BAWA), true);
  assert.equal(isCrossClass(SAPI_A_BELI, SAPI_A_BAWA), false);
});

test('different kelas → cross-class', () => {
  assert.equal(isCrossClass(SAPI_A_BELI, SAPI_B_BELI), true);
});

test('different jenis → cross-class', () => {
  assert.equal(isCrossClass(SAPI_A_BELI, KAMBING_A_BELI), true);
});

test('cross-tipe = beda tipe_pembelian (BELI vs BAWA_SENDIRI)', () => {
  assert.equal(isCrossTipe(SAPI_A_BELI, SAPI_A_BAWA), true);
  assert.equal(isCrossTipe(SAPI_A_BELI, SAPI_B_BELI), false);
});

// ---------------------------------------------------------------------------
// moveHargaOptions
// ---------------------------------------------------------------------------

test('move same-tipe → use_old default, use_new enabled, use_custom enabled', () => {
  const opts = moveHargaOptions(SAPI_A_BELI, SAPI_B_BELI);
  const old = opts.find((o) => o.value === 'use_old')!;
  const fresh = opts.find((o) => o.value === 'use_new')!;
  const custom = opts.find((o) => o.value === 'use_custom')!;
  assert.equal(old.isDefault, true);
  assert.equal(old.disabled, false);
  assert.equal(fresh.disabled, false);
  assert.equal(fresh.isDefault, false);
  assert.equal(custom.disabled, false);
  assert.equal(custom.isDefault, false);
});

test('move CROSS-TIPE → use_new DISABLED + note; default jadi use_custom', () => {
  const opts = moveHargaOptions(SAPI_A_BELI, SAPI_A_BAWA);
  const old = opts.find((o) => o.value === 'use_old')!;
  const fresh = opts.find((o) => o.value === 'use_new')!;
  const custom = opts.find((o) => o.value === 'use_custom')!;
  assert.equal(fresh.disabled, true, 'use_new harus disabled cross-tipe');
  assert.ok(fresh.note, 'note harus terisi saat disabled');
  assert.equal(old.isDefault, false);
  assert.equal(custom.isDefault, true, 'default harus use_custom cross-tipe');
});

test('move tidak punya use_existing_target', () => {
  const opts = moveHargaOptions(SAPI_A_BELI, SAPI_B_BELI);
  assert.equal(opts.find((o) => o.value === 'use_existing_target'), undefined);
});

// ---------------------------------------------------------------------------
// swapHargaOptions
// ---------------------------------------------------------------------------

test('swap same-tipe → use_old default + use_new enabled + use_existing_target + use_custom', () => {
  const opts = swapHargaOptions(SAPI_A_BELI, SAPI_B_BELI);
  const values = opts.map((o) => o.value);
  assert.deepEqual(values, ['use_old', 'use_new', 'use_existing_target', 'use_custom']);
  assert.equal(opts.find((o) => o.value === 'use_old')!.isDefault, true);
  assert.equal(opts.find((o) => o.value === 'use_new')!.disabled, false);
});

test('swap CROSS-TIPE → use_new DISABLED, default use_custom; use_existing_target tetap', () => {
  const opts = swapHargaOptions(SAPI_A_BELI, SAPI_A_BAWA);
  assert.equal(opts.find((o) => o.value === 'use_new')!.disabled, true);
  assert.equal(opts.find((o) => o.value === 'use_custom')!.isDefault, true);
  assert.equal(opts.find((o) => o.value === 'use_old')!.isDefault, false);
  // use_existing_target tetap available untuk swap
  assert.equal(opts.find((o) => o.value === 'use_existing_target')!.disabled, false);
});

// ---------------------------------------------------------------------------
// classifyDrop
// ---------------------------------------------------------------------------

test('classifyDrop: slot kosong + same-class → move tanpa modal', () => {
  const r = classifyDrop({
    source: SAPI_A_BELI,
    target: SAPI_A_BELI,
    targetSlot: { slot_number: 3, peserta: null },
  });
  assert.deepEqual(r, { kind: 'move', needsModal: false });
});

test('classifyDrop: slot kosong + cross-class → move dengan modal', () => {
  const r = classifyDrop({
    source: SAPI_A_BELI,
    target: SAPI_B_BELI,
    targetSlot: { slot_number: 3, peserta: null },
  });
  assert.deepEqual(r, { kind: 'move', needsModal: true });
});

test('classifyDrop: slot terisi + same-class → swap tanpa modal', () => {
  const r = classifyDrop({
    source: SAPI_A_BELI,
    target: SAPI_A_BELI,
    targetSlot: {
      slot_number: 3,
      peserta: {
        id: 'PST-X',
        nama_atas_nama: '',
        muqorib_id: 'MQR-X',
        muqorib_nama: 'X',
        harga_disepakati: 100,
        kode_bayar: 'QRB-1448-001',
        tipe_qurban: 'BELI',
      },
    },
  });
  assert.deepEqual(r, { kind: 'swap', needsModal: false });
});

test('classifyDrop: slot terisi + cross-class → swap dengan modal', () => {
  const r = classifyDrop({
    source: SAPI_A_BELI,
    target: SAPI_B_BELI,
    targetSlot: {
      slot_number: 3,
      peserta: {
        id: 'PST-X',
        nama_atas_nama: '',
        muqorib_id: 'MQR-X',
        muqorib_nama: 'X',
        harga_disepakati: 100,
        kode_bayar: 'QRB-1448-001',
        tipe_qurban: 'BELI',
      },
    },
  });
  assert.deepEqual(r, { kind: 'swap', needsModal: true });
});

// ---------------------------------------------------------------------------
// buildRenumberOps
// ---------------------------------------------------------------------------

test('buildRenumberOps: tukar dua hewan (1,2 → posisi 2,1) → dua op', () => {
  const ops = buildRenumberOps([
    { id: 'HWN-A', nomor_urut: 2 }, // posisi baru index 0 → new_nomor_urut 1
    { id: 'HWN-B', nomor_urut: 1 }, // posisi baru index 1 → new_nomor_urut 2
  ]);
  assert.deepEqual(ops, [
    { type: 'renumber_hewan', hewan_id: 'HWN-A', new_nomor_urut: 1 },
    { type: 'renumber_hewan', hewan_id: 'HWN-B', new_nomor_urut: 2 },
  ]);
});

test('buildRenumberOps: tidak berubah → array kosong', () => {
  const ops = buildRenumberOps([
    { id: 'HWN-A', nomor_urut: 1 },
    { id: 'HWN-B', nomor_urut: 2 },
    { id: 'HWN-C', nomor_urut: 3 },
  ]);
  assert.deepEqual(ops, []);
});

test('buildRenumberOps: sebagian berubah → hanya yang bergeser', () => {
  const ops = buildRenumberOps([
    { id: 'HWN-A', nomor_urut: 1 }, // posisi 1 → 1, skip
    { id: 'HWN-C', nomor_urut: 3 }, // posisi 2 → harus 2
    { id: 'HWN-B', nomor_urut: 2 }, // posisi 3 → harus 3
  ]);
  assert.deepEqual(ops, [
    { type: 'renumber_hewan', hewan_id: 'HWN-C', new_nomor_urut: 2 },
    { type: 'renumber_hewan', hewan_id: 'HWN-B', new_nomor_urut: 3 },
  ]);
});

// ---------------------------------------------------------------------------
// applyMoveLocal / applySwapLocal / applyRenumberLocal
// ---------------------------------------------------------------------------

function mkHewan(id: string, nomor_urut: number, slots: SnapshotHewan['slots']): SnapshotHewan {
  return {
    id,
    nomor_urut,
    tipe_pembelian: 'BELI',
    jenis: 'SAPI',
    kelas: 'A',
    nama_tipe: 'SAPI Kelas A',
    kapasitas_slot: slots.length,
    status: 'AKTIF',
    slots,
  };
}

function mkP(id: string, harga: number) {
  return {
    id,
    nama_atas_nama: '',
    muqorib_id: `MQR-${id}`,
    muqorib_nama: `M-${id}`,
    harga_disepakati: harga,
    kode_bayar: 'QRB-1448-001',
    tipe_qurban: 'BELI' as const,
  };
}

test('applyMoveLocal: peserta pindah ke slot kosong di hewan lain', () => {
  const initial = [
    mkHewan('HWN-A', 1, [
      { slot_number: 1, peserta: mkP('PST-1', 1000) },
      { slot_number: 2, peserta: null },
    ]),
    mkHewan('HWN-B', 2, [
      { slot_number: 1, peserta: null },
      { slot_number: 2, peserta: null },
    ]),
  ];
  const next = applyMoveLocal(initial, 'PST-1', 'HWN-B', 2, null);
  assert.equal(next[0].slots[0].peserta, null);
  assert.equal(next[1].slots[1].peserta?.id, 'PST-1');
  assert.equal(next[1].slots[1].peserta?.harga_disepakati, 1000); // tidak berubah
  // initial tak ter-mutasi (immutability)
  assert.equal(initial[0].slots[0].peserta?.id, 'PST-1');
});

test('applyMoveLocal: hargaOverride → harga peserta jadi nilai itu', () => {
  const initial = [
    mkHewan('HWN-A', 1, [
      { slot_number: 1, peserta: mkP('PST-1', 1000) },
      { slot_number: 2, peserta: null },
    ]),
  ];
  const next = applyMoveLocal(initial, 'PST-1', 'HWN-A', 2, 555);
  assert.equal(next[0].slots[1].peserta?.harga_disepakati, 555);
});

test('applyMoveLocal: peserta tidak ditemukan → state tidak berubah (identity)', () => {
  const initial = [
    mkHewan('HWN-A', 1, [{ slot_number: 1, peserta: null }]),
  ];
  const next = applyMoveLocal(initial, 'PST-MISSING', 'HWN-A', 1, null);
  assert.strictEqual(next, initial);
});

test('applySwapLocal: tukar A↔B di hewan berbeda', () => {
  const initial = [
    mkHewan('HWN-A', 1, [
      { slot_number: 1, peserta: mkP('PST-A', 1000) },
    ]),
    mkHewan('HWN-B', 2, [
      { slot_number: 1, peserta: mkP('PST-B', 800) },
    ]),
  ];
  const next = applySwapLocal(initial, 'PST-A', 'PST-B', null, null);
  // Slot A sekarang berisi B (harga tetap B → 800)
  assert.equal(next[0].slots[0].peserta?.id, 'PST-B');
  assert.equal(next[0].slots[0].peserta?.harga_disepakati, 800);
  // Slot B sekarang berisi A (harga tetap A → 1000)
  assert.equal(next[1].slots[0].peserta?.id, 'PST-A');
  assert.equal(next[1].slots[0].peserta?.harga_disepakati, 1000);
});

test('applySwapLocal: hargaOverrideA → harga peserta di slot A (peserta B yg pindah)', () => {
  const initial = [
    mkHewan('HWN-A', 1, [{ slot_number: 1, peserta: mkP('PST-A', 1000) }]),
    mkHewan('HWN-B', 2, [{ slot_number: 1, peserta: mkP('PST-B', 800) }]),
  ];
  const next = applySwapLocal(initial, 'PST-A', 'PST-B', 1234, 5678);
  // Slot A: peserta B dengan harga override A = 1234
  assert.equal(next[0].slots[0].peserta?.id, 'PST-B');
  assert.equal(next[0].slots[0].peserta?.harga_disepakati, 1234);
  // Slot B: peserta A dengan harga override B = 5678
  assert.equal(next[1].slots[0].peserta?.id, 'PST-A');
  assert.equal(next[1].slots[0].peserta?.harga_disepakati, 5678);
});

test('applyRenumberLocal: urutan + nomor_urut ditulis ulang 1..N', () => {
  const initial = [
    mkHewan('HWN-A', 1, []),
    mkHewan('HWN-B', 2, []),
    mkHewan('HWN-C', 3, []),
  ];
  const next = applyRenumberLocal(initial, ['HWN-C', 'HWN-A', 'HWN-B']);
  assert.deepEqual(
    next.map((h) => [h.id, h.nomor_urut]),
    [
      ['HWN-C', 1],
      ['HWN-A', 2],
      ['HWN-B', 3],
    ]
  );
});

test('applyRenumberLocal: id tidak ada di hewan[] → di-skip', () => {
  const initial = [mkHewan('HWN-A', 1, [])];
  const next = applyRenumberLocal(initial, ['HWN-A', 'HWN-MISSING']);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'HWN-A');
});
