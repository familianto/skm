'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Kategori, ApiResponse } from '@/types';

export function useKategori(jenis?: string) {
  const [data, setData] = useState<Kategori[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // AbortController with 15s timeout prevents fetch from hanging forever
    // (e.g., on Vercel cold start or network partition)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const url = jenis ? `/api/kategori?jenis=${jenis}` : '/api/kategori';
      const res = await fetch(url, { signal: controller.signal });
      const json: ApiResponse<Kategori[]> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        console.warn('useKategori: API returned', json.success ? 'empty data' : json.error);
      }
    } catch (err) {
      console.warn('useKategori fetch failed:', err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [jenis]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading };
}
