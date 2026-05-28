'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import { formatRupiah, formatTimestamp } from '@/lib/utils';
import {
  canManagePesertaStatus,
  canWritePeserta,
  extractCancelAlasan,
  formatPesertaDateID,
  hewanSlotLabel,
  pesertaDisplayNama,
  statusPendaftaranBadgeClass,
  statusPendaftaranLabel,
  sumberPendaftaranLabel,
  tipeQurbanBadgeClass,
  tipeQurbanLabel,
  type QurbanPeserta,
} from '@/lib/qurban/peserta-display';
import type { AuditEntry } from '@/lib/api/audit-read';
import { AuditTimeline } from '@/components/qurban/AuditTimeline';
import { PesertaCancelModal } from '@/components/qurban/PesertaCancelModal';

/**
 * /qurban/peserta/[id] detail view (PS3).
 *
 * Enriches the raw PS3 row with muqorib identity (M3) and the hewan label (H3),
 * then groups the fields like the Muqorib detail page, with the A3 audit
 * timeline (PS-AUDIT). F4c-D adds role-gated write actions: Edit (SA·AQ·PD →
 * PS4), Tandai BATAL & Refresh Harga (SA·AQ → PS5/PS7), shown only while the
 * row is TERDAFTAR.
 */

interface Props {
  edisiId: string;
  pesertaId: string;
}

