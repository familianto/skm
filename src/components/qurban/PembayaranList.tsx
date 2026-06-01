'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import { formatRupiah } from '@/lib/utils';
import {
  canTerimaPanitia,
  canLunaskan,
  filterPembayaran,
  metodePembayaranLabel,
  transferHintForStatus,
  type PembayaranRow,
  type StatusPembayaranFilter,
  type MetodePembayaranFilter,
} from '@/lib/qurban/pembayaran-display';
import { PembayaranStatusBadge } from './PembayaranStatusBadge';
import { TerimaPanitiaModal } from './TerimaPanitiaModal';

/**
 * F6 D2 — daftar & manajemen pembayaran (konsumsi PY4). Tab tunggal "Daftar
 * Pembayaran"; struktur tab disiapkan untuk M-D3 ("Rekonsiliasi"). Aksi alur
 * TUNAI: Terima Panitia (PY2) + Setor ke Kas (PY3) bergantung metode+status+peran.
 */

interface Props {
  edisiId: string;
}

const STATUS_FILTERS: { value: StatusPembayaranFilter; label: string }[] = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'BELUM_BAYAR', label: 'Belum Bayar' },
  { value: 'TERIMA_PANITIA', label: 'Diterima Panitia' },
  { value: 'LUNAS', label: 'Lunas' },
  { value: 'BATAL', label: 'Batal' },
];
const METODE_FILTERS: { value: MetodePembayaranFilter; label: string }[] = [
  { value: 'ALL', label: 'Semua metode' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'TUNAI', label: 'Cash · Datang Langsung' },
];

type Tab = 'daftar';

export function PembayaranList({ edisiId }: Props) {
  const { me } = useMe();
  const peran = me?.user.peran;
  const { toast } = useToast();

  const [tab] = useState<Tab>('daftar');
  const [rows, setRows] = useState<PembayaranRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusF, setStatusF] = useState<StatusPembayaranFilter>('ALL');
  const [metodeF, setMetodeF] = useState<MetodePembayaranFilter>('ALL');
  const [q, setQ] = useState('');

  // Modal Terima Panitia.
  const [terimaTarget, setTerimaTarget] = useState<PembayaranRow | null>(null);
  // Dialog Setor ke Kas (lunaskan).
  const [lunasTarget, setLunasTarget] = useState<PembayaranRow | null>(null);
  const [lunasSubmitting, setLunasSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/qurban/pembayaran?edisi_id=${encodeURIComponent(edisiId)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setRows((json.data as PembayaranRow[]) || []);
      } else {
        setError(json?.error?.message || 'Gagal memuat daftar pembayaran.');
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

  const filtered = useMemo(
    () => filterPembayaran(rows, { status: statusF, metode: metodeF, q }),
    [rows, statusF, metodeF, q]
  );

  const doLunaskan = async () => {
    if (!lunasTarget) return;
    setLunasSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/pembayaran/${lunasTarget.id}/lunaskan?edisi_id=${encodeURIComponent(edisiId)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Pembayaran dilunaskan & dicatat ke Kas Tunai.', 'success');
        setLunasTarget(null);
        await load();
        return;
      }
      toast(json?.error?.message || 'Gagal melunaskan pembayaran.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setLunasSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs (D2 tunggal; "Rekonsiliasi" menyusul M-D3). */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          className={
            tab === 'daftar'
              ? 'px-3 py-2 text-sm font-medium text-emerald-700 border-b-2 border-emerald-600'
              : 'px-3 py-2 text-sm font-medium text-gray-500'
          }
        >
          Daftar Pembayaran
        </button>
        <span className="px-3 py-2 text-sm text-gray-300" title="Segera hadir (M-D3)">
          Rekonsiliasi
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusF}
          onChange={(e) => setStatusF(e.target.value as StatusPembayaranFilter)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
        >
          {STATUS_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={metodeF}
          onChange={(e) => setMetodeF(e.target.value as MetodePembayaranFilter)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
        >
          {METODE_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex-1 min-w-[160px]">
          <Input placeholder="Cari kode bayar / muqorib…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Card><Loading /></Card>
      ) : error ? (
        <Card><p className="text-sm text-red-600">{error}</p></Card>
      ) : filtered.length === 0 ? (
        <Card><p className="text-sm text-gray-500">Tidak ada pembayaran yang cocok.</p></Card>
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Kode Bayar</th>
                  <th className="px-3 py-2">Muqorib</th>
                  <th className="px-3 py-2">Metode</th>
                  <th className="px-3 py-2 text-right">Nominal</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const showTerima = canTerimaPanitia(peran, r.metode, r.status);
                  const showLunas = canLunaskan(peran, r.metode, r.status);
                  const hint = transferHintForStatus(r.metode, r.status);
                  return (
                    <tr key={r.id} className="text-gray-900">
                      <td className="px-3 py-2 font-mono">{r.kode_bayar}</td>
                      <td className="px-3 py-2">
                        {r.muqorib_nama || '—'}
                        {r.jumlah_slot > 0 && (
                          <span className="text-xs text-gray-400"> · {r.jumlah_slot} slot</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{metodePembayaranLabel(r.metode)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-medium">{formatRupiah(r.nominal_total)}</div>
                        {r.metode === 'TRANSFER' && (
                          <div className="text-xs text-gray-400">transfer {formatRupiah(r.nominal_transfer)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <PembayaranStatusBadge status={r.status} />
                        {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {showTerima && (
                          <Button size="sm" variant="secondary" onClick={() => setTerimaTarget(r)}>
                            Terima Panitia
                          </Button>
                        )}
                        {showLunas && (
                          <Button size="sm" className="ml-2" onClick={() => setLunasTarget(r)}>
                            Setor ke Kas
                          </Button>
                        )}
                        {!showTerima && !showLunas && <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TerimaPanitiaModal
        open={!!terimaTarget}
        edisiId={edisiId}
        pembayaran={terimaTarget}
        onClose={() => setTerimaTarget(null)}
        onSuccess={() => { setTerimaTarget(null); void load(); }}
      />

      <ConfirmDialog
        open={!!lunasTarget}
        title="Setor ke Kas Tunai"
        message={
          lunasTarget
            ? `Mencatat pemasukan ${formatRupiah(lunasTarget.nominal_total)} ke Kas Tunai untuk ${lunasTarget.kode_bayar} (${lunasTarget.muqorib_nama || 'muqorib'}). Lanjutkan?`
            : ''
        }
        confirmLabel="Ya, Setor"
        onConfirm={doLunaskan}
        onCancel={() => setLunasTarget(null)}
        loading={lunasSubmitting}
      />
    </div>
  );
}
