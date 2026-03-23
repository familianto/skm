'use client';

import { use, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageTitle } from '@/components/layout/page-title';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { VoidModal } from '@/components/forms/void-modal';
import { UploadBukti } from '@/components/forms/upload-bukti';
import { ImagePreview } from '@/components/ui/image-preview';
import { useTransaksiDetail } from '@/hooks/use-transaksi';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { useToast } from '@/components/ui/toast';
import { TransaksiJenis, TransaksiStatus } from '@/types';
import type { ApiResponse, Transaksi } from '@/types';
import { formatRupiah, formatTanggal, formatTimestamp } from '@/lib/utils';

export default function TransaksiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: transaksi, loading, error, refetch } = useTransaksiDetail(id);
  const { data: kategoris } = useKategori();
  const { data: rekenings } = useRekening();
  const { toast } = useToast();

  const [voidOpen, setVoidOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const kategoriNama = useMemo(() => {
    if (!transaksi) return '';
    return kategoris.find((k) => k.id === transaksi.kategori_id)?.nama || transaksi.kategori_id;
  }, [transaksi, kategoris]);

  const rekeningLabel = useMemo(() => {
    if (!transaksi) return '';
    const r = rekenings.find((r) => r.id === transaksi.rekening_id);
    return r ? `${r.nama_bank} - ${r.nomor_rekening}` : transaksi.rekening_id;
  }, [transaksi, rekenings]);

  const handleVoid = useCallback(async (reason: string) => {
    const res = await fetch(`/api/transaksi/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const json: ApiResponse<Transaksi> = await res.json();
    if (!json.success) throw new Error(json.error || 'Gagal void');
    toast('Transaksi berhasil di-void', 'success');
    await refetch();
  }, [id, toast, refetch]);

  const handleKoreksi = useCallback(() => {
    router.push(`/transaksi/baru?koreksi_dari=${id}`);
  }, [id, router]);

  const handleUploadSuccess = useCallback(async (buktiUrl: string) => {
    toast('Bukti berhasil diupload', 'success');
    setShowUpload(false);
    await refetch();
  }, [toast, refetch]);

  if (loading) return <Loading className="py-12" />;

  if (error || !transaksi) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{error || 'Transaksi tidak ditemukan'}</p>
        <Link href="/transaksi">
          <Button variant="secondary" className="mt-4">Kembali ke Daftar</Button>
        </Link>
      </div>
    );
  }

  const isAktif = transaksi.status === TransaksiStatus.AKTIF;

  return (
    <div>
      <PageTitle
        title="Detail Transaksi"
        subtitle={transaksi.id}
        action={
          isAktif ? (
            <div className="flex gap-2">
              <Link href={`/transaksi/${id}/edit`}>
                <Button>Edit</Button>
              </Link>
              <Button variant="secondary" onClick={handleKoreksi}>Koreksi</Button>
              <Button variant="danger" onClick={() => setVoidOpen(true)}>Void</Button>
            </div>
          ) : undefined
        }
      />

      <Card>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Tanggal</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatTanggal(transaksi.tanggal)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Jenis</dt>
            <dd className="mt-1"><Badge label={transaksi.jenis} /></dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Kategori</dt>
            <dd className="mt-1 text-sm text-gray-900">{kategoriNama}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Rekening</dt>
            <dd className="mt-1 text-sm text-gray-900">{rekeningLabel}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Deskripsi</dt>
            <dd className="mt-1 text-sm text-gray-900">{transaksi.deskripsi}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Jumlah</dt>
            <dd className={`mt-1 text-lg font-bold ${transaksi.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'}`}>
              {transaksi.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(transaksi.jumlah)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1"><Badge label={transaksi.status} /></dd>
          </div>

          {transaksi.status === TransaksiStatus.VOID && (
            <>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Alasan Void</dt>
                <dd className="mt-1 text-sm text-red-600">{transaksi.void_reason || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Tanggal Void</dt>
                <dd className="mt-1 text-sm text-gray-900">{transaksi.void_date ? formatTanggal(transaksi.void_date) : '-'}</dd>
              </div>
            </>
          )}

          {transaksi.koreksi_dari_id && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Koreksi dari</dt>
              <dd className="mt-1">
                <Link href={`/transaksi/${transaksi.koreksi_dari_id}`} className="text-sm text-emerald-600 hover:underline">
                  {transaksi.koreksi_dari_id}
                </Link>
              </dd>
            </div>
          )}

          {/* Bukti section */}
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500 mb-2">Bukti Transaksi</dt>
            <dd>
              {transaksi.bukti_url && !showUpload ? (
                <div className="space-y-2">
                  <div className="w-32 h-32">
                    <ImagePreview src={transaksi.bukti_url} alt="Bukti transaksi" />
                  </div>
                  <div className="flex gap-2">
                    <a href={transaksi.bukti_url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 hover:underline">
                      Lihat Bukti
                    </a>
                    {isAktif && (
                      <button onClick={() => setShowUpload(true)} className="text-sm text-emerald-600 hover:underline">
                        Ganti Bukti
                      </button>
                    )}
                  </div>
                </div>
              ) : showUpload || (!transaksi.bukti_url && isAktif) ? (
                <div>
                  <UploadBukti
                    transaksiId={transaksi.id}
                    currentBuktiUrl={transaksi.bukti_url || undefined}
                    onUploadSuccess={handleUploadSuccess}
                  />
                  {showUpload && (
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowUpload(false)}>
                      Batal
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Tidak ada bukti</p>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Dibuat oleh</dt>
            <dd className="mt-1 text-sm text-gray-900">{transaksi.created_by}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Dibuat pada</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatTimestamp(transaksi.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Terakhir diubah</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatTimestamp(transaksi.updated_at)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-4">
        <Link href="/transaksi">
          <Button variant="secondary">Kembali ke Daftar</Button>
        </Link>
      </div>

      <VoidModal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
        transaksiId={transaksi.id}
      />
    </div>
  );
}
