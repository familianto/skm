'use client';

import { PageTitle } from '@/components/layout/page-title';
import { TransactionForm } from '@/components/forms/transaction-form';

export default function TransaksiBaru() {
  return (
    <div>
      <PageTitle
        title="Tambah Transaksi"
        subtitle="Catat pemasukan atau pengeluaran baru"
      />
      <TransactionForm mode="create" />
    </div>
  );
}
