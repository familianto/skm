import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNamaAtasNamaPerSlot,
  classifyDuplicate,
  computeHargaPreview,
  findMaster,
  hargaPenuhForTipe,
  hargaPerSlot,
  jenisOptions,
  kelasOptionsForJenis,
  validatePesertaForm,
  type PesertaFormValidationInput,
} from '@/lib/qurban/peserta-form';
import type { MasterHewan } from '@/lib/qurban/master-hewan-display';

/**
 * Pure logic for the F4c-B panitia registration form: pricing preview, hewan
 * option transforms, duplicate classification, form validation. Form/route
 * components aren't unit-tested (repo convention).
 */

function master(p: Partial<MasterHewan>): MasterHewan {
  return {
    id: 'MH-1',
    edisi_id: 'EDS-1',
    jenis: 'SAPI',
    kelas: 'A',
    kapasitas_slot: 7,
    harga_beli: 21000000,
    harga_bawa_sendiri: 7000000,
    is_active: true,
    created_at: '',
    updated_at: '',
    created_by: '',
    ...p,
  };
}

// ── Pricing ──────────────────────────────────────────────────────────────────

test('hargaPenuhForTipe selects beli vs bawa_sendiri', () => {
  const m = master({});
  assert.equal(hargaPenuhForTipe(m, 'BELI'), 21000000);
  assert.equal(hargaPenuhForTipe(m, 'BAWA_SENDIRI'), 7000000);
});

test('hargaPerSlot rounds and guards bad capacity', () => {
  assert.equal(hargaPerSlot(21000000, 7), 3000000);
  assert.equal(hargaPerSlot(1000, 3), 333); // Math.round(333.33)
  assert.equal(hargaPerSlot(1000, 0), 0);
  assert.equal(hargaPerSlot(1000, -1), 0);
});

test('computeHargaPreview multiplies per-slot by jumlah', () => {
  const m = master({ harga_beli: 21000000, kapasitas_slot: 7 });
  assert.deepEqual(computeHargaPreview(m, 'BELI', 3), { per_slot: 3000000, total: 9000000 });
  assert.deepEqual(computeHargaPreview(m, 'BELI', 7), { per_slot: 3000000, total: 21000000 });
});

test('computeHargaPreview returns zeros when incomplete', () => {
  const m = master({});
  assert.deepEqual(computeHargaPreview(null, 'BELI', 3), { per_slot: 0, total: 0 });
  assert.deepEqual(computeHargaPreview(m, '', 3), { per_slot: 0, total: 0 });
  assert.deepEqual(computeHargaPreview(m, 'BELI', 0), { per_slot: 3000000, total: 0 });
});

// ── Hewan option transforms ──────────────────────────────────────────────────

test('jenisOptions returns distinct sorted jenis', () => {
  const masters = [
    master({ id: 'a', jenis: 'SAPI', kelas: 'A' }),
    master({ id: 'b', jenis: 'KAMBING', kelas: 'A' }),
    master({ id: 'c', jenis: 'SAPI', kelas: 'B' }),
  ];
  assert.deepEqual(jenisOptions(masters), ['KAMBING', 'SAPI']);
});

test('kelasOptionsForJenis filters + sorts by kelas', () => {
  const masters = [
    master({ id: 'a', jenis: 'SAPI', kelas: 'B' }),
    master({ id: 'b', jenis: 'SAPI', kelas: 'A' }),
    master({ id: 'c', jenis: 'KAMBING', kelas: 'A' }),
  ];
  const out = kelasOptionsForJenis(masters, 'SAPI');
  assert.deepEqual(out.map((m) => m.kelas), ['A', 'B']);
});

test('findMaster resolves a (jenis, kelas) pair', () => {
  const masters = [
    master({ id: 'a', jenis: 'SAPI', kelas: 'A' }),
    master({ id: 'b', jenis: 'SAPI', kelas: 'B' }),
  ];
  assert.equal(findMaster(masters, 'SAPI', 'B')?.id, 'b');
  assert.equal(findMaster(masters, 'KAMBING', 'A'), undefined);
});

// ── Duplicate classification ──────────────────────────────────────────────────

test('classifyDuplicate prioritises terdaftar, then batal_only, then none', () => {
  assert.equal(classifyDuplicate(2, 0), 'terdaftar');
  assert.equal(classifyDuplicate(1, 3), 'terdaftar');
  assert.equal(classifyDuplicate(0, 2), 'batal_only');
  assert.equal(classifyDuplicate(0, 0), 'none');
});

// ── Form validation ───────────────────────────────────────────────────────────

function validInput(p: Partial<PesertaFormValidationInput> = {}): PesertaFormValidationInput {
  return {
    masterHewanId: 'MH-1',
    tipe: 'BELI',
    jumlahSlot: 1,
    availableSlots: 7,
    muqoribId: 'MQB-1',
    creatingMuqorib: false,
    confirmed: true,
    ...p,
  };
}

test('validatePesertaForm passes a complete input', () => {
  assert.deepEqual(validatePesertaForm(validInput()), []);
});

test('validatePesertaForm flags missing hewan/tipe', () => {
  const errs = validatePesertaForm(validInput({ masterHewanId: '', tipe: '' }));
  assert.ok(errs.some((e) => e.field === 'hewan'));
});

test('validatePesertaForm flags slot bounds', () => {
  assert.ok(validatePesertaForm(validInput({ jumlahSlot: 0 })).some((e) => e.field === 'jumlah_slot'));
  assert.ok(
    validatePesertaForm(validInput({ jumlahSlot: 8, availableSlots: 7 })).some(
      (e) => e.field === 'jumlah_slot'
    )
  );
  assert.ok(
    validatePesertaForm(validInput({ availableSlots: 0 })).some((e) => e.field === 'jumlah_slot')
  );
});

test('validatePesertaForm requires a muqorib only on existing path', () => {
  assert.ok(validatePesertaForm(validInput({ muqoribId: '' })).some((e) => e.field === 'muqorib'));
  // On the create-new path the id is resolved later, so no muqorib error.
  assert.ok(
    !validatePesertaForm(validInput({ muqoribId: '', creatingMuqorib: true })).some(
      (e) => e.field === 'muqorib'
    )
  );
});

test('validatePesertaForm requires confirmation', () => {
  assert.ok(validatePesertaForm(validInput({ confirmed: false })).some((e) => e.field === 'confirm'));
});

// ── nama_atas_nama_per_slot ───────────────────────────────────────────────────

test('buildNamaAtasNamaPerSlot fills array of length jumlahSlot', () => {
  assert.deepEqual(buildNamaAtasNamaPerSlot('Hamba Allah', 3), [
    'Hamba Allah',
    'Hamba Allah',
    'Hamba Allah',
  ]);
  assert.deepEqual(buildNamaAtasNamaPerSlot('  ', 2), ['', '']);
  assert.deepEqual(buildNamaAtasNamaPerSlot('X', 0), []);
});
