import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRekapBagian,
  cleanKeterangan,
  detectBagian,
  compileAliases,
  sumKuponBungkus,
  DEFAULT_BAGIAN_MAP,
  type BagianKanonik,
} from '@/lib/qurban/rekap-bagian';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';

/**
 * Rekap Bagian (F8 Milestone F). Mengunci: pembersihan noise (kupon/kg/kurung/
 * data tidak tersedia), alias terpanjang-dulu (Paha kambing→Paha, ekor→Buntut,
 * iga→Tulang Iga, "Daging Khas Dalam"→keduanya), 1 peserta 1× per bagian.
 */

const NOW = '2026-05-01T00:00:00.000Z';
let seq = 0;
function pst(keterangan: string, status: QurbanPeserta['status_pendaftaran'] = 'TERDAFTAR'): QurbanPeserta {
  seq += 1;
  return {
    id: `PST-${seq}`,
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: '',
    keterangan_bagian: keterangan,
    harga_disepakati: 0,
    kode_bayar: 'QRB-1',
    sumber_pendaftaran: 'IMPORT_1447H',
    status_pendaftaran: status,
    tanggal_daftar: NOW,
    notes: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'IMPORT',
  };
}

const compiled = compileAliases(DEFAULT_BAGIAN_MAP);

test('cleanKeterangan: buang kurung, kupon, kg, data tidak tersedia', () => {
  assert.equal(cleanKeterangan('Daging (porsi besar)'), 'Daging');
  // kupon/bks hilang; "Paha" tersisa (koma pemisah boleh tertinggal).
  const cleaned = cleanKeterangan('5 bks (kupon), Paha');
  assert.equal(/bks|kupon/i.test(cleaned), false);
  assert.match(cleaned, /Paha/);
  assert.equal(cleanKeterangan('Daging 2 kg'), 'Daging');
  assert.equal(cleanKeterangan('data tidak tersedia'), '');
  assert.equal(cleanKeterangan(''), '');
});

test('sumKuponBungkus: jumlahkan N bks', () => {
  assert.equal(sumKuponBungkus('5 bks (kupon), Paha'), 5);
  assert.equal(sumKuponBungkus('3 bks, 2 bks mustahik'), 5);
  assert.equal(sumKuponBungkus('Paha'), 0);
});

test('detectBagian: alias terpanjang-dulu + gabungan', () => {
  assert.deepEqual([...detectBagian('Paha Kambing', compiled)], ['Paha']);
  assert.deepEqual([...detectBagian('ekor', compiled)], ['Buntut']);
  assert.deepEqual([...detectBagian('iga', compiled)], ['Tulang Iga']);
  // "Daging Khas Dalam" → Khas Dalam + Daging (bukan dobel Daging).
  const both = [...detectBagian('Daging Khas Dalam', compiled)].sort();
  assert.deepEqual(both, ['Daging', 'Khas Dalam']);
  // noise → kosong
  assert.equal(detectBagian('5 bks (kupon)', compiled).size, 0);
  assert.equal(detectBagian('GABUNG KE Sapi-3', compiled).size, 0);
});

test('buildRekapBagian: 1 peserta 1x per bagian + total + catatan kaki', () => {
  const peserta = [
    pst('Daging, Daging, Paha'), // Daging dihitung 1×
    pst('Paha Kambing, ekor'), // Paha + Buntut
    pst('5 bks (kupon)'), // tanpa permintaan
    pst('Daging', 'BATAL'), // dibuang (bukan TERDAFTAR)
  ];
  const r = buildRekapBagian({ peserta, map: DEFAULT_BAGIAN_MAP });

  const byName = Object.fromEntries(r.rows.map((x) => [x.nama, x.jumlah]));
  assert.equal(byName['Daging'], 1);
  assert.equal(byName['Paha'], 2);
  assert.equal(byName['Buntut'], 1);
  assert.equal(r.peserta_valid, 3); // BATAL dibuang
  assert.equal(r.dengan_permintaan, 2);
  assert.equal(r.tanpa_permintaan, 1);
  // Total permintaan = Daging1 + Paha2 + Buntut1 = 4.
  assert.equal(r.total_permintaan, 4);
  assert.equal(r.total_bungkus_kupon, 5);
});

test('buildRekapBagian: urut jumlah desc lalu alfabet', () => {
  const peserta = [pst('Hati'), pst('Daging'), pst('Daging'), pst('Buntut')];
  const r = buildRekapBagian({ peserta, map: DEFAULT_BAGIAN_MAP });
  const nonzero = r.rows.filter((x) => x.jumlah > 0).map((x) => [x.nama, x.jumlah]);
  assert.deepEqual(nonzero, [
    ['Daging', 2],
    ['Buntut', 1],
    ['Hati', 1],
  ]);
});

test('buildRekapBagian: kanonik nonaktif tak dihitung', () => {
  const map: BagianKanonik[] = DEFAULT_BAGIAN_MAP.map((e) =>
    e.nama_kanonik === 'Daging' ? { ...e, is_active: false } : e
  );
  const r = buildRekapBagian({ peserta: [pst('Daging, Paha')], map });
  const names = r.rows.map((x) => x.nama);
  assert.equal(names.includes('Daging'), false);
  assert.equal(r.rows.find((x) => x.nama === 'Paha')?.jumlah, 1);
});
