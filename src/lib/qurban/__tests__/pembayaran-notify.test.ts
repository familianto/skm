import { test, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';

import { SHEET_NAMES } from '@/lib/constants';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import { konfigurasiToRow, type Konfigurasi } from '@/lib/qurban/konfigurasi-repo';
import { notifyPembayaranLunas } from '../pembayaran-notify';
import type { Pembayaran } from '../pembayaran-repo';

import {
  installMockSheets,
  resetMockSheets,
  edisiRows,
  muqoribRows,
  makeEdisi,
  makeMuqorib,
  SHEETS,
  type SheetDb,
} from './_pemetaan-handler-harness';

/**
 * F6 D2 — notifyPembayaranLunas: gated `wa_send_on_pembayaran_confirmed`,
 * best-effort (tak melempar). Fonnte mock mode aktif tanpa FONNTE_API_TOKEN.
 */

before(() => {
  process.env.FONNTE_MOCK = 'true';
});
afterEach(() => resetMockSheets());

function pay(over: Partial<Pembayaran> = {}): Pembayaran {
  return {
    id: 'BYR-1', edisi_id: 'EDS-1', kode_bayar: 'QRB-1448-001', muqorib_id: 'MQR-1',
    nominal_total: 1_500_000, nominal_transfer: 1_500_003, metode: 'TUNAI', status: 'LUNAS',
    tanggal_terima_panitia: '', panitia_terima_id: '', tanggal_lunas: '2026-05-31T00:00:00.000Z',
    bank_ref: '', skm_transaksi_id: 'TRX-1', bukti_url: '', match_metadata: '', notes: '',
    created_at: '', updated_at: '', created_by: 'ANG-1', ...over,
  };
}

function konfig(over: Partial<Konfigurasi> = {}): Konfigurasi {
  return {
    id: 'KFG-1', edisi_id: 'EDS-1', bop_per_ekor_sapi: 0, bop_per_ekor_kambing: 0, target_bungkus_total: 0,
    berat_target_per_bungkus: 0, tanggal_distribusi_mulai: '', tanggal_distribusi_selesai: '', payment_suffix: 3,
    wa_send_on_pendaftaran: false, wa_send_on_pembayaran_confirmed: true, notes: '',
    created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', created_by: 'ANG-1', ...over,
  };
}

function db(over: { konfig: Konfigurasi; muqoribHp?: string }): SheetDb {
  return {
    [SHEETS.EDISI]: edisiRows(makeEdisi({ id: 'EDS-1', tahun_hijriah: '1448H' })),
    [SHEETS.MUQORIB]: muqoribRows(makeMuqorib({ id: 'MQR-1', nama_lengkap: 'Fulan', no_hp: over.muqoribHp ?? '628123456789' })),
    [QURBAN_SHEETS.KONFIGURASI_EDISI]: [konfigurasiToRow(over.konfig)],
    [SHEET_NAMES.AUDIT_LOG]: [],
  };
}

test('flag ON + muqorib ber-no_hp → terkirim (mock)', async () => {
  installMockSheets(db({ konfig: konfig({ wa_send_on_pembayaran_confirmed: true }) }));
  const r = await notifyPembayaranLunas(pay());
  assert.equal(r.sent, true);
  assert.equal(r.mock, true);
});

test('flag OFF → tidak kirim (reason flag_off)', async () => {
  installMockSheets(db({ konfig: konfig({ wa_send_on_pembayaran_confirmed: false }) }));
  const r = await notifyPembayaranLunas(pay());
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'flag_off');
});

test('muqorib tanpa no_hp → tidak kirim (reason no_hp), tidak melempar', async () => {
  installMockSheets(db({ konfig: konfig(), muqoribHp: '' }));
  const r = await notifyPembayaranLunas(pay());
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'no_hp');
});

test('error baca sheet → di-swallow, sent:false (best-effort)', async () => {
  // Tanpa installMockSheets → getClient mencoba auth asli & gagal → ditangkap.
  resetMockSheets();
  const r = await notifyPembayaranLunas(pay());
  assert.equal(r.sent, false);
  // reason error/flag_off/no_edisi — yang penting tidak throw.
  assert.ok(['error', 'flag_off', 'no_muqorib', 'no_edisi'].includes(r.reason ?? ''));
});
