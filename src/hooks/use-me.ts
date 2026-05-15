'use client';

import { useEffect, useState } from 'react';

/**
 * useMe — F1 client hook around GET /api/auth/me (Tahap 3.E §3.1 A3).
 *
 * Returns:
 *   me      — { user, permissions, landing_url, current_edisi, session } | null
 *   loading — true while the request is in flight
 *   error   — error code string when /me fails (AUTH_REQUIRED, NETWORK_ERROR, …)
 *
 * Mutations (login / logout / change-pin) refresh `me` automatically on the
 * next mount because the page reloads. F2 may want to expose a `refresh()`
 * callback; not needed in F1.
 */

export interface MeUser {
  id: string;
  nama: string;
  telepon: string;
  email: string;
  peran: string;
  is_active: boolean;
  last_login_at: string;
  created_at: string;
}

export interface MePermissions {
  can_access: string[];
  qurban_edisi_locked_to_aktif: boolean;
  can_manage_anggota: boolean;
}

export interface MeData {
  user: MeUser;
  permissions: MePermissions;
  current_edisi: null;
  landing_url: string;
  session: { expires_at: string };
}

interface State {
  me: MeData | null;
  loading: boolean;
  error: string | null;
}

export function useMe(): State {
  const [state, setState] = useState<State>({ me: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setState({ me: json.data as MeData, loading: false, error: null });
        } else {
          setState({
            me: null,
            loading: false,
            error: json?.error?.code || 'AUTH_REQUIRED',
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ me: null, loading: false, error: 'NETWORK_ERROR' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
