import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreTransaksi,
  rankKandidat,
  extractNameTokens,
  bestNameSimilarity,
  SUGGEST_THRESHOLD,
  SCORE_WEIGHTS,
  type KandidatKonteks,
} from '../rekonsiliasi-scoring';
import type { Pembayaran } from '../pembayaran-repo';

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    nominal_total: 1_500_000, nominal_transfer: 1_500_003, metode: 'TRANSFER', status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '', bank_ref: '',
    skm_transaksi_id: '', bukti_url: '', match_metadata: '', notes: '',
    created_at: '', updated_at: '', created_by: 'ANG-1', ...over,
  };
}

function kand(over: Partial<KandidatKonteks> = {}): KandidatKonteks {
  return {
    pembayaran: pay({}),
    muqorib_nama: 'Ahmad Fauzi',
    muqorib_no_hp: '628123456789',
    tanggal_daftar: '2026-05-15T00:00:00.000Z',
    ...over,
  };
}

test('extractNameTokens: buang kode/angka/keyword, sisakan token nama', () => {
  assert.deepEqual(extractNameTokens('TRF QRB-1448-001 Ahmad Fauzi 628'), ['ahmad', 'fauzi']);
  assert.deepEqual(extractNameTokens('QURBAN dari hamba'), ['dari', 'hamba']);
});

test('bestNameSimilarity: token mirip → tinggi; beda → rendah', () => {
  assert.ok(bestNameSimilarity('TRF Ahmad Fauzy', 'Ahmad Fauzi') >= 0.8);
  assert.ok(bestNameSimilarity('Infaq jumat', 'Ahmad Fauzi') < 0.8);
});

test('scoreTransaksi: suffix pakai payment_suffix config (bukan hardcode 3)', () => {
  // suffix=7, jumlah berakhir 007 → dapat poin suffix.
  const r = scoreTransaksi({ deskripsi: 'transfer', jumlah: 1_500_007, tanggal: '2026-05-16' }, kand(), { payment_suffix: 7 });
  assert.ok(r.sinyal.some((s) => s.key === 'suffix' && s.poin === SCORE_WEIGHTS.suffix));
  // suffix=3 → jumlah ...007 TIDAK dapat suffix.
  const r2 = scoreTransaksi({ deskripsi: 'transfer', jumlah: 1_500_007, tanggal: '2026-05-16' }, kand(), { payment_suffix: 3 });
  assert.ok(!r2.sinyal.some((s) => s.key === 'suffix'));
});

test('scoreTransaksi: keyword + nominal(±1%) + tanggal + nama + phone berkontribusi', () => {
  const r = scoreTransaksi(
    { deskripsi: 'QURBAN Ahmad Fauzy 628123456789', jumlah: 1_500_000, tanggal: '2026-05-16' },
    kand(),
    { payment_suffix: 3 }
  );
  const keys = r.sinyal.map((s) => s.key).sort();
  assert.deepEqual(keys, ['keyword', 'nama', 'nominal', 'phone', 'tanggal']);
  assert.equal(
    r.score,
    SCORE_WEIGHTS.keyword + SCORE_WEIGHTS.nominal + SCORE_WEIGHTS.tanggal + SCORE_WEIGHTS.nama + SCORE_WEIGHTS.phone
  );
});

test('scoreTransaksi: tanggal di luar 14 hari tidak dapat poin', () => {
  const r = scoreTransaksi({ deskripsi: 'x', jumlah: 100, tanggal: '2026-07-01' }, kand({ tanggal_daftar: '2026-05-01T00:00:00.000Z' }), { payment_suffix: 3 });
  assert.ok(!r.sinyal.some((s) => s.key === 'tanggal'));
});

test('rankKandidat: hanya ≥ ambang, descending', () => {
  const kuat = kand({ pembayaran: pay({ id: 'BYR-KUAT' }), muqorib_nama: 'Ahmad Fauzi' });
  const lemah = kand({ pembayaran: pay({ id: 'BYR-LEMAH', nominal_total: 9_900_000, nominal_transfer: 9_900_003 }), muqorib_nama: 'Zulkifli Akbar', muqorib_no_hp: '628999', tanggal_daftar: '2026-01-01T00:00:00.000Z' });
  const ranked = rankKandidat(
    { deskripsi: 'QURBAN Ahmad Fauzy 628123456789', jumlah: 1_500_000, tanggal: '2026-05-16' },
    [lemah, kuat],
    { payment_suffix: 3 }
  );
  assert.ok(ranked.length >= 1);
  assert.equal(ranked[0].pembayaran_id, 'BYR-KUAT');
  assert.ok(ranked[0].score >= SUGGEST_THRESHOLD);
  assert.ok(!ranked.some((r) => r.pembayaran_id === 'BYR-LEMAH'));
});

test('rankKandidat: tak ada yang ≥ ambang → kosong', () => {
  const ranked = rankKandidat(
    { deskripsi: 'Infaq jumat', jumlah: 50_000, tanggal: '2026-09-01' },
    [kand({ tanggal_daftar: '2026-05-01T00:00:00.000Z' })],
    { payment_suffix: 3 }
  );
  assert.equal(ranked.length, 0);
});
