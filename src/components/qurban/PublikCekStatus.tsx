'use client';

import { useState } from 'react';

import { formatRupiah } from '@/lib/utils';
import {
  statusPendaftaranBadgeClass,
  statusPendaftaranLabel,
  tipeQurbanLabel,
} from '@/lib/qurban/peserta-display';
import { friendlyPublikError } from '@/lib/qurban/publik-daftar-form';
import {
  buildCekStatusQuery,
  groupByKodeBayar,
  type CekStatusGroup,
  type CekStatusMode,
} from '@/lib/qurban/publik-cek-status';
import type { CekStatusEntry } from '@/lib/qurban/publik-status';

/**
 * F4c-F — public cek-status (PB4). Search by kode_bayar or no_hp; the muqorib
 * name comes back masked from PB4 (no client masking needed). Results are
 * grouped by kode_bayar (one registration = one card, F4c-C model).
 */

const MODES: { value: CekStatusMode; label: string }[] = [
  { value: 'kode_bayar', label: 'Kode Bayar' },
  { value: 'no_hp', label: 'Nomor HP' },
];

export function PublikCekStatus() {
  const [mode, setMode] = useState<CekStatusMode>('kode_bayar');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CekStatusGroup[] | null>(null);

  const search = async () => {
    const v = value.trim();
    if (!v) {
      setError(mode === 'kode_bayar' ? 'Masukkan kode bayar.' : 'Masukkan nomor HP.');
      return;
    }
    setLoading(true);
    setError(null);
    setGroups(null);
    try {
      const res = await fetch(`/api/publik/qurban/cek-status?${buildCekStatusQuery(mode, v)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setGroups(groupByKodeBayar((json.data as CekStatusEntry[]) || []));
      } else {
        setError(friendlyPublikError(json?.error?.code || '', res.status, json?.error?.message));
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: CekStatusMode) => {
    setMode(m);
    setValue('');
    setGroups(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => switchMode(m.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === m.value ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search();
          }}
          placeholder={mode === 'kode_bayar' ? 'mis. QRB-1448-013' : '08xxx atau 628xxx'}
          inputMode={mode === 'no_hp' ? 'tel' : 'text'}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />

        <button
          type="button"
          onClick={search}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Mencari…' : 'Cek Status'}
        </button>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {groups !== null && groups.length === 0 && !error && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <p className="text-sm text-gray-600">
            Tidak ada pendaftaran ditemukan. Periksa kembali{' '}
            {mode === 'kode_bayar' ? 'kode bayar' : 'nomor HP'} Anda.
          </p>
        </div>
      )}

      {groups?.map((g) => (
        <GroupCard key={g.kode_bayar} group={g} />
      ))}
    </div>
  );
}

function GroupCard({ group }: { group: CekStatusGroup }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{group.nama}</p>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{group.kode_bayar}</p>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{group.slot_count} slot</span>
      </div>

      <ul className="mt-3 divide-y divide-gray-100">
        {group.entries.map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="text-gray-700">
              Slot {e.slot_number} · {tipeQurbanLabel(e.tipe_qurban)}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-gray-600">{formatRupiah(e.harga_disepakati)}</span>
              <span className={statusPendaftaranBadgeClass(e.status_pendaftaran)}>
                {statusPendaftaranLabel(e.status_pendaftaran)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex justify-between text-sm border-t border-gray-100 pt-2">
        <span className="text-gray-500">Total</span>
        <span className="font-semibold text-gray-900">{formatRupiah(group.total_harga)}</span>
      </div>
    </div>
  );
}
