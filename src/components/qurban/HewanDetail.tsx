'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useMe } from '@/hooks/use-me';
import { formatRupiah } from '@/lib/utils';
import {
  canWriteDaftarHewan,
  canManageHewanStatus,
  hewanStatusBadgeClass,
  hewanStatusLabel,
  tipePembelianLabel,
  jenisLabel,
  formatHewanDateID,
  isHewanTerminal,
  type DaftarHewanDetailData,
} from '@/lib/qurban/daftar-hewan-display';
import { HewanCancelModal } from '@/components/qurban/HewanCancelModal';

interface Props {
  edisiId: string;
  hewanId: string;
}

export function HewanDetail({ edisiId, hewanId }: Props) {
  const { me, loading: meLoading } = useMe();

  const [hewan, setHewan] = useState<DaftarHewanDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const listHref = `/qurban/hewan?tab=inventory&edisi=${encodeURIComponent(edisiId)}`;
  const editHref = `/qurban/hewan/${hewanId}/edit?edisi=${encodeURIComponent(edisiId)}`;

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/qurban/hewan/${hewanId}?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setHewan(json.data as DaftarHewanDetailData);
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
  }, [edisiId, hewanId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (meLoading || loading) return <Loading className="my-8" />;

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <BackLink href={listHref} />
        <PageTitle title="Detail Hewan" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">Hewan tidak ditemukan.</p>
            <Link href={listHref} className="inline-block mt-4 text-emerald-600 hover:underline text-sm">
              Kembali ke daftar
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (errorMessage || !hewan) {
    return (
      <div className="max-w-2xl mx-auto">
        <BackLink href={listHref} />
        <PageTitle title="Detail Hewan" />
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-3">{errorMessage || 'Gagal memuat detail.'}</p>
            <Button variant="secondary" onClick={fetchDetail}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const canEdit = canWriteDaftarHewan(me?.user.peran) && !isHewanTerminal(hewan.status);
  const canCancel = canManageHewanStatus(me?.user.peran) && !isHewanTerminal(hewan.status);

  return (
    <div className="max-w-2xl mx-auto">
      <BackLink href={listHref} />

      <div className="flex items-center gap-3 mb-4">
        <PageTitle title={hewan.nama_display} subtitle="Detail hewan qurban" />
        <span className={hewanStatusBadgeClass(hewan.status)}>{hewanStatusLabel(hewan.status)}</span>
      </div>

      {/* Info */}
      <Card className="mb-4">
        <dl className="divide-y divide-gray-100">
          <Row label="Tipe Hewan" value={`${jenisLabel(hewan.jenis)} — Kelas ${hewan.kelas}`} />
          <Row label="Tipe Pembelian" value={tipePembelianLabel(hewan.tipe_pembelian)} />
          <Row label="Vendor" value={hewan.vendor_nama || '—'} />
          <Row label="Harga Beli Aktual" value={formatRupiah(hewan.harga_beli_aktual)} />
          <Row label="Tanggal Pembelian" value={formatHewanDateID(hewan.tanggal_pembelian)} />
          {hewan.notes && <Row label="Catatan" value={hewan.notes} />}
          <Row
            label="Dibuat"
            value={
              <span className="text-gray-700">
                {formatHewanDateID(hewan.created_at)}
                {hewan.created_by && (
                  <span className="text-gray-400 text-xs ml-1.5">oleh {hewan.created_by}</span>
                )}
              </span>
            }
          />
          <Row label="Diperbarui" value={formatHewanDateID(hewan.updated_at)} />
        </dl>
      </Card>

      {/* Slot */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Slot Peserta</h2>
          <span className="text-sm font-medium text-gray-700">
            {hewan.slot_terisi} / {hewan.kapasitas_slot} terisi
          </span>
        </div>
        {hewan.occupants.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            Belum ada peserta terdaftar pada hewan ini.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {hewan.occupants.map((o, i) => (
              <li key={o.peserta_id || i} className="py-2 flex items-center justify-between">
                <span className="text-sm text-gray-900">{o.nama || o.peserta_id}</span>
                <span className="text-xs text-gray-500">{o.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Actions */}
      {(canEdit || canCancel) && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Aksi</h2>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {canEdit && (
              <Link href={editHref}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  Edit
                </Button>
              </Link>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setShowCancel(true)} className="w-full sm:w-auto">
                Batalkan Hewan
              </Button>
            )}
          </div>
        </Card>
      )}

      <HewanCancelModal
        open={showCancel}
        edisiId={edisiId}
        hewanId={hewan.id}
        namaDisplay={hewan.nama_display}
        onClose={() => setShowCancel(false)}
        onSuccess={() => {
          setShowCancel(false);
          fetchDetail();
        }}
      />
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Kembali ke Daftar Inventory
    </Link>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 gap-1">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 sm:text-right break-words">{value}</dd>
    </div>
  );
}
