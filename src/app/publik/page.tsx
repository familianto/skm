'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatRupiah, formatTanggal } from '@/lib/utils';
import type { PublicRingkasan } from '@/app/api/publik/ringkasan/route';
import { PublicTrendChart } from '@/components/publik/public-chart';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default function PublicPage() {
  const [data, setData] = useState<PublicRingkasan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/publik/ringkasan');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLastUpdated(new Date());
        setError('');
      } else {
        setError(json.error || 'Gagal memuat data');
      }
    } catch {
      setError('Gagal terhubung ke server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-300 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-emerald-200 text-lg">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-300 text-xl mb-2">{error || 'Data tidak tersedia'}</p>
          <button
            onClick={fetchData}
            className="text-emerald-300 underline hover:text-white"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const currentMonth = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen p-6 lg:p-10 flex flex-col">
      {/* Header */}
      <header className="text-center mb-8">
        {data.logoUrl && (
          <div className="mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.logoUrl}
              alt="Logo Masjid"
              width={96}
              height={96}
              className="w-20 h-20 lg:w-24 lg:h-24 rounded-full mx-auto object-cover border-4 border-white/20 shadow-lg"
            />
          </div>
        )}
        <h1 className="text-3xl lg:text-5xl font-bold text-white mb-2">
          {data.namaMasjid}
        </h1>
        {data.alamat && (
          <p className="text-emerald-200 text-sm lg:text-base">{data.alamat}</p>
        )}
        <div className="mt-3 inline-block bg-white/10 rounded-full px-4 py-1.5">
          <p className="text-emerald-100 text-sm lg:text-base font-medium">
            Laporan Keuangan — {currentMonth}
          </p>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 lg:p-8 border border-white/10">
          <p className="text-emerald-200 text-sm lg:text-base mb-1">Total Pemasukan</p>
          <p className="text-2xl lg:text-4xl font-bold text-emerald-300">
            {formatRupiah(data.bulanIni.totalMasuk)}
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 lg:p-8 border border-white/10">
          <p className="text-emerald-200 text-sm lg:text-base mb-1">Total Pengeluaran</p>
          <p className="text-2xl lg:text-4xl font-bold text-red-300">
            {formatRupiah(data.bulanIni.totalKeluar)}
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 lg:p-8 border border-white/10">
          <p className="text-emerald-200 text-sm lg:text-base mb-1">Saldo Kas</p>
          <p className="text-2xl lg:text-4xl font-bold text-white">
            {formatRupiah(data.saldoTotal)}
          </p>
        </div>
      </div>

      {/* Chart + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Trend Chart */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg lg:text-xl font-semibold text-white mb-4">
            Tren 6 Bulan Terakhir
          </h2>
          <PublicTrendChart data={data.tren6Bulan} />
        </div>

        {/* Recent Transactions */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg lg:text-xl font-semibold text-white mb-4">
            Transaksi Terakhir
          </h2>
          {data.transaksiTerakhir.length === 0 ? (
            <p className="text-emerald-200 text-sm">Belum ada transaksi</p>
          ) : (
            <div className="space-y-3">
              {data.transaksiTerakhir.map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-white text-sm lg:text-base font-medium truncate">
                      {tx.deskripsi}
                    </p>
                    <p className="text-emerald-300/70 text-xs lg:text-sm">
                      {formatTanggal(tx.tanggal)}
                    </p>
                  </div>
                  <span
                    className={`text-sm lg:text-base font-semibold whitespace-nowrap ${
                      tx.jenis === 'MASUK' ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {tx.jenis === 'MASUK' ? '+' : '-'}{formatRupiah(tx.jumlah)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center">
        <div className="flex items-center justify-center gap-2 text-emerald-300/50 text-xs lg:text-sm">
          <span>Dikelola dengan SKM v2.1</span>
          <span>•</span>
          <span>Auto-refresh setiap 5 menit</span>
          {lastUpdated && (
            <>
              <span>•</span>
              <span>Update terakhir: {lastUpdated.toLocaleTimeString('id-ID')}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
