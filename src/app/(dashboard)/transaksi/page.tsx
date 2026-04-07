'use client';

import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loading } from '@/components/ui/loading';
import { useTransaksi } from '@/hooks/use-transaksi';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import { formatRupiah, formatTanggal, paginateData } from '@/lib/utils';
import { APP_CONFIG } from '@/lib/constants';

type SortField = 'tanggal' | 'jumlah';
type SortOrder = 'asc' | 'desc';

function KategoriMultiSelect({
  kategoris,
  selected,
  onChange,
}: {
  kategoris: { id: string; nama: string; jenis: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const masukKats = kategoris.filter(k => k.jenis === TransaksiJenis.MASUK);
  const keluarKats = kategoris.filter(k => k.jenis === TransaksiJenis.KELUAR);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const isAll = selected.length === 0;
  const label = isAll
    ? 'Semua Kategori'
    : `${selected.length} Kategori`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-left flex items-center justify-between"
      >
        <span className={isAll ? 'text-gray-900' : 'text-emerald-700 font-medium'}>
          {label}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          <div className="flex gap-2 px-3 py-2 border-b border-gray-100 sticky top-0 bg-white">
            <button type="button" onClick={() => onChange([])} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              Semua
            </button>
            {selected.length > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-700">
                  Reset
                </button>
              </>
            )}
          </div>

          {masukKats.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 uppercase tracking-wide">
                Pemasukan
              </div>
              {masukKats.map(k => (
                <label key={k.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(k.id)}
                    onChange={() => toggle(k.id)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{k.nama}</span>
                </label>
              ))}
            </div>
          )}

          {keluarKats.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-red-600 bg-red-50 uppercase tracking-wide">
                Pengeluaran
              </div>
              {keluarKats.map(k => (
                <label key={k.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(k.id)}
                    onChange={() => toggle(k.id)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{k.nama}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TransaksiPage() {
  return (
    <Suspense fallback={<Loading className="py-12" />}>
      <TransaksiPageInner />
    </Suspense>
  );
}

function TransaksiPageInner() {
  const { data: transaksis, loading } = useTransaksi();
  const { data: kategoris } = useKategori();
  const { data: rekenings } = useRekening();
  const tableRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Filters
  const [filterJenis, setFilterJenis] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterKategoriIds, setFilterKategoriIds] = useState<string[]>([]);
  const [filterRekening, setFilterRekening] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Initialize rekening filter from URL query param
  useEffect(() => {
    const rekeningParam = searchParams.get('rekening');
    if (rekeningParam) {
      setFilterRekening(rekeningParam);
    }
  }, [searchParams]);

  // Sorting — default ascending (oldest first) so date-filtered results show earliest first
  const [sortField, setSortField] = useState<SortField>('tanggal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

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
    if (filterKategoriIds.length > 0) result = result.filter((t) => filterKategoriIds.includes(t.kategori_id));
    if (filterRekening) result = result.filter((t) => t.rekening_id === filterRekening);
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
  }, [transaksis, filterJenis, filterStatus, filterKategoriIds, filterRekening, filterDateFrom, filterDateTo, sortField, sortOrder]);

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

  const sortLabel = sortField === 'tanggal'
    ? (sortOrder === 'asc' ? 'Tanggal terlama' : 'Tanggal terbaru')
    : (sortOrder === 'asc' ? 'Jumlah terkecil' : 'Jumlah terbesar');

  const hasActiveFilters = filterJenis || filterStatus || filterKategoriIds.length > 0 || filterRekening || filterDateFrom || filterDateTo;

  // Auto-scroll to table when filters change
  useEffect(() => {
    if (hasActiveFilters && tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filterJenis, filterStatus, filterKategoriIds, filterRekening, filterDateFrom, filterDateTo]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
            <KategoriMultiSelect
              kategoris={kategoris}
              selected={filterKategoriIds}
              onChange={(ids) => { setFilterKategoriIds(ids); setPage(1); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Rekening</label>
            <select
              value={filterRekening}
              onChange={(e) => { setFilterRekening(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua Rekening</option>
              {rekenings.filter(r => r.is_active).map(r => (
                <option key={r.id} value={r.id}>{r.nama_bank}{r.nomor_rekening ? ` - ${r.nomor_rekening}` : ''}</option>
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

      {/* Sticky Summary Bar */}
      <div ref={tableRef} className="sticky top-0 z-10 bg-white border border-gray-200 rounded-lg shadow-sm mt-4 px-4 py-3">
        <div className="flex flex-wrap gap-4 justify-between items-center text-sm">
          <div className="flex gap-4 items-center">
            <span className="text-emerald-600 font-medium">Masuk: {formatRupiah(totalMasuk)}</span>
            <span className="text-red-600 font-medium">Keluar: {formatRupiah(totalKeluar)}</span>
            <span className="font-bold">Saldo: {formatRupiah(totalMasuk - totalKeluar)}</span>
          </div>
          <div className="flex gap-3 items-center">
            <span className="text-xs text-gray-400">Diurutkan: {sortLabel}</span>
            <span className="text-gray-500">{filtered.length} transaksi</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card padding={false} className="mt-2">
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
                  <TableHead className="text-center">Aksi</TableHead>
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
                    <TableCell className="text-center">
                      <Link href={`/transaksi/${t.id}`}>
                        <Button variant="ghost" size="sm">Detail</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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
