'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Reminder, ApiResponse } from '@/types';

export function useReminder(options?: { donatur_id?: string }) {
  const [data, setData] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.donatur_id) params.set('donatur_id', options.donatur_id);
      const url = `/api/reminder${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      const json: ApiResponse<Reminder[]> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Gagal memuat data');
      }
    } catch {
      setError('Gagal memuat data reminder');
    } finally {
      setLoading(false);
    }
  }, [options?.donatur_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useFonnteStatus() {
  const [connected, setConnected] = useState(false);
  const [mock, setMock] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reminder/send')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setConnected(json.data.connected);
          setMock(json.data.mock);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { connected, mock, loading };
}
