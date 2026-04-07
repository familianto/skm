'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ApiResponse } from '@/types';

export interface DashboardSummary {
  totalMasuk: number;
  totalKeluar: number;
  saldo: number;
  jumlahTransaksi: number;
  jumlahMasuk: number;
  jumlahKeluar: number;
  saldoPerRekening: {
    rekening_id: string;
    nama_bank: string;
    nomor_rekening: string;
    saldo: number;
  }[];
}

export interface MonthlyTrendItem {
  bulan: string;
  bulanIndex: number;
  masuk: number;
  keluar: number;
}

export interface CategoryBreakdownItem {
  kategori_id: string;
  nama: string;
  jumlah: number;
  persentase: number;
}

export interface ChartData {
  type: string;
  data: MonthlyTrendItem[] | CategoryBreakdownItem[];
}

export interface YearlyTrendItem {
  tahun: string;
  masuk: number;
  keluar: number;
}

export interface CumulativeCategoryItem {
  kategori_id: string;
  nama: string;
  jumlah: number;
  persentase: number;
}

export interface CumulativeDashboard {
  totalMasuk: number;
  totalKeluar: number;
  saldo: number;
  jumlahTransaksi: number;
  jumlahMasuk: number;
  jumlahKeluar: number;
  yearlyTrend: YearlyTrendItem[];
  categoryBreakdown: {
    masuk: CumulativeCategoryItem[];
    keluar: CumulativeCategoryItem[];
  };
}

export function useCumulativeDashboard() {
  const [data, setData] = useState<CumulativeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/cumulative');
      const json: ApiResponse<CumulativeDashboard> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat data kumulatif');
      }
    } catch {
      setError('Gagal memuat data kumulatif');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useDashboardSummary(tahun?: string, bulan?: string, kategoriIds?: string[]) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const kategoriKey = kategoriIds?.sort().join(',') || '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tahun) params.set('tahun', tahun);
      if (bulan) params.set('bulan', bulan);
      if (kategoriIds && kategoriIds.length > 0) {
        params.set('kategori', kategoriIds.join(','));
      }
      const qs = params.toString();
      const url = qs ? `/api/dashboard/summary?${qs}` : '/api/dashboard/summary';
      const res = await fetch(url);
      const json: ApiResponse<DashboardSummary> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat ringkasan');
      }
    } catch {
      setError('Gagal memuat data ringkasan');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun, bulan, kategoriKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useChartData(type: 'monthly-trend' | 'category-breakdown', tahun?: string, jenis?: string) {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type });
      if (tahun) params.set('tahun', tahun);
      if (jenis) params.set('jenis', jenis);
      const res = await fetch(`/api/dashboard/chart-data?${params.toString()}`);
      const json: ApiResponse<ChartData> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat data grafik');
      }
    } catch {
      setError('Gagal memuat data grafik');
    } finally {
      setLoading(false);
    }
  }, [type, tahun, jenis]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
