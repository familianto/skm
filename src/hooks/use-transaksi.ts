'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaksi, ApiResponse } from '@/types';

interface UseTransaksiOptions {
  tahun?: string;
  bulan?: string;
}

export function useTransaksi(options?: UseTransaksiOptions) {
  const [data, setData] = useState<Transaksi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.tahun) params.set('tahun', options.tahun);
      if (options?.bulan) params.set('bulan', options.bulan);
      const qs = params.toString();
      const url = qs ? `/api/transaksi?${qs}` : '/api/transaksi';
      const res = await fetch(url);
      const json: ApiResponse<Transaksi[]> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat data');
      }
    } catch {
      setError('Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  }, [options?.tahun, options?.bulan]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useTransaksiDetail(id: string | null) {
  const [data, setData] = useState<Transaksi | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transaksi/${id}`);
      const json: ApiResponse<Transaksi> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Transaksi tidak ditemukan');
      }
    } catch {
      setError('Gagal memuat detail transaksi');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
