import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  muamalatTemplate,
  matchesBiayaAdminBankCharge,
} from '@/lib/bank-templates/muamalat';
import type { ParsedBankRow } from '@/lib/bank-templates/types';
import { TransaksiJenis } from '@/types';

// ============================================================
// Rule baru: "Biaya Admin Bank" untuk biaya/charge transfer bank
// ============================================================
//
// Kondisi (AND): jenis KELUAR + kata utuh `CHARGE` + nominal ∈ {2500, 6500}.
// Rule diberi PRIORITAS TERTINGGI di keluarRules sehingga short-circuit
// sebelum rule QURBAN / HONOR / LISTRIK (uji prioritas di bawah).

// Resolver palsu: nama → ID deterministik, supaya status tetap 'auto'
// (categorize() men-downgrade ke 'review' bila kategori_id kosong).
const fakeResolve = (nama: string) => (nama ? `KAT-${nama}` : '');

function keluar(keterangan: string, jumlah: number): ParsedBankRow {
  return {
    tanggal: '2026-05-02',
    keterangan,
    debit: jumlah,
    kredit: 0,
    saldo: 0,
    referensi: 'REF-TEST',
  };
}

function masuk(keterangan: string, jumlah: number): ParsedBankRow {
  return {
    tanggal: '2026-05-02',
    keterangan,
    debit: 0,
    kredit: jumlah,
    saldo: 0,
    referensi: 'REF-TEST',
  };
}

// ------------------------------------------------------------
// POSITIVE — harus → "Biaya Admin Bank" (status auto)
// ------------------------------------------------------------

const positives: Array<{ desc: string; keterangan: string; jumlah: number }> = [
  {
    desc: 'DBT TRF CHARGE BERSAMA (6500)',
    keterangan:
      '673 ... MOHAMMAD SHODIQ Hadiah Kajian MAJ 020526  DBT TRF CHARGE BERSAMA',
    jumlah: 6500,
  },
  {
    desc: 'DBT TRF CHARGE PRIMA (6500)',
    keterangan: '673 ... AMRAN ANWAR IR Proyek pintu  DBT TRF CHARGE PRIMA',
    jumlah: 6500,
  },
  {
    desc: 'CHARGE di depan + keyword QURBAN (2500) — uji prioritas vs QURBAN',
    keterangan:
      '673 ... AKOMODASI DAN BBM SURVEY QURBAN MAJ  CHARGE DBT TRF BIFAST',
    jumlah: 2500,
  },
  {
    desc: 'BNF CHARGE + keyword QURBAN (6500) — uji prioritas vs QURBAN',
    keterangan:
      '673 ... Qurban Belanja Seksi Persiapan via Yadi  TRF ISS BNF CHARGE ATM LINK',
    jumlah: 6500,
  },
  {
    desc: 'VA CHARGE (2500)',
    keterangan: 'VA : 8727120000381890 - MASJID ALJABAR  VA CHARGE',
    jumlah: 2500,
  },
  {
    desc: 'CHARGE PRIMA + keyword HONOR (6500) — uji prioritas vs HONOR',
    keterangan:
      '673 ... A IMRON ROSADI MAJ Honor Mei 2026  DBT TRF CHARGE PRIMA',
    jumlah: 6500,
  },
];

for (const c of positives) {
  test(`POSITIVE: ${c.desc} → Biaya Admin Bank (auto)`, () => {
    const result = muamalatTemplate.categorize(
      keluar(c.keterangan, c.jumlah),
      fakeResolve
    );
    assert.equal(result.jenis, TransaksiJenis.KELUAR);
    assert.equal(result.kategoriLabel, 'Biaya Admin Bank');
    assert.equal(result.kategori_id, 'KAT-Biaya Admin Bank');
    assert.equal(result.status, 'auto');
  });
}

// ------------------------------------------------------------
// NEGATIVE — TIDAK boleh ditangkap rule CHARGE baru
// ------------------------------------------------------------

test('NEGATIVE: ATK rutin tanpa CHARGE (KELUAR 6500) → bukan Biaya Admin Bank', () => {
  const result = muamalatTemplate.categorize(
    keluar('Pembelian ATK rutin', 6500),
    fakeResolve
  );
  assert.notEqual(result.kategoriLabel, 'Biaya Admin Bank');
});

test('NEGATIVE: jenis MASUK walau ada CHARGE (6500) → bukan Biaya Admin Bank', () => {
  const result = muamalatTemplate.categorize(
    masuk('673 ... TRANSFER DARI BUDI  CHARGE BIFAST', 6500),
    fakeResolve
  );
  assert.equal(result.jenis, TransaksiJenis.MASUK);
  assert.notEqual(result.kategoriLabel, 'Biaya Admin Bank');
});

test('NEGATIVE: ada CHARGE tapi nominal 5000 (KELUAR) → bukan Biaya Admin Bank', () => {
  const result = muamalatTemplate.categorize(
    keluar('673 ... AMRAN ANWAR IR  DBT TRF CHARGE PRIMA', 5000),
    fakeResolve
  );
  assert.notEqual(result.kategoriLabel, 'Biaya Admin Bank');
});

// ------------------------------------------------------------
// Predikat rule baru diuji langsung (whole-word + nominal gate)
// ------------------------------------------------------------

test('predikat: cocok untuk CHARGE pada 2500 & 6500, tolak nominal lain', () => {
  assert.equal(matchesBiayaAdminBankCharge('DBT TRF CHARGE BERSAMA', 6500), true);
  assert.equal(matchesBiayaAdminBankCharge('VA CHARGE', 2500), true);
  assert.equal(matchesBiayaAdminBankCharge('DBT TRF CHARGE PRIMA', 5000), false);
  assert.equal(matchesBiayaAdminBankCharge('DBT TRF CHARGE PRIMA', 10000), false);
});

test('predikat: whole-word — "SURCHARGE" tidak ikut ter-match', () => {
  assert.equal(matchesBiayaAdminBankCharge('BIAYA SURCHARGE TOL', 6500), false);
});

// Edge-case payroll (DIVERGENSI yang dilaporkan ke Hopy):
// Baris "Fee Payroll April 2026 ... CMS BIAYA PAYROLL" bernilai 10000 TANPA
// kata CHARGE. Rule CHARGE BARU sengaja TIDAK menangkapnya (di luar scope).
// Catatan: baris ini TETAP ter-auto-kategori ke "Biaya Admin Bank" oleh rule
// "Fee Payroll|CMS BIAYA PAYROLL" yang SUDAH ADA sebelumnya — di luar scope
// perubahan ini dan tidak disentuh (lihat PR description).
test('NEGATIVE (predikat): payroll 10000 tanpa CHARGE → rule baru tidak fire', () => {
  assert.equal(
    matchesBiayaAdminBankCharge(
      '673 3200028199 Fee Payroll April 2026   CMS BIAYA PAYROLL',
      10000
    ),
    false
  );
});
