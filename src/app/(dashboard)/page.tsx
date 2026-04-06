'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { PageTitle } from '@/components/layout/page-title';
import { SummaryCard } from '@/components/ui/summary-card';
import { MonthlyTrendChart } from '@/components/charts/monthly-trend';
import { CategoryBreakdownChart } from '@/components/charts/category-breakdown';
import { YearlyTrendChart } from '@/components/charts/yearly-trend';
import { CategoryBarChart } from '@/components/charts/category-bar';
import { Loading } from '@/components/ui/loading';
import { useDashboardSummary, useChartData, useCumulativeDashboard } from '@/hooks/use-dashboard';
import { useTransaksi } from '@/hooks/use-transaksi';
import { formatRupiah, formatTanggal } from '@/lib/utils';
import { APP_CONFIG } from '@/lib/constants';
import { TransaksiJenis } from '@/types';
import type { MonthlyTrendItem, CategoryBreakdownItem } from '@/hooks/use-dashboard';
import Link from 'next/link';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
const months = [
  { value: '', label: 'Semua Bulan' },
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

function formatCount(count: number): string {
  return new Intl.NumberFormat('id-ID').format(count);
}

export default function DashboardPage() {
  const [tahun, setTahun] = useState(APP_CONFIG.DEFAULT_TAHUN_BUKU);
  const [bulan, setBulan] = useState('');
  const [categoryJenis, setCategoryJenis] = useState<string>(TransaksiJenis.KELUAR);
  const [cumulativeCatJenis, setCumulativeCatJenis] = useState<'masuk' | 'keluar'>('keluar');

  const { data: cumulative, loading: cumulativeLoading } = useCumulativeDashboard();
  const { data: summary, loading: summaryLoading } = useDashboardSummary(tahun, bulan || undefined);
  const { data: trendData, loading: trendLoading } = useChartData('monthly-trend', tahun);
  const { data: categoryData, loading: categoryLoading } = useChartData('category-breakdown', tahun, categoryJenis);
  const { data: recentTx, loading: recentLoading } = useTransaksi({ tahun, bulan: bulan || undefined });

  const last5Tx = recentTx.slice(0, 5);

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Ringkasan keuangan masjid" />

      {/* Cumulative All-Time Section */}
      {cumulativeLoading ? (
        <Loading className="my-8" />
      ) : cumulative ? (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <SummaryCard
              title="Total Pemasukan (All-Time)"
              value={formatRupiah(cumulative.totalMasuk)}
              icon="↑"
              color="green"
              subtitle={`${formatCount(cumulative.jumlahMasuk)} transaksi`}
            />
            <SummaryCard
              title="Total Pengeluaran (All-Time)"
              value={formatRupiah(cumulative.totalKeluar)}
              icon="↓"
              color="red"
              subtitle={`${formatCount(cumulative.jumlahKeluar)} transaksi`}
            />
            <SummaryCard
              title="Saldo Kumulatif"
              value={formatRupiah(cumulative.saldo)}
              icon="$"
              color="blue"
              subtitle={`${formatCount(cumulative.jumlahTransaksi)} transaksi total`}
            />
          </div>

          {cumulative.yearlyTrend.length > 0 && (
            <Card className="mb-6">
              <CardTitle>Tren Tahunan</CardTitle>
              <div className="mt-4">
                <YearlyTrendChart data={cumulative.yearlyTrend} />
              </div>
            </Card>
          )}

          {/* Category Breakdown All-Time */}
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Top Kategori (All-Time)</CardTitle>
              <div className="flex gap-1">
                <button
                  onClick={() => setCumulativeCatJenis('masuk')}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    cumulativeCatJenis === 'masuk'
                      ? 'bg-emerald-100 text-emerald-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Pemasukan
                </button>
                <button
                  onClick={() => setCumulativeCatJenis('keluar')}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    cumulativeCatJenis === 'keluar'
                      ? 'bg-red-100 text-red-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Pengeluaran
                </button>
              </div>
            </div>
            <div className="mt-4">
              <CategoryBarChart
                data={cumulative.categoryBreakdown[cumulativeCatJenis]}
                color={cumulativeCatJenis === 'masuk' ? 'green' : 'red'}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {/* Detail Bulanan Separator */}
      <div className="border-t border-gray-200 pt-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Detail Bulanan</h2>
        <p className="text-sm text-gray-500">Filter berdasarkan tahun dan bulan</p>
      </div>

      {/* Period Filter */}
      <div className="flex gap-3 mb-6">
        <select
          value={tahun}
          onChange={e => setTahun(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={bulan}
          onChange={e => setBulan(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <Loading className="my-8" />
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            title="Total Pemasukan"
            value={formatRupiah(summary.totalMasuk)}
            icon="↑"
            color="green"
            subtitle={`${summary.jumlahTransaksi} transaksi`}
          />
          <SummaryCard
            title="Total Pengeluaran"
            value={formatRupiah(summary.totalKeluar)}
            icon="↓"
            color="red"
          />
          <SummaryCard
            title="Saldo Periode"
            value={formatRupiah(summary.saldo)}
            icon="$"
            color="blue"
          />
          <SummaryCard
            title="Jumlah Transaksi"
            value={summary.jumlahTransaksi.toString()}
            icon="#"
            color="gray"
          />
        </div>
      ) : null}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Monthly Trend Chart */}
        <Card>
          <CardTitle>Tren Bulanan {tahun}</CardTitle>
          <div className="mt-4">
            {trendLoading ? (
              <Loading className="h-64" />
            ) : trendData ? (
              <MonthlyTrendChart data={trendData.data as MonthlyTrendItem[]} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-12">Tidak ada data</p>
            )}
          </div>
        </Card>

        {/* Category Breakdown Chart */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Breakdown Kategori</CardTitle>
            <div className="flex gap-1">
              <button
                onClick={() => setCategoryJenis(TransaksiJenis.MASUK)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  categoryJenis === TransaksiJenis.MASUK
                    ? 'bg-emerald-100 text-emerald-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Pemasukan
              </button>
              <button
                onClick={() => setCategoryJenis(TransaksiJenis.KELUAR)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  categoryJenis === TransaksiJenis.KELUAR
                    ? 'bg-red-100 text-red-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Pengeluaran
              </button>
            </div>
          </div>
          <div className="mt-4">
            {categoryLoading ? (
              <Loading className="h-64" />
            ) : categoryData ? (
              <CategoryBreakdownChart data={categoryData.data as CategoryBreakdownItem[]} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-12">Tidak ada data</p>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Transaksi Terakhir</CardTitle>
            <Link
              href="/transaksi"
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Lihat Semua
            </Link>
          </div>
          {recentLoading ? (
            <Loading className="h-32" />
          ) : last5Tx.length === 0 ? (
            <p className="text-gray-400 text-sm">Belum ada transaksi</p>
          ) : (
            <div className="space-y-3">
              {last5Tx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.deskripsi}</p>
                    <p className="text-xs text-gray-400">{formatTanggal(tx.tanggal)}</p>
                  </div>
                  <span className={`text-sm font-semibold ${
                    tx.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {tx.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(tx.jumlah)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Saldo per Rekening */}
        <Card>
          <CardTitle>Saldo per Rekening</CardTitle>
          <div className="mt-4">
            {summaryLoading ? (
              <Loading className="h-32" />
            ) : summary && summary.saldoPerRekening.length > 0 ? (
              <div className="space-y-3">
                {summary.saldoPerRekening.map(rek => (
                  <div key={rek.rekening_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{rek.nama_bank}</p>
                      <p className="text-xs text-gray-400">{rek.nomor_rekening}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-600">
                      {formatRupiah(rek.saldo)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Belum ada data rekening</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
