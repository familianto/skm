'use client';

import { use } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/layout/page-title';
import { Loading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { TransactionForm } from '@/components/forms/transaction-form';
import { useTransaksiDetail } from '@/hooks/use-transaksi';
import { TransaksiStatus } from '@/types';

export default function TransaksiEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: transaksi, loading, error } = useTransaksiDetail(id);

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

  if (transaksi.status !== TransaksiStatus.AKTIF) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Hanya transaksi AKTIF yang bisa diubah.</p>
        <Link href={`/transaksi/${id}`}>
          <Button variant="secondary" className="mt-4">Kembali ke Detail</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Edit Transaksi"
        subtitle={transaksi.id}
      />
      <TransactionForm mode="edit" initialData={transaksi} />
    </div>
  );
}
