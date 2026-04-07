'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useKelompok } from '@/hooks/use-kelompok';
import { useKategori } from '@/hooks/use-kategori';
import { useKelompokSummary } from '@/hooks/use-kelompok';
import { TransaksiJenis } from '@/types';
import type { Kelompok, Kategori } from '@/types';
import { formatRupiah } from '@/lib/utils';

const COLOR_PRESETS = [
  '#059669', // emerald
  '#dc2626', // red
  '#2563eb', // blue
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
];

interface KelompokFormState {
  nama: string;
  deskripsi: string;
  warna: string;
  kategori_masuk: string[];
  kategori_keluar: string[];
}

const emptyForm: KelompokFormState = {
  nama: '',
  deskripsi: '',
  warna: COLOR_PRESETS[0],
  kategori_masuk: [],
  kategori_keluar: [],
};

function KategoriPicker({
  label,
  jenis,
  kategoriList,
  selected,
  onChange,
  accentColor,
}: {
  label: string;
  jenis: TransaksiJenis;
  kategoriList: Kategori[];
  selected: string[];
  onChange: (ids: string[]) => void;
  accentColor: 'green' | 'red';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const available = kategoriList.filter(k => k.jenis === jenis && !selected.includes(k.id));
  const selectedItems = selected
    .map(id => kategoriList.find(k => k.id === id))
    .filter((k): k is Kategori => !!k);

  const borderClass = accentColor === 'green' ? 'border-emerald-300' : 'border-red-300';
  const chipClass = accentColor === 'green'
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
    : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200';
  const btnClass = accentColor === 'green'
    ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
    : 'text-red-700 border-red-300 hover:bg-red-50';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className={`border-2 border-dashed ${borderClass} rounded-lg p-3 min-h-[80px]`}>
        {selectedItems.length === 0 ? (
          <p className="text-xs text-gray-400 mb-2">Belum ada kategori dipilih</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedItems.map(k => (
              <span
                key={k.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${chipClass}`}
              >
                {k.nama}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter(s => s !== k.id))}
                  className="hover:opacity-70"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div ref={ref} className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            disabled={available.length === 0}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-dashed rounded-full ${btnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            + Tambah {jenis === TransaksiJenis.MASUK ? 'Masuk' : 'Keluar'}
          </button>
          {open && available.length > 0 && (
            <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {available.map(k => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => {
                    onChange([...selected, k.id]);
                    setOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {k.nama}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KelompokPage() {
  const { toast } = useToast();
  const { data: kelompoks, loading, refetch } = useKelompok();
  const { data: kategoris } = useKategori();
  const { data: summaries, refetch: refetchSummary } = useKelompokSummary();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<KelompokFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Kelompok | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summaryMap = useMemo(() => {
    const map = new Map<string, typeof summaries[0]>();
    summaries.forEach(s => map.set(s.id, s));
    return map;
  }, [summaries]);

  const kategoriMap = useMemo(() => {
    const m = new Map<string, Kategori>();
    kategoris.forEach(k => m.set(k.id, k));
    return m;
  }, [kategoris]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (k: Kelompok) => {
    setEditingId(k.id);
    setForm({
      nama: k.nama,
      deskripsi: k.deskripsi,
      warna: k.warna || COLOR_PRESETS[0],
      kategori_masuk: [...k.kategori_masuk],
      kategori_keluar: [...k.kategori_keluar],
    });
    setModalOpen(true);
  };

  const canSave = form.nama.trim().length > 0 && (form.kategori_masuk.length > 0 || form.kategori_keluar.length > 0);

  const doSave = async () => {
    setSubmitting(true);
    try {
      const url = editingId ? `/api/kelompok/${editingId}` : '/api/kelompok';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast(editingId ? 'Kelompok berhasil diupdate' : 'Kelompok berhasil disimpan');
        setModalOpen(false);
        setConfirmUpdate(false);
        refetch();
        refetchSummary();
      } else {
        toast(data.error || 'Gagal menyimpan', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!canSave) return;
    if (editingId) {
      setConfirmUpdate(true);
    } else {
      doSave();
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/kelompok/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast('Kelompok berhasil dihapus');
        setConfirmDelete(null);
        refetch();
        refetchSummary();
      } else {
        toast(data.error || 'Gagal menghapus', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="Kelompok Anggaran"
        subtitle="Kelompokkan kategori terkait untuk pelaporan terpadu"
        action={<Button onClick={openCreate}>+ Tambah Kelompok</Button>}
      />

      {loading ? (
        <Loading className="py-12" />
      ) : kelompoks.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">Belum ada kelompok anggaran.</p>
            <Button onClick={openCreate}>+ Buat Kelompok Pertama</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kelompoks.map(k => {
            const summary = summaryMap.get(k.id);
            const totalMasuk = summary?.totalMasuk || 0;
            const totalKeluar = summary?.totalKeluar || 0;
            const saldo = summary?.saldo || 0;
            const maxValue = Math.max(totalMasuk, totalKeluar, 1);
            const masukWidth = (totalMasuk / maxValue) * 100;
            const keluarWidth = (totalKeluar / maxValue) * 100;

            const allKats = [
              ...k.kategori_masuk.map(id => ({ id, jenis: 'MASUK' as const, nama: kategoriMap.get(id)?.nama || id })),
              ...k.kategori_keluar.map(id => ({ id, jenis: 'KELUAR' as const, nama: kategoriMap.get(id)?.nama || id })),
            ];
            const previewKats = allKats.slice(0, 5);
            const extraCount = allKats.length - previewKats.length;

            return (
              <button
                key={k.id}
                type="button"
                onClick={() => openEdit(k)}
                className="text-left bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${k.warna}20`, color: k.warna }}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 truncate">{k.nama}</h3>
                    <p className="text-xs text-gray-500">{allKats.length} kategori</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-xs text-gray-500">Saldo</p>
                  <p className={`text-lg font-bold ${saldo >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatRupiah(saldo)}
                  </p>
                </div>

                <div className="space-y-1.5 mb-3">
                  <div>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-emerald-600">Masuk</span>
                      <span className="text-gray-600">{formatRupiah(totalMasuk)}</span>
                    </div>
                    <div className="h-1.5 bg-emerald-100 rounded-full">
                      <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${masukWidth}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-red-600">Keluar</span>
                      <span className="text-gray-600">{formatRupiah(totalKeluar)}</span>
                    </div>
                    <div className="h-1.5 bg-red-100 rounded-full">
                      <div className="h-1.5 bg-red-500 rounded-full" style={{ width: `${keluarWidth}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {previewKats.map(kat => (
                    <span
                      key={`${kat.jenis}-${kat.id}`}
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        kat.jenis === 'MASUK'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                          : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                      }`}
                    >
                      {kat.nama}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200">
                      +{extraCount} lainnya
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Kelompok Anggaran' : 'Tambah Kelompok Anggaran'}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kelompok</label>
            <input
              type="text"
              value={form.nama}
              onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
              placeholder="Contoh: Qurban 1447H"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
            <textarea
              value={form.deskripsi}
              onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
              placeholder="Opsional"
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Warna</label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, warna: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.warna === c ? 'border-gray-900 scale-110' : 'border-gray-200'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <KategoriPicker
            label="Kategori Pemasukan"
            jenis={TransaksiJenis.MASUK}
            kategoriList={kategoris}
            selected={form.kategori_masuk}
            onChange={ids => setForm(f => ({ ...f, kategori_masuk: ids }))}
            accentColor="green"
          />

          <KategoriPicker
            label="Kategori Pengeluaran"
            jenis={TransaksiJenis.KELUAR}
            kategoriList={kategoris}
            selected={form.kategori_keluar}
            onChange={ids => setForm(f => ({ ...f, kategori_keluar: ids }))}
            accentColor="red"
          />

          {/* Preview */}
          {(form.kategori_masuk.length > 0 || form.kategori_keluar.length > 0) && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-emerald-700 mb-1">MASUK ({form.kategori_masuk.length})</p>
                  {form.kategori_masuk.length === 0 ? (
                    <p className="text-xs text-gray-400">—</p>
                  ) : (
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {form.kategori_masuk.map(id => (
                        <li key={id}>• {kategoriMap.get(id)?.nama || id}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">KELUAR ({form.kategori_keluar.length})</p>
                  {form.kategori_keluar.length === 0 ? (
                    <p className="text-xs text-gray-400">—</p>
                  ) : (
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {form.kategori_keluar.map(id => (
                        <li key={id}>• {kategoriMap.get(id)?.nama || id}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-between pt-2 border-t border-gray-200">
            {editingId ? (
              <Button
                variant="danger"
                onClick={() => {
                  const k = kelompoks.find(x => x.id === editingId);
                  if (k) {
                    setModalOpen(false);
                    setConfirmDelete(k);
                  }
                }}
              >
                Hapus
              </Button>
            ) : <div />}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !canSave}>
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm update */}
      <ConfirmDialog
        open={confirmUpdate}
        title="Konfirmasi Update"
        message="Apakah Anda yakin ingin mengupdate kelompok ini?"
        confirmLabel="Ya, Update"
        onConfirm={doSave}
        onCancel={() => setConfirmUpdate(false)}
        loading={submitting}
      />

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Hapus Kelompok"
        message={`Apakah Anda yakin ingin menghapus kelompok "${confirmDelete?.nama}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
        loading={deleting}
      />
    </div>
  );
}
