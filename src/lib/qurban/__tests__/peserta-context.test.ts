import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePesertaEdisiGate } from '../peserta-context';
import { PERAN } from '@/lib/api/permissions';
import { ErrorCodes } from '@/lib/api/errors';
import type { Edisi } from '../edisi-repo';
import type { EdisiStatus } from '../edisi-state-machine';

function edisi(status: EdisiStatus): Edisi {
  return {
    id: 'EDS-1', tahun_hijriah: '1448', tahun_masehi: 2026, tanggal_idul_adha: '',
    tanggal_pendaftaran_buka: '', tanggal_pendaftaran_tutup: '', status,
    parent_edisi_id: '', cloned_at: '', created_at: '', updated_at: '', created_by: '',
  };
}

test('edisi null → 404 NOT_FOUND apa pun opsinya', () => {
  const d = evaluatePesertaEdisiGate(null, PERAN.SUPER_ADMIN, {});
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.status, 404);
});

test('read: panitia (PENDAFTARAN) hanya boleh AKTIF', () => {
  assert.equal(evaluatePesertaEdisiGate(edisi('AKTIF'), PERAN.PENDAFTARAN, {}).ok, true);
  const draft = evaluatePesertaEdisiGate(edisi('DRAFT'), PERAN.PENDAFTARAN, {});
  assert.equal(draft.ok, false);
  if (!draft.ok) {
    assert.equal(draft.status, 403);
    assert.equal(draft.code, ErrorCodes.FORBIDDEN_EDISI);
  }
});

test('read: non-panitia (SA) boleh edisi non-AKTIF', () => {
  assert.equal(evaluatePesertaEdisiGate(edisi('DRAFT'), PERAN.SUPER_ADMIN, {}).ok, true);
  assert.equal(evaluatePesertaEdisiGate(edisi('SELESAI'), PERAN.SUPER_ADMIN, {}).ok, true);
});

test('requireAktif (PS2 create): semua peran ditolak kalau bukan AKTIF', () => {
  assert.equal(evaluatePesertaEdisiGate(edisi('AKTIF'), PERAN.SUPER_ADMIN, { requireAktif: true }).ok, true);
  for (const status of ['DRAFT', 'SELESAI'] as const) {
    const d = evaluatePesertaEdisiGate(edisi(status), PERAN.SUPER_ADMIN, { requireAktif: true });
    assert.equal(d.ok, false, status);
    if (!d.ok) {
      assert.equal(d.status, 422);
      assert.equal(d.code, ErrorCodes.BUSINESS_EDISI_NOT_AKTIF);
    }
  }
});

test('requireWritable (PS4/PS5): SELESAI ditolak untuk semua', () => {
  const d = evaluatePesertaEdisiGate(edisi('SELESAI'), PERAN.ADMIN_QURBAN, { requireWritable: true });
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.status, 422);
    assert.equal(d.code, ErrorCodes.BUSINESS_EDISI_LOCKED);
  }
  assert.equal(evaluatePesertaEdisiGate(edisi('AKTIF'), PERAN.ADMIN_QURBAN, { requireWritable: true }).ok, true);
});
