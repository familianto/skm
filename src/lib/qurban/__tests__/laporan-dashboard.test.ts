import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDashboard,
  isEdisiArsip,
  deriveFase,
  safePercent,
  selectRecentQurbanActivity,
  activityLabel,
} from '@/lib/qurban/laporan-dashboard';
import type { Edisi } from '@/lib/qurban/edisi-repo';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';
import type { Pembayaran } from '@/lib/qurban/pembayaran-repo';
import type { AuditEntry } from '@/lib/api/audit-read';

/**
 * LP5 — agregasi Dashboard Qurban (F8 Milestone A). Mengunci: split peserta,
 * dana terhimpun + persen LUNAS (pembagian-nol aman), redefinisi "Hewan Aktif"
 * (tanpa terpotong), flag arsip + fase, urutan pemotongan, dan pemilihan
 * aktivitas terakhir.
 */

const NOW = '2026-05-01T00:00:00.000Z';

function makeEdisi(over: Partial<Edisi> = {}): Edisi {
  return {
    id: 'EDS-1',
    tahun_hijriah: '1447 H',
    tahun_masehi: 2026,
    tanggal_idul_adha: '2026-05-27',
    tanggal_pendaftaran_buka: '2026-04-01',
    tanggal_pendaftaran_tutup: '2026-05-20',
    status: 'AKTIF',
    parent_edisi_id: '',
    cloned_at: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    pemetaan_version: NOW,
    ...over,
  };
}

function pst(over: Partial<QurbanPeserta>): QurbanPeserta {
  return {
    id: 'PST-x',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 2_500_000,
    kode_bayar: 'QRB-1447-001',
    sumber_pendaftaran: 'IMPORT_1447H',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: NOW,
    notes: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    ...over,
  };
}

