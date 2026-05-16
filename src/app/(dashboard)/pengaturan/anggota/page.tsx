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
  anggotaStatus,
  peranBadgeClass,
  peranLabel,
  relativeTimeID,
  statusBadgeClass,
  statusLabel,
} from '@/lib/anggota-display';

/**
 * E2 — /pengaturan/anggota (anggota list page)
 *
 * SUPER_ADMIN-gated by middleware (Milestone D STRICT_PATH_RULES). This page
 * additionally checks `me.permissions.can_manage_anggota` for the "Tambah"
 * button and renders a defensive "Akses ditolak" card if the hook resolves
 * to a non-SA session (shouldn't happen because of middleware, but cheap
 * second layer).
 *
 * Responsive:
 *   - lg+   → table view (5 cols: nama, telepon, peran, status, login terakhir)
 *   - <lg   → vertical card stack (covers iPad portrait per Decision #19;
 *             card layout is more ergonomic for touch tap-targets)
 *
 * Filters:
 *   - search       — debounced 300ms, sent as `?search=` to U1
 *   - chip Semua/Aktif/Non-aktif → `?is_active=true|false`
 *
 * Pagination:
 *   - F1 fetches first 200 rows up-front (anggota table typically tens of
 *     rows). Add cursor / infinite scroll in F2 if dataset grows.
 */

interface AnggotaItem {
  id: string;
  nama: string;
  telepon: string;
  email: string;
  peran: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  last_login_at: string;
  failed_attempts: number;
  locked_until: string;
}

type Filter = 'all' | 'active' | 'inactive';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Non-aktif' },
];

export default function AnggotaListPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();

  const [items, setItems] = useState<AnggotaItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', '1');
      qs.set('page_size', '200');
      qs.set('sort', 'nama:asc');
      if (search) qs.set('search', search);
      if (filter === 'active') qs.set('is_active', 'true');
      if (filter === 'inactive') qs.set('is_active', 'false');

      const res = await fetch(`/api/pengaturan/anggota?${qs.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setItems(json.data || []);
        setTotal(json.meta?.total ?? (json.data || []).length);
      } else {
        setError(json?.error?.message || 'Gagal memuat anggota.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canManage = !!me?.permissions.can_manage_anggota;
  const isFiltering = !!search || filter !== 'all';

  // Defensive: if useMe finished and the user clearly isn't SA, show a
  // helpful card instead of letting the list render (which would also 403
  // anyway at the API layer).
  if (!meLoading && me && !canManage) {
    return (
      <div>
        <PageTitle title="Anggota" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses ke halaman ini.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Anggota"
        subtitle="Kelola pengguna SKM beserta hak akses"
        action={
          canManage ? (
            <Link href="/pengaturan/anggota/baru">
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
                <span className="hidden sm:inline">Tambah Anggota</span>
                <span className="sm:hidden">Tambah</span>
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Search + filter */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Cari nama atau telepon..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Cari anggota"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                type="button"
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  filter === f.value
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
                ? 'Tidak ada anggota yang cocok dengan filter.'
                : 'Belum ada anggota.'}
            </p>
            {canManage && !isFiltering && (
              <Link
                href="/pengaturan/anggota/baru"
                className="inline-block mt-4"
              >
                <Button>Tambah Anggota Pertama</Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Results */}
      {!loading && !error && items.length > 0 && (
        <>
          {/* Desktop table (lg+; iPad portrait + smaller use cards below) */}
          <div className="hidden lg:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nama
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Telepon
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peran
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Login Terakhir
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((a) => {
                      const st = anggotaStatus(a);
                      return (
                        <tr
                          key={a.id}
                          onClick={() =>
                            router.push(`/pengaturan/anggota/${a.id}`)
                          }
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-2 py-3 text-sm font-medium text-gray-900">
                            {a.nama}
                          </td>
                          <td className="px-2 py-3 text-sm text-gray-600">
                            {a.telepon}
                          </td>
                          <td className="px-2 py-3">
                            <span className={peranBadgeClass(a.peran)}>
                              {peranLabel(a.peran)}
                            </span>
                          </td>
                          <td className="px-2 py-3">
                            <span className={statusBadgeClass(st)}>
                              {statusLabel(st)}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-sm text-gray-500">
                            {relativeTimeID(a.last_login_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Card stack for everything below lg (covers iPad portrait + phones) */}
          <div className="lg:hidden space-y-3">
            {items.map((a) => {
              const st = anggotaStatus(a);
              return (
                <Link
                  key={a.id}
                  href={`/pengaturan/anggota/${a.id}`}
                  className="block"
                >
                  <Card className="hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {a.nama}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {a.telepon}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Login: {relativeTimeID(a.last_login_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={peranBadgeClass(a.peran)}>
                          {peranLabel(a.peran)}
                        </span>
                        <span className={statusBadgeClass(st)}>
                          {statusLabel(st)}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Total */}
          {total !== null && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              {total} anggota{isFiltering ? ' (filtered)' : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}
