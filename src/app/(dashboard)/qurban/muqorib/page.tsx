'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';
import {
  canReadMuqorib,
  canWriteMuqorib,
  muqoribStatusBadgeClass,
  muqoribStatusLabel,
  type Muqorib,
} from '@/lib/qurban/muqorib-display';

/**
 * F03 Milestone D — /qurban/muqorib (list).
 *
 * Master muqorib LINTAS-EDISI: this page does NOT read the selected edisi /
 * EditionSwitcher. Mirrors the F01 anggota list (responsive table + card
 * stack, role-gated "Tambah" button) and wires search / status / sort /
 * pagination to M1 GET /api/qurban/muqorib.
 */

type StatusFilter = 'active' | 'inactive' | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
  { value: 'all', label: 'Semua' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'nama_lengkap:asc', label: 'Nama (A–Z)' },
  { value: 'nama_lengkap:desc', label: 'Nama (Z–A)' },
  { value: 'created_at:desc', label: 'Terbaru' },
  { value: 'created_at:asc', label: 'Terlama' },
];

const PAGE_SIZE = 25;

export default function MuqoribListPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();

  const [items, setItems] = useState<Muqorib[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [sort, setSort] = useState('nama_lengkap:asc');
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever the query shape changes
  useEffect(() => {
    setPage(1);
  }, [search, status, sort]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(page));
      qs.set('page_size', String(PAGE_SIZE));
      qs.set('status', status);
      qs.set('sort', sort);
      if (search) qs.set('search', search);

      const res = await fetch(`/api/qurban/muqorib?${qs.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setItems((json.data as Muqorib[]) || []);
        setTotal(json.meta?.total ?? (json.data || []).length);
        setHasMore(!!json.meta?.has_more);
      } else {
        setError(json?.error?.message || 'Gagal memuat daftar muqorib.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [page, status, sort, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canWrite = canWriteMuqorib(me?.user.peran);
  const isFiltering = !!search || status !== 'active';
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + items.length;

  // Defensive: middleware already gates /qurban/muqorib to read roles, but if
  // the hook resolves to a role outside that set, show a friendly card.
  if (!meLoading && me && !canReadMuqorib(me.user.peran)) {
    return (
      <div>
        <PageTitle title="Muqorib" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses ke halaman ini.
            </p>
            <Link
              href="/qurban"
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke Qurban
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Muqorib"
        subtitle="Master jamaah qurban (lintas-edisi)"
        action={
          canWrite ? (
            <Link href="/qurban/muqorib/baru">
              <Button>
                <svg
                  className="w-4 h-4 mr-1.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="hidden sm:inline">Tambah Muqorib</span>
                <span className="sm:hidden">Tambah</span>
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Search + filter + sort */}
      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1">
              <Input
                placeholder="Cari nama, alamat, atau no. HP..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Cari muqorib"
              />
            </div>
            <div>
              <label htmlFor="muqorib-sort" className="sr-only">
                Urutkan
              </label>
              <select
                id="muqorib-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="block w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                type="button"
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  status === f.value
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Loading state */}
      {loading && <Loading className="my-8" />}

      {/* Error state */}
      {error && !loading && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-3">{error}</p>
            <Button variant="secondary" onClick={fetchData}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">
              {isFiltering
                ? 'Tidak ada muqorib yang cocok dengan filter.'
                : 'Belum ada data muqorib.'}
            </p>
            {canWrite && !isFiltering && (
              <Link href="/qurban/muqorib/baru" className="inline-block mt-4">
                <Button>Tambah Muqorib Pertama</Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Results */}
      {!loading && !error && items.length > 0 && (
        <>
          {/* Desktop table (lg+) */}
          <div className="hidden lg:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nama Lengkap
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Alamat
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        RT
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        No. HP
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((m) => (
                      <tr
                        key={m.id}
                        onClick={() => router.push(`/qurban/muqorib/${m.id}`)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-2 py-3 text-sm font-medium text-gray-900">
                          {m.nama_lengkap}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 max-w-xs truncate">
                          {m.alamat}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600">{m.rt}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 font-mono">
                          {m.no_hp}
                        </td>
                        <td className="px-2 py-3">
                          <span className={muqoribStatusBadgeClass(m.is_active)}>
                            {muqoribStatusLabel(m.is_active)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Card stack below lg */}
          <div className="lg:hidden space-y-3">
            {items.map((m) => (
              <Link
                key={m.id}
                href={`/qurban/muqorib/${m.id}`}
                className="block"
              >
                <Card className="hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.nama_lengkap}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {m.alamat}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        RT {m.rt} · <span className="font-mono">{m.no_hp}</span>
                      </p>
                    </div>
                    <span
                      className={cn(muqoribStatusBadgeClass(m.is_active), 'shrink-0')}
                    >
                      {muqoribStatusLabel(m.is_active)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-xs text-gray-500 text-center sm:text-left">
              Menampilkan {rangeStart}–{rangeEnd} dari {total} muqorib
              {isFiltering ? ' (terfilter)' : ''}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Sebelumnya
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
