'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

import type { EdisiAccessReason } from '@/lib/qurban/edisi-context';

export interface EditionSwitcherEdisi {
  id: string;
  tahun_hijriah: string;
  status: 'DRAFT' | 'AKTIF' | 'SELESAI';
  tanggal_pendaftaran_buka: string;
  tanggal_pendaftaran_tutup: string;
}

interface Props {
  current: EditionSwitcherEdisi | null;
  available: EditionSwitcherEdisi[];
  canSwitch: boolean;
  reason: EdisiAccessReason;
}

function pendaftaranLabel(e: EditionSwitcherEdisi | null): string {
  if (!e) return '—';
  const today = new Date().toISOString().slice(0, 10);
  const buka = e.tanggal_pendaftaran_buka;
  const tutup = e.tanggal_pendaftaran_tutup;
  if (!buka || !tutup) return '—';
  if (today < buka) return 'BELUM BUKA';
  if (today > tutup) return 'TUTUP';
  return 'BUKA';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'AKTIF':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'DRAFT':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'SELESAI':
      return 'bg-gray-100 text-gray-700 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

export function EditionSwitcher({
  current,
  available,
  canSwitch,
  reason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handlePick = (id: string) => {
    setOpen(false);
    if (current?.id === id) return;
    const params = new URLSearchParams(window.location.search);
    params.set('edisi', id);
    router.push(`${window.location.pathname}?${params.toString()}`);
    router.refresh();
  };

  // Empty state — no edisi exists yet (Milestone A always lands here).
  if (!current) {
    const hint =
      reason === 'NO_EDISI_EXISTS'
        ? 'Belum ada edisi'
        : reason === 'NOT_AKTIF_FOR_PANITIA'
        ? 'Belum ada edisi aktif'
        : 'Edisi tidak tersedia';
    return (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm">
        <span className="font-medium text-gray-600">Edisi:</span>
        <span className="text-gray-500 italic">{hint}</span>
      </div>
    );
  }

  const labelText = (
    <>
      <span className="font-semibold text-gray-900">{current.tahun_hijriah}</span>
      <span
        className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(current.status)}`}
      >
        {current.status}
      </span>
      <span className="hidden md:inline text-gray-500">
        Pendaftaran:{' '}
        <span className="font-medium text-gray-700">{pendaftaranLabel(current)}</span>
      </span>
    </>
  );

  if (!canSwitch || available.length <= 1) {
    return (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm">
        <span className="text-gray-500">Edisi:</span>
        {labelText}
      </div>
    );
  }

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-gray-500">Edisi:</span>
        {labelText}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 mt-1 min-w-[16rem] z-30 rounded-lg border border-gray-200 bg-white shadow-lg py-1 max-h-72 overflow-y-auto"
        >
          {available.map((e) => {
            const isActive = e.id === current.id;
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handlePick(e.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                  isActive ? 'bg-emerald-50 text-emerald-900' : 'text-gray-800'
                }`}
              >
                <span className="font-medium">{e.tahun_hijriah}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(e.status)}`}
                >
                  {e.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
