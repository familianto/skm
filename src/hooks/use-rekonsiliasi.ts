'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Rekonsiliasi, ApiResponse } from '@/types';

interface UseRekonsiliasiOptions {
  rekening_id?: string;
}

export function useRekonsiliasi(options?: UseRekonsiliasiOptions) {
  const [data, setData] = useState<Rekonsiliasi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.rekening_id) params.set('rekening_id', options.rekening_id);
      const qs = params.toString();
      const url = qs ? `/api/rekonsiliasi?${qs}` : '/api/rekonsiliasi';
      const res = await fetch(url);
      const json: ApiResponse<Rekonsiliasi[]> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat data rekonsiliasi');
      }
    } catch {
      setError('Gagal memuat data rekonsiliasi');
    } finally {
      setLoading(false);
    }
  }, [options?.rekening_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
