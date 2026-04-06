'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { useDashboardSummary } from '@/hooks/use-dashboard';
import { useKategori } from '@/hooks/use-kategori';
import { formatRupiah } from '@/lib/utils';
import { APP_CONFIG } from '@/lib/constants';
import { TransaksiJenis } from '@/types';
import type { Kategori } from '@/types';
import { useToast } from '@/components/ui/toast';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
const months = [
  { value: '', label: 'Semua Bulan' },
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

const BULAN_NAMES = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function KategoriMultiSelect({
  kategoriList,
  selected,
  onChange,
}: {
  kategoriList: Kategori[];
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

  const masukKategori = kategoriList.filter(k => k.jenis === TransaksiJenis.MASUK);
  const keluarKategori = kategoriList.filter(k => k.jenis === TransaksiJenis.KELUAR);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function selectAll() {
    onChange(kategoriList.map(k => k.id));
  }

  function clearAll() {
    onChange([]);
  }

  const label = selected.length === 0
    ? 'Semua Kategori'
    : selected.length === kategoriList.length
      ? 'Semua Kategori'
      : `${selected.length} kategori dipilih`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-left flex items-center justify-between"
      >
        <span className={selected.length === 0 ? 'text-gray-900' : 'text-emerald-700 font-medium'}>
          {label}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {/* Quick actions */}
          <div className="flex gap-2 px-3 py-2 border-b border-gray-100 sticky top-0 bg-white">
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Semua
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Pilih Semua
            </button>
            {selected.length > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Reset
                </button>
              </>
            )}
          </div>

          {/* MASUK group */}
          {masukKategori.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 uppercase tracking-wide">
                Pemasukan
              </div>
              {masukKategori.map(k => (
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

          {/* KELUAR group */}
          {keluarKategori.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 uppercase tracking-wide">
                Pengeluaran
              </div>
              {keluarKategori.map(k => (
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

export default function LaporanPage() {
  const [tahun, setTahun] = useState(APP_CONFIG.DEFAULT_TAHUN_BUKU);
  const [bulan, setBulan] = useState('');
  const [tipe, setTipe] = useState<'ringkasan' | 'detail'>('ringkasan');
  const [selectedKategori, setSelectedKategori] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);
  const { toast } = useToast();

  const { data: kategoriList } = useKategori();
  const { data: summary, loading: summaryLoading } = useDashboardSummary(
    tahun,
    bulan || undefined,
    selectedKategori.length > 0 ? selectedKategori : undefined,
  );

  const periode = bulan
    ? `${BULAN_NAMES[parseInt(bulan, 10)]} ${tahun}`
    : `Tahun ${tahun}`;

  const kategoriLabel = selectedKategori.length > 0
    ? selectedKategori.map(id => kategoriList.find(k => k.id === id)?.nama || id).join(', ')
    : '';

  async function handleExport(format: 'pdf' | 'excel') {
    setDownloading(format);
    try {
      const params = new URLSearchParams({ tahun });
      if (bulan) params.set('bulan', bulan);
      if (format === 'pdf') params.set('type', tipe);
      if (selectedKategori.length > 0) {
        params.set('kategori', selectedKategori.join(','));
      }

      const url = `/api/export/${format}?${params.toString()}`;
      const res = await fetch(url);

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `Gagal download ${format.toUpperCase()}`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = format === 'pdf'
        ? `Laporan_${tipe}_${periode.replace(/\s+/g, '_')}.pdf`
        : `Laporan_${periode.replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast(`File ${format.toUpperCase()} berhasil didownload`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal download file', 'error');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <PageTitle title="Laporan" subtitle="Export laporan keuangan ke PDF atau Excel" />

      {/* Filters */}
      <Card className="mb-6">
        <CardTitle>Filter Laporan</CardTitle>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tahun</label>
            <select
              value={tahun}
              onChange={e => setTahun(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bulan</label>
            <select
              value={bulan}
              onChange={e => setBulan(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <KategoriMultiSelect
              kategoriList={kategoriList}
              selected={selectedKategori}
              onChange={setSelectedKategori}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Laporan (PDF)</label>
            <select
              value={tipe}
              onChange={e => setTipe(e.target.value as 'ringkasan' | 'detail')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ringkasan">Ringkasan</option>
              <option value="detail">Detail Transaksi</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Preview */}
      <Card className="mb-6">
        <CardTitle>
          Preview Ringkasan — {periode}
          {kategoriLabel && (
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({kategoriLabel})
            </span>
          )}
        </CardTitle>
        <div className="mt-4">
          {summaryLoading ? (
            <Loading className="h-32" />
          ) : summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <p className="text-sm text-gray-500">Total Pemasukan</p>
                <p className="text-xl font-bold text-emerald-700 mt-1">{formatRupiah(summary.totalMasuk)}</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-gray-500">Total Pengeluaran</p>
                <p className="text-xl font-bold text-red-700 mt-1">{formatRupiah(summary.totalKeluar)}</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-500">Saldo</p>
                <p className="text-xl font-bold text-blue-700 mt-1">{formatRupiah(summary.saldo)}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Tidak ada data untuk periode ini</p>
          )}
          {summary && (
            <p className="text-sm text-gray-400 mt-4 text-center">
              {summary.jumlahTransaksi} transaksi pada periode ini
            </p>
          )}
        </div>
      </Card>

      {/* Export Buttons */}
      <Card>
        <CardTitle>Download Laporan</CardTitle>
        <div className="mt-4 flex flex-wrap gap-4">
          <Button
            onClick={() => handleExport('pdf')}
            disabled={downloading !== null}
            className="gap-2"
          >
            {downloading === 'pdf' ? (
              <>
                <Loading size="sm" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <span>Download PDF</span>
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleExport('excel')}
            disabled={downloading !== null}
            className="gap-2"
          >
            {downloading === 'excel' ? (
              <>
                <Loading size="sm" />
                <span>Generating Excel...</span>
              </>
            ) : (
              <span>Download Excel</span>
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          PDF akan di-generate sesuai tipe laporan yang dipilih. Excel selalu berisi 2 sheet (Ringkasan + Detail).
          {selectedKategori.length > 0 && ' Filter kategori akan diterapkan pada export.'}
        </p>
      </Card>
    </div>
  );
}
