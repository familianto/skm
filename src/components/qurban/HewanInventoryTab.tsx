'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { TableSkeleton } from '@/components/qurban/TabSkeleton';
import { formatRupiah, cn } from '@/lib/utils';
import {
  hewanStatusBadgeClass,
  hewanStatusLabel,
  tipePembelianLabel,
  formatHewanDateID,
  JENIS_OPTIONS,
  KELAS_OPTIONS,
  STATUS_OPTIONS,
  type DaftarHewanListItem,
} from '@/lib/qurban/daftar-hewan-display';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface Props {
  edisiId: string;
  edisiStatus: EdisiStatus;
  /** True when the session may mutate (SA/AQ/PD + status != SELESAI). */
  canEdit: boolean;
}

export function HewanInventoryTab({ edisiId, edisiStatus, canEdit }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [list, setList] = useState<DaftarHewanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [jenis, setJenis] = useState('');
  const [kelas, setKelas] = useState('');
  const [status, setStatus] = useState('');

  const baruHref = `/qurban/hewan/baru?edisi=${encodeURIComponent(edisiId)}`;
  const detailHref = (id: string) =>
    `/qurban/hewan/${id}?edisi=${encodeURIComponent(edisiId)}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ edisi_id: edisiId });
      if (jenis) qs.set('jenis', jenis);
      if (kelas) qs.set('kelas', kelas);
      if (status) qs.set('status', status);
      const res = await fetch(`/api/qurban/hewan?${qs.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setList(json.data as DaftarHewanListItem[]);
      } else {
        toast(json?.error?.message || 'Gagal memuat inventaris hewan.', 'error');
        setList([]);
      }
    } catch {
      toast('Gagal memuat inventaris hewan.', 'error');
    } finally {
      setLoading(false);
    }
  }, [edisiId, jenis, kelas, status, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isFiltering = !!jenis || !!kelas || !!status;

  const filterBar = (
    <Card className="mb-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <FilterSelect label="Jenis" value={jenis} onChange={setJenis} options={JENIS_OPTIONS} />
        <FilterSelect label="Kelas" value={kelas} onChange={setKelas} options={KELAS_OPTIONS} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </div>
    </Card>
  );

  const lockHint =
    edisiStatus === 'SELESAI'
      ? 'Edisi sudah SELESAI — inventaris hewan tidak dapat diubah.'
      : null;

  return (
    <div className="space-y-4">
      {lockHint && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {lockHint}
        </p>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => router.push(baruHref)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tambah Hewan
          </Button>
        </div>
      )}

      {filterBar}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : list.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">
              {isFiltering
                ? 'Tidak ada hewan yang cocok dengan filter.'
                : 'Belum ada hewan fisik untuk edisi ini.'}
            </p>
            {canEdit && !isFiltering && (
              <Button className="mt-4" onClick={() => router.push(baruHref)}>
                Tambah Hewan Pertama
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop table (lg+) */}
          <Card padding={false} className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Hewan</th>
                    <th className="px-4 py-3 text-left">Tipe</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Slot</th>
                    <th className="px-4 py-3 text-left">Vendor</th>
                    <th className="px-4 py-3 text-left">Harga</th>
                    <th className="px-4 py-3 text-left">Tgl Pembelian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((h) => (
                    <tr
                      key={h.id}
                      onClick={() => router.push(detailHref(h.id))}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{h.nama_display}</td>
                      <td className="px-4 py-3 text-gray-700">{tipePembelianLabel(h.tipe_pembelian)}</td>
                      <td className="px-4 py-3">
                        <span className={hewanStatusBadgeClass(h.status)}>{hewanStatusLabel(h.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {h.slot_terisi} / {h.kapasitas_slot}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{h.vendor_nama || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{formatRupiah(h.harga_beli_aktual)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatHewanDateID(h.tanggal_pembelian)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Card stack below lg */}
          <div className="lg:hidden space-y-3">
            {list.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => router.push(detailHref(h.id))}
                className="block w-full text-left"
              >
                <Card className="hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{h.nama_display}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {tipePembelianLabel(h.tipe_pembelian)} · Slot {h.slot_terisi}/{h.kapasitas_slot}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {h.vendor_nama || 'Tanpa vendor'} · {formatRupiah(h.harga_beli_aktual)}
                      </p>
                    </div>
                    <span className={cn(hewanStatusBadgeClass(h.status), 'shrink-0')}>
                      {hewanStatusLabel(h.status)}
                    </span>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="flex-1">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
      >
        <option value="">Semua {label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
