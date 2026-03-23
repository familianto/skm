'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { formatRupiah } from '@/lib/utils';
import type { Donatur } from '@/types';
import { DonaturKelompok } from '@/types';

export default function DonaturPage() {
  const { toast } = useToast();
  const [donaturs, setDonaturs] = useState<Donatur[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterKelompok, setFilterKelompok] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    nama: '',
    telepon: '',
    alamat: '',
    kelompok: DonaturKelompok.TETAP as DonaturKelompok,
    jumlah_komitmen: 0,
    catatan: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/donatur');
      const data = await res.json();
      if (data.success) setDonaturs(data.data);
    } catch {
      toast('Gagal memuat data donatur', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredDonaturs = donaturs.filter((d) => {
    if (filterKelompok && d.kelompok !== filterKelompok) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.nama.toLowerCase().includes(q) || d.telepon.includes(q);
    }
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ nama: '', telepon: '', alamat: '', kelompok: DonaturKelompok.TETAP, jumlah_komitmen: 0, catatan: '' });
    setModalOpen(true);
  };

  const openEdit = (d: Donatur) => {
    setEditingId(d.id);
    setForm({
      nama: d.nama,
      telepon: d.telepon,
      alamat: d.alamat,
      kelompok: d.kelompok,
      jumlah_komitmen: d.jumlah_komitmen,
      catatan: d.catatan,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const url = editingId ? `/api/donatur/${editingId}` : '/api/donatur';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        toast(editingId ? 'Donatur berhasil diupdate' : 'Donatur berhasil ditambahkan');
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
    if (!confirm(`Hapus donatur "${nama}"?`)) return;

    try {
      const res = await fetch(`/api/donatur/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast('Donatur berhasil dihapus');
        fetchData();
      } else {
        toast(data.error || 'Gagal menghapus', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    }
  };

  const totalKomitmen = filteredDonaturs
    .filter((d) => d.kelompok === DonaturKelompok.TETAP)
    .reduce((sum, d) => sum + d.jumlah_komitmen, 0);

  return (
    <div>
      <PageTitle
        title="Donatur"
        subtitle="Kelola data donatur masjid"
        action={<Button onClick={openCreate}>+ Tambah Donatur</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="text-sm text-gray-500">Total Donatur</div>
          <div className="text-2xl font-bold text-gray-900">{donaturs.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Donatur Tetap</div>
          <div className="text-2xl font-bold text-emerald-600">
            {donaturs.filter((d) => d.kelompok === DonaturKelompok.TETAP).length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Total Komitmen/Bulan</div>
          <div className="text-2xl font-bold text-blue-600">{formatRupiah(totalKomitmen)}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Cari nama atau telepon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select
            value={filterKelompok}
            onChange={(e) => setFilterKelompok(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Semua Kelompok</option>
            <option value={DonaturKelompok.TETAP}>Tetap</option>
            <option value={DonaturKelompok.INSIDENTAL}>Insidental</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        {loading ? (
          <Loading className="py-12" />
        ) : filteredDonaturs.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            {donaturs.length === 0 ? 'Belum ada donatur.' : 'Tidak ada donatur yang cocok.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead className="text-right">Komitmen/Bulan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDonaturs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/donatur/${d.id}`} className="font-medium text-emerald-600 hover:text-emerald-700">
                      {d.nama}
                    </Link>
                  </TableCell>
                  <TableCell>{d.telepon}</TableCell>
                  <TableCell>
                    <Badge
                      label={d.kelompok}
                      variant={d.kelompok === DonaturKelompok.TETAP ? 'AKTIF' : 'default'}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {d.jumlah_komitmen > 0 ? formatRupiah(d.jumlah_komitmen) : '-'}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id, d.nama)}>Hapus</Button>
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
        title={editingId ? 'Edit Donatur' : 'Tambah Donatur'}
      >
        <div className="space-y-4">
          <Input
            label="Nama"
            value={form.nama}
            onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
            placeholder="Nama lengkap donatur"
          />

          <Input
            label="No. Telepon (WhatsApp)"
            value={form.telepon}
            onChange={(e) => setForm((f) => ({ ...f, telepon: e.target.value }))}
            placeholder="08123456789"
          />

          <Input
            label="Alamat"
            value={form.alamat}
            onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
            placeholder="Alamat donatur (opsional)"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kelompok</label>
            <select
              value={form.kelompok}
              onChange={(e) => setForm((f) => ({ ...f, kelompok: e.target.value as DonaturKelompok }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={DonaturKelompok.TETAP}>Tetap</option>
              <option value={DonaturKelompok.INSIDENTAL}>Insidental</option>
            </select>
          </div>

          <Input
            label="Komitmen Donasi/Bulan (Rp)"
            type="number"
            value={form.jumlah_komitmen || ''}
            onChange={(e) => setForm((f) => ({ ...f, jumlah_komitmen: parseInt(e.target.value, 10) || 0 }))}
            placeholder="0"
          />

          <Input
            label="Catatan"
            value={form.catatan}
            onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
            placeholder="Catatan tambahan (opsional)"
          />

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSubmit} disabled={submitting || !form.nama || !form.telepon}>
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
