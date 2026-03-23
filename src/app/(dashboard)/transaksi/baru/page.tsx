'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageTitle } from '@/components/layout/page-title';
import { TransactionForm } from '@/components/forms/transaction-form';
import { useTransaksiDetail } from '@/hooks/use-transaksi';
import { Loading } from '@/components/ui/loading';

function TransaksiBaruContent() {
  const searchParams = useSearchParams();
  const koreksiDari = searchParams.get('koreksi_dari');
  const { data: originalTrx, loading } = useTransaksiDetail(koreksiDari);

  if (koreksiDari && loading) {
    return <Loading className="py-12" />;
  }

  return (
    <div>
      <PageTitle
        title={koreksiDari ? 'Koreksi Transaksi' : 'Tambah Transaksi'}
        subtitle={koreksiDari ? `Koreksi dari: ${koreksiDari}` : 'Catat pemasukan atau pengeluaran baru'}
      />
      <TransactionForm
        mode="create"
        initialData={originalTrx || undefined}
        koreksiDariId={koreksiDari || undefined}
      />
    </div>
  );
}

export default function TransaksiBaru() {
  return (
    <Suspense fallback={<Loading className="py-12" />}>
      <TransaksiBaruContent />
    </Suspense>
  );
}
