import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateDaftarHewanCreate,
  validateDaftarHewanPatch,
  validateReorderPayload,
  validateBatchStatusPayload,
  isValidYmd,
} from '../validators';
import { evaluateEdisiGate } from '../daftar-hewan-context';
import type { Edisi } from '../edisi-repo';
import type { EdisiStatus } from '../edisi-state-machine';

// ---------------------------------------------------------------------------
// isValidYmd
// ---------------------------------------------------------------------------

test('isValidYmd menerima tanggal valid & menolak yang invalid', () => {
  assert.equal(isValidYmd('2026-06-07'), true);
  assert.equal(isValidYmd('2026-13-01'), false); // bulan 13
  assert.equal(isValidYmd('2026-02-30'), false); // 30 Feb
  assert.equal(isValidYmd('2026-6-7'), false); // tanpa padding
  assert.equal(isValidYmd('07/06/2026'), false);
});

// ---------------------------------------------------------------------------
// validateDaftarHewanCreate
// ---------------------------------------------------------------------------

test('create: payload minimal valid (default status AKTIF, harga 0)', () => {
  const r = validateDaftarHewanCreate({ master_hewan_id: 'MHW-1', tipe_pembelian: 'BELI' });
  assert.equal(r.ok, true);
  assert.equal(r.value?.status, 'AKTIF');
  assert.equal(r.value?.harga_beli_aktual, 0);
});

test('create: master_hewan_id wajib', () => {
  const r = validateDaftarHewanCreate({ tipe_pembelian: 'BELI' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'master_hewan_id'));
});

test('create: tipe_pembelian harus enum', () => {
  const r = validateDaftarHewanCreate({ master_hewan_id: 'MHW-1', tipe_pembelian: 'SEWA' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'tipe_pembelian'));
});

test('create: status hanya boleh DRAFT/AKTIF', () => {
  const r = validateDaftarHewanCreate({ master_hewan_id: 'MHW-1', tipe_pembelian: 'BELI', status: 'TERPOTONG' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'status'));
});

test('create: tanggal_pembelian format diperiksa', () => {
  const r = validateDaftarHewanCreate({ master_hewan_id: 'MHW-1', tipe_pembelian: 'BELI', tanggal_pembelian: '7 Juni' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'tanggal_pembelian'));
});

// ---------------------------------------------------------------------------
// validateDaftarHewanPatch
// ---------------------------------------------------------------------------

test('patch: menolak field immutable', () => {
  for (const f of ['jenis', 'kelas', 'nomor_urut', 'status', 'tipe_pembelian', 'master_hewan_id', 'nomor_urut_pemotongan']) {
    const r = validateDaftarHewanPatch({ [f]: 'x' });
    assert.equal(r.ok, false, `field ${f} harus ditolak`);
    assert.ok(r.errors.some((e) => e.field === f));
  }
});

test('patch: minimal satu field patchable', () => {
  const r = validateDaftarHewanPatch({});
  assert.equal(r.ok, false);
});

test('patch: field patchable valid', () => {
  const r = validateDaftarHewanPatch({ vendor_nama: ' Pak Vendor ', notes: 'catatan' });
  assert.equal(r.ok, true);
  assert.equal(r.value?.vendor_nama, 'Pak Vendor');
});

// ---------------------------------------------------------------------------
// validateReorderPayload
// ---------------------------------------------------------------------------

test('reorder: payload valid', () => {
  const r = validateReorderPayload({ jenis: 'SAPI', kelas: 'A', ordered_hewan_ids: ['HWN-1', 'HWN-2'] });
  assert.equal(r.ok, true);
});

test('reorder: ordered_hewan_ids wajib array tidak kosong', () => {
  const r = validateReorderPayload({ jenis: 'SAPI', kelas: 'A', ordered_hewan_ids: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'ordered_hewan_ids'));
});

// ---------------------------------------------------------------------------
// validateBatchStatusPayload
// ---------------------------------------------------------------------------

test('batch-status: TERPOTONG wajib tanggal_pemotongan', () => {
  const r = validateBatchStatusPayload({ hewan_ids: ['HWN-1'], target_status: 'TERPOTONG' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'tanggal_pemotongan'));
});

test('batch-status: TERPOTONG dengan tanggal valid → ok', () => {
  const r = validateBatchStatusPayload({ hewan_ids: ['HWN-1'], target_status: 'TERPOTONG', tanggal_pemotongan: '2026-06-07' });
  assert.equal(r.ok, true);
});

test('batch-status: target_status harus enum', () => {
  const r = validateBatchStatusPayload({ hewan_ids: ['HWN-1'], target_status: 'DRAFT' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'target_status'));
});

// ---------------------------------------------------------------------------
// evaluateEdisiGate — kunci edisi & panitia lock
// ---------------------------------------------------------------------------

function makeEdisi(status: EdisiStatus): Edisi {
  return {
    id: 'EDS-1',
    tahun_hijriah: '1448H',
    tahun_masehi: 2026,
    tanggal_idul_adha: '',
    tanggal_pendaftaran_buka: '',
    tanggal_pendaftaran_tutup: '',
    status,
    parent_edisi_id: '',
    cloned_at: '',
    created_at: '',
    updated_at: '',
    created_by: '',
    pemetaan_version: '',
  };
}

test('gate: edisi SELESAI menolak write (BUSINESS_EDISI_LOCKED)', () => {
  const d = evaluateEdisiGate(makeEdisi('SELESAI'), 'SUPER_ADMIN', { requireWritable: true });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.code, 'BUSINESS_EDISI_LOCKED');
});

test('gate: edisi SELESAI tetap boleh dibaca', () => {
  const d = evaluateEdisiGate(makeEdisi('SELESAI'), 'SUPER_ADMIN', { requireWritable: false });
  assert.equal(d.ok, true);
});

test('gate: DRAFT boleh ditulis oleh SA/AQ', () => {
  assert.equal(evaluateEdisiGate(makeEdisi('DRAFT'), 'SUPER_ADMIN', { requireWritable: true }).ok, true);
  assert.equal(evaluateEdisiGate(makeEdisi('DRAFT'), 'ADMIN_QURBAN', { requireWritable: true }).ok, true);
});

test('gate: PENDAFTARAN hanya boleh edisi AKTIF', () => {
  const draft = evaluateEdisiGate(makeEdisi('DRAFT'), 'PENDAFTARAN', { requireWritable: true });
  assert.equal(draft.ok, false);
  if (!draft.ok) assert.equal(draft.code, 'FORBIDDEN_EDISI');
  assert.equal(evaluateEdisiGate(makeEdisi('AKTIF'), 'PENDAFTARAN', { requireWritable: true }).ok, true);
});

test('gate: edisi null → NOT_FOUND', () => {
  const d = evaluateEdisiGate(null, 'SUPER_ADMIN', { requireWritable: false });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.code, 'NOT_FOUND');
});
