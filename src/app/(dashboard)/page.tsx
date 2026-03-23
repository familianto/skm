import { Card, CardTitle } from '@/components/ui/card';
import { PageTitle } from '@/components/layout/page-title';

export default function DashboardPage() {
  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Ringkasan keuangan masjid" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <p className="text-sm text-gray-500">Total Saldo</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">-</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Pemasukan Bulan Ini</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">-</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Pengeluaran Bulan Ini</p>
          <p className="text-2xl font-bold text-red-600 mt-1">-</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Transaksi Bulan Ini</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">-</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Transaksi Terakhir</CardTitle>
        <p className="text-gray-500 text-sm mt-2">
          Belum ada transaksi. Data dashboard akan tersedia setelah Sprint 2.
        </p>
      </Card>
    </div>
  );
}
