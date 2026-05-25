'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { TableSkeleton } from '@/components/qurban/TabSkeleton';
import { HewanBatchStatusModal } from '@/components/qurban/HewanBatchStatusModal';
import { formatRupiah, cn } from '@/lib/utils';
import {
  hewanStatusBadgeClass,
  hewanStatusLabel,
  tipePembelianLabel,
  formatHewanDateID,
  jenisLabel,
  JENIS_OPTIONS,
  KELAS_OPTIONS,
  STATUS_OPTIONS,
  type DaftarHewanListItem,
} from '@/lib/qurban/daftar-hewan-display';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface Props {
  edisiId: string;
  edisiStatus: EdisiStatus;
  /** Reorder + create (SA/AQ/PD + status != SELESAI). */
  canEdit: boolean;
  /** Batch-status (SA/AQ + status != SELESAI). */
  canBatchStatus: boolean;
}

export function HewanInventoryTab({ edisiId, edisiStatus, canEdit, canBatchStatus }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [list, setList] = useState<DaftarHewanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [jenis, setJenis] = useState('');
  const [kelas, setKelas] = useState('');
  const [status, setStatus] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

  // Reorder mode (D1) — simple up/down for one (jenis, kelas) group.
  const [reordering, setReordering] = useState(false);
  const [reorderItems, setReorderItems] = useState<DaftarHewanListItem[]>([]);
  const [reorderSaving, setReorderSaving] = useState(false);

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

  // Selection only makes sense for the current list; reset when it changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [jenis, kelas, status]);

  const isFiltering = !!jenis || !!kelas || !!status;
  const canReorderGroup = canEdit && !!jenis && !!kelas;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = list.length > 0 && list.every((h) => selectedIds.has(h.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(list.map((h) => h.id)));
  };

  // --- Reorder ---
  const enterReorder = async () => {
    // Fetch the FULL group (all statuses) — nomor_urut spans statuses, and H5
    // requires a complete permutation of the group.
    try {
      const qs = new URLSearchParams({ edisi_id: edisiId, jenis, kelas });
      const res = await fetch(`/api/qurban/hewan?${qs.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setReorderItems(json.data as DaftarHewanListItem[]);
        setSelectedIds(new Set());
        setReordering(true);
      } else {
        toast(json?.error?.message || 'Gagal memuat grup hewan.', 'error');
      }
    } catch {
      toast('Gagal memuat grup hewan.', 'error');
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    setReorderItems((arr) => {
      const j = index + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  };

  const saveReorder = async () => {
    setReorderSaving(true);
    try {
      const res = await fetch(
        `/api/qurban/hewan/reorder?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jenis,
            kelas,
            ordered_hewan_ids: reorderItems.map((h) => h.id),
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Urutan disimpan.', 'success');
        setReordering(false);
        await fetchData();
        return;
      }
      toast(json?.error?.message || 'Gagal menyimpan urutan.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setReorderSaving(false);
    }
  };

  const lockHint =
    edisiStatus === 'SELESAI'
      ? 'Edisi sudah SELESAI — inventaris hewan tidak dapat diubah.'
      : null;

  // ===== Reorder mode view =====
  if (reordering) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Atur Urutan</h2>
              <p className="text-xs text-gray-500">
                Grup {jenisLabel(jenis)} — Kelas {kelas} · {reorderItems.length} hewan
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReordering(false)}
                disabled={reorderSaving}
              >
                Batal
              </Button>
              <Button size="sm" onClick={saveReorder} disabled={reorderSaving || reorderItems.length === 0}>
                {reorderSaving ? 'Menyimpan...' : 'Simpan Urutan'}
              </Button>
            </div>
          </div>

          {reorderItems.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Grup ini belum punya hewan.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reorderItems.map((h, i) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-gray-400 w-6 text-right">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{h.nama_display}</p>
                      <p className="text-xs text-gray-500">
                        {tipePembelianLabel(h.tipe_pembelian)} ·{' '}
                        <span className={hewanStatusBadgeClass(h.status)}>{hewanStatusLabel(h.status)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => move(i, -1)}
                      disabled={reorderSaving || i === 0}
                      aria-label="Naikkan"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => move(i, 1)}
                      disabled={reorderSaving || i === reorderItems.length - 1}
                      aria-label="Turunkan"
                    >
                      ↓
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // ===== Normal view =====
  const showCheckbox = canBatchStatus;
  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      {lockHint && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {lockHint}
        </p>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit && (
          <Button
            variant="secondary"
            onClick={enterReorder}
            disabled={!canReorderGroup}
            title={!canReorderGroup ? 'Pilih Jenis & Kelas untuk mengatur urutan.' : undefined}
          >
            Atur Urutan
          </Button>
        )}
        {canEdit && (
          <Button onClick={() => router.push(baruHref)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tambah Hewan
          </Button>
        )}
      </div>
      {canEdit && !canReorderGroup && (
        <p className="text-xs text-gray-400 text-right -mt-2">
          Pilih Jenis &amp; Kelas untuk mengatur urutan.
        </p>
      )}

      <Card className="mb-0">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <FilterSelect label="Jenis" value={jenis} onChange={setJenis} options={JENIS_OPTIONS} />
          <FilterSelect label="Kelas" value={kelas} onChange={setKelas} options={KELAS_OPTIONS} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </Card>

      {/* Batch action bar */}
      {showCheckbox && selectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <span className="text-sm text-emerald-900">{selectedCount} hewan dipilih</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              Bersihkan
            </Button>
            <Button size="sm" onClick={() => setBatchOpen(true)}>
              Ubah Status
            </Button>
          </div>
        </div>
      )}

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
                    {showCheckbox && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Pilih semua"
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </th>
                    )}
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
                      {showCheckbox && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(h.id)}
                            onChange={() => toggleOne(h.id)}
                            aria-label={`Pilih ${h.nama_display}`}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                      )}
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
              <Card key={h.id} className="hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  {showCheckbox && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(h.id)}
                      onChange={() => toggleOne(h.id)}
                      aria-label={`Pilih ${h.nama_display}`}
                      className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => router.push(detailHref(h.id))}
                    className="flex-1 min-w-0 text-left"
                  >
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
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <HewanBatchStatusModal
        open={batchOpen}
        edisiId={edisiId}
        hewanIds={Array.from(selectedIds)}
        onClose={() => setBatchOpen(false)}
        onSuccess={() => {
          setBatchOpen(false);
          setSelectedIds(new Set());
          fetchData();
        }}
      />
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
