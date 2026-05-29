import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSimulateState, simulateBatch, type MasterIndexEntry } from '../pemetaan-engine';
import type { QurbanPeserta } from '../peserta-types';
import type { QurbanDaftarHewan } from '../daftar-hewan-types';
import type { Operation } from '../pemetaan-validators';

/**
 * F5b A2 — engine simulasi cross-op + matriks harga.
 */

function mkP(p: Partial<QurbanPeserta>): QurbanPeserta {
  return {
    id: 'PST-1',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 1000000,
    kode_bayar: 'QRB-1448-001',
    sumber_pendaftaran: 'PANITIA',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: '',
    notes: '',
    created_at: '',
    updated_at: '',
    created_by: '',
    ...p,
  };
}

function mkH(h: Partial<QurbanDaftarHewan>): QurbanDaftarHewan {
  return {
    id: 'HWN-1',
    edisi_id: 'EDS-1',
    master_hewan_id: 'MHW-SAPI-A',
    jenis: 'SAPI',
    kelas: 'A',
    nomor_urut: 1,
    kapasitas_slot: 7,
    tipe_pembelian: 'BELI',
    vendor_nama: '',
    harga_beli_aktual: 0,
    tanggal_pembelian: '',
    status: 'AKTIF',
    notes: '',
    nomor_urut_pemotongan: null,
    created_at: '',
    updated_at: '',
    created_by: '',
    ...h,
  };
}

const MASTER = new Map<string, MasterIndexEntry>([
  ['MHW-SAPI-A', { harga: 1000000 }],
  ['MHW-SAPI-B', { harga: 800000 }],
  ['MHW-KAMBING-A', { harga: 2500000 }],
]);

// ---------------------------------------------------------------------------
// move_peserta — happy path & matriks harga
// ---------------------------------------------------------------------------

test('move ke slot kosong → ok; diff peserta benar', () => {
  const state = buildSimulateState(
    [mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 })],
    [mkH({ id: 'HWN-1', kapasitas_slot: 7 })]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 5,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.changes.pesertaIds, ['PST-A']);
  assert.deepEqual(res.changes.hewanIds, []);
  assert.equal(res.state.peserta.get('PST-A')!.slot_number, 5);
  assert.equal(res.state.peserta.get('PST-A')!.harga_disepakati, 1000000); // tidak berubah
});

test('move use_new → harga = master[target.master_hewan_id]', () => {
  const state = buildSimulateState(
    [mkP({ id: 'PST-A', hewan_id: 'HWN-A', slot_number: 1, harga_disepakati: 1000000 })],
    [
      mkH({ id: 'HWN-A', master_hewan_id: 'MHW-SAPI-A', kapasitas_slot: 7 }),
      mkH({ id: 'HWN-B', master_hewan_id: 'MHW-SAPI-B', kapasitas_slot: 7, nomor_urut: 2 }),
    ]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-B',
      target_slot_number: 1,
      harga_decision: 'use_new',
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.state.peserta.get('PST-A')!.harga_disepakati, 800000);
  assert.equal(res.state.peserta.get('PST-A')!.hewan_id, 'HWN-B');
});

test('move use_custom → harga = harga_override', () => {
  const state = buildSimulateState(
    [mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 })],
    [mkH({ id: 'HWN-1' })]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 3,
      harga_decision: 'use_custom',
      harga_override: 750000,
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.state.peserta.get('PST-A')!.harga_disepakati, 750000);
});

test('move ke slot terisi peserta lain → final-state collision', () => {
  const state = buildSimulateState(
    [
      mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 }),
      mkP({ id: 'PST-B', hewan_id: 'HWN-1', slot_number: 2 }),
    ],
    [mkH({ id: 'HWN-1', kapasitas_slot: 7 })]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 2,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errorCode, 'SLOT_COLLISION');
});

test('move target_slot_number > kapasitas → fail SLOT_OUT_OF_RANGE', () => {
  const state = buildSimulateState(
    [mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 })],
    [mkH({ id: 'HWN-1', kapasitas_slot: 7 })]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 10,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errorCode, 'SLOT_OUT_OF_RANGE');
  assert.equal(res.failedOpIndex, 0);
});

test('move peserta BATAL → fail PESERTA_NOT_TERDAFTAR', () => {
  const state = buildSimulateState(
    [mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1, status_pendaftaran: 'BATAL' })],
    [mkH({ id: 'HWN-1' })]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 2,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errorCode, 'PESERTA_NOT_TERDAFTAR');
});

