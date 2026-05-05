'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
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

  const [form, setForm] = useState<{
    tanggal: string;
    jenis: TransaksiJenis;
    kategori_id: string;
    deskripsi: string;
    jumlah: number | null;
    rekening_id: string;
    dari_rekening_id: string;
    ke_rekening_id: string;
  }>({
    tanggal: initialData?.tanggal || todayISO(),
    jenis: initialData?.jenis || TransaksiJenis.MASUK,
    kategori_id: initialData?.kategori_id || '',
    deskripsi: initialData?.deskripsi || '',
    jumlah: initialData?.jumlah ?? null,
    rekening_id: initialData?.rekening_id || '',
    dari_rekening_id: '',
    ke_rekening_id: '',
  });

  const isMutasi = form.jenis === TransaksiJenis.MUTASI;
  const isMutasiCreate = isMutasi && mode === 'create' && !koreksiDariId;

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

    const jumlah = form.jumlah ?? 0;
    if (jumlah <= 0) {
      toast('Jumlah harus lebih dari 0', 'error');
      setSubmitting(false);
      return;
    }

    if (isMutasiCreate) {
      if (!form.dari_rekening_id || !form.ke_rekening_id) {
        toast('Rekening asal dan tujuan wajib dipilih', 'error');
        setSubmitting(false);
        return;
      }
      if (form.dari_rekening_id === form.ke_rekening_id) {
        toast('Rekening asal dan tujuan tidak boleh sama', 'error');
        setSubmitting(false);
        return;
      }
    }

    const payload = isMutasiCreate
      ? {
          jenis: TransaksiJenis.MUTASI,
          tanggal: form.tanggal,
          deskripsi: form.deskripsi,
          jumlah,
          dari_rekening_id: form.dari_rekening_id,
          ke_rekening_id: form.ke_rekening_id,
        }
      : {
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

  const hasJumlah = (form.jumlah ?? 0) > 0;
  const isValid = isMutasiCreate
    ? !!(form.tanggal && form.deskripsi && hasJumlah && form.dari_rekening_id && form.ke_rekening_id && form.dari_rekening_id !== form.ke_rekening_id)
    : !!(form.tanggal && form.kategori_id && form.deskripsi && hasJumlah && form.rekening_id);

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
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {[
              { v: TransaksiJenis.MASUK, label: 'Masuk', cls: 'text-emerald-700' },
              { v: TransaksiJenis.KELUAR, label: 'Keluar', cls: 'text-red-700' },
              { v: TransaksiJenis.MUTASI, label: 'Mutasi', cls: 'text-slate-700' },
            ].map((j) => {
              const active = form.jenis === j.v;
              const disabled = mode === 'edit' || !!koreksiDariId;
              return (
                <button
                  type="button"
                  key={j.v}
                  disabled={disabled && !active}
                  onClick={() => setForm((f) => ({ ...f, jenis: j.v }))}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${active ? `bg-white shadow-sm ${j.cls}` : 'text-gray-500 hover:text-gray-700'} ${disabled && !active ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {j.label}
                </button>
              );
            })}
          </div>
        </div>

        {isMutasiCreate ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <input
                type="text"
                readOnly
                value="Mutasi Internal"
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dari Rekening</label>
              <select
                value={form.dari_rekening_id}
                onChange={(e) => setForm((f) => ({ ...f, dari_rekening_id: e.target.value }))}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Pilih Rekening Asal</option>
                {rekenings.map((r) => (
                  <option key={r.id} value={r.id}>{r.nama_bank} - {r.nomor_rekening}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ke Rekening</label>
              <select
                value={form.ke_rekening_id}
                onChange={(e) => setForm((f) => ({ ...f, ke_rekening_id: e.target.value }))}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Pilih Rekening Tujuan</option>
                {rekenings.filter(r => r.id !== form.dari_rekening_id).map((r) => (
                  <option key={r.id} value={r.id}>{r.nama_bank} - {r.nomor_rekening}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
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
        )}

        <Input
          label="Deskripsi"
          value={form.deskripsi}
          onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
          placeholder="Contoh: Infaq Jumat minggu ke-3"
        />

        <CurrencyInput
          label="Jumlah (Rp)"
          value={form.jumlah}
          onChange={(v) => setForm((f) => ({ ...f, jumlah: v }))}
          placeholder="Contoh: 1.500.000"
        />

        {!isMutasiCreate && (
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
        )}

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
