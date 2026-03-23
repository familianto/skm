'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RekeningBank, ApiResponse } from '@/types';

export function useRekening() {
  const [data, setData] = useState<RekeningBank[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/rekening');
      const json: ApiResponse<RekeningBank[]> = await res.json();
      if (json.success && json.data) setData(json.data);
    } catch {
      // silently fail — rekening is supplementary data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading };
}
