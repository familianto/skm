'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { formatRupiah } from '@/lib/utils';
import type { RekeningBank, ApiResponse } from '@/types';

export default function RekeningPage() {
  const { toast } = useToast();
  const [rekenings, setRekenings] = useState<RekeningBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nama_bank: '', nomor_rekening: '', atas_nama: '', saldo_awal: 0 });
  const [submitting, setSubmitting] = useState(false);

  // Delete protection & confirmation state
  const [protectionDialog, setProtectionDialog] = useState<{ open: boolean; nama: string; count: number; id: string }>({
    open: false, nama: '', count: 0, id: '',
  });
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string; nama: string }>({
    open: false, id: '', nama: '',
  });
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/rekening');
      const data = await res.json();
      if (data.success) setRekenings(data.data);
    } catch {
      toast('Gagal memuat data rekening', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ nama_bank: '', nomor_rekening: '', atas_nama: '', saldo_awal: 0 });
    setModalOpen(true);
  };

  const openEdit = (r: RekeningBank) => {
    setEditingId(r.id);
    setForm({
      nama_bank: r.nama_bank,
      nomor_rekening: r.nomor_rekening,
      atas_nama: r.atas_nama,
      saldo_awal: r.saldo_awal,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const url = editingId ? `/api/rekening/${editingId}` : '/api/rekening';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        toast(editingId ? 'Rekening berhasil diupdate' : 'Rekening berhasil dibuat');
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

  const handleDeleteClick = async (id: string, nama: string) => {
    // Check usage count first
    try {
      const res = await fetch(`/api/rekening/${id}/usage-count`);
      const data: ApiResponse<{ count: number }> = await res.json();

      if (data.success && data.data && data.data.count > 0) {
        // Show protection dialog
        setProtectionDialog({ open: true, nama, count: data.data.count, id });
      } else {
        // Show confirmation dialog
        setConfirmDelete({ open: true, id, nama });
      }
    } catch {
      toast('Gagal memeriksa penggunaan rekening', 'error');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rekening/${confirmDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast('Rekening berhasil dihapus');
        setConfirmDelete({ open: false, id: '', nama: '' });
        fetchData();
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
        title="Rekening Bank"
        subtitle="Kelola rekening bank masjid"
        action={<Button onClick={openCreate}>+ Tambah Rekening</Button>}
      />

      <Card padding={false}>
        {loading ? (
          <Loading className="py-12" />
        ) : rekenings.length === 0 ? (
          <p className="text-gray-500 text-center py-12">Belum ada rekening.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>No. Rekening</TableHead>
                <TableHead>Atas Nama</TableHead>
                <TableHead className="text-right">Saldo Awal</TableHead>
                <TableHead className="text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rekenings.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nama_bank}</TableCell>
                  <TableCell>{r.nomor_rekening}</TableCell>
                  <TableCell>{r.atas_nama}</TableCell>
                  <TableCell className="text-right">{formatRupiah(r.saldo_awal)}</TableCell>
                  <TableCell className="text-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(r.id, r.nama_bank)}>Hapus</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Edit/Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Rekening' : 'Tambah Rekening'}
      >
        <div className="space-y-4">
          <Input
            label="Nama Bank"
            value={form.nama_bank}
            onChange={(e) => setForm((f) => ({ ...f, nama_bank: e.target.value }))}
            placeholder="Contoh: Bank Syariah Indonesia"
          />

          <Input
            label="Nomor Rekening"
            value={form.nomor_rekening}
            onChange={(e) => setForm((f) => ({ ...f, nomor_rekening: e.target.value }))}
            placeholder="Contoh: 7123456789"
          />

          <Input
            label="Atas Nama"
            value={form.atas_nama}
            onChange={(e) => setForm((f) => ({ ...f, atas_nama: e.target.value }))}
            placeholder="Contoh: Masjid Al-Ikhlas"
          />

          <Input
            label="Saldo Awal (Rp)"
            type="number"
            value={form.saldo_awal || ''}
            onChange={(e) => setForm((f) => ({ ...f, saldo_awal: parseInt(e.target.value, 10) || 0 }))}
            placeholder="0"
          />

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSubmit} disabled={submitting || !form.nama_bank || !form.nomor_rekening || !form.atas_nama}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
          </div>
        </div>
      </Modal>

      {/* Protection Dialog — cannot delete, has transactions */}
      <Modal
        open={protectionDialog.open}
        onClose={() => setProtectionDialog(p => ({ ...p, open: false }))}
        title="Tidak dapat menghapus"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm">
            Rekening <strong>{protectionDialog.nama}</strong> digunakan oleh <strong>{protectionDialog.count} transaksi</strong>.
          </div>
          <p className="text-sm text-gray-600">
            Pindahkan transaksi ke rekening lain terlebih dahulu.
          </p>
          <Link
            href={`/transaksi?rekening=${protectionDialog.id}`}
            className="inline-flex items-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            Lihat {protectionDialog.count} transaksi →
          </Link>
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setProtectionDialog(p => ({ ...p, open: false }))}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDelete.open}
        title="Hapus rekening"
        message={`Apakah Anda yakin ingin menghapus "${confirmDelete.nama}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, hapus"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({ open: false, id: '', nama: '' })}
        loading={deleting}
      />
    </div>
  );
}
