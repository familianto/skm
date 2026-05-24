'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/toast';
import { TableSkeleton } from '@/components/qurban/TabSkeleton';
import { MasterHewanCreateModal } from '@/components/qurban/MasterHewanCreateModal';
import { formatRupiah } from '@/lib/utils';
import {
  masterHewanStatusBadgeClass,
  masterHewanStatusLabel,
  type MasterHewan,
} from '@/lib/qurban/master-hewan-display';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface Props {
  edisiId: string;
  edisiStatus: EdisiStatus;
  /** True when the session may mutate (SA/AQ + status != SELESAI). */
  canEdit: boolean;
}

interface EditState {
  kapasitas: string;
  hargaBeli: number | null;
  hargaBawa: number | null;
}

export function MasterTipeTab({ edisiId, edisiStatus, canEdit }: Props) {
  const { toast } = useToast();
  const [list, setList] = useState<MasterHewan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ kapasitas: '', hargaBeli: null, hargaBawa: null });
  const [savingId, setSavingId] = useState<string | null>(null);

  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    open: boolean;
    id: string;
    label: string;
  }>({ open: false, id: '', label: '' });
  const [deactivating, setDeactivating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/qurban/master-hewan?edisi_id=${encodeURIComponent(edisiId)}&status=all`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setList(json.data as MasterHewan[]);
      } else {
        toast(json?.error?.message || 'Gagal memuat master tipe hewan.', 'error');
        setList([]);
      }
    } catch {
      toast('Gagal memuat master tipe hewan.', 'error');
    } finally {
      setLoading(false);
    }
  }, [edisiId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const startEdit = (m: MasterHewan) => {
    setEditingId(m.id);
    setEdit({
      kapasitas: String(m.kapasitas_slot),
      hargaBeli: m.harga_beli,
      hargaBawa: m.harga_bawa_sendiri,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdit({ kapasitas: '', hargaBeli: null, hargaBawa: null });
  };

  const saveEdit = async (id: string) => {
    const kapasitasNum = parseInt(edit.kapasitas, 10);
    if (!edit.kapasitas || !Number.isInteger(kapasitasNum) || kapasitasNum < 1) {
      toast('Kapasitas slot harus bilangan bulat ≥ 1.', 'error');
      return;
    }
    if (edit.hargaBeli == null || edit.hargaBeli < 0) {
      toast('Harga beli harus angka ≥ 0.', 'error');
      return;
    }
    if (edit.hargaBawa == null || edit.hargaBawa < 0) {
      toast('Harga bawa sendiri harus angka ≥ 0.', 'error');
      return;
    }

    setSavingId(id);
    try {
      const res = await fetch(
        `/api/qurban/master-hewan/${id}?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kapasitas_slot: kapasitasNum,
            harga_beli: edit.hargaBeli,
            harga_bawa_sendiri: edit.hargaBawa,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Perubahan disimpan.', 'success');
        cancelEdit();
        await fetchData();
        return;
      }
      toast(json?.error?.message || 'Gagal menyimpan perubahan.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    setDeactivating(true);
    try {
      const res = await fetch(
        `/api/qurban/master-hewan/${id}/deactivate?edisi_id=${encodeURIComponent(edisiId)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Tipe hewan dinonaktifkan.', 'success');
        setConfirmDeactivate({ open: false, id: '', label: '' });
        await fetchData();
        return;
      }
      toast(json?.error?.message || 'Gagal menonaktifkan.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setDeactivating(false);
    }
  };

  if (loading) return <TableSkeleton rows={3} />;

  const lockHint =
    edisiStatus === 'SELESAI'
      ? 'Edisi sudah SELESAI — master tipe hewan tidak dapat diubah.'
      : null;

  // Empty state
  if (list.length === 0) {
    return (
      <div className="space-y-4">
        {lockHint && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {lockHint}
          </p>
        )}
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">Belum ada tipe hewan untuk edisi ini.</p>
            <p className="text-xs text-gray-400 mt-1">
              Minimal 1 tipe hewan aktif diperlukan untuk mengaktifkan edisi.
            </p>
            {canEdit && (
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                Tambah Tipe Pertama
              </Button>
            )}
          </div>
        </Card>
        <MasterHewanCreateModal
          open={showCreate}
          edisiId={edisiId}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            fetchData();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lockHint && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {lockHint}
        </p>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tambah Tipe
          </Button>
        </div>
      )}

      {/* Desktop table (lg+) */}
      <Card padding={false} className="hidden lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Jenis</th>
                <th className="px-4 py-3 text-left">Kelas</th>
                <th className="px-4 py-3 text-left">Kapasitas Slot</th>
                <th className="px-4 py-3 text-left">Harga Beli</th>
                <th className="px-4 py-3 text-left">Harga Bawa Sendiri</th>
                <th className="px-4 py-3 text-left">Status</th>
                {canEdit && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((m) => {
                const isEditing = editingId === m.id;
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{m.jenis}</td>
                    <td className="px-4 py-3 text-gray-700">{m.kelas}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {isEditing ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={edit.kapasitas}
                          onChange={(e) =>
                            setEdit((s) => ({ ...s, kapasitas: e.target.value.replace(/\D/g, '') }))
                          }
                          className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          aria-label="Kapasitas slot"
                        />
                      ) : (
                        m.kapasitas_slot
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {isEditing ? (
                        <CurrencyInput
                          value={edit.hargaBeli}
                          onChange={(v) => setEdit((s) => ({ ...s, hargaBeli: v }))}
                          className="!py-1"
                          aria-label="Harga beli"
                        />
                      ) : (
                        formatRupiah(m.harga_beli)
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {isEditing ? (
                        <CurrencyInput
                          value={edit.hargaBawa}
                          onChange={(v) => setEdit((s) => ({ ...s, hargaBawa: v }))}
                          className="!py-1"
                          aria-label="Harga bawa sendiri"
                        />
                      ) : (
                        formatRupiah(m.harga_bawa_sendiri)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={masterHewanStatusBadgeClass(m.is_active)}>
                        {masterHewanStatusLabel(m.is_active)}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(m.id)}
                              disabled={savingId === m.id}
                            >
                              {savingId === m.id ? 'Menyimpan...' : 'Simpan'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={cancelEdit}
                              disabled={savingId === m.id}
                            >
                              Batal
                            </Button>
                          </div>
                        ) : (
                          m.is_active && (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="secondary" onClick={() => startEdit(m)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() =>
                                  setConfirmDeactivate({
                                    open: true,
                                    id: m.id,
                                    label: `${m.jenis} kelas ${m.kelas}`,
                                  })
                                }
                              >
                                Nonaktifkan
                              </Button>
                            </div>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Card stack below lg */}
      <div className="lg:hidden space-y-3">
        {list.map((m) => {
          const isEditing = editingId === m.id;
          return (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {m.jenis} · Kelas {m.kelas}
                  </p>
                </div>
                <span className={masterHewanStatusBadgeClass(m.is_active)}>
                  {masterHewanStatusLabel(m.is_active)}
                </span>
              </div>

              {isEditing ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Kapasitas Slot</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={edit.kapasitas}
                      onChange={(e) =>
                        setEdit((s) => ({ ...s, kapasitas: e.target.value.replace(/\D/g, '') }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <CurrencyInput
                    label="Harga Beli"
                    value={edit.hargaBeli}
                    onChange={(v) => setEdit((s) => ({ ...s, hargaBeli: v }))}
                  />
                  <CurrencyInput
                    label="Harga Bawa Sendiri"
                    value={edit.hargaBawa}
                    onChange={(v) => setEdit((s) => ({ ...s, hargaBawa: v }))}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={savingId === m.id}>
                      Batal
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(m.id)} disabled={savingId === m.id}>
                      {savingId === m.id ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-gray-500">Kapasitas Slot</dt>
                    <dd className="text-gray-900 text-right">{m.kapasitas_slot}</dd>
                    <dt className="text-gray-500">Harga Beli</dt>
                    <dd className="text-gray-900 text-right">{formatRupiah(m.harga_beli)}</dd>
                    <dt className="text-gray-500">Harga Bawa Sendiri</dt>
                    <dd className="text-gray-900 text-right">{formatRupiah(m.harga_bawa_sendiri)}</dd>
                  </dl>
                  {canEdit && m.is_active && (
                    <div className="flex gap-2 justify-end mt-3">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(m)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() =>
                          setConfirmDeactivate({
                            open: true,
                            id: m.id,
                            label: `${m.jenis} kelas ${m.kelas}`,
                          })
                        }
                      >
                        Nonaktifkan
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      <MasterHewanCreateModal
        open={showCreate}
        edisiId={edisiId}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          fetchData();
        }}
      />

      <ConfirmDialog
        open={confirmDeactivate.open}
        title="Nonaktifkan tipe hewan?"
        message={`Tipe ${confirmDeactivate.label} akan dinonaktifkan dan tidak bisa dipilih saat pendaftaran. Tipe tetap tersimpan untuk jejak audit.`}
        confirmLabel="Nonaktifkan"
        variant="danger"
        loading={deactivating}
        onCancel={() => setConfirmDeactivate({ open: false, id: '', label: '' })}
        onConfirm={() => handleDeactivate(confirmDeactivate.id)}
      />
    </div>
  );
}
