'use client';

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import type {
  LaporanPesertaDTO,
  TipeGroup,
  JenisKelasGroup,
  RtGroup,
} from '@/lib/qurban/laporan-peserta';

/**
 * F8 Milestone B — Laporan Qurban bertab. Tab Peserta mengkonsumsi LP1
 * (`GET /api/qurban/laporan/peserta`) — ketiga grouping ada di satu payload,
 * jadi ganti grouping instan tanpa refetch. Tab Hewan & Keuangan placeholder
 * (Milestone C/D). Tanpa tab Distribusi. Mobile-first (iPad Safari).
 */

interface Props {
  edisiId: string;
}

type Tab = 'peserta' | 'hewan' | 'keuangan';
type Grouping = 'tipe' | 'jenis_kelas' | 'rt';

const TABS: { value: Tab; label: string }[] = [
  { value: 'peserta', label: 'Peserta' },
  { value: 'hewan', label: 'Hewan' },
  { value: 'keuangan', label: 'Keuangan' },
];

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: 'tipe', label: 'Tipe Qurban' },
  { value: 'jenis_kelas', label: 'Jenis–Kelas Hewan' },
  { value: 'rt', label: 'RT' },
];

export function LaporanQurban({ edisiId }: Props) {
  const [tab, setTab] = useState<Tab>('peserta');

  return (
    <div className="space-y-4">
      {/* Tab utama. */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? 'whitespace-nowrap px-4 py-2 text-sm font-medium text-emerald-700 border-b-2 border-emerald-600'
                : 'whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'peserta' && <TabPeserta edisiId={edisiId} />}
      {tab === 'hewan' && <Placeholder label="Laporan Hewan" milestone="Milestone C" />}
      {tab === 'keuangan' && <Placeholder label="Laporan Keuangan" milestone="Milestone D" />}
    </div>
  );
}

function Placeholder({ label, milestone }: { label: string; milestone: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-xs text-gray-400">Segera — {milestone}</p>
    </div>
  );
}

// ── Tab Peserta ──────────────────────────────────────────────────────────────

function TabPeserta({ edisiId }: { edisiId: string }) {
  const [data, setData] = useState<LaporanPesertaDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>('tipe');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/laporan/peserta?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setData(json.data as LaporanPesertaDTO);
      } else {
        setError(json?.error?.message || 'Gagal memuat laporan peserta.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [edisiId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoading />;

  if (error || !data) {
    return (
      <Card>
        <p className="text-sm text-red-600">{error || 'Data tidak tersedia.'}</p>
        <button
          onClick={() => void load()}
          className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Coba lagi
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ringkasan kecil. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-600">
        <span className="text-lg font-bold text-gray-900">{data.total_peserta}</span>
        <span>peserta terdaftar</span>
        {data.peserta_batal > 0 && (
          <span className="text-xs text-gray-400">
            · {data.peserta_batal} peserta batal tidak dihitung
          </span>
        )}
      </div>

      {/* Pemilih grouping (segmented). */}
      <div className="flex flex-wrap gap-2">
        {GROUPINGS.map((g) => (
          <button
            key={g.value}
            onClick={() => setGrouping(g.value)}
            className={
              grouping === g.value
                ? 'rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200'
            }
          >
            {g.label}
          </button>
        ))}
      </div>

      {grouping === 'tipe' && <TabelTipe rows={data.groupings.tipe} total={data.total_peserta} />}
      {grouping === 'jenis_kelas' && (
        <TabelJenisKelas rows={data.groupings.jenis_kelas} total={data.total_peserta} />
      )}
      {grouping === 'rt' && <TabelRt rows={data.groupings.rt} total={data.total_peserta} />}
    </div>
  );
}

// ── Tabel: Tipe ──────────────────────────────────────────────────────────────

function TabelTipe({ rows, total }: { rows: TipeGroup[]; total: number }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">Tipe</th>
            <th className="px-4 py-2.5 text-right font-medium">Peserta</th>
            <th className="px-4 py-2.5 text-right font-medium">Porsi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-100">
              <td className="px-4 py-2.5 text-gray-700">{r.label}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.peserta}</td>
              <td className="px-4 py-2.5 text-right text-gray-500">{fmtPct(r.persen)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right">{total}</td>
            <td className="px-4 py-2.5 text-right">{total > 0 ? '100%' : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ── Tabel: Jenis–Kelas ───────────────────────────────────────────────────────

function TabelJenisKelas({ rows, total }: { rows: JenisKelasGroup[]; total: number }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">Hewan</th>
            <th className="px-4 py-2.5 text-right font-medium">Peserta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.jenis}-${r.kelas}-${r.label}`}
              className={`border-b border-gray-100 ${r.jenis ? '' : 'text-gray-400'}`}
            >
              <td className="px-4 py-2.5 text-gray-700">{r.label}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.peserta}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right">{total}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ── Tabel: RT ────────────────────────────────────────────────────────────────

function TabelRt({ rows, total }: { rows: RtGroup[]; total: number }) {
  const max = rows.reduce((m, r) => Math.max(m, r.peserta), 0);
  const totalMuqorib = rows.reduce((s, r) => s + r.muqorib, 0);
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">RT</th>
            <th className="px-4 py-2.5 font-medium">Sebaran</th>
            <th className="px-4 py-2.5 text-right font-medium">Peserta</th>
            <th className="px-4 py-2.5 text-right font-medium">Muqorib</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lainnya = r.rt === 'LAINNYA';
            const pct = max > 0 ? Math.round((r.peserta / max) * 100) : 0;
            return (
              <tr key={r.rt} className={`border-b border-gray-100 ${lainnya ? 'text-gray-400' : ''}`}>
                <td className={`px-4 py-2.5 ${lainnya ? '' : 'text-gray-700'}`}>{r.label}</td>
                <td className="px-4 py-2.5">
                  <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${lainnya ? 'bg-gray-300' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.peserta}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{r.muqorib}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5 text-right">{total}</td>
            <td className="px-4 py-2.5 text-right">{totalMuqorib}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/** Persen 1-desimal → string. mis. 59 → "59%", 59.5 → "59,5%". */
function fmtPct(p: number): string {
  if (Number.isInteger(p)) return `${p}%`;
  return `${p.toString().replace('.', ',')}%`;
}
