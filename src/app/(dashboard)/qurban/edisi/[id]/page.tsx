'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';
import { KonfigurasiTab } from '@/components/qurban/KonfigurasiTab';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface Edisi {
  id: string;
  tahun_hijriah: string;
  tahun_masehi: number;
  tanggal_idul_adha: string;
  tanggal_pendaftaran_buka: string;
  tanggal_pendaftaran_tutup: string;
  status: EdisiStatus;
  parent_edisi_id: string;
  cloned_at: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

type TabKey = 'detail' | 'konfigurasi' | 'panitia';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'detail', label: 'Detail' },
  { key: 'konfigurasi', label: 'Konfigurasi' },
  { key: 'panitia', label: 'Panitia' },
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

function EdisiDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const { me } = useMe();

  const tabFromUrl = (search.get('tab') as TabKey) || 'detail';
  const activeTab: TabKey = (['detail', 'konfigurasi', 'panitia'] as TabKey[]).includes(tabFromUrl)
    ? tabFromUrl
    : 'detail';

  const [edisi, setEdisi] = useState<Edisi | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmForce, setConfirmForce] = useState<{
    open: boolean;
    existing: string;
  }>({ open: false, existing: '' });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/qurban/edisi/${id}`);
      const json = await res.json();
      if (json?.ok) {
        setEdisi(json.data as Edisi);
      } else {
        toast(json?.error?.message || 'Gagal memuat edisi', 'error');
        setEdisi(null);
      }
    } catch {
      toast('Gagal memuat edisi', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(search.toString());
    if (next === 'detail') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(`/qurban/edisi/${id}${qs ? `?${qs}` : ''}`);
  };

  const callActivate = async (force: boolean) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/qurban/edisi/${id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_close_existing_aktif: force }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Edisi berhasil diaktifkan.', 'success');
        setConfirmActivate(false);
        setConfirmForce({ open: false, existing: '' });
        fetchData();
        return;
      }
      const code = json?.error?.code;
      const details = json?.error?.details;
      if (
        code === 'BUSINESS_PREFLIGHT_FAILED' &&
        details?.check === 'single_aktif' &&
        !force
      ) {
        // Surface the force-close confirmation.
        setConfirmActivate(false);
        setConfirmForce({
          open: true,
          existing: details?.existing_aktif?.tahun_hijriah || '(tidak diketahui)',
        });
        return;
      }
      toast(json?.error?.message || 'Gagal mengaktifkan edisi.', 'error');
      setConfirmActivate(false);
      setConfirmForce({ open: false, existing: '' });
    } finally {
      setActionLoading(false);
    }
  };

  const callClose = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/qurban/edisi/${id}/close`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Edisi berhasil ditutup.', 'success');
        setConfirmClose(false);
        fetchData();
        return;
      }
      toast(json?.error?.message || 'Gagal menutup edisi.', 'error');
      setConfirmClose(false);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (!edisi) {
    return (
      <div>
        <PageTitle title="Edisi tidak ditemukan" />
        <Card>
          <p className="text-sm text-gray-600">
            Edisi ini tidak tersedia atau tidak dapat diakses.{' '}
            <Link href="/qurban/edisi" className="text-emerald-700 hover:underline">
              Kembali ke daftar edisi
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  const writeAllowed = canWrite(me?.user.peran);
  const editLabel =
    edisi.status === 'AKTIF' ? 'Edit Tanggal' : edisi.status === 'DRAFT' ? 'Edit' : null;

  return (
    <div>
      <PageTitle
        title={`Edisi ${edisi.tahun_hijriah}`}
        subtitle={`Tahun masehi: ${edisi.tahun_masehi}`}
        action={
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide',
              statusBadgeClass(edisi.status)
            )}
          >
            {edisi.status}
          </span>
        }
      />

      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === t.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'detail' && (
        <div className="space-y-4">
          <Card>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Tahun Hijriah</dt>
                <dd className="text-gray-900 font-medium">{edisi.tahun_hijriah}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Tahun Masehi</dt>
                <dd className="text-gray-900 font-medium">{edisi.tahun_masehi}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Tanggal Idul Adha</dt>
                <dd className="text-gray-900 font-medium">
                  {edisi.tanggal_idul_adha || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Pendaftaran</dt>
                <dd className="text-gray-900 font-medium">
                  {edisi.tanggal_pendaftaran_buka || '—'}
                  {' '}s/d{' '}
                  {edisi.tanggal_pendaftaran_tutup || '—'}
                </dd>
              </div>
              {edisi.parent_edisi_id && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Disalin dari</dt>
                  <dd className="text-gray-900 font-medium">
                    <Link
                      href={`/qurban/edisi/${edisi.parent_edisi_id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {edisi.parent_edisi_id}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {writeAllowed && edisi.status !== 'SELESAI' && (
            <div className="flex flex-wrap gap-3">
              {editLabel && (
                <Link href={`/qurban/edisi/${edisi.id}/edit`}>
                  <Button variant="secondary">{editLabel}</Button>
                </Link>
              )}
              {edisi.status === 'DRAFT' && (
                <Button onClick={() => setConfirmActivate(true)}>Aktifkan</Button>
              )}
              {edisi.status === 'AKTIF' && (
                <Button variant="danger" onClick={() => setConfirmClose(true)}>
                  Tutup Edisi
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'konfigurasi' && (
        <KonfigurasiTab
          edisiId={edisi.id}
          edisiStatus={edisi.status}
          canEdit={writeAllowed && edisi.status !== 'SELESAI'}
        />
      )}

      {activeTab === 'panitia' && (
        <Card>
          <p className="text-sm text-gray-600">
            Panitia edisi — tersedia di langkah berikutnya.
          </p>
        </Card>
      )}

      <ConfirmDialog
        open={confirmActivate}
        title="Aktifkan Edisi?"
        message={`Edisi ${edisi.tahun_hijriah} akan diubah ke status AKTIF. Aksi ini hanya bisa diakhiri dengan menutup edisi. Lanjutkan?`}
        confirmLabel="Aktifkan"
        variant="primary"
        loading={actionLoading}
        onCancel={() => setConfirmActivate(false)}
        onConfirm={() => callActivate(false)}
      />

      <ConfirmDialog
        open={confirmForce.open}
        title="Sudah ada edisi AKTIF lain"
        message={`Edisi ${confirmForce.existing} sedang AKTIF. Aktifkan edisi ini akan menutupnya secara otomatis. Lanjutkan?`}
        confirmLabel="Tutup yang lama & aktifkan"
        variant="danger"
        loading={actionLoading}
        onCancel={() => setConfirmForce({ open: false, existing: '' })}
        onConfirm={() => callActivate(true)}
      />

      <ConfirmDialog
        open={confirmClose}
        title="Tutup Edisi?"
        message={`Edisi ${edisi.tahun_hijriah} akan diubah ke status SELESAI. Setelah ditutup, edisi ini tidak dapat dibuka kembali. Lanjutkan?`}
        confirmLabel="Tutup Edisi"
        variant="danger"
        loading={actionLoading}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => callClose()}
      />
    </div>
  );
}

export default function EdisiDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EdisiDetailInner />
    </Suspense>
  );
}
