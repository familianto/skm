'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/layout/page-title';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { useTransaksiDetail } from '@/hooks/use-transaksi';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import { formatRupiah, formatTanggal, formatTimestamp } from '@/lib/utils';

export default function TransaksiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: transaksi, loading, error } = useTransaksiDetail(id);
  const { data: kategoris } = useKategori();
  const { data: rekenings } = useRekening();

  const kategoriNama = useMemo(() => {
    if (!transaksi) return '';
    return kategoris.find((k) => k.id === transaksi.kategori_id)?.nama || transaksi.kategori_id;
  }, [transaksi, kategoris]);

  const rekeningLabel = useMemo(() => {
    if (!transaksi) return '';
    const r = rekenings.find((r) => r.id === transaksi.rekening_id);
    return r ? `${r.nama_bank} - ${r.nomor_rekening}` : transaksi.rekening_id;
  }, [transaksi, rekenings]);

  if (loading) return <Loading className="py-12" />;

  if (error || !transaksi) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{error || 'Transaksi tidak ditemukan'}</p>
        <Link href="/transaksi">
          <Button variant="secondary" className="mt-4">Kembali ke Daftar</Button>
        </Link>
      </div>
    );
  }

  const isAktif = transaksi.status === TransaksiStatus.AKTIF;

  return (
    <div>
      <PageTitle
        title="Detail Transaksi"
        subtitle={transaksi.id}
        action={
          isAktif ? (
            <Link href={`/transaksi/${id}/edit`}>
              <Button>Edit Transaksi</Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Tanggal</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatTanggal(transaksi.tanggal)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Jenis</dt>
            <dd className="mt-1"><Badge label={transaksi.jenis} /></dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Kategori</dt>
            <dd className="mt-1 text-sm text-gray-900">{kategoriNama}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Rekening</dt>
            <dd className="mt-1 text-sm text-gray-900">{rekeningLabel}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Deskripsi</dt>
            <dd className="mt-1 text-sm text-gray-900">{transaksi.deskripsi}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Jumlah</dt>
            <dd className={`mt-1 text-lg font-bold ${transaksi.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'}`}>
              {transaksi.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(transaksi.jumlah)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1"><Badge label={transaksi.status} /></dd>
          </div>

          {transaksi.status === TransaksiStatus.VOID && (
            <>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Alasan Void</dt>
                <dd className="mt-1 text-sm text-red-600">{transaksi.void_reason || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Tanggal Void</dt>
                <dd className="mt-1 text-sm text-gray-900">{transaksi.void_date ? formatTanggal(transaksi.void_date) : '-'}</dd>
              </div>
            </>
          )}

          {transaksi.koreksi_dari_id && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Koreksi dari</dt>
              <dd className="mt-1">
                <Link href={`/transaksi/${transaksi.koreksi_dari_id}`} className="text-sm text-emerald-600 hover:underline">
                  {transaksi.koreksi_dari_id}
                </Link>
              </dd>
            </div>
          )}

          {transaksi.bukti_url && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Bukti</dt>
              <dd className="mt-1">
                <a href={transaksi.bukti_url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 hover:underline">
                  Lihat Bukti
                </a>
              </dd>
            </div>
          )}

          <div>
            <dt className="text-sm font-medium text-gray-500">Dibuat oleh</dt>
            <dd className="mt-1 text-sm text-gray-900">{transaksi.created_by}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Dibuat pada</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatTimestamp(transaksi.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Terakhir diubah</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatTimestamp(transaksi.updated_at)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-4">
        <Link href="/transaksi">
          <Button variant="secondary">Kembali ke Daftar</Button>
        </Link>
      </div>
    </div>
  );
}
