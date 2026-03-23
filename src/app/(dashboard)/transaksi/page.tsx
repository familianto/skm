'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loading } from '@/components/ui/loading';
import { useTransaksi } from '@/hooks/use-transaksi';
import { useKategori } from '@/hooks/use-kategori';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import { formatRupiah, formatTanggal, paginateData } from '@/lib/utils';
import { APP_CONFIG } from '@/lib/constants';

type SortField = 'tanggal' | 'jumlah';
type SortOrder = 'asc' | 'desc';

export default function TransaksiPage() {
  const { data: transaksis, loading } = useTransaksi();
  const { data: kategoris } = useKategori();

  // Filters
  const [filterJenis, setFilterJenis] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterKategori, setFilterKategori] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('tanggal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = APP_CONFIG.PAGINATION_LIMIT;

  const kategoriMap = useMemo(() => {
    const map: Record<string, string> = {};
    kategoris.forEach((k) => { map[k.id] = k.nama; });
    return map;
  }, [kategoris]);

  const filtered = useMemo(() => {
    let result = [...transaksis];

    if (filterJenis) result = result.filter((t) => t.jenis === filterJenis);
    if (filterStatus) result = result.filter((t) => t.status === filterStatus);
    if (filterKategori) result = result.filter((t) => t.kategori_id === filterKategori);
    if (filterDateFrom) result = result.filter((t) => t.tanggal >= filterDateFrom);
    if (filterDateTo) result = result.filter((t) => t.tanggal <= filterDateTo);

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'tanggal') {
        cmp = a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id);
      } else {
        cmp = a.jumlah - b.jumlah;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [transaksis, filterJenis, filterStatus, filterKategori, filterDateFrom, filterDateTo, sortField, sortOrder]);

  // Totals
  const totalMasuk = useMemo(
    () => filtered.filter((t) => t.jenis === TransaksiJenis.MASUK && t.status === TransaksiStatus.AKTIF).reduce((s, t) => s + t.jumlah, 0),
    [filtered]
  );
  const totalKeluar = useMemo(
    () => filtered.filter((t) => t.jenis === TransaksiJenis.KELUAR && t.status === TransaksiStatus.AKTIF).reduce((s, t) => s + t.jumlah, 0),
    [filtered]
  );

  const paginated = paginateData(filtered, page, limit);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return ' ↕';
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div>
      <PageTitle
        title="Transaksi"
        subtitle="Daftar pemasukan dan pengeluaran"
        action={
          <Link href="/transaksi/baru">
            <Button>+ Tambah Transaksi</Button>
          </Link>
        }
      />

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jenis</label>
            <select
              value={filterJenis}
              onChange={(e) => { setFilterJenis(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua</option>
              <option value="MASUK">Pemasukan</option>
              <option value="KELUAR">Pengeluaran</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua</option>
              <option value="AKTIF">Aktif</option>
              <option value="VOID">Void</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kategori</label>
            <select
              value={filterKategori}
              onChange={(e) => { setFilterKategori(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua</option>
              {kategoris.map((k) => (
                <option key={k.id} value={k.id}>{k.nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false} className="mt-4">
        {loading ? (
          <Loading className="py-12" />
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-12">Belum ada transaksi.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button onClick={() => toggleSort('tanggal')} className="font-semibold hover:text-emerald-600">
                      Tanggal{sortIcon('tanggal')}
                    </button>
                  </TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('jumlah')} className="font-semibold hover:text-emerald-600">
                      Jumlah{sortIcon('jumlah')}
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatTanggal(t.tanggal)}</TableCell>
                    <TableCell><Badge label={t.jenis} /></TableCell>
                    <TableCell>{kategoriMap[t.kategori_id] || t.kategori_id}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{t.deskripsi}</TableCell>
                    <TableCell className={`font-medium whitespace-nowrap ${t.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(t.jumlah)}
                    </TableCell>
                    <TableCell><Badge label={t.status} /></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/transaksi/${t.id}`}>
                        <Button variant="ghost" size="sm">Detail</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Footer totals */}
            <div className="flex flex-wrap gap-4 justify-between items-center px-4 py-3 border-t bg-gray-50 text-sm">
              <div className="flex gap-4">
                <span className="text-emerald-600 font-medium">Masuk: {formatRupiah(totalMasuk)}</span>
                <span className="text-red-600 font-medium">Keluar: {formatRupiah(totalKeluar)}</span>
                <span className="font-bold">Saldo: {formatRupiah(totalMasuk - totalKeluar)}</span>
              </div>
              <span className="text-gray-500">{filtered.length} transaksi</span>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-gray-600">
                  Halaman {page} dari {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Selanjutnya
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