test('move ke hewan tidak AKTIF (DRAFT/TERPOTONG) → fail HEWAN_NOT_AKTIF', () => {
  const state = buildSimulateState(
    [mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 })],
    [
      mkH({ id: 'HWN-1' }),
      mkH({ id: 'HWN-DRAFT', status: 'DRAFT', nomor_urut: 2 }),
    ]
  );
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-DRAFT',
      target_slot_number: 1,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errorCode, 'HEWAN_NOT_AKTIF');
});

// ---------------------------------------------------------------------------
// swap_peserta — matriks harga (4 case)
// ---------------------------------------------------------------------------

function setupSwap(): ReturnType<typeof buildSimulateState> {
  return buildSimulateState(
    [
      mkP({ id: 'PST-A', hewan_id: 'HWN-A', slot_number: 1, harga_disepakati: 1000000 }),
      mkP({ id: 'PST-B', hewan_id: 'HWN-B', slot_number: 3, harga_disepakati: 800000 }),
    ],
    [
      mkH({ id: 'HWN-A', master_hewan_id: 'MHW-SAPI-A', kapasitas_slot: 7, nomor_urut: 1 }),
      mkH({ id: 'HWN-B', master_hewan_id: 'MHW-SAPI-B', kapasitas_slot: 7, nomor_urut: 2 }),
    ]
  );
}

