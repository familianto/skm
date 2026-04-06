'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { TransaksiJenis } from '@/types';
import type { Transaksi } from '@/types';
import type { ApiResponse } from '@/types';
import { todayISO } from '@/lib/utils';

interface TransactionFormProps {
  initialData?: Transaksi;
  mode: 'create' | 'edit';
  koreksiDariId?: string;
}

export function TransactionForm({ initialData, mode, koreksiDariId }: TransactionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [voidOriginal, setVoidOriginal] = useState(false);

  const formatRupiah = (value: string) => {
    const digits = value.replace(/[^\d]/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const [form, setForm] = useState({
    tanggal: initialData?.tanggal || todayISO(),
    jenis: initialData?.jenis || TransaksiJenis.MASUK,
    kategori_id: initialData?.kategori_id || '',
    deskripsi: initialData?.deskripsi || '',
    jumlah: initialData?.jumlah ? formatRupiah(initialData.jumlah.toString()) : '',
    rekening_id: initialData?.rekening_id || '',
  });

  const { data: kategoris } = useKategori(form.jenis);
  const { data: rekenings } = useRekening();

  // Reset kategori_id when jenis changes (categories are filtered by jenis)
  useEffect(() => {
    if (mode === 'create') {
      setForm((f) => ({ ...f, kategori_id: '' }));
    }
  }, [form.jenis, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const jumlah = parseInt(form.jumlah.replace(/[^\d]/g, ''), 10);
    if (!jumlah || jumlah <= 0) {
      toast('Jumlah harus lebih dari 0', 'error');
      setSubmitting(false);
      return;
    }

    const payload = {
      tanggal: form.tanggal,
      jenis: form.jenis,
      kategori_id: form.kategori_id,
      deskripsi: form.deskripsi,
      jumlah,
      rekening_id: form.rekening_id,
    };

    try {
      let url: string;
      let method: string;

      if (koreksiDariId) {
        url = `/api/transaksi/${koreksiDariId}/koreksi`;
        method = 'POST';
      } else if (mode === 'edit') {
        url = `/api/transaksi/${initialData!.id}`;
        method = 'PUT';
      } else {
        url = '/api/transaksi';
        method = 'POST';
      }

      const body = koreksiDariId ? { ...payload, void_original: voidOriginal } : payload;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data: ApiResponse<Transaksi> = await res.json();
      if (data.success) {
        const msg = koreksiDariId
          ? 'Koreksi transaksi berhasil dibuat'
          : mode === 'edit' ? 'Transaksi berhasil diupdate' : 'Transaksi berhasil dibuat';
        toast(msg);
        router.push(data.data ? `/transaksi/${data.data.id}` : '/transaksi');
      } else {
        toast(data.error || 'Gagal menyimpan transaksi', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = form.tanggal && form.kategori_id && form.deskripsi && form.jumlah && form.rekening_id;

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Tanggal"
          type="date"
          value={form.tanggal}
          onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Transaksi</label>
          <div className="flex gap-4">
            {[TransaksiJenis.MASUK, TransaksiJenis.KELUAR].map((j) => (
              <label key={j} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="jenis"
                  value={j}
                  checked={form.jenis === j}
                  onChange={() => setForm((f) => ({ ...f, jenis: j }))}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`text-sm font-medium ${j === TransaksiJenis.MASUK ? 'text-emerald-700' : 'text-red-700'}`}>
                  {j === TransaksiJenis.MASUK ? 'Pemasukan (MASUK)' : 'Pengeluaran (KELUAR)'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
          <select
            value={form.kategori_id}
            onChange={(e) => setForm((f) => ({ ...f, kategori_id: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Pilih Kategori</option>
            {kategoris.map((k) => (
              <option key={k.id} value={k.id}>{k.nama}</option>
            ))}
          </select>
        </div>

        <Input
          label="Deskripsi"
          value={form.deskripsi}
          onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
          placeholder="Contoh: Infaq Jumat minggu ke-3"
        />

        <Input
          label="Jumlah (Rp)"
          type="text"
          inputMode="numeric"
          value={form.jumlah}
          onChange={(e) => setForm((f) => ({ ...f, jumlah: formatRupiah(e.target.value) }))}
          placeholder="Contoh: 1.500.000"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rekening</label>
          <select
            value={form.rekening_id}
            onChange={(e) => setForm((f) => ({ ...f, rekening_id: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Pilih Rekening</option>
            {rekenings.map((r) => (
              <option key={r.id} value={r.id}>{r.nama_bank} - {r.nomor_rekening}</option>
            ))}
          </select>
        </div>

        {koreksiDariId && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <p className="text-sm text-amber-800">
              Koreksi dari: <span className="font-medium">{koreksiDariId}</span>
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={voidOriginal}
                onChange={(e) => setVoidOriginal(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700">Void transaksi asli bersamaan</span>
            </label>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting || !isValid}>
            {submitting ? 'Menyimpan...' : koreksiDariId ? 'Simpan Koreksi' : (mode === 'edit' ? 'Update Transaksi' : 'Simpan Transaksi')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push('/transaksi')}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  );
}
