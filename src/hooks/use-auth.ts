'use client';

import { useState, useEffect } from 'react';
import type { SessionData } from '@/types';

export function useAuth() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setSession(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { session, loading, isAuthenticated: !!session };
}
