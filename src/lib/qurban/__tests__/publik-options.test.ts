import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTipeOptions, type OptionHewan } from '../publik-options';
import type { QurbanMasterHewan } from '../master-hewan-repo';

function mkMaster(p: Partial<QurbanMasterHewan> = {}): QurbanMasterHewan {
  return {
    id: 'MHW-SAPI',
    edisi_id: 'EDS-1',
    jenis: 'SAPI',
    kelas: 'A',
    kapasitas_slot: 7,
    harga_beli: 21_000_000,
    harga_bawa_sendiri: 3_500_000,
    is_active: true,
    created_at: '',
    updated_at: '',
    created_by: '',
    ...p,
  };
}

test('groups empty slots per (master, tipe) and prices per slot', () => {
  const masters = [mkMaster()];
  const hewan: OptionHewan[] = [
    { id: 'H1', master_hewan_id: 'MHW-SAPI', tipe_pembelian: 'BELI', kapasitas_slot: 7 },
    { id: 'H2', master_hewan_id: 'MHW-SAPI', tipe_pembelian: 'BELI', kapasitas_slot: 7 },
  ];
  const occupied = new Map<string, Set<number>>([['H1', new Set([1, 2, 3])]]); // H1: 4 free, H2: 7 free

  const opts = buildTipeOptions(masters, hewan, occupied);
  assert.equal(opts.length, 1);
  assert.deepEqual(opts[0], {
    master_hewan_id: 'MHW-SAPI',
    jenis: 'SAPI',
    kelas: 'A',
    kapasitas_slot: 7,
    tipe_qurban: 'BELI',
    harga_per_slot: 3_000_000, // 21,000,000 / 7
    slot_tersedia: 11,
  });
});

test('separates BELI and BAWA_SENDIRI of the same master', () => {
  const masters = [mkMaster()];
  const hewan: OptionHewan[] = [
    { id: 'H1', master_hewan_id: 'MHW-SAPI', tipe_pembelian: 'BELI', kapasitas_slot: 7 },
    { id: 'H2', master_hewan_id: 'MHW-SAPI', tipe_pembelian: 'BAWA_SENDIRI', kapasitas_slot: 7 },
  ];
  const opts = buildTipeOptions(masters, hewan, new Map());
  assert.equal(opts.length, 2);
  const beli = opts.find((o) => o.tipe_qurban === 'BELI')!;
  const bawa = opts.find((o) => o.tipe_qurban === 'BAWA_SENDIRI')!;
  assert.equal(beli.harga_per_slot, 3_000_000);
  assert.equal(bawa.harga_per_slot, 500_000); // 3,500,000 / 7
});

test('omits fully-occupied combinations (slot_tersedia must be > 0)', () => {
  const masters = [mkMaster()];
  const hewan: OptionHewan[] = [
    { id: 'H1', master_hewan_id: 'MHW-SAPI', tipe_pembelian: 'BELI', kapasitas_slot: 1 },
  ];
  const occupied = new Map<string, Set<number>>([['H1', new Set([1])]]); // full
  assert.deepEqual(buildTipeOptions(masters, hewan, occupied), []);
});

test('skips physical hewan whose master is absent/inactive', () => {
  const masters: QurbanMasterHewan[] = []; // no active master
  const hewan: OptionHewan[] = [
    { id: 'H1', master_hewan_id: 'MHW-SAPI', tipe_pembelian: 'BELI', kapasitas_slot: 7 },
  ];
  assert.deepEqual(buildTipeOptions(masters, hewan, new Map()), []);
});
