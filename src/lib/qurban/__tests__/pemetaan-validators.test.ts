import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PEMETAAN_BATCH_SAVE_SCHEMA,
  OPERATION_SCHEMA,
} from '../pemetaan-validators';

/**
 * F5b A2 — Zod schema-level validasi PM1.
 *
 * Hanya bentuk + range numerik dasar. Validasi bisnis (peserta/hewan exists,
 * kapasitas, kolisi cross-op) di engine, bukan di sini.
 */

test('move_peserta minimal ok (use_old)', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 1,
    harga_decision: 'use_old',
  });
  assert.equal(r.success, true);
});

test('move use_new ok tanpa harga_override', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 2,
    harga_decision: 'use_new',
  });
  assert.equal(r.success, true);
});

test('move use_custom WAJIB harga_override', () => {
  const ok = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 1,
    harga_decision: 'use_custom',
    harga_override: 1000,
  });
  assert.equal(ok.success, true);

  const bad = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 1,
    harga_decision: 'use_custom',
  });
  assert.equal(bad.success, false);
});

test('move harga_decision use_existing_target DITOLAK (hanya valid di swap)', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 1,
    harga_decision: 'use_existing_target' as never,
  });
  assert.equal(r.success, false);
});

test('move target_slot_number < 1 ditolak', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 0,
    harga_decision: 'use_old',
  });
  assert.equal(r.success, false);
});

test('move harga_override negatif ditolak (use_custom)', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'move_peserta',
    peserta_id: 'PST-1',
    target_hewan_id: 'HWN-1',
    target_slot_number: 1,
    harga_decision: 'use_custom',
    harga_override: -1,
  });
  assert.equal(r.success, false);
});

test('swap minimal ok (use_old)', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'swap_peserta',
    peserta_a_id: 'PST-A',
    peserta_b_id: 'PST-B',
    harga_decision: 'use_old',
  });
  assert.equal(r.success, true);
});

test('swap use_existing_target ok', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'swap_peserta',
    peserta_a_id: 'PST-A',
    peserta_b_id: 'PST-B',
    harga_decision: 'use_existing_target',
  });
  assert.equal(r.success, true);
});

test('swap peserta_a == peserta_b ditolak', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'swap_peserta',
    peserta_a_id: 'PST-A',
    peserta_b_id: 'PST-A',
    harga_decision: 'use_old',
  });
  assert.equal(r.success, false);
});

test('swap use_custom WAJIB kedua harga_override', () => {
  const both = OPERATION_SCHEMA.safeParse({
    type: 'swap_peserta',
    peserta_a_id: 'PST-A',
    peserta_b_id: 'PST-B',
    harga_decision: 'use_custom',
    harga_override_a: 100,
    harga_override_b: 200,
  });
  assert.equal(both.success, true);

  const onlyA = OPERATION_SCHEMA.safeParse({
    type: 'swap_peserta',
    peserta_a_id: 'PST-A',
    peserta_b_id: 'PST-B',
    harga_decision: 'use_custom',
    harga_override_a: 100,
  });
  assert.equal(onlyA.success, false);
});

test('renumber_hewan ok', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'renumber_hewan',
    hewan_id: 'HWN-1',
    new_nomor_urut: 3,
  });
  assert.equal(r.success, true);
});

test('renumber_hewan new_nomor_urut < 1 ditolak', () => {
  const r = OPERATION_SCHEMA.safeParse({
    type: 'renumber_hewan',
    hewan_id: 'HWN-1',
    new_nomor_urut: 0,
  });
  assert.equal(r.success, false);
});

test('request body minimal: 1 op ok', () => {
  const r = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse({
    edisi_id: 'EDS-1',
    expected_version: '2026-05-28T10:00:00.000Z',
    operations: [
      {
        type: 'move_peserta',
        peserta_id: 'PST-1',
        target_hewan_id: 'HWN-1',
        target_slot_number: 1,
        harga_decision: 'use_old',
      },
    ],
  });
  assert.equal(r.success, true);
});

test('request body: operations kosong ditolak', () => {
  const r = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse({
    edisi_id: 'EDS-1',
    expected_version: '2026-05-28T10:00:00.000Z',
    operations: [],
  });
  assert.equal(r.success, false);
});

test('request body: operations > 100 ditolak', () => {
  const ops = Array.from({ length: 101 }, (_, i) => ({
    type: 'renumber_hewan' as const,
    hewan_id: `HWN-${i}`,
    new_nomor_urut: i + 1,
  }));
  const r = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse({
    edisi_id: 'EDS-1',
    expected_version: '2026-05-28T10:00:00.000Z',
    operations: ops,
  });
  assert.equal(r.success, false);
});

test('request body: edisi_id / expected_version kosong ditolak', () => {
  const r1 = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse({
    edisi_id: '',
    expected_version: 'x',
    operations: [
      { type: 'renumber_hewan', hewan_id: 'HWN-1', new_nomor_urut: 1 },
    ],
  });
  assert.equal(r1.success, false);

  const r2 = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse({
    edisi_id: 'EDS-1',
    expected_version: '',
    operations: [
      { type: 'renumber_hewan', hewan_id: 'HWN-1', new_nomor_urut: 1 },
    ],
  });
  assert.equal(r2.success, false);
});

test('audit_notes > 500 char ditolak', () => {
  const longNotes = 'x'.repeat(501);
  const r = PEMETAAN_BATCH_SAVE_SCHEMA.safeParse({
    edisi_id: 'EDS-1',
    expected_version: '2026-05-28T10:00:00.000Z',
    operations: [{ type: 'renumber_hewan', hewan_id: 'HWN-1', new_nomor_urut: 1 }],
    audit_notes: longNotes,
  });
  assert.equal(r.success, false);
});
