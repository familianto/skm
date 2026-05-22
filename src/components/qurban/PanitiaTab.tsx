'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { peranBadgeClass, peranLabel } from '@/lib/anggota-display';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/qurban/TabSkeleton';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface EnrichedPanitia {
  id: string;
  edisi_id: string;
  anggota_id: string;
  is_active: boolean;
  assigned_at: string;
  assigned_by: string;
  notes: string;
  anggota_nama: string;
  anggota_peran: string;
  assigned_by_nama: string;
}

interface Candidate {
  id: string;
  nama: string;
  peran: string;
}

interface Props {
  edisiId: string;
  edisiStatus: EdisiStatus;
  /** True when the current session may mutate panitia (SA/AQ + status != SELESAI). */
  canEdit: boolean;
}

function formatAssignedAt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function PanitiaTab({ edisiId, edisiStatus, canEdit }: Props) {
  const { toast } = useToast();
  const [list, setList] = useState<EnrichedPanitia[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [selectedAnggota, setSelectedAnggota] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ open: boolean; id: string; nama: string }>({
    open: false,
    id: '',
    nama: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<Response>[] = [
        fetch(`/api/qurban/panitia?edisi_id=${encodeURIComponent(edisiId)}`),
      ];
      if (canEdit) {
        requests.push(
          fetch(`/api/qurban/panitia/candidates?edisi_id=${encodeURIComponent(edisiId)}`)
        );
      }
      const responses = await Promise.all(requests);

      const listJson = await responses[0].json().catch(() => ({}));
      if (!responses[0].ok || !listJson?.ok) {
        toast(listJson?.error?.message || 'Gagal memuat panitia.', 'error');
        setList([]);
      } else {
        setList(listJson.data as EnrichedPanitia[]);
      }

      if (canEdit && responses[1]) {
        const candJson = await responses[1].json().catch(() => ({}));
        if (responses[1].ok && candJson?.ok) {
          setCandidates(candJson.data as Candidate[]);
        } else {
          setCandidates([]);
        }
      } else {
        setCandidates([]);
      }
    } catch {
      toast('Gagal memuat panitia.', 'error');
    } finally {
      setLoading(false);
    }
  }, [edisiId, canEdit, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnggota) {
      toast('Pilih anggota terlebih dahulu.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/panitia?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anggota_id: selectedAnggota, notes: notes.trim() }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast(json?.error?.message || 'Gagal menugaskan panitia.', 'error');
        return;
      }
      toast('Panitia berhasil ditugaskan.', 'success');
      setSelectedAnggota('');
      setNotes('');
      await fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemoving(id);
    try {
      const res = await fetch(`/api/qurban/panitia/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast(json?.error?.message || 'Gagal menghapus panitia.', 'error');
        return;
      }
      toast('Panitia dihapus.', 'success');
      setConfirmRemove({ open: false, id: '', nama: '' });
      await fetchData();
    } finally {
      setRemoving(null);
    }
  };

  if (loading) return <TableSkeleton rows={3} />;

  const lockHint =
    edisiStatus === 'SELESAI'
      ? 'Edisi sudah SELESAI — panitia tidak dapat diubah.'
      : !canEdit
      ? undefined
      : undefined;

  const showAddSection = canEdit;
  const showRemoveButton = canEdit;

  return (
    <div className="space-y-4">
      {lockHint && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {lockHint}
        </p>
      )}

      <Card padding={false}>
        {list.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">
            Belum ada panitia. Tambahkan minimal 1 untuk bisa Aktifkan edisi.
          </div>
        ) : (
          <>
            {/* lg+ : table (5 cols). <lg : card stack (covers iPad portrait). */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Nama</th>
                    <th className="px-4 py-3 text-left">Peran</th>
                    <th className="px-4 py-3 text-left">Ditugaskan</th>
                    <th className="px-4 py-3 text-left">Oleh</th>
                    {showRemoveButton && (
                      <th className="px-4 py-3 text-right">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.anggota_nama || p.anggota_id}
                      </td>
                      <td className="px-4 py-3">
                        <span className={peranBadgeClass(p.anggota_peran)}>
                          {peranLabel(p.anggota_peran)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatAssignedAt(p.assigned_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.assigned_by_nama || '—'}
                      </td>
                      {showRemoveButton && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmRemove({
                                open: true,
                                id: p.id,
                                nama: p.anggota_nama || p.anggota_id,
                              })
                            }
                            disabled={removing === p.id}
                            className="text-red-600 hover:bg-red-50"
                          >
                            {removing === p.id ? 'Menghapus...' : 'Hapus'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="lg:hidden divide-y divide-gray-100">
              {list.map((p) => (
                <li key={p.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {p.anggota_nama || p.anggota_id}
                      </p>
                      <p className="mt-1">
                        <span className={peranBadgeClass(p.anggota_peran)}>
                          {peranLabel(p.anggota_peran)}
                        </span>
                      </p>
                    </div>
                    {showRemoveButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmRemove({
                            open: true,
                            id: p.id,
                            nama: p.anggota_nama || p.anggota_id,
                          })
                        }
                        disabled={removing === p.id}
                        className="text-red-600 hover:bg-red-50 shrink-0"
                      >
                        {removing === p.id ? 'Menghapus...' : 'Hapus'}
                      </Button>
                    )}
                  </div>
                  <dl className="text-xs text-gray-500 grid grid-cols-2 gap-x-3 gap-y-1">
                    <dt className="text-gray-400">Ditugaskan</dt>
                    <dd className="text-gray-700">{formatAssignedAt(p.assigned_at)}</dd>
                    <dt className="text-gray-400">Oleh</dt>
                    <dd className="text-gray-700 truncate">{p.assigned_by_nama || '—'}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {showAddSection && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
            Tambah Panitia
          </h3>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-600">
              Tidak ada anggota yang bisa ditambahkan (semua anggota yang memenuhi syarat sudah jadi panitia, atau belum ada anggota dengan peran panitia).
            </p>
          ) : (
            <form onSubmit={handleAssign} className="space-y-3">
              <div>
                <label
                  htmlFor="panitia-anggota"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Anggota
                </label>
                <select
                  id="panitia-anggota"
                  value={selectedAnggota}
                  onChange={(e) => setSelectedAnggota(e.target.value)}
                  disabled={submitting}
                  className={cn(
                    'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
                    'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                  )}
                  required
                >
                  <option value="">Pilih anggota...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama} ({peranLabel(c.peran)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="panitia-notes"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Catatan <span className="text-gray-500 font-normal">(opsional)</span>
                </label>
                <textarea
                  id="panitia-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  maxLength={500}
                  placeholder="Catatan opsional..."
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={submitting || !selectedAnggota}>
                  {submitting ? 'Menugaskan...' : 'Assign'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmRemove.open}
        title="Hapus Panitia?"
        message={`Panitia ${confirmRemove.nama} akan dihapus dari edisi ini. Baris ini akan dinonaktifkan namun tetap tersimpan untuk jejak audit. Lanjutkan?`}
        confirmLabel="Hapus"
        variant="danger"
        loading={removing === confirmRemove.id}
        onCancel={() => setConfirmRemove({ open: false, id: '', nama: '' })}
        onConfirm={() => handleRemove(confirmRemove.id)}
      />
    </div>
  );
}
