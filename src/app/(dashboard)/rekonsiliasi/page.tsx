'use client';

import { useState, useCallback } from 'react';
import { PageTitle } from '@/components/layout/page-title';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useRekening } from '@/hooks/use-rekening';
import { useRekonsiliasi } from '@/hooks/use-rekonsiliasi';
import type { ApiResponse, Rekonsiliasi } from '@/types';
import { formatRupiah, formatTanggal, todayISO } from '@/lib/utils';

export default function RekonsiliasiPage() {
  const { toast } = useToast();
  const { data: rekenings, loading: rekeningLoading } = useRekening();

  const [selectedRekening, setSelectedRekening] = useState('');
  const [saldoBank, setSaldoBank] = useState('');
  const [tanggal, setTanggal] = useState(todayISO());
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Rekonsiliasi | null>(null);

  const { data: riwayat, loading: riwayatLoading, refetch } = useRekonsiliasi(
    selectedRekening ? { rekening_id: selectedRekening } : undefined
  );

  const rekeningLabel = useCallback((id: string) => {
    const r = rekenings.find((r) => r.id === id);
    return r ? `${r.nama_bank} - ${r.nomor_rekening}` : id;
  }, [rekenings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRekening) {
      toast('Pilih rekening terlebih dahulu', 'error');
      return;
    }

    const saldoBankNum = parseInt(saldoBank.replace(/[^\d]/g, ''), 10);
    if (isNaN(saldoBankNum) || saldoBankNum < 0) {
      toast('Saldo bank harus berupa angka positif', 'error');
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/rekonsiliasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rekening_id: selectedRekening,
          tanggal,
          saldo_bank: saldoBankNum,
          catatan: catatan.trim(),
        }),
      });

      const json: ApiResponse<Rekonsiliasi> = await res.json();
      if (json.success && json.data) {
        setResult(json.data);
        toast('Rekonsiliasi berhasil', 'success');
        setSaldoBank('');
        setCatatan('');
        await refetch();
      } else {
        toast(json.error || 'Gagal melakukan rekonsiliasi', 'error');
      }
    } catch {
      toast('Gagal melakukan rekonsiliasi', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (rekeningLoading) return <Loading className="py-12" />;

  return (
    <div>
      <PageTitle
        title="Rekonsiliasi Bank"
        subtitle="Bandingkan saldo sistem dengan saldo bank aktual"
      />

      {/* Form */}
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rekening Bank</label>
            <select
              value={selectedRekening}
              onChange={(e) => { setSelectedRekening(e.target.value); setResult(null); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Pilih Rekening</option>
              {rekenings.filter((r) => r.is_active).map((r) => (
                <option key={r.id} value={r.id}>{r.nama_bank} - {r.nomor_rekening} ({r.atas_nama})</option>
              ))}
            </select>
          </div>

          <Input
            label="Tanggal Rekonsiliasi"
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />

          <Input
            label="Saldo Bank Aktual (Rp)"
            type="number"
            value={saldoBank}
            onChange={(e) => setSaldoBank(e.target.value)}
            placeholder="Masukkan saldo dari mutasi bank"
          />

          <Input
            label="Catatan (opsional)"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Catatan atau keterangan"
          />

          <Button type="submit" disabled={submitting || !selectedRekening || !saldoBank}>
            {submitting ? 'Memproses...' : 'Rekonsiliasi'}
          </Button>
        </form>
      </Card>

      {/* Result */}
      {result && (
        <Card className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Hasil Rekonsiliasi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Saldo Sistem</p>
              <p className="text-xl font-bold text-blue-900">{formatRupiah(result.saldo_sistem)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 font-medium">Saldo Bank</p>
              <p className="text-xl font-bold text-gray-900">{formatRupiah(result.saldo_bank)}</p>
            </div>
            <div className={`p-4 rounded-lg ${result.selisih === 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className={`text-sm font-medium ${result.selisih === 0 ? 'text-emerald-600' : 'text-red-600'}`}>Selisih</p>
              <p className={`text-xl font-bold ${result.selisih === 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                {formatRupiah(Math.abs(result.selisih))}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-gray-600">Status:</span>
            <Badge label={result.status} />
          </div>
        </Card>
      )}

      {/* History */}
      {selectedRekening && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Riwayat Rekonsiliasi — {rekeningLabel(selectedRekening)}
          </h3>
          {riwayatLoading ? (
            <Loading className="py-8" />
          ) : riwayat.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-4">Belum ada riwayat rekonsiliasi untuk rekening ini.</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Saldo Sistem</TableHead>
                    <TableHead className="text-right">Saldo Bank</TableHead>
                    <TableHead className="text-right">Selisih</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riwayat.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatTanggal(r.tanggal)}</TableCell>
                      <TableCell className="text-right">{formatRupiah(r.saldo_sistem)}</TableCell>
                      <TableCell className="text-right">{formatRupiah(r.saldo_bank)}</TableCell>
                      <TableCell className={`text-right font-medium ${r.selisih === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatRupiah(Math.abs(r.selisih))}
                      </TableCell>
                      <TableCell><Badge label={r.status} /></TableCell>
                      <TableCell className="text-sm text-gray-500">{r.catatan || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
