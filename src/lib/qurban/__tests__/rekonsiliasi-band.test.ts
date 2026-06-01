import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isWithinReconBand,
  QURBAN_RECON_BAND_MIN,
  QURBAN_RECON_BAND_MAX,
} from '../rekonsiliasi-band';
import { buildSuggestionBuckets, type RekonContext } from '../rekonsiliasi-report';
import { classifyTransaksi, indexPembayaranByKode } from '../rekonsiliasi-engine';
import type { Pembayaran } from '../pembayaran-repo';
import type { TransaksiLite } from '../skm-bridge';

test('isWithinReconBand: batas inklusif [MIN, MAX]', () => {
  assert.equal(isWithinReconBand(QURBAN_RECON_BAND_MIN), true);
  assert.equal(isWithinReconBand(QURBAN_RECON_BAND_MAX), true);
  assert.equal(isWithinReconBand(QURBAN_RECON_BAND_MIN - 1), false);
  assert.equal(isWithinReconBand(QURBAN_RECON_BAND_MAX + 1), false);
  assert.equal(isWithinReconBand(250_000), false); // Bawa Sendiri kecil
  assert.equal(isWithinReconBand(3_500_000), true); // kambing A
});

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    nominal_total: 3_500_000, nominal_transfer: 3_500_003, metode: 'TRANSFER', status: 'BELUM_BAYAR',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '', bank_ref: '',
    skm_transaksi_id: '', bukti_url: '', match_metadata: '', notes: '',
    created_at: '', updated_at: '', created_by: 'ANG-1', ...over,
  };
}

function trx(over: Partial<TransaksiLite>): TransaksiLite {
  return {
    id: 'TRX-1', tanggal: '2026-05-20', jenis: 'MASUK', kategori_id: 'KAT-SAPI', deskripsi: '',
    jumlah: 3_500_000, rekening_id: 'REK-1', status: 'AKTIF', bank_ref: 'R1', ...over,
  };
}

/** Bangun RekonContext minimal dari daftar transaksi + pembayaran. */
function ctxOf(pembayaran: Pembayaran[], transaksi: TransaksiLite[]): RekonContext {
  const kodeIndex = indexPembayaranByKode(pembayaran);
  return {
    rekeningIds: ['REK-1'],
    classified: transaksi.map((t) => ({ transaksi: t, result: classifyTransaksi(t, kodeIndex) })),
    scoringKandidat: pembayaran
      .filter((p) => p.metode === 'TRANSFER' && p.status === 'BELUM_BAYAR')
      .map((p) => ({ pembayaran: p, muqorib_nama: 'Fulan', muqorib_no_hp: '628123456789', tanggal_daftar: '2026-05-15T00:00:00.000Z' })),
    pembayaranEdisi: pembayaran,
  };
}

test('code-less DI LUAR band → tidak masuk antrian (bukan suggestion / unmatched)', () => {
  // Transfer 250rb tanpa kode → di bawah floor → di-skip total.
  const ctx = ctxOf([pay({})], [trx({ id: 'TRX-LOW', jumlah: 250_000, deskripsi: 'titip jasa' })]);
  const { suggestions, unmatched } = buildSuggestionBuckets(ctx, { payment_suffix: 3 });
  assert.equal(suggestions.length, 0);
  assert.equal(unmatched.length, 0);
});

test('code-less DALAM band tanpa kandidat → unmatched', () => {
  const ctx = ctxOf(
    [pay({ nominal_total: 9_900_000, nominal_transfer: 9_900_003 })],
    [trx({ id: 'TRX-MID', jumlah: 5_000_000, deskripsi: 'transfer lain', tanggal: '2026-09-01' })]
  );
  const { suggestions, unmatched } = buildSuggestionBuckets(ctx, { payment_suffix: 3 });
  // skor < 50 (beda nominal, beda tanggal, tanpa kode/keyword) → unmatched, bukan suggestion.
  assert.equal(suggestions.length, 0);
  assert.deepEqual(unmatched.map((u) => u.transaksi_id), ['TRX-MID']);
});

test('Layer 1 (kode_bayar) TETAP match di luar band — 250rb ber-kode jadi suggestion_high', () => {
  // Pembayaran 250rb (Bawa Sendiri) + transaksi 250rb ber-kode tapi nominal beda dari transfer.
  const p = pay({ id: 'BYR-BS', kode_bayar: 'QRB-1448-050', nominal_total: 250_000, nominal_transfer: 250_003 });
  const ctx = ctxOf([p], [trx({ id: 'TRX-BS', jumlah: 250_000, deskripsi: 'QRB-1448-050 titip' })]);
  // jumlah 250000 === nominal_total → engine = auto (Q3), bukan di-band. Konfirmasi auto.
  assert.equal(ctx.classified[0].result.kind, 'auto');
  // auto tidak masuk suggestion/unmatched; di-apply caller. Band tak menghalangi.
  const { suggestions, unmatched } = buildSuggestionBuckets(ctx, { payment_suffix: 3 });
  assert.equal(suggestions.length, 0);
  assert.equal(unmatched.length, 0);
});

test('Layer 1 ber-kode nominal janggal di luar band → suggestion_high (tetap muncul)', () => {
  const p = pay({ id: 'BYR-BS', kode_bayar: 'QRB-1448-050', nominal_total: 250_000, nominal_transfer: 250_003 });
  // transaksi 200rb (di luar band, beda dari total & transfer) tapi kode cocok → suggestion_high.
  const ctx = ctxOf([p], [trx({ id: 'TRX-BS', jumlah: 200_000, deskripsi: 'QRB-1448-050' })]);
  assert.equal(ctx.classified[0].result.kind, 'suggestion_high');
  const { suggestions } = buildSuggestionBuckets(ctx, { payment_suffix: 3 });
  // suggestion_high TIDAK kena band (ber-kode) → tetap muncul.
  assert.deepEqual(suggestions.map((s) => s.transaksi.id), ['TRX-BS']);
});
