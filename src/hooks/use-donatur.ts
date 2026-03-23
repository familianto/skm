'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Donatur, ApiResponse } from '@/types';

export function useDonatur(options?: { kelompok?: string }) {
  const [data, setData] = useState<Donatur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.kelompok) params.set('kelompok', options.kelompok);
      const url = `/api/donatur${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      const json: ApiResponse<Donatur[]> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat data');
      }
    } catch {
      setError('Gagal memuat data donatur');
    } finally {
      setLoading(false);
    }
  }, [options?.kelompok]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useDonaturDetail(id: string | null) {
  const [data, setData] = useState<Donatur | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/donatur/${id}`);
      const json: ApiResponse<Donatur> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Donatur tidak ditemukan');
      }
    } catch {
      setError('Gagal memuat detail donatur');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