function byr(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-x',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1447-001',
    muqorib_id: 'MQR-1',
    nominal_total: 2_500_000,
    nominal_transfer: 2_500_000,
    metode: 'IMPORT_1447H',
    status: 'LUNAS',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: NOW,
    bank_ref: '',
    skm_transaksi_id: '',
    bukti_url: '',
    match_metadata: '',
    notes: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

function hwn(over: Partial<QurbanDaftarHewan>): QurbanDaftarHewan {
  return {
    id: 'HWN-x',
    edisi_id: 'EDS-1',
    master_hewan_id: 'MHW-1',
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
    nomor_urut_pemotongan: 1,
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

// ── isEdisiArsip ─────────────────────────────────────────────────────────────

test('isEdisiArsip: true bila Idul Adha sudah lewat', () => {
  assert.equal(
    isEdisiArsip({ tanggal_idul_adha: '2026-05-27' }, [], '2026-06-04'),
    true
  );
});

test('isEdisiArsip: true bila semua pembayaran IMPORT_1447H (walau tanggal belum lewat)', () => {
  assert.equal(
    isEdisiArsip(
      { tanggal_idul_adha: '2026-12-31' },
      [byr({}), byr({ status: 'BATAL' })],
      '2026-05-01'
    ),
    true
  );
});

test('isEdisiArsip: false bila tanggal depan & metode campur', () => {
  assert.equal(
    isEdisiArsip(
      { tanggal_idul_adha: '2026-12-31' },
      [byr({ metode: 'TRANSFER' }), byr({ metode: 'IMPORT_1447H' })],
      '2026-05-01'
    ),
    false
  );
});

test('isEdisiArsip: false bila tak ada pembayaran & tanggal depan', () => {
  assert.equal(
    isEdisiArsip({ tanggal_idul_adha: '2026-12-31' }, [], '2026-05-01'),
    false
  );
});

// ── deriveFase ───────────────────────────────────────────────────────────────

test('deriveFase: arsip → finalisasi', () => {
  assert.equal(deriveFase(makeEdisi(), true, '2026-06-04'), 'finalisasi');
});

test('deriveFase: DRAFT non-arsip → preparation', () => {
  assert.equal(deriveFase(makeEdisi({ status: 'DRAFT' }), false, '2026-03-01'), 'preparation');
});

test('deriveFase: AKTIF dalam window pendaftaran → pendaftaran', () => {
  assert.equal(deriveFase(makeEdisi(), false, '2026-04-15'), 'pendaftaran');
});

test('deriveFase: AKTIF setelah tutup pendaftaran → hari_h', () => {
  assert.equal(deriveFase(makeEdisi(), false, '2026-05-25'), 'hari_h');
});

// ── safePercent ──────────────────────────────────────────────────────────────

test('safePercent: pembagian-nol aman → 0', () => {
  assert.equal(safePercent(100, 0), 0);
  assert.equal(safePercent(0, 0), 0);
});

test('safePercent: bulat ke integer', () => {
  assert.equal(safePercent(1, 3), 33);
  assert.equal(safePercent(2, 2), 100);
});

// ── buildDashboard (skenario gaya 1447H) ─────────────────────────────────────

test('buildDashboard: agregasi peserta/dana/hewan + flag arsip', () => {
  const peserta: QurbanPeserta[] = [
    pst({ id: 'P1', tipe_qurban: 'BELI', harga_disepakati: 3_000_000 }),
    pst({ id: 'P2', tipe_qurban: 'BELI', harga_disepakati: 2_000_000 }),
    pst({ id: 'P3', tipe_qurban: 'BAWA_SENDIRI', harga_disepakati: 500_000 }),
    // dibatalkan → tidak dihitung
    pst({ id: 'P4', tipe_qurban: 'BELI', harga_disepakati: 9_000_000, status_pendaftaran: 'BATAL' }),
  ];
  const pembayaran: Pembayaran[] = [
    byr({ id: 'B1', status: 'LUNAS', nominal_total: 3_000_000 }),
    byr({ id: 'B2', status: 'LUNAS', nominal_total: 2_000_000 }),
    byr({ id: 'B3', status: 'LUNAS', nominal_total: 500_000 }),
  ];
  const hewan: QurbanDaftarHewan[] = [
    hwn({ id: 'H1', jenis: 'SAPI', kelas: 'A', status: 'AKTIF', tipe_pembelian: 'BELI', nomor_urut_pemotongan: 1 }),
    hwn({ id: 'H2', jenis: 'SAPI', kelas: 'A', status: 'BATAL', tipe_pembelian: 'BELI', nomor_urut_pemotongan: null }),
    hwn({ id: 'H3', jenis: 'KAMBING', kelas: 'B', status: 'AKTIF', tipe_pembelian: 'BAWA_SENDIRI', nomor_urut_pemotongan: 2 }),
  ];

  const dto = buildDashboard({
    edisi: makeEdisi(),
    peserta,
    pembayaran,
    hewan,
    aktivitas: [],
    today: '2026-06-04',
  });

  // Peserta: 3 terdaftar (P4 batal dibuang), 2 BELI / 1 BAWA_SENDIRI.
  assert.equal(dto.kartu.peserta.total, 3);
  assert.equal(dto.kartu.peserta.beli, 2);
  assert.equal(dto.kartu.peserta.bawa_sendiri, 1);
  assert.equal(dto.kartu.peserta.trend, null);

  // Dana: Σ LUNAS = 5.5jt; nilai pendaftaran aktif = 3+2+0.5 = 5.5jt → 100%.
  assert.equal(dto.kartu.dana_terhimpun.nominal, 5_500_000);
  assert.equal(dto.kartu.dana_terhimpun.jumlah_pembayaran, 3);
  assert.equal(dto.kartu.dana_terhimpun.persen_lunas, 100);

  // Hewan: total 3, aktif 2, batal 1; sapi 2 / kambing 1.
  assert.equal(dto.kartu.hewan.total, 3);
  assert.equal(dto.kartu.hewan.aktif, 2);
  assert.equal(dto.kartu.hewan.batal, 1);
  assert.equal(dto.kartu.hewan.sapi, 2);
  assert.equal(dto.kartu.hewan.kambing, 1);
  assert.equal(dto.kartu.hewan.siap_metric, 'aktif');
  assert.equal(dto.kartu.hewan.terpotong_tersedia, false);

  // Arsip + fase finalisasi.
  assert.equal(dto.edisi.is_arsip, true);
  assert.equal(dto.edisi.fase, 'finalisasi');
  assert.equal(dto.kartu.status_edisi.is_arsip, true);

  // Persiapan: split tipe pembelian hewan 2 beli / 1 bawa.
  assert.equal(dto.persiapan.beli, 2);
  assert.equal(dto.persiapan.bawa_sendiri, 1);
  const sapi = dto.persiapan.per_jenis.find((j) => j.jenis === 'SAPI');
  assert.equal(sapi?.total, 2);
  assert.equal(sapi?.aktif, 1);

  // Operasional: ter_assign = hewan AKTIF dengan nomor_urut_pemotongan (H1, H3 = 2).
  assert.equal(dto.operasional.urutan_pemotongan.ter_assign, 2);
  assert.equal(dto.operasional.urutan_pemotongan.total_aktif, 2);
  assert.equal(dto.operasional.distribusi_tersedia, false);
});

test('buildDashboard: pembagian-nol — tak ada peserta terdaftar → persen 0', () => {
  const dto = buildDashboard({
    edisi: makeEdisi(),
    peserta: [],
    pembayaran: [byr({ status: 'LUNAS', nominal_total: 1_000_000 })],
    hewan: [],
    aktivitas: [],
    today: '2026-06-04',
  });
  assert.equal(dto.kartu.dana_terhimpun.persen_lunas, 0);
  assert.equal(dto.kartu.peserta.total, 0);
});

// ── Aktivitas terakhir ───────────────────────────────────────────────────────

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    id: 'LOG-x',
    timestamp: '2026-05-01T10:00:00.000Z',
    aksi: 'CREATE',
    entitas: 'peserta',
    entitas_id: 'PST-1',
    event_type: 'peserta.created',
    before: undefined,
    after: { edisi_id: 'EDS-1' },
    notes: '',
    user_info: 'Admin',
    user_id: 'ANG-1',
    ...over,
  };
}

test('activityLabel: event dikenal → label manusiawi', () => {
  assert.deepEqual(activityLabel(entry({ event_type: 'pembayaran.lunas' })), {
    label: 'Pembayaran LUNAS',
    tipe: 'pembayaran',
  });
});

test('activityLabel: event tak dikenal → fallback aman', () => {
  const r = activityLabel(entry({ event_type: 'peserta.mystery' }));
  assert.equal(r.tipe, 'peserta');
  assert.equal(r.label, 'peserta.mystery');
});

test('selectRecentQurbanActivity: buang entitas non-qurban, urut terbaru, batasi 5', () => {
  const entries: AuditEntry[] = [
    entry({ id: 'L1', timestamp: '2026-05-01T01:00:00.000Z', event_type: 'peserta.created' }),
    entry({ id: 'L2', timestamp: '2026-05-01T05:00:00.000Z', entitas: 'pembayaran', event_type: 'pembayaran.lunas' }),
    entry({ id: 'L3', timestamp: '2026-05-01T09:00:00.000Z', entitas: 'transaksi', event_type: 'transaksi.created' }), // non-qurban
    entry({ id: 'L4', timestamp: '2026-05-01T03:00:00.000Z', entitas: 'pemetaan', event_type: 'pemetaan.batch_save' }),
  ];
  const out = selectRecentQurbanActivity(entries, { edisiId: 'EDS-1', limit: 5 });
  // L3 (transaksi) dibuang; sisanya urut desc: L2, L4, L1.
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((o) => o.label), [
    'Pembayaran LUNAS',
    'Pemetaan hewan diperbarui',
    'Peserta didaftarkan',
  ]);
});

test('selectRecentQurbanActivity: buang entry dari edisi lain bila edisi_id terdeteksi', () => {
  const entries: AuditEntry[] = [
    entry({ id: 'L1', after: { edisi_id: 'EDS-2' } }),
    entry({ id: 'L2', after: { edisi_id: 'EDS-1' } }),
    entry({ id: 'L3', after: { foo: 'bar' } }), // tanpa edisi_id → tetap disertakan
  ];
  const out = selectRecentQurbanActivity(entries, { edisiId: 'EDS-1' });
  assert.equal(out.length, 2);
});
