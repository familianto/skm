'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

import { useMe } from '@/hooks/use-me';
import {
  peranBadgeClass,
  peranLabel,
  anggotaStatus,
  statusBadgeClass,
  statusLabel,
  relativeTimeID,
} from '@/lib/anggota-display';

import { ResetPinModal } from '@/components/anggota/ResetPinModal';
import { DeactivateModal } from '@/components/anggota/DeactivateModal';
import { ReactivateModal } from '@/components/anggota/ReactivateModal';
import { PinOnceModal } from '@/components/anggota/PinOnceModal';

/**
 * E4 — /pengaturan/anggota/[id]
 *
 * Detail view + action set for a single anggota (SUPER_ADMIN-only).
 * Edit Profil deep-links to /pengaturan/anggota/[id]/edit (E5 — will 404
 * until that milestone ships).
 *
 * Actions (visible based on state):
 *  - Edit Profil     : always
 *  - Reset PIN       : always (calls U5, reuses PinOnceModal)
 *  - Buka Kunci      : only when locked_until > now (calls U6)
 *  - Nonaktifkan     : only when is_active=true; disabled when target === self
 *  - Aktifkan Kembali: only when is_active=false (calls U8)
 *
 * Self-deactivate UI guard: when `me.user.id === anggota.id`, the
 * Nonaktifkan button is rendered disabled with a tooltip. The backend
 * also rejects with BUSINESS_CANNOT_DEACTIVATE_SELF as defense-in-depth.
 *
 * Responsive: details stack on <lg, two-column on lg+ (consistent with
 * Decision #19 — iPad portrait gets stacked layout).
 */