test('swap use_old → posisi tukar, harga tetap', () => {
  const res = simulateBatch(setupSwap(), MASTER, [
    {
      type: 'swap_peserta',
      peserta_a_id: 'PST-A',
      peserta_b_id: 'PST-B',
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const a = res.state.peserta.get('PST-A')!;
  const b = res.state.peserta.get('PST-B')!;
  assert.equal(a.hewan_id, 'HWN-B');
  assert.equal(a.slot_number, 3);
  assert.equal(a.harga_disepakati, 1000000);
  assert.equal(b.hewan_id, 'HWN-A');
  assert.equal(b.slot_number, 1);
  assert.equal(b.harga_disepakati, 800000);
  assert.deepEqual(res.changes.pesertaIds.sort(), ['PST-A', 'PST-B']);
});

test('swap use_new → harga ikut master hewan tujuan masing-masing', () => {
  // A pindah ke HWN-B (master SAPI-B → 800000). B pindah ke HWN-A (master SAPI-A → 1000000).
  const res = simulateBatch(setupSwap(), MASTER, [
    {
      type: 'swap_peserta',
      peserta_a_id: 'PST-A',
      peserta_b_id: 'PST-B',
      harga_decision: 'use_new',
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.state.peserta.get('PST-A')!.harga_disepakati, 800000);
  assert.equal(res.state.peserta.get('PST-B')!.harga_disepakati, 1000000);
});

test('swap use_existing_target → tukar harga (A↔B)', () => {
  const res = simulateBatch(setupSwap(), MASTER, [
    {
      type: 'swap_peserta',
      peserta_a_id: 'PST-A',
      peserta_b_id: 'PST-B',
      harga_decision: 'use_existing_target',
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.state.peserta.get('PST-A')!.harga_disepakati, 800000);
  assert.equal(res.state.peserta.get('PST-B')!.harga_disepakati, 1000000);
});

test('swap use_custom → harga ikut override masing-masing', () => {
  const res = simulateBatch(setupSwap(), MASTER, [
    {
      type: 'swap_peserta',
      peserta_a_id: 'PST-A',
      peserta_b_id: 'PST-B',
      harga_decision: 'use_custom',
      harga_override_a: 1234,
      harga_override_b: 5678,
    },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.state.peserta.get('PST-A')!.harga_disepakati, 1234);
  assert.equal(res.state.peserta.get('PST-B')!.harga_disepakati, 5678);
});

test('swap dengan peserta tidak ada → fail PESERTA_NOT_FOUND', () => {
  const res = simulateBatch(setupSwap(), MASTER, [
    {
      type: 'swap_peserta',
      peserta_a_id: 'PST-A',
      peserta_b_id: 'PST-MISSING',
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errorCode, 'PESERTA_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// renumber_hewan
// ---------------------------------------------------------------------------

test('renumber: dua hewan tukar nomor_urut (op1 H1→2, op2 H2→1) → ok, keduanya ber-changed', () => {
  const state = buildSimulateState(
    [],
    [
      mkH({ id: 'HWN-1', nomor_urut: 1 }),
      mkH({ id: 'HWN-2', nomor_urut: 2 }),
    ]
  );
  const res = simulateBatch(state, MASTER, [
    { type: 'renumber_hewan', hewan_id: 'HWN-1', new_nomor_urut: 2 },
    { type: 'renumber_hewan', hewan_id: 'HWN-2', new_nomor_urut: 1 },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.changes.hewanIds.sort(), ['HWN-1', 'HWN-2']);
  assert.equal(res.state.hewan.get('HWN-1')!.nomor_urut, 2);
  assert.equal(res.state.hewan.get('HWN-2')!.nomor_urut, 1);
});

test('renumber: hewan tidak ada → fail HEWAN_NOT_FOUND', () => {
  const state = buildSimulateState([], [mkH({ id: 'HWN-1' })]);
  const res = simulateBatch(state, MASTER, [
    { type: 'renumber_hewan', hewan_id: 'HWN-MISSING', new_nomor_urut: 3 },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errorCode, 'HEWAN_NOT_FOUND');
});

test('renumber: new_nomor_urut sama dengan saat ini → ok, tidak ditandai changed', () => {
  const state = buildSimulateState(
    [],
    [mkH({ id: 'HWN-1', nomor_urut: 3 })]
  );
  const res = simulateBatch(state, MASTER, [
    { type: 'renumber_hewan', hewan_id: 'HWN-1', new_nomor_urut: 3 },
  ]);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.changes.hewanIds, []);
});

// ---------------------------------------------------------------------------
// Cross-op
// ---------------------------------------------------------------------------

test('cross-op: move A ke (H1,3), lalu swap A↔B → A & B konsisten', () => {
  const state = buildSimulateState(
    [
      mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1, harga_disepakati: 1000000 }),
      mkP({ id: 'PST-B', hewan_id: 'HWN-2', slot_number: 5, harga_disepakati: 800000 }),
    ],
    [
      mkH({ id: 'HWN-1' }),
      mkH({ id: 'HWN-2', master_hewan_id: 'MHW-SAPI-B', nomor_urut: 2 }),
    ]
  );
  const ops: Operation[] = [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 3,
      harga_decision: 'use_old',
    },
    {
      type: 'swap_peserta',
      peserta_a_id: 'PST-A',
      peserta_b_id: 'PST-B',
      harga_decision: 'use_old',
    },
  ];
  const res = simulateBatch(state, MASTER, ops);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  // Setelah op1: A → HWN-1 slot 3. Setelah op2 swap A↔B:
  //   A baru: posisi B sebelum swap → HWN-2 slot 5.
  //   B baru: posisi A sebelum swap → HWN-1 slot 3.
  const a = res.state.peserta.get('PST-A')!;
  const b = res.state.peserta.get('PST-B')!;
  assert.equal(a.hewan_id, 'HWN-2');
  assert.equal(a.slot_number, 5);
  assert.equal(b.hewan_id, 'HWN-1');
  assert.equal(b.slot_number, 3);
});

test('cross-op konflik: dua move ke slot sama → op kedua fail collision', () => {
  const state = buildSimulateState(
    [
      mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 }),
      mkP({ id: 'PST-B', hewan_id: 'HWN-1', slot_number: 2 }),
    ],
    [mkH({ id: 'HWN-1', kapasitas_slot: 7 })]
  );
  // Op1: A → slot 5 (kosong). Op2: B → slot 5 (sudah ke-isi A oleh op1).
  const res = simulateBatch(state, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 5,
      harga_decision: 'use_old',
    },
    {
      type: 'move_peserta',
      peserta_id: 'PST-B',
      target_hewan_id: 'HWN-1',
      target_slot_number: 5,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, false);
  if (res.ok) return;
  // Final-state validator yang menangkap (op individu tidak tahu posisi A
  // sudah pindah → ke slot 5 valid; tabrakan baru ketahuan di pass akhir).
  assert.equal(res.errorCode, 'SLOT_COLLISION');
});

test('initialState tidak ter-mutasi (deep clone)', () => {
  const peserta = [mkP({ id: 'PST-A', hewan_id: 'HWN-1', slot_number: 1 })];
  const hewan = [mkH({ id: 'HWN-1' })];
  const initial = buildSimulateState(peserta, hewan);
  const beforeSlot = initial.peserta.get('PST-A')!.slot_number;
  const res = simulateBatch(initial, MASTER, [
    {
      type: 'move_peserta',
      peserta_id: 'PST-A',
      target_hewan_id: 'HWN-1',
      target_slot_number: 4,
      harga_decision: 'use_old',
    },
  ]);
  assert.equal(res.ok, true);
  // initial state TIDAK boleh ter-mutasi.
  assert.equal(initial.peserta.get('PST-A')!.slot_number, beforeSlot);
});
