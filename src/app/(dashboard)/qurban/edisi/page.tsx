'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface EdisiItem {
  id: string;
  tahun_hijriah: string;
  tahun_masehi: number;
  tanggal_idul_adha: string;
  tanggal_pendaftaran_buka: string;
  tanggal_pendaftaran_tutup: string;
  status: EdisiStatus;
}

const STATUS_FILTERS: { label: string; value: '' | EdisiStatus }[] = [
  { label: 'Semua', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Aktif', value: 'AKTIF' },
  { label: 'Selesai', value: 'SELESAI' },
];

function statusBadgeClass(status: EdisiStatus): string {
  switch (status) {
    case 'AKTIF':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'DRAFT':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'SELESAI':
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

function canWrite(peran: string | undefined): boolean {
  return peran === 'SUPER_ADMIN' || peran === 'ADMIN_QURBAN';
}

function EdisiListInner() {
  const { me } = useMe();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const initialStatus = (searchParams.get('status') || '') as '' | EdisiStatus;
  const [statusFilter, setStatusFilter] = useState<'' | EdisiStatus>(initialStatus);
  const [items, setItems] = useState<EdisiItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/qurban/edisi${qs}`);
      const json = await res.json();
      if (json?.ok) {
        setItems(json.data as EdisiItem[]);
      } else {
        toast(json?.error?.message || 'Gagal memuat daftar edisi', 'error');
      }
    } catch {
      toast('Gagal memuat daftar edisi', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showCreate = canWrite(me?.user.peran);

  const empty = !loading && items.length === 0;

  return (
    <div>
      <PageTitle
        title="Edisi Qurban"
        subtitle="Kelola edisi penyelenggaraan Qurban per tahun hijriah."
        action={
          showCreate ? (
            <Link href="/qurban/edisi/baru">
              <Button>+ Edisi Baru</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
              statusFilter === f.value
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : empty ? (
        <Card>
          <p className="text-sm text-gray-600">
            {statusFilter
              ? `Tidak ada edisi dengan status ${statusFilter}.`
              : 'Belum ada edisi. Buat edisi pertama.'}
          </p>
        </Card>
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Tahun Hijriah</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Idul Adha</th>
                  <th className="px-4 py-3 text-left">Peserta</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {e.tahun_hijriah}
                      <span className="text-gray-500 font-normal ml-2">
                        ({e.tahun_masehi})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide',
                          statusBadgeClass(e.status)
                        )}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {e.tanggal_idul_adha || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/qurban/edisi/${e.id}`}
                        className="text-emerald-700 hover:text-emerald-900 font-medium text-sm"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function EdisiListPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EdisiListInner />
    </Suspense>
  );
}