interface AnggotaDetail {
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

function formatDateID(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTimeID(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnggotaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();

  const anggotaId = params?.id || '';

  const [anggota, setAnggota] = useState<AnggotaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Modal/action states
  const [showResetPin, setShowResetPin] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // PinOnceModal (reused from E3) — shown after Reset PIN success
  const [pinOnceData, setPinOnceData] = useState<{
    nama: string;
    pin: string;
    telepon: string;
    peran: string;
  } | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!anggotaId) return;
    setLoading(true);
    setErrorMessage(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/pengaturan/anggota/${anggotaId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setAnggota(json.data as AnggotaDetail);
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
  }, [anggotaId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const res = await fetch(
        `/api/pengaturan/anggota/${anggotaId}/unlock`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Akun dibuka.', 'success');
        setShowUnlockConfirm(false);
        fetchDetail();
      } else {
        toast(json?.error?.message || 'Gagal membuka kunci.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setUnlocking(false);
    }
  };

  // Loading
  if (meLoading || loading) return <Loading className="my-8" />;

  // Non-SA defensive
  if (me && !me.permissions.can_manage_anggota) {
    return (
      <div>
        <PageTitle title="Detail Anggota" />
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

  // Not found
  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link
          href="/pengaturan/anggota"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
        >
          <ArrowLeftIcon />
          Kembali ke Daftar Anggota
        </Link>
        <PageTitle title="Detail Anggota" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">Anggota tidak ditemukan.</p>
            <Link
              href="/pengaturan/anggota"
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke daftar
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Error fallback
  if (errorMessage || !anggota) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link
          href="/pengaturan/anggota"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
        >
          <ArrowLeftIcon />
          Kembali ke Daftar Anggota
        </Link>
        <PageTitle title="Detail Anggota" />
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

  const status = anggotaStatus(anggota);
  const isLocked = status === 'terkunci';
  const isSelf = me?.user.id === anggota.id;

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/pengaturan/anggota"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
      >
        <ArrowLeftIcon />
        Kembali ke Daftar Anggota
      </Link>

      <PageTitle
        title={anggota.nama}
        subtitle="Detail anggota dan aksi pengelolaan"
      />

      {/* Info card */}
      <Card className="mb-4">
        <dl className="divide-y divide-gray-100">
          <Row label="Nama" value={anggota.nama} />
          <Row label="Telepon" value={<span className="font-mono">{anggota.telepon}</span>} />
          {anggota.email && <Row label="Email" value={anggota.email} />}
          <Row
            label="Peran"
            value={
              <span className={peranBadgeClass(anggota.peran)}>
                {peranLabel(anggota.peran)}
              </span>
            }
          />
          <Row
            label="Status"
            value={
              <span className={statusBadgeClass(status)}>
                {statusLabel(status)}
              </span>
            }
          />
          <Row
            label="Login Terakhir"
            value={
              <span className="text-gray-700">
                {relativeTimeID(anggota.last_login_at)}
              </span>
            }
          />
          <Row
            label="Dibuat"
            value={
              <span className="text-gray-700">
                {formatDateID(anggota.created_at)}
                {anggota.created_by && (
                  <span className="text-gray-400 text-xs ml-1.5">
                    oleh {anggota.created_by === 'SYSTEM_BOOTSTRAP'
                      ? 'SYSTEM'
                      : anggota.created_by}
                  </span>
                )}
              </span>
            }
          />
        </dl>

        {isLocked && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <svg
              className="w-4 h-4 text-amber-600 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Akun terkunci</span> sampai{' '}
              {formatDateTimeID(anggota.locked_until)}
              {anggota.failed_attempts > 0 && (
                <span className="text-amber-700">
                  {' '}
                  ({anggota.failed_attempts}× gagal login)
                </span>
              )}
              .
            </p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Aksi</h2>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <Link href={`/pengaturan/anggota/${anggota.id}/edit`}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Edit Profil
            </Button>
          </Link>

          <Button
            variant="secondary"
            onClick={() => setShowResetPin(true)}
            className="w-full sm:w-auto"
          >
            Reset PIN
          </Button>

          {isLocked && (
            <Button
              variant="secondary"
              onClick={() => setShowUnlockConfirm(true)}
              className="w-full sm:w-auto border border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              Buka Kunci
            </Button>
          )}

          {anggota.is_active ? (
            <span
              title={
                isSelf ? 'Tidak bisa nonaktifkan akun sendiri' : undefined
              }
              className="w-full sm:w-auto"
            >
              <Button
                variant="danger"
                onClick={() => setShowDeactivate(true)}
                disabled={isSelf}
                className="w-full sm:w-auto"
              >
                Nonaktifkan
              </Button>
            </span>
          ) : (
            <Button
              onClick={() => setShowReactivate(true)}
              className="w-full sm:w-auto"
            >
              Aktifkan Kembali
            </Button>
          )}
        </div>
        {isSelf && anggota.is_active && (
          <p className="mt-2 text-xs text-gray-500">
            Anda tidak dapat menonaktifkan akun Anda sendiri. Minta Super Admin
            lain bila perlu.
          </p>
        )}
      </Card>

      {/* Modals */}
      <ResetPinModal
        open={showResetPin}
        anggotaId={anggota.id}
        anggotaNama={anggota.nama}
        onClose={() => setShowResetPin(false)}
        onSuccess={(newPin) => {
          setShowResetPin(false);
          setPinOnceData({
            nama: anggota.nama,
            pin: newPin,
            telepon: anggota.telepon,
            peran: anggota.peran,
          });
        }}
      />

      <DeactivateModal
        open={showDeactivate}
        anggotaId={anggota.id}
        anggotaNama={anggota.nama}
        onClose={() => setShowDeactivate(false)}
        onSuccess={() => {
          setShowDeactivate(false);
          toast('Anggota dinonaktifkan.', 'success');
          fetchDetail();
        }}
      />

      <ReactivateModal
        open={showReactivate}
        anggotaId={anggota.id}
        anggotaNama={anggota.nama}
        onClose={() => setShowReactivate(false)}
        onSuccess={() => {
          setShowReactivate(false);
          toast('Anggota diaktifkan kembali.', 'success');
          fetchDetail();
        }}
      />

      <ConfirmDialog
        open={showUnlockConfirm}
        title="Buka kunci akun?"
        message={`Buka kunci akun ${anggota.nama}? Counter gagal login akan di-reset.`}
        confirmLabel="Buka Kunci"
        cancelLabel="Batal"
        loading={unlocking}
        onConfirm={handleUnlock}
        onCancel={() => setShowUnlockConfirm(false)}
      />

      {pinOnceData && (
        <PinOnceModal
          open
          nama={pinOnceData.nama}
          pin={pinOnceData.pin}
          telepon={pinOnceData.telepon}
          peran={pinOnceData.peran}
          onAcknowledge={() => {
            setPinOnceData(null);
            fetchDetail();
            // Avoid stale stale-router-back; refresh data inline.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 gap-1">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 sm:text-right break-words">
        {value}
      </dd>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}
