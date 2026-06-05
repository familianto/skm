import type { DashboardDTO } from './laporan-dashboard';
import type { LaporanHewanDTO } from './laporan-hewan';
import type { LaporanKeuanganDTO } from './laporan-keuangan';

/**
 * Builder DOKUMEN ringkasan (F8 Milestone E) — bentuk netral-renderer untuk
 * preset ringkasan (Executive/Inventaris/Keuangan). Modul PUR: mengubah DTO
 * LP5/LP2/LP4 menjadi `SummaryDoc` (judul + section tabel) yang dirender ke
 * PDF/Excel oleh `export-render-summary.ts`. Reuse agregasi LP — tidak
 * menghitung ulang.
 */

export interface SummaryCell {
  v: string | number;
  /** Format sebagai Rupiah (PDF) / numFmt (#,##0) (Excel). */
  currency?: boolean;
  bold?: boolean;
}

export interface SummarySection {
  title: string;
  header?: string[];
  rows: SummaryCell[][];
}

export interface SummaryDoc {
  sections: SummarySection[];
}

function t(v: string | number, opts?: { bold?: boolean }): SummaryCell {
  return { v, bold: opts?.bold };
}
function rp(v: number, opts?: { bold?: boolean }): SummaryCell {
  return { v, currency: true, bold: opts?.bold };
}

/** LP5 → Executive: peserta, dana, hewan, status edisi. */
export function buildSummaryExecutive(d: DashboardDTO): SummaryDoc {
  const k = d.kartu;
  return {
    sections: [
      {
        title: 'Dana Terhimpun',
        rows: [
          [t('Dana Terhimpun'), rp(k.dana_terhimpun.nominal, { bold: true })],
          [t('Jumlah Pembayaran'), t(k.dana_terhimpun.jumlah_pembayaran)],
          [t('Persen LUNAS'), t(`${k.dana_terhimpun.persen_lunas}%`)],
        ],
      },
      {
        title: 'Peserta',
        rows: [
          [t('Total Peserta'), t(k.peserta.total, { bold: true })],
          [t('Beli'), t(k.peserta.beli)],
          [t('Bawa Sendiri'), t(k.peserta.bawa_sendiri)],
        ],
      },
      {
        title: 'Hewan',
        rows: [
          [t('Total'), t(k.hewan.total, { bold: true })],
          [t('Aktif'), t(k.hewan.aktif)],
          [t('Batal'), t(k.hewan.batal)],
          [t('Sapi'), t(k.hewan.sapi)],
          [t('Kambing'), t(k.hewan.kambing)],
        ],
      },
      {
        title: 'Status Edisi',
        rows: [
          [t('Fase'), t(d.edisi.fase)],
          [t('Arsip'), t(d.edisi.is_arsip ? 'Ya' : 'Tidak')],
        ],
      },
    ],
  };
}

/** LP2 → Inventaris: matriks jenis–kelas + ringkasan biaya. */
export function buildSummaryInventaris(d: LaporanHewanDTO): SummaryDoc {
  const r = d.ringkasan;
  const matriks: SummaryCell[][] = d.inventaris.map((row) => [
    t(row.label),
    t(row.total),
    t(row.aktif),
    t(row.beli),
    t(row.bawa_sendiri),
    row.biaya_pengadaan > 0 ? rp(row.biaya_pengadaan) : t('—'),
  ]);
  matriks.push([
    t('Total', { bold: true }),
    t(r.total, { bold: true }),
    t(r.aktif, { bold: true }),
    t(r.beli, { bold: true }),
    t(r.bawa_sendiri, { bold: true }),
    r.biaya_pengadaan_total > 0 ? rp(r.biaya_pengadaan_total, { bold: true }) : t('—', { bold: true }),
  ]);

  const biayaRows: SummaryCell[][] = [
    [t('Sapi'), r.biaya_pengadaan_sapi > 0 ? rp(r.biaya_pengadaan_sapi) : t('—')],
    [t('Kambing'), r.biaya_pengadaan_kambing > 0 ? rp(r.biaya_pengadaan_kambing) : t('—')],
    [t('Total', { bold: true }), rp(r.biaya_pengadaan_total, { bold: true })],
  ];
  if (r.hewan_beli_tanpa_harga > 0) {
    biayaRows.push([t(`${r.hewan_beli_tanpa_harga} hewan beli belum ada harga pengadaan`), t('')]);
  }

  return {
    sections: [
      {
        title: 'Inventaris Hewan',
        header: ['Hewan', 'Total', 'Aktif', 'Beli', 'Bawa Sendiri', 'Biaya Pengadaan'],
        rows: matriks,
      },
      { title: 'Ringkasan Biaya Pengadaan', rows: biayaRows },
    ],
  };
}

/** LP4 → Keuangan: dana per kategori + biaya + saldo + korelasi. */
export function buildSummaryKeuangan(d: LaporanKeuanganDTO): SummaryDoc {
  const dana = d.dana_terhimpun;
  const danaRows: SummaryCell[][] = dana.per_kategori.map((kk) => [
    t(kk.label),
    t(kk.peserta),
    rp(kk.nominal),
  ]);
  danaRows.push([t('Dana Terhimpun', { bold: true }), t(''), rp(dana.total, { bold: true })]);

  const korelasiLabel =
    d.korelasi_ledger.mode === 'arsip' ? 'N/A · Arsip' : d.korelasi_ledger.status;

  return {
    sections: [
      {
        title: 'Dana Terhimpun',
        header: ['Kategori', 'Peserta', 'Nominal'],
        rows: danaRows,
      },
      {
        title: 'Biaya Pengadaan',
        rows: [
          [t('Sapi'), d.biaya_pengadaan.sapi > 0 ? rp(d.biaya_pengadaan.sapi) : t('—')],
          [t('Kambing'), d.biaya_pengadaan.kambing > 0 ? rp(d.biaya_pengadaan.kambing) : t('—')],
          [t('Total', { bold: true }), rp(d.biaya_pengadaan.total, { bold: true })],
        ],
      },
      {
        title: 'Saldo Qurban',
        rows: [[t('Saldo Qurban (Dana − Biaya)', { bold: true }), rp(d.saldo_qurban, { bold: true })]],
      },
      {
        title: 'Korelasi Ledger SKM',
        rows: [
          [t('Status'), t(korelasiLabel)],
          [
            t('Pembayaran tertaut'),
            t(`${d.korelasi_ledger.pembayaran_tertaut} / ${d.korelasi_ledger.pembayaran_total}`),
          ],
        ],
      },
    ],
  };
}
