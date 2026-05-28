'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

/**
 * F4c-B — smart autocomplete over ACTIVE muqorib (M7 lookup). Debounced 300ms,
 * fires at ≥2 characters, shows scored candidates. Emits the picked candidate
 * to the parent; rendering the selected muqorib + duplicate checks live there.
 *
 * F4d Milestone B: M7 server-side now also handles **HP-exact lookup** when
 * `q` looks mostly numeric (≥7 digits). Same query param, the server routes:
 *   - HP-like input → exact-match HP (1 result max, score 1.0).
 *   - Otherwise → existing Jaro-Winkler name autocomplete.
 * `no_hp` is returned **unmasked** for panitia (PII matrix).
 */

export interface MuqoribCandidate {
  id: string;
  nama_lengkap: string;
  alamat: string;
  rt: string;
  no_hp: string;
  score: number;
}

interface Props {
  onSelect: (m: MuqoribCandidate) => void;
  disabled?: boolean;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

export function MuqoribLookup({ onSelect, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<MuqoribCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const runSearch = useCallback(async (q: string) => {
    const myId = ++reqIdRef.current;
    if (q.length < MIN_CHARS) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/qurban/muqorib/lookup?q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => ({}));
      if (reqIdRef.current !== myId) return; // a newer query superseded this one
      setResults(json?.ok ? ((json.data as MuqoribCandidate[]) || []) : []);
    } catch {
      if (reqIdRef.current === myId) setResults([]);
    } finally {
      if (reqIdRef.current === myId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(debounced);
  }, [debounced, runSearch]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handlePick = (m: MuqoribCandidate) => {
    onSelect(m);
    setQuery('');
    setDebounced('');
    setResults([]);
    setOpen(false);
  };

  const showDropdown = open && debounced.length >= MIN_CHARS;

  return (
    <div className="relative" ref={wrapperRef}>
      <Input
        label="Cari Muqorib"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder="Ketik nama atau no. HP lengkap (min. 2 karakter)..."
        disabled={disabled}
        autoComplete="off"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-1 z-30 rounded-lg border border-gray-200 bg-white shadow-lg max-h-72 overflow-y-auto">
          {loading && (
            <p className="px-3 py-3 text-sm text-gray-500">Mencari…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-gray-500">
              Tidak ada muqorib cocok. Gunakan “Buat muqorib baru” di bawah.
            </p>
          )}
          {!loading &&
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handlePick(m)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <p className="text-sm font-medium text-gray-900">{m.nama_lengkap}</p>
                <p className="text-xs text-gray-500">
                  {m.alamat ? `${m.alamat} · ` : ''}RT {m.rt} ·{' '}
                  <span className="font-mono">{m.no_hp}</span>
                </p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
