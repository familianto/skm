import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLaporanPeserta,
  normalizeRt,
  roundPct,
} from '@/lib/qurban/laporan-peserta';
import type { Edisi } from '@/lib/qurban/edisi-repo';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';
import type { QurbanMuqorib } from '@/lib/qurban/muqorib-repo';

/**
 * LP1 — agregasi Laporan Peserta (F8 Milestone B). Mengunci: tiga grouping
 * (tipe/jenis-kelas/rt), normalisasi RT (float/3-digit/Lainnya), urutan
 * kanonik, peserta vs muqorib distinct, pembagian-nol, & batal dikecualikan.
 */

const NOW = '2026-05-01T00:00:00.000Z';

function edisi(over: Partial<Edisi> = {}): Edisi {
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

let pstSeq = 0;
function pst(over: Partial<QurbanPeserta>): QurbanPeserta {
  pstSeq += 1;
  return {
    id: `PST-${pstSeq}`,
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
    created_by: 'IMPORT',
    ...over,
  };
}

function hwn(over: Partial<QurbanDaftarHewan>): QurbanDaftarHewan {
  return {
    id: 'HWN-1',
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
    nomor_urut_pemotongan: null,
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
    ...over,
  };
}

function mqr(id: string, rt: string): QurbanMuqorib {
  return {
    id,
    nama_lengkap: `Muqorib ${id}`,
    alamat: 'Jl. Masjid',
    rt,
    no_hp: '628',
    is_active: true,
    data_induk_ref_1447h: '',
    notes: '',
    created_at: NOW,
    created_by: 'IMPORT',
    updated_at: NOW,
  };
}

// ── normalizeRt ──────────────────────────────────────────────────────────────

test('normalizeRt: float & angka → 2-digit', () => {
  assert.equal(normalizeRt('4.0'), '04');
  assert.equal(normalizeRt(4), '04');
  assert.equal(normalizeRt('01'), '01');
  assert.equal(normalizeRt('001'), '01');
  assert.equal(normalizeRt(' 6 '), '06');
});

test('normalizeRt: kosong / Lainnya / non-numerik → LAINNYA', () => {
  assert.equal(normalizeRt(''), 'LAINNYA');
  assert.equal(normalizeRt(null), 'LAINNYA');
  assert.equal(normalizeRt('Lainnya'), 'LAINNYA');
  assert.equal(normalizeRt('LAINNYA'), 'LAINNYA');
  assert.equal(normalizeRt('RT5'), 'LAINNYA');
});

// ── roundPct ─────────────────────────────────────────────────────────────────

test('roundPct: 1-desimal + pembagian-nol aman', () => {
  assert.equal(roundPct(141, 239), 59);
  assert.equal(roundPct(98, 239), 41);
  assert.equal(roundPct(1, 0), 0);
});

// ── buildLaporanPeserta ──────────────────────────────────────────────────────

test('buildLaporanPeserta: tipe + total + batal dikecualikan', () => {
  const peserta: QurbanPeserta[] = [
    pst({ tipe_qurban: 'BELI' }),
    pst({ tipe_qurban: 'BELI' }),
    pst({ tipe_qurban: 'BAWA_SENDIRI' }),
    pst({ tipe_qurban: 'BELI', status_pendaftaran: 'BATAL' }), // dibuang
  ];
  const dto = buildLaporanPeserta({
    edisi: edisi(),
    isArsip: true,
    peserta,
    hewan: [hwn({ id: 'HWN-1' })],
    muqorib: [mqr('MQR-1', '01')],
  });

  assert.equal(dto.total_peserta, 3);
  assert.equal(dto.peserta_batal, 1);
  assert.equal(dto.edisi.is_arsip, true);

  const tipe = dto.groupings.tipe;
  assert.deepEqual(
    tipe.map((t) => [t.key, t.peserta]),
    [['BELI', 2], ['BAWA_SENDIRI', 1]]
  );
  assert.equal(tipe[0].persen, roundPct(2, 3));
});

test('buildLaporanPeserta: jenis_kelas urut kanonik + unmapped di akhir', () => {
  const hewan: QurbanDaftarHewan[] = [
    hwn({ id: 'H-SAPI-A', jenis: 'SAPI', kelas: 'A' }),
    hwn({ id: 'H-SAPI-B', jenis: 'SAPI', kelas: 'B' }),
    hwn({ id: 'H-KAMBING-A', jenis: 'KAMBING', kelas: 'A' }),
  ];
  const peserta: QurbanPeserta[] = [
    pst({ hewan_id: 'H-KAMBING-A' }),
    pst({ hewan_id: 'H-SAPI-A' }),
    pst({ hewan_id: 'H-SAPI-A' }),
    pst({ hewan_id: 'H-SAPI-B' }),
    pst({ hewan_id: 'HWN-HILANG' }), // tak ketemu → Tidak Terpetakan
  ];
  const dto = buildLaporanPeserta({
    edisi: edisi(),
    isArsip: true,
    peserta,
    hewan,
    muqorib: [mqr('MQR-1', '01')],
  });

  const jk = dto.groupings.jenis_kelas;
  assert.deepEqual(
    jk.map((g) => [g.label, g.peserta]),
    [
      ['Sapi A', 2],
      ['Sapi B', 1],
      ['Kambing A', 1],
      ['Tidak Terpetakan', 1],
    ]
  );
});

test('buildLaporanPeserta: RT peserta(primary) + muqorib distinct(secondary), Lainnya akhir, urut natural', () => {
  // RT04: 2 muqorib (MQR-A 2 peserta, MQR-B 1) = 3 peserta / 2 muqorib.
  // RT01: MQR-C 1 peserta. Lainnya: MQR-D (rt kosong) 1 peserta + muqorib hilang 1.
  const muqorib: QurbanMuqorib[] = [
    mqr('MQR-A', '4.0'),
    mqr('MQR-B', '04'),
    mqr('MQR-C', '1'),
    mqr('MQR-D', ''),
  ];
  const peserta: QurbanPeserta[] = [
    pst({ muqorib_id: 'MQR-A' }),
    pst({ muqorib_id: 'MQR-A' }),
    pst({ muqorib_id: 'MQR-B' }),
    pst({ muqorib_id: 'MQR-C' }),
    pst({ muqorib_id: 'MQR-D' }),
    pst({ muqorib_id: 'MQR-HILANG' }), // muqorib tak ketemu → Lainnya
  ];
  const dto = buildLaporanPeserta({
    edisi: edisi(),
    isArsip: true,
    peserta,
    hewan: [hwn({ id: 'HWN-1' })],
    muqorib,
  });

  const rt = dto.groupings.rt;
  assert.deepEqual(
    rt.map((r) => [r.rt, r.peserta, r.muqorib]),
    [
      ['01', 1, 1],
      ['04', 3, 2],
      ['LAINNYA', 2, 2], // MQR-D + MQR-HILANG (distinct muqorib_id)
    ]
  );
  assert.equal(rt[rt.length - 1].label, 'Lainnya');
  // Total peserta = 6 (denominator konsisten).
  assert.equal(dto.total_peserta, 6);
});

test('buildLaporanPeserta: pembagian-nol — tanpa peserta', () => {
  const dto = buildLaporanPeserta({
    edisi: edisi(),
    isArsip: false,
    peserta: [],
    hewan: [],
    muqorib: [],
  });
  assert.equal(dto.total_peserta, 0);
  assert.equal(dto.groupings.tipe[0].persen, 0);
  assert.equal(dto.groupings.jenis_kelas.length, 0);
  assert.equal(dto.groupings.rt.length, 0);
});
