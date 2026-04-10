'use client';

import { Suspense, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useTransaksi } from '@/hooks/use-transaksi';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { Transaksi, Kategori, ApiResponse } from '@/types';
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

/** Check if a transaction can be selected for bulk edit */
function isSelectable(t: Transaksi): boolean {
  return t.status !== TransaksiStatus.VOID && !t.mutasi_ref;
}

export default function TransaksiPage() {
  return (
    <Suspense fallback={<Loading className="py-12" />}>
      <TransaksiPageInner />
    </Suspense>
  );
}

function TransaksiPageInner() {
  const { toast } = useToast();
  const { data: transaksis, loading, refetch } = useTransaksi();
  const { data: kategoris } = useKategori();
  const { data: rekenings } = useRekening();
  const tableRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Filters — initial rekening/kategori read from URL query param via lazy init
  const [filterJenis, setFilterJenis] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterKategoriIds, setFilterKategoriIds] = useState<string[]>(() => {
    const kat = searchParams.get('kategori');
    return kat ? [kat] : [];
  });
  const [filterRekening, setFilterRekening] = useState<string>(() => searchParams.get('rekening') || '');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Search (debounced 300ms)
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expanded description rows (per-row toggle)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sorting — default ascending (oldest first) so date-filtered results show earliest first
  const [sortField, setSortField] = useState<SortField>('tanggal');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = APP_CONFIG.PAGINATION_LIMIT;

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk edit dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkNewKategoriId, setBulkNewKategoriId] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Debounce search input → searchQuery (300ms) and reset to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim().toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const kategoriMap = useMemo(() => {
    const map: Record<string, Kategori> = {};
    kategoris.forEach((k) => { map[k.id] = k; });
    return map;
  }, [kategoris]);

  const filtered = useMemo(() => {
    let result = [...transaksis];

    if (filterJenis) {
      if (filterJenis === 'MUTASI') {
        result = result.filter((t) => !!t.mutasi_ref);
      } else {
        result = result.filter((t) => t.jenis === filterJenis && !t.mutasi_ref);
      }
    }
    if (filterStatus) result = result.filter((t) => t.status === filterStatus);
    if (filterKategoriIds.length > 0) result = result.filter((t) => filterKategoriIds.includes(t.kategori_id));
    if (filterRekening) result = result.filter((t) => t.rekening_id === filterRekening);
    if (filterDateFrom) result = result.filter((t) => t.tanggal >= filterDateFrom);
    if (filterDateTo) result = result.filter((t) => t.tanggal <= filterDateTo);
    if (searchQuery) result = result.filter((t) => t.deskripsi.toLowerCase().includes(searchQuery));

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
  }, [transaksis, filterJenis, filterStatus, filterKategoriIds, filterRekening, filterDateFrom, filterDateTo, searchQuery, sortField, sortOrder]);

  // Totals
  const totalMasuk = useMemo(
    () => filtered.filter((t) => t.jenis === TransaksiJenis.MASUK && t.status === TransaksiStatus.AKTIF && !t.mutasi_ref).reduce((s, t) => s + t.jumlah, 0),
    [filtered]
  );
  const totalKeluar = useMemo(
    () => filtered.filter((t) => t.jenis === TransaksiJenis.KELUAR && t.status === TransaksiStatus.AKTIF && !t.mutasi_ref).reduce((s, t) => s + t.jumlah, 0),
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

  const hasActiveFilters = filterJenis || filterStatus || filterKategoriIds.length > 0 || filterRekening || filterDateFrom || filterDateTo || searchQuery;

  const resetFilters = () => {
    setFilterJenis('');
    setFilterStatus('');
    setFilterKategoriIds([]);
    setFilterRekening('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchInput('');
    setPage(1);
  };

  // Auto-scroll to table when filters change
  useEffect(() => {
    if (hasActiveFilters && tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filterJenis, filterStatus, filterKategoriIds, filterRekening, filterDateFrom, filterDateTo, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Bulk selection helpers ---
  const selectableOnPage = useMemo(
    () => paginated.filter(isSelectable),
    [paginated]
  );

  const selectedCount = selectedIds.size;

  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every(t => selectedIds.has(t.id));
  const someOnPageSelected = selectableOnPage.some(t => selectedIds.has(t.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        // Deselect all on this page
        selectableOnPage.forEach(t => next.delete(t.id));
      } else {
        // Select all on this page
        selectableOnPage.forEach(t => next.add(t.id));
      }
      return next;
    });
  }, [allOnPageSelected, selectableOnPage]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // --- Bulk edit dialog data ---
  const selectedTransactions = useMemo(
    () => transaksis.filter(t => selectedIds.has(t.id)),
    [transaksis, selectedIds]
  );

  const selectedJenisSet = useMemo(() => {
    const s = new Set<string>();
    selectedTransactions.forEach(t => s.add(t.jenis));
    return s;
  }, [selectedTransactions]);

  const isMixedJenis = selectedJenisSet.size > 1;

  const selectedTotalNominal = useMemo(
    () => selectedTransactions.reduce((sum, t) => sum + t.jumlah, 0),
    [selectedTransactions]
  );

  // Group by old kategori for summary
  const oldKategoriSummary = useMemo(() => {
    const map: Record<string, number> = {};
    selectedTransactions.forEach(t => {
      const name = kategoriMap[t.kategori_id]?.nama || t.kategori_id;
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).map(([nama, count]) => `${nama} (${count})`).join(', ');
  }, [selectedTransactions, kategoriMap]);

  // Available categories for the new kategori dropdown (filtered by jenis)
  const availableKategoris = useMemo(() => {
    if (isMixedJenis) return [];
    const jenis = selectedJenisSet.values().next().value;
    return kategoris.filter(k => k.jenis === jenis);
  }, [kategoris, isMixedJenis, selectedJenisSet]);

  const handleOpenBulkDialog = () => {
    setBulkNewKategoriId('');
    setBulkDialogOpen(true);
  };

  const handleBulkUpdate = async () => {
    if (!bulkNewKategoriId || selectedIds.size === 0) return;

    setBulkSubmitting(true);
    try {
      const res = await fetch('/api/transaksi/bulk-update-kategori', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: Array.from(selectedIds),
          newKategoriId: bulkNewKategoriId,
        }),
      });
      const data: ApiResponse<{ updatedCount: number }> = await res.json();
      if (data.success && data.data) {
        toast(`${data.data.updatedCount} transaksi berhasil diubah kategorinya`);
        setBulkDialogOpen(false);
        clearSelection();
        refetch();
      } else {
        toast(data.error || 'Gagal mengubah kategori', 'error');
      }
    } catch {
      toast('Gagal mengubah kategori: terjadi kesalahan', 'error');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Preview for dialog
  const previewOldKategori = useMemo(() => {
    if (selectedTransactions.length === 0) return '';
    // Get unique old kategori names
    const names = new Set(selectedTransactions.map(t => kategoriMap[t.kategori_id]?.nama || t.kategori_id));
    return Array.from(names).join(', ');
  }, [selectedTransactions, kategoriMap]);

  const newKategoriName = bulkNewKategoriId ? (kategoriMap[bulkNewKategoriId]?.nama || '') : '';

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
        {/* Row 1: Search (full width) */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari deskripsi..."
            className="block w-full rounded-lg border border-gray-300 pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Hapus pencarian"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Row 2: Dropdowns + Reset button */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-[11px] text-gray-400 uppercase tracking-wide mb-1">Jenis</label>
            <select
              value={filterJenis}
              onChange={(e) => { setFilterJenis(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua</option>
              <option value="MASUK">Pemasukan</option>
              <option value="KELUAR">Pengeluaran</option>
              <option value="MUTASI">Mutasi</option>
            </select>
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-[11px] text-gray-400 uppercase tracking-wide mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua</option>
              <option value="AKTIF">Aktif</option>
              <option value="VOID">Void</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[11px] text-gray-400 uppercase tracking-wide mb-1">Kategori</label>
            <KategoriMultiSelect
              kategoris={kategoris}
              selected={filterKategoriIds}
              onChange={(ids) => { setFilterKategoriIds(ids); setPage(1); }}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[11px] text-gray-400 uppercase tracking-wide mb-1">Rekening</label>
            <select
              value={filterRekening}
              onChange={(e) => { setFilterRekening(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Semua</option>
              {rekenings.filter(r => r.is_active).map(r => (
                <option key={r.id} value={r.id}>{r.nama_bank}{r.nomor_rekening ? ` - ${r.nomor_rekening}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-gray-400 uppercase tracking-wide mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-gray-400 uppercase tracking-wide mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="whitespace-nowrap text-xs font-medium text-gray-500 hover:text-emerald-600 px-2 py-2"
            >
              Reset Filter
            </button>
          )}
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
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                      title="Pilih semua di halaman ini"
                    />
                  </TableHead>
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
                {paginated.map((t) => {
                  const isExpanded = expandedKeys.has(t.id);
                  const canSelect = isSelectable(t);
                  const isSelected = selectedIds.has(t.id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="w-[40px] align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canSelect}
                          onChange={() => toggleSelectOne(t.id)}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 disabled:opacity-30"
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">{formatTanggal(t.tanggal)}</TableCell>
                      <TableCell className="align-top">
                        {t.mutasi_ref ? <Badge label="MUTASI" /> : <Badge label={t.jenis} />}
                      </TableCell>
                      <TableCell className="align-top">{kategoriMap[t.kategori_id]?.nama || t.kategori_id}</TableCell>
                      <TableCell className="max-w-[260px] align-top">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(t.id)}
                          title={isExpanded ? 'Klik untuk tutup' : 'Klik untuk lihat deskripsi lengkap'}
                          className="group flex items-start gap-1.5 w-full text-left hover:text-emerald-700"
                        >
                          <span className={isExpanded ? 'whitespace-normal break-words flex-1' : 'truncate flex-1'}>
                            {t.deskripsi}
                          </span>
                          <svg
                            className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400 group-hover:text-emerald-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </TableCell>
                      <TableCell className={`font-medium whitespace-nowrap align-top ${t.mutasi_ref ? 'text-slate-600' : t.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.mutasi_ref ? '' : t.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(t.jumlah)}
                      </TableCell>
                      <TableCell className="align-top"><Badge label={t.status} /></TableCell>
                      <TableCell className="text-center align-top">
                        <Link href={`/transaksi/${t.id}`}>
                          <Button variant="ghost" size="sm">Detail</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Sticky Bulk Action Toolbar */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ease-out ${
          selectedCount > 0
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-4 py-3 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-900">
            {selectedCount} transaksi dipilih
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Batal Pilih
            </Button>
            <Button size="sm" onClick={handleOpenBulkDialog}>
              Ubah Kategori
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Edit Dialog */}
      <Modal
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        title="Ubah kategori"
        className="max-w-lg"
      >
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-900 mb-1">
              {selectedCount} transaksi dipilih
            </p>
            <p className="text-xs text-gray-600">
              Kategori asal: {oldKategoriSummary}
            </p>
            <p className="text-xs text-gray-600">
              Total nominal: {formatRupiah(selectedTotalNominal)}
            </p>
          </div>

          {isMixedJenis ? (
            <div className="bg-red-50 text-red-800 rounded-lg p-3 text-sm">
              Pilih transaksi dengan jenis yang sama (hanya MASUK atau hanya KELUAR) untuk mengubah kategori.
            </div>
          ) : (
            <>
              {/* Kategori dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori baru</label>
                <select
                  value={bulkNewKategoriId}
                  onChange={(e) => setBulkNewKategoriId(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Pilih kategori...</option>
                  {availableKategoris.map(k => (
                    <option key={k.id} value={k.id}>{k.nama}</option>
                  ))}
                </select>
              </div>

              {/* Preview */}
              {bulkNewKategoriId && (
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-emerald-700 mb-1">Preview perubahan</p>
                  <p className="text-sm text-gray-700">
                    {previewOldKategori} → <span className="font-semibold text-emerald-700">{newKategoriName}</span>
                  </p>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setBulkDialogOpen(false)} disabled={bulkSubmitting}>
              Batal
            </Button>
            {!isMixedJenis && (
              <Button
                onClick={handleBulkUpdate}
                disabled={bulkSubmitting || !bulkNewKategoriId}
              >
                {bulkSubmitting ? 'Memproses...' : `Ya, ubah ${selectedCount} transaksi`}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
