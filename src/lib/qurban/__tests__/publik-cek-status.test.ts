import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCekStatusQuery, groupByKodeBayar } from '@/lib/qurban/publik-cek-status';
import type { CekStatusEntry } from '@/lib/qurban/publik-status';

/**
 * Pure client helpers for the F4c-F cek-status page (PB4). The page/route is not
 * unit-tested (no React harness; node:test on pure libs).
 */

function entry(p: Partial<CekStatusEntry>): CekStatusEntry {
  return {
    kode_bayar: 'QRB-1448-001',
    nama: 'Bu**',
    tipe_qurban: 'BELI',
    hewan_id: 'HWN-1',
    slot_number: 1,
    harga_disepakati: 3_000_000,
    status_pendaftaran: 'TERDAFTAR',
    ...p,
  };
}

test('buildCekStatusQuery builds the right query param per mode', () => {
  assert.equal(buildCekStatusQuery('kode_bayar', 'QRB-1448-013'), 'kode_bayar=QRB-1448-013');
  assert.equal(buildCekStatusQuery('no_hp', ' 0822 '), 'no_hp=0822');
});

test('groupByKodeBayar collapses shared-code rows into one group', () => {
  const entries = [
    entry({ kode_bayar: 'QRB-1448-003', slot_number: 1, harga_disepakati: 3_000_000 }),
    entry({ kode_bayar: 'QRB-1448-003', slot_number: 2, harga_disepakati: 3_000_000 }),
    entry({ kode_bayar: 'QRB-1448-003', slot_number: 3, harga_disepakati: 3_000_000 }),
  ];
  const groups = groupByKodeBayar(entries);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kode_bayar, 'QRB-1448-003');
  assert.equal(groups[0].slot_count, 3);
  assert.equal(groups[0].total_harga, 9_000_000);
  assert.equal(groups[0].entries.length, 3);
});

test('groupByKodeBayar keeps distinct registrations separate, preserving order', () => {
  const entries = [
    entry({ kode_bayar: 'QRB-1448-005' }),
    entry({ kode_bayar: 'QRB-1448-002' }),
    entry({ kode_bayar: 'QRB-1448-005' }),
  ];
  const groups = groupByKodeBayar(entries);
  assert.deepEqual(groups.map((g) => g.kode_bayar), ['QRB-1448-005', 'QRB-1448-002']);
  assert.equal(groups[0].slot_count, 2);
  assert.equal(groups[1].slot_count, 1);
});

test('groupByKodeBayar handles empty input', () => {
  assert.deepEqual(groupByKodeBayar([]), []);
});
