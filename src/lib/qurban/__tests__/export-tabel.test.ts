import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExportTabel,
  buildLabelHewan,
  cleanPermintaanTambahan,
  resolveColumns,
  isValidColumnId,
  type ExportTabelConfig,
} from '@/lib/qurban/export-tabel';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';
import type { QurbanMuqorib } from '@/lib/qurban/muqorib-repo';
import type { Pembayaran } from '@/lib/qurban/pembayaran-repo';

/**
 * LP6 — mesin builder baris Export Tabel (F8 Milestone E). Mengunci: derived
 * (permintaan_tambahan, label_hewan), filter (jenis/status/rt/ber-urut), sort,
 * kolom isi-tangan kosong, no_baris, no_hp sebagai teks.
 */

const NOW = '2026-05-01T00:00:00.000Z';

let pSeq = 0;
function pst(over: Partial<QurbanPeserta>): QurbanPeserta {
  pSeq += 1;
  return {
    id: `PST-${pSeq}`,
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: '',
    harga_disepakati: 2_500_000,
    kode_bayar: 'QRB-1',
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
    nomor_urut: 3,
    kapasitas_slot: 7,
    tipe_pembelian: 'BELI',
    vendor_nama: '',
    harga_beli_aktual: 22_750_000,
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

function mqr(id: string, over: Partial<QurbanMuqorib> = {}): QurbanMuqorib {
  return {
    id,
    nama_lengkap: `Muqorib ${id}`,
    alamat: 'Jl. Masjid',
    rt: '01',
    no_hp: '628123456789',
    is_active: true,
    data_induk_ref_1447h: '',
    notes: '',
    created_at: NOW,
    created_by: 'IMPORT',
    updated_at: NOW,
    ...over,
  };
}

function pay(over: Partial<Pembayaran>): Pembayaran {
  return {
    id: 'BYR-1',
    edisi_id: 'EDS-1',
    kode_bayar: 'QRB-1',
    muqorib_id: 'MQR-1',
    nominal_total: 5_000_000,
    nominal_transfer: 5_000_000,
    metode: 'IMPORT_1447H',
    status: 'LUNAS',
    tanggal_terima_panitia: '',
    panitia_terima_id: '',
    tanggal_lunas: '2026-05-02T03:04:05.000Z',
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

// ── derived helpers ──────────────────────────────────────────────────────────

test('cleanPermintaanTambahan: buang token kupon, rapikan koma', () => {
  assert.equal(cleanPermintaanTambahan('5 bks (kupon),Paha Kambing'), 'Paha Kambing');
  assert.equal(cleanPermintaanTambahan('Daging, 3bks(kupon) , Jeroan'), 'Daging,Jeroan');
  assert.equal(cleanPermintaanTambahan('10 BKS (KUPON)'), '');
  assert.equal(cleanPermintaanTambahan(''), '');
  assert.equal(cleanPermintaanTambahan('Paha'), 'Paha');
});

test('buildLabelHewan: "Sapi A-03"; kosong bila tak ada hewan', () => {
  assert.equal(buildLabelHewan(hwn({ jenis: 'SAPI', kelas: 'A', nomor_urut: 3 })), 'Sapi A-03');
  assert.equal(buildLabelHewan(hwn({ jenis: 'KAMBING', kelas: 'B', nomor_urut: 12 })), 'Kambing B-12');
  assert.equal(buildLabelHewan(undefined), '');
});

test('isValidColumnId + resolveColumns: katalog + kolom isi-tangan', () => {
  assert.equal(isValidColumnId('atas_nama'), true);
  assert.equal(isValidColumnId('ngawur'), false);
  const cols = resolveColumns(['atas_nama', 'ngawur', 'no_hp'], ['Petugas']);
  assert.deepEqual(cols.map((c) => c.id), ['atas_nama', 'no_hp', 'manual_0']);
  assert.equal(cols[2].group, 'Manual');
  assert.equal(cols[2].label, 'Petugas');
});

// ── buildExportTabel ─────────────────────────────────────────────────────────

function maps(muqorib: QurbanMuqorib[], hewan: QurbanDaftarHewan[], pembayaran: Pembayaran[]) {
  return {
    muqoribById: new Map(muqorib.map((m) => [m.id, m])),
    hewanById: new Map(hewan.map((h) => [h.id, h])),
    pembayaranByKode: new Map(pembayaran.map((p) => [p.kode_bayar, p])),
  };
}

test('buildExportTabel: kolom (termasuk derived + manual kosong) + no_hp teks', () => {
  const peserta = [
    pst({ id: 'P1', muqorib_id: 'M1', hewan_id: 'H1', kode_bayar: 'QRB-1', keterangan_bagian: '5 bks (kupon),Paha' }),
  ];
  const config: ExportTabelConfig = {
    columns: ['no_hp', 'label_hewan', 'permintaan_tambahan', 'nominal'],
    manual_columns: ['Petugas'],
    sort: 'jenis_urut_slot',
  };
  const built = buildExportTabel({
    peserta,
    ...maps([mqr('M1', { no_hp: '628999' })], [hwn({ id: 'H1', jenis: 'SAPI', kelas: 'A', nomor_urut: 3 })], [pay({ kode_bayar: 'QRB-1', nominal_total: 5_000_000 })]),
    config,
  });

  assert.equal(built.total_baris, 1);
  const cells = built.rows[0].cells;
  assert.equal(cells['no_hp'], '628999'); // string, bukan number
  assert.equal(typeof cells['no_hp'], 'string');
  assert.equal(cells['label_hewan'], 'Sapi A-03');
  assert.equal(cells['permintaan_tambahan'], 'Paha');
  assert.equal(cells['nominal'], 5_000_000);
  assert.equal(cells['manual_0'], ''); // isi-tangan kosong
});

test('buildExportTabel: filter hanya_ber_urut', () => {
  const peserta = [
    pst({ id: 'P1', hewan_id: 'H-URUT' }),
    pst({ id: 'P2', hewan_id: 'H-NOURUT' }),
  ];
  const hewan = [
    hwn({ id: 'H-URUT', nomor_urut_pemotongan: 5 }),
    hwn({ id: 'H-NOURUT', nomor_urut_pemotongan: null }),
  ];
  const built = buildExportTabel({
    peserta,
    ...maps([mqr('MQR-1')], hewan, [pay({})]),
    config: { columns: ['kode_peserta'], filter: { hanya_ber_urut: true }, sort: 'jenis_urut_slot' },
  });
  assert.deepEqual(built.rows.map((r) => r.cells['kode_peserta']), ['P1']);
});

test('buildExportTabel: filter jenis + status_hewan + rt', () => {
  const peserta = [
    pst({ id: 'P1', muqorib_id: 'M-RT4', hewan_id: 'H-SAPI' }),
    pst({ id: 'P2', muqorib_id: 'M-RT1', hewan_id: 'H-KAMBING' }),
    pst({ id: 'P3', muqorib_id: 'M-RT4', hewan_id: 'H-SAPI-BATAL' }),
  ];
  const hewan = [
    hwn({ id: 'H-SAPI', jenis: 'SAPI', status: 'AKTIF' }),
    hwn({ id: 'H-KAMBING', jenis: 'KAMBING', status: 'AKTIF' }),
    hwn({ id: 'H-SAPI-BATAL', jenis: 'SAPI', status: 'BATAL' }),
  ];
  const muqorib = [mqr('M-RT4', { rt: '4.0' }), mqr('M-RT1', { rt: '01' })];
  const built = buildExportTabel({
    peserta,
    ...maps(muqorib, hewan, [pay({})]),
    config: {
      columns: ['kode_peserta'],
      filter: { jenis: 'SAPI', status_hewan: 'AKTIF', rt: '04' },
      sort: 'jenis_urut_slot',
    },
  });
  // Hanya P1: Sapi + AKTIF + RT04.
  assert.deepEqual(built.rows.map((r) => r.cells['kode_peserta']), ['P1']);
});

test('buildExportTabel: BATAL dibuang (base scope TERDAFTAR)', () => {
  const peserta = [
    pst({ id: 'P1', status_pendaftaran: 'TERDAFTAR' }),
    pst({ id: 'P2', status_pendaftaran: 'BATAL' }),
  ];
  const built = buildExportTabel({
    peserta,
    ...maps([mqr('MQR-1')], [hwn({})], [pay({})]),
    config: { columns: ['kode_peserta'], sort: 'jenis_urut_slot' },
  });
  assert.deepEqual(built.rows.map((r) => r.cells['kode_peserta']), ['P1']);
});

test('buildExportTabel: sort jenis_urut_slot — Sapi dulu, no_urut kosong di akhir, lalu slot', () => {
  const hewan = [
    hwn({ id: 'H-SAPI-U2', jenis: 'SAPI', nomor_urut_pemotongan: 2 }),
    hwn({ id: 'H-SAPI-U1', jenis: 'SAPI', nomor_urut_pemotongan: 1 }),
    hwn({ id: 'H-KAMBING', jenis: 'KAMBING', nomor_urut_pemotongan: 1 }),
    hwn({ id: 'H-SAPI-NOURUT', jenis: 'SAPI', nomor_urut_pemotongan: null }),
  ];
  const peserta = [
    pst({ id: 'Pk', hewan_id: 'H-KAMBING' }),
    pst({ id: 'Pnou', hewan_id: 'H-SAPI-NOURUT' }),
    pst({ id: 'Pu2b', hewan_id: 'H-SAPI-U2', slot_number: 2 }),
    pst({ id: 'Pu2a', hewan_id: 'H-SAPI-U2', slot_number: 1 }),
    pst({ id: 'Pu1', hewan_id: 'H-SAPI-U1' }),
  ];
  const built = buildExportTabel({
    peserta,
    ...maps([mqr('MQR-1')], hewan, [pay({})]),
    config: { columns: ['kode_peserta'], sort: 'jenis_urut_slot' },
  });
  assert.deepEqual(built.rows.map((r) => r.cells['kode_peserta']), [
    'Pu1', // Sapi urut1
    'Pu2a', // Sapi urut2 slot1
    'Pu2b', // Sapi urut2 slot2
    'Pnou', // Sapi tanpa urut (akhir kelompok Sapi)
    'Pk', // Kambing
  ]);
});

test('buildExportTabel: no_baris sekuensial setelah sort/filter', () => {
  const peserta = [
    pst({ id: 'PB', nama_atas_nama: 'Budi' }),
    pst({ id: 'PA', nama_atas_nama: 'Andi' }),
  ];
  const built = buildExportTabel({
    peserta,
    ...maps([mqr('MQR-1')], [hwn({})], [pay({})]),
    config: { columns: ['no_baris', 'atas_nama'], sort: 'nama' },
  });
  assert.deepEqual(
    built.rows.map((r) => [r.cells['no_baris'], r.cells['atas_nama']]),
    [
      [1, 'Andi'],
      [2, 'Budi'],
    ]
  );
});
