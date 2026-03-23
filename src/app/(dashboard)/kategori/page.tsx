'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import type { Kategori } from '@/types';
import { TransaksiJenis } from '@/types';

export default function KategoriPage() {
  const { toast } = useToast();
  const [kategoris, setKategoris] = useState<Kategori[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [form, setForm] = useState({ nama: '', jenis: 'MASUK' as TransaksiJenis, deskripsi: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const url = filter ? `/api/kategori?jenis=${filter}` : '/api/kategori';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setKategoris(data.data);
    } catch {
      toast('Gagal memuat data kategori', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ nama: '', jenis: TransaksiJenis.MASUK, deskripsi: '' });
    setModalOpen(true);
  };

  const openEdit = (k: Kategori) => {
    setEditingId(k.id);
    setForm({ nama: k.nama, jenis: k.jenis, deskripsi: k.deskripsi });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const url = editingId ? `/api/kategori/${editingId}` : '/api/kategori';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        toast(editingId ? 'Kategori berhasil diupdate' : 'Kategori berhasil dibuat');
        setModalOpen(false);
        fetchData();
      } else {
        toast(data.error || 'Gagal menyimpan', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm(`Hapus kategori "${nama}"?`)) return;

    try {
      const res = await fetch(`/api/kategori/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast('Kategori berhasil dihapus');
        fetchData();
      } else {
        toast(data.error || 'Gagal menghapus', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    }
  };

  return (
    <div>
      <PageTitle
        title="Kategori"
        subtitle="Kelola kategori pemasukan dan pengeluaran"
        action={<Button onClick={openCreate}>+ Tambah Kategori</Button>}
      />

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['', 'MASUK', 'KELUAR'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f || 'Semua'}
          </Button>
        ))}
      </div>

      <Card padding={false}>
        {loading ? (
          <Loading className="py-12" />
        ) : kategoris.length === 0 ? (
          <p className="text-gray-500 text-center py-12">Belum ada kategori.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kategoris.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.nama}</TableCell>
                  <TableCell><Badge label={k.jenis} /></TableCell>
                  <TableCell className="text-gray-500">{k.deskripsi || '-'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(k)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(k.id, k.nama)}>Hapus</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Kategori' : 'Tambah Kategori'}
      >
        <div className="space-y-4">
          <Input
            label="Nama Kategori"
            value={form.nama}
            onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
            placeholder="Contoh: Infaq Jumat"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jenis</label>
            <select
              value={form.jenis}
              onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value as TransaksiJenis }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="MASUK">Pemasukan (MASUK)</option>
              <option value="KELUAR">Pengeluaran (KELUAR)</option>
            </select>
          </div>

          <Input
            label="Deskripsi"
            value={form.deskripsi}
            onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
            placeholder="Opsional"
          />

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSubmit} disabled={submitting || !form.nama}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