export function PesertaDetail({ edisiId, pesertaId }: Props) {
  const { me } = useMe();
  const { toast } = useToast();

  const [peserta, setPeserta] = useState<QurbanPeserta | null>(null);
  const [muqoribNama, setMuqoribNama] = useState('');
  const [muqoribNoHp, setMuqoribNoHp] = useState('');
  const [hewanLabel, setHewanLabel] = useState('');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const listHref = `/qurban/peserta?edisi=${encodeURIComponent(edisiId)}`;
  const edisiParam = `edisi_id=${encodeURIComponent(edisiId)}`;

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setNotFound(false);
    setAuditError(null);
    try {
      const res = await fetch(
        `/api/qurban/peserta/${pesertaId}?${edisiParam}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok || !json?.ok) {
        setErrorMessage(json?.error?.message || 'Gagal memuat detail.');
        return;
      }
      const p = json.data as QurbanPeserta;
      setPeserta(p);

      const [muqoribRes, hewanRes, auditRes] = await Promise.all([
        fetch(`/api/qurban/muqorib/${p.muqorib_id}`),
        fetch(`/api/qurban/hewan/${p.hewan_id}?${edisiParam}`),
        fetch(`/api/qurban/peserta/${pesertaId}/audit?${edisiParam}`),
      ]);

      const muqoribJson = await muqoribRes.json().catch(() => ({}));
      if (muqoribRes.ok && muqoribJson?.ok) {
        setMuqoribNama(muqoribJson.data.muqorib?.nama_lengkap || '');
        setMuqoribNoHp(muqoribJson.data.muqorib?.no_hp || '');
      }

      const hewanJson = await hewanRes.json().catch(() => ({}));
      const namaDisplay =
        hewanRes.ok && hewanJson?.ok ? hewanJson.data?.nama_display : undefined;
      setHewanLabel(hewanSlotLabel(namaDisplay, p.slot_number, p.hewan_id));

      const auditJson = await auditRes.json().catch(() => ({}));
      if (auditRes.ok && auditJson?.ok) {
        setAudit((auditJson.data as AuditEntry[]) || []);
      } else {
        setAuditError('Gagal memuat riwayat perubahan.');
      }
    } catch {
      setErrorMessage('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [pesertaId, edisiParam]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleRefreshHarga = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/qurban/peserta/${pesertaId}/refresh-harga?${edisiParam}`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        const { harga_lama, harga_baru } = json.data as { harga_lama: number; harga_baru: number };
        toast(
          harga_baru === harga_lama
            ? 'Harga sudah sesuai master — tidak ada perubahan.'
            : `Harga diperbarui: ${formatRupiah(harga_lama)} → ${formatRupiah(harga_baru)}.`,
          'success'
        );
        setShowRefresh(false);
        fetchDetail();
      } else {
        toast(json?.error?.message || 'Gagal me-refresh harga.', 'error');
        setShowRefresh(false);
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
      setShowRefresh(false);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <Loading className="my-8" />;

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb listHref={listHref} nama="Tidak ditemukan" />
        <PageTitle title="Detail Peserta" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">Peserta tidak ditemukan.</p>
            <Link
              href={listHref}
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke daftar
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (errorMessage || !peserta) {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb listHref={listHref} nama="—" />
        <PageTitle title="Detail Peserta" />
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

  const displayNama = pesertaDisplayNama(peserta.nama_atas_nama, muqoribNama);
  const isTerdaftar = peserta.status_pendaftaran === 'TERDAFTAR';
  const isBatal = peserta.status_pendaftaran === 'BATAL';
  const canEdit = canWritePeserta(me?.user.peran) && isTerdaftar;
  const canStatus = canManagePesertaStatus(me?.user.peran) && isTerdaftar;
  const cancelAlasan = isBatal ? extractCancelAlasan(audit) : '';

  return (
    <div className="max-w-2xl mx-auto">
      <Breadcrumb listHref={listHref} nama={displayNama} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <PageTitle title={displayNama} subtitle="Detail peserta qurban" />
        <span className={statusPendaftaranBadgeClass(peserta.status_pendaftaran)}>
          {statusPendaftaranLabel(peserta.status_pendaftaran)}
        </span>
      </div>

      {/* Identitas muqorib */}
      <Section title="Identitas Muqorib">
        <Row label="Nama Muqorib" value={muqoribNama || '—'} />
        <Row
          label="No. HP"
          value={muqoribNoHp ? <span className="font-mono">{muqoribNoHp}</span> : '—'}
        />
        {peserta.nama_atas_nama && (
          <Row label="Atas Nama" value={peserta.nama_atas_nama} />
        )}
      </Section>

      {/* Detail qurban */}
      <Section title="Detail Qurban">
        <Row
          label="Tipe Qurban"
          value={
            <span className={tipeQurbanBadgeClass(peserta.tipe_qurban)}>
              {tipeQurbanLabel(peserta.tipe_qurban)}
            </span>
          }
        />
        <Row label="Hewan & Slot" value={hewanLabel} />
        {peserta.keterangan_bagian && (
          <Row label="Keterangan Bagian" value={peserta.keterangan_bagian} />
        )}
      </Section>

      {/* Pembayaran */}
      <Section title="Pembayaran">
        <Row label="Harga Disepakati" value={formatRupiah(peserta.harga_disepakati)} />
        <Row
          label="Kode Bayar"
          value={<span className="font-mono">{peserta.kode_bayar}</span>}
        />
      </Section>

      {/* Pendaftaran */}
      <Section title="Pendaftaran">
        <Row label="Sumber" value={sumberPendaftaranLabel(peserta.sumber_pendaftaran)} />
        <Row
          label="Status"
          value={
            <span className={statusPendaftaranBadgeClass(peserta.status_pendaftaran)}>
              {statusPendaftaranLabel(peserta.status_pendaftaran)}
            </span>
          }
        />
        <Row label="Tanggal Daftar" value={formatPesertaDateID(peserta.tanggal_daftar)} />
        {isBatal && (
          <Row
            label="Alasan Pembatalan"
            value={<span className="text-red-700">{cancelAlasan || '—'}</span>}
          />
        )}
        {peserta.notes && <Row label="Catatan" value={peserta.notes} />}
      </Section>

      {/* Aksi (D2) */}
      {(canEdit || canStatus) && (
        <Card className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Aksi</h2>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {canEdit && (
              <Link href={`/qurban/peserta/${peserta.id}/edit?edisi=${encodeURIComponent(edisiId)}`}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  Edit
                </Button>
              </Link>
            )}
            {canStatus && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowRefresh(true)}
                  className="w-full sm:w-auto"
                >
                  Refresh Harga
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowCancel(true)}
                  className="w-full sm:w-auto"
                >
                  Tandai BATAL
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Metadata */}
      <Section title="Metadata">
        <Row
          label="Dibuat"
          value={
            <span className="text-gray-700">
              {formatTimestamp(peserta.created_at)}
              {peserta.created_by && (
                <span className="text-gray-400 text-xs ml-1.5">
                  oleh{' '}
                  {peserta.created_by === 'SYSTEM_BOOTSTRAP'
                    ? 'SYSTEM'
                    : peserta.created_by}
                </span>
              )}
            </span>
          }
        />
        <Row label="Diperbarui" value={formatTimestamp(peserta.updated_at)} />
      </Section>

      {/* Riwayat Perubahan (A3) */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Riwayat Perubahan
        </h2>
        <AuditTimeline entries={audit} error={auditError} />
      </Card>

      {/* Aksi tulis (D2) */}
      <PesertaCancelModal
        open={showCancel}
        edisiId={edisiId}
        pesertaId={peserta.id}
        onClose={() => setShowCancel(false)}
        onSuccess={() => {
          setShowCancel(false);
          fetchDetail();
        }}
      />
      <ConfirmDialog
        open={showRefresh}
        title="Refresh Harga"
        message="Terapkan harga master terkini ke harga disepakati peserta ini? Nilai yang sudah dibekukan akan diperbarui."
        confirmLabel="Refresh Harga"
        variant="primary"
        loading={refreshing}
        onConfirm={handleRefreshHarga}
        onCancel={() => setShowRefresh(false)}
      />
    </div>
  );
}

function Breadcrumb({ listHref, nama }: { listHref: string; nama: string }) {
  return (
    <nav className="flex items-center flex-wrap gap-1.5 text-sm text-gray-500 mb-2" aria-label="Breadcrumb">
      <Link href="/qurban" className="hover:text-emerald-700">
        Qurban
      </Link>
      <Chevron />
      <Link href={listHref} className="hover:text-emerald-700">
        Peserta
      </Link>
      <Chevron />
      <span className="text-gray-700 font-medium truncate max-w-[12rem]">{nama}</span>
    </nav>
  );
}

function Chevron() {
  return (
    <svg
      className="w-3.5 h-3.5 text-gray-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">{title}</h2>
      <dl className="divide-y divide-gray-100">{children}</dl>
    </Card>
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
