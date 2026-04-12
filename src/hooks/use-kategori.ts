'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Kategori, ApiResponse } from '@/types';

export function useKategori(jenis?: string) {
  const [data, setData] = useState<Kategori[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const url = jenis ? `/api/kategori?jenis=${jenis}` : '/api/kategori';
      const res = await fetch(url);
      const json: ApiResponse<Kategori[]> = await res.json();
      if (json.success && json.data) setData(json.data);
    } catch {
      // silently fail — kategori is supplementary data
    } finally {
      setLoading(false);
    }
  }, [jenis]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading };
}
