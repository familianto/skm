'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import {
  canManageMuqoribStatus,
  canWriteMuqorib,
  formatMuqoribDateID,
  muqoribStatusBadgeClass,
  muqoribStatusLabel,
  type Muqorib,
} from '@/lib/qurban/muqorib-display';
import { MuqoribDeactivateModal } from '@/components/qurban/MuqoribDeactivateModal';
import { MuqoribReactivateModal } from '@/components/qurban/MuqoribReactivateModal';

/**
 * F03 Milestone D — /qurban/muqorib/[id] (detail, M3).
 *
 * Mirrors the F01 anggota detail page. Renders the muqorib fields, a
 * participation-history section (empty until F04 ships `qurban_peserta`), and
 * role-gated Edit / Nonaktifkan / Aktifkan kembali actions (M5 / M6).
 */

export default function MuqoribDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();

  const muqoribId = params?.id || '';

  const [muqorib, setMuqorib] = useState<Muqorib | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!muqoribId) return;
    setLoading(true);
    setErrorMessage(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/qurban/muqorib/${muqoribId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setMuqorib(json.data.muqorib as Muqorib);
        setHistory(Array.isArray(json.data.history) ? json.data.history : []);
      } else if (res.status === 404) {
        setNotFound(true);
      } else {
        setErrorMessage(json?.error?.message || 'Gagal memuat detail.');
      }
    } catch {
      setErrorMessage('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [muqoribId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (meLoading || loading) return <Loading className="my-8" />;

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <BackLink />
        <PageTitle title="Detail Muqorib" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">Muqorib tidak ditemukan.</p>
            <Link
              href="/qurban/muqorib"
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke daftar
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (errorMessage || !muqorib) {
    return (
      <div className="max-w-2xl mx-auto">
        <BackLink />
        <PageTitle title="Detail Muqorib" />
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-3">
              {errorMessage || 'Gagal memuat detail.'}
            </p>
            <Button variant="secondary" onClick={fetchDetail}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const canEdit = canWriteMuqorib(me?.user.peran);
  const canStatus = canManageMuqoribStatus(me?.user.peran);

  return (
    <div className="max-w-2xl mx-auto">
      <BackLink />

      <PageTitle title={muqorib.nama_lengkap} subtitle="Detail muqorib" />

      {/* Info card */}
      <Card className="mb-4">
        <dl className="divide-y divide-gray-100">
          <Row label="Nama Lengkap" value={muqorib.nama_lengkap} />
          <Row label="Alamat" value={muqorib.alamat} />
          <Row label="RT" value={muqorib.rt} />
          <Row
            label="No. HP"
            value={<span className="font-mono">{muqorib.no_hp}</span>}
          />
          <Row
            label="Status"
            value={
              <span className={muqoribStatusBadgeClass(muqorib.is_active)}>
                {muqoribStatusLabel(muqorib.is_active)}
              </span>
            }
          />
          {muqorib.notes && <Row label="Catatan" value={muqorib.notes} />}
          {muqorib.data_induk_ref_1447h && (
            <Row label="Ref. Data Induk 1447H" value={muqorib.data_induk_ref_1447h} />
          )}
          <Row
            label="Dibuat"
            value={
              <span className="text-gray-700">
                {formatMuqoribDateID(muqorib.created_at)}
                {muqorib.created_by && (
                  <span className="text-gray-400 text-xs ml-1.5">
                    oleh{' '}
                    {muqorib.created_by === 'SYSTEM_BOOTSTRAP'
                      ? 'SYSTEM'
                      : muqorib.created_by}
                  </span>
                )}
              </span>
            }
          />
        </dl>
      </Card>

      {/* Riwayat Partisipasi Qurban */}
      <Card className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Riwayat Partisipasi Qurban
        </h2>
        {history.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              Belum ada data peserta — riwayat akan tampil setelah modul
              Pendaftaran tersedia.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Actions */}
      {(canEdit || canStatus) && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Aksi</h2>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {canEdit && (
              <Link href={`/qurban/muqorib/${muqorib.id}/edit`}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  Edit
                </Button>
              </Link>
            )}

            {canStatus &&
              (muqorib.is_active ? (
                <Button
                  variant="danger"
                  onClick={() => setShowDeactivate(true)}
                  className="w-full sm:w-auto"
                >
                  Nonaktifkan
                </Button>
              ) : (
                <Button
                  onClick={() => setShowReactivate(true)}
                  className="w-full sm:w-auto"
                >
                  Aktifkan Kembali
                </Button>
              ))}
          </div>
        </Card>
      )}

      {/* Modals */}
      <MuqoribDeactivateModal
        open={showDeactivate}
        muqoribId={muqorib.id}
        muqoribNama={muqorib.nama_lengkap}
        onClose={() => setShowDeactivate(false)}
        onSuccess={() => {
          setShowDeactivate(false);
          toast('Muqorib dinonaktifkan.', 'success');
          fetchDetail();
        }}
      />

      <MuqoribReactivateModal
        open={showReactivate}
        muqoribId={muqorib.id}
        muqoribNama={muqorib.nama_lengkap}
        onClose={() => setShowReactivate(false)}
        onSuccess={() => {
          setShowReactivate(false);
          toast('Muqorib diaktifkan kembali.', 'success');
          fetchDetail();
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/qurban/muqorib"
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 19l-7-7 7-7"
        />
      </svg>
      Kembali ke Daftar Muqorib
    </Link>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 gap-1">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 sm:text-right break-words">
        {value}
      </dd>
    </div>
  );
}
