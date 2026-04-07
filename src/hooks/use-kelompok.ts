'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Kelompok, ApiResponse } from '@/types';
import type { KelompokSummaryItem } from '@/app/api/dashboard/kelompok/route';

export function useKelompok() {
  const [data, setData] = useState<Kelompok[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/kelompok');
      const json: ApiResponse<Kelompok[]> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat kelompok');
      }
    } catch {
      setError('Gagal memuat kelompok');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useKelompokSummary() {
  const [data, setData] = useState<KelompokSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/kelompok');
      const json: ApiResponse<KelompokSummaryItem[]> = await res.json();
      if (json.success && json.data) setData(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refetch: fetchData };
}
