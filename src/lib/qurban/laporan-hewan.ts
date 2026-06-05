import type { Edisi } from './edisi-repo';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import { JENIS_HEWAN, KELAS_HEWAN } from './validators';

/**
 * LP2 — agregasi read-only Laporan Hewan (F8 Milestone C).
 *
 * Modul PUR (tanpa I/O), sejajar `laporan-peserta.ts`: route handler
 * `GET /api/qurban/laporan/hewan` membaca `qurban_daftar_hewan` lalu memanggil
 * `buildLaporanHewan(...)`. Dipisah dari I/O agar diuji fixture & dipakai ulang
 * Export (LP6) nanti.
 *
 * Sajian utama: matriks inventaris per (jenis, kelas) — total/aktif/batal +
 * split tipe_pembelian + Biaya Pengadaan, plus ringkasan biaya. Biaya dibaca
 * dari `harga_beli_aktual` (BELI & AKTIF saja; BATAL dibuang, BAWA_SENDIRI = 0).
 */

const STATUS_AKTIF = 'AKTIF';
const STATUS_BATAL = 'BATAL';
const TIPE_BELI = 'BELI';
const TIPE_BAWA = 'BAWA_SENDIRI';

export interface InventarisRow {
  jenis: string;
  kelas: string;
  label: string;
  total: number;
  aktif: number;
  batal: number;
  beli: number;
  bawa_sendiri: number;
  /** Σ harga_beli_aktual atas hewan BELI & AKTIF di grup ini. */
  biaya_pengadaan: number;
}

export interface RingkasanHewan {
  total: number;
  aktif: number;
  batal: number;
  beli: number;
  bawa_sendiri: number;
  biaya_pengadaan_total: number;
  biaya_pengadaan_sapi: number;
  biaya_pengadaan_kambing: number;
  /** BELI & AKTIF yang harga_beli_aktual kosong/0 (catatan UI). */
  hewan_beli_tanpa_harga: number;
}

export interface LaporanHewanDTO {
  edisi: { id: string; nama: string; is_arsip: boolean };
  inventaris: InventarisRow[];
  ringkasan: RingkasanHewan;
}

function titleJenis(jenis: string): string {
  if (!jenis) return jenis;
  return jenis.charAt(0).toUpperCase() + jenis.slice(1).toLowerCase();
}

/** Biaya satu ekor: hanya BELI & AKTIF berkontribusi; sisanya 0. Aman non-finite. */
function biayaEkor(h: QurbanDaftarHewan): number {
  if (h.tipe_pembelian !== TIPE_BELI || h.status !== STATUS_AKTIF) return 0;
  const n = Number(h.harga_beli_aktual);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface BuildInput {
  edisi: Pick<Edisi, 'id' | 'tahun_hijriah'>;
  isArsip: boolean;
  hewan: QurbanDaftarHewan[];
}

export function buildLaporanHewan(input: BuildInput): LaporanHewanDTO {
  const { edisi, isArsip, hewan } = input;

  // Akumulasi per (jenis|kelas).
  const cells = new Map<string, InventarisRow>();
  const keyOf = (j: string, k: string) => `${j}|${k}`;

  for (const h of hewan) {
    const key = keyOf(h.jenis, h.kelas);
    const row =
      cells.get(key) ??
      {
        jenis: h.jenis,
        kelas: h.kelas,
        label: `${titleJenis(h.jenis)} ${h.kelas}`,
        total: 0,
        aktif: 0,
        batal: 0,
        beli: 0,
        bawa_sendiri: 0,
        biaya_pengadaan: 0,
      };
    row.total += 1;
    if (h.status === STATUS_AKTIF) row.aktif += 1;
    else if (h.status === STATUS_BATAL) row.batal += 1;
    if (h.tipe_pembelian === TIPE_BELI) row.beli += 1;
    else if (h.tipe_pembelian === TIPE_BAWA) row.bawa_sendiri += 1;
    row.biaya_pengadaan += biayaEkor(h);
    cells.set(key, row);
  }

  // Urut kanonik: SAPI A→D lalu KAMBING A→D; hanya emit grup yang ada isinya.
  const inventaris: InventarisRow[] = [];
  for (const jenis of JENIS_HEWAN) {
    for (const kelas of KELAS_HEWAN) {
      const row = cells.get(keyOf(jenis, kelas));
      if (row && row.total > 0) inventaris.push(row);
    }
  }

  // Ringkasan dari seluruh hewan (bukan hanya grup ter-emit, walau identik).
  const ringkasan: RingkasanHewan = {
    total: hewan.length,
    aktif: 0,
    batal: 0,
    beli: 0,
    bawa_sendiri: 0,
    biaya_pengadaan_total: 0,
    biaya_pengadaan_sapi: 0,
    biaya_pengadaan_kambing: 0,
    hewan_beli_tanpa_harga: 0,
  };
  for (const h of hewan) {
    if (h.status === STATUS_AKTIF) ringkasan.aktif += 1;
    else if (h.status === STATUS_BATAL) ringkasan.batal += 1;
    if (h.tipe_pembelian === TIPE_BELI) ringkasan.beli += 1;
    else if (h.tipe_pembelian === TIPE_BAWA) ringkasan.bawa_sendiri += 1;

    const biaya = biayaEkor(h);
    ringkasan.biaya_pengadaan_total += biaya;
    if (h.jenis === 'SAPI') ringkasan.biaya_pengadaan_sapi += biaya;
    else if (h.jenis === 'KAMBING') ringkasan.biaya_pengadaan_kambing += biaya;

    // BELI & AKTIF tapi harga kosong/0 → belum dilengkapi.
    if (h.tipe_pembelian === TIPE_BELI && h.status === STATUS_AKTIF && biaya === 0) {
      ringkasan.hewan_beli_tanpa_harga += 1;
    }
  }

  return {
    edisi: { id: edisi.id, nama: edisi.tahun_hijriah, is_arsip: isArsip },
    inventaris,
    ringkasan,
  };
}
