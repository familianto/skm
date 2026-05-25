'use client';

import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import {
  canWriteDaftarHewan,
  hewanStatusBadgeClass,
  hewanStatusLabel,
  tipePembelianLabel,
  jenisLabel,
  isHewanTerminal,
  type DaftarHewanDetailData,
} from '@/lib/qurban/daftar-hewan-display';

interface Props {
  edisiId: string;
  hewanId: string;
}

export function HewanEditForm({ edisiId, hewanId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();

  const detailHref = `/qurban/hewan/${hewanId}?edisi=${encodeURIComponent(edisiId)}`;
  const listHref = `/qurban/hewan?tab=inventory&edisi=${encodeURIComponent(edisiId)}`;

  const [original, setOriginal] = useState<DaftarHewanDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [vendorNama, setVendorNama] = useState('');
  const [harga, setHarga] = useState<number | null>(null);
  const [tanggal, setTanggal] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isBawaSendiri = original?.tipe_pembelian === 'BAWA_SENDIRI';

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/qurban/hewan/${hewanId}?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        const data = json.data as DaftarHewanDetailData;
        setOriginal(data);
        setVendorNama(data.vendor_nama);
        setHarga(data.harga_beli_aktual);
        setTanggal(data.tanggal_pembelian || '');
        setNotes(data.notes);
      } else if (res.status === 404) {
        setNotFound(true);
      } else {
        setFetchError(json?.error?.message || 'Gagal memuat data hewan.');
      }
    } catch {
      setFetchError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [edisiId, hewanId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const isDirty = useMemo(() => {
    if (!original) return false;
    return (
      vendorNama.trim() !== original.vendor_nama ||
      (harga ?? 0) !== original.harga_beli_aktual ||
      tanggal !== (original.tanggal_pembelian || '') ||
      notes.trim() !== original.notes
    );
  }, [vendorNama, harga, tanggal, notes, original]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!original) return;
    setFormError(null);

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/hewan/${hewanId}?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor_nama: vendorNama.trim(),
            harga_beli_aktual: isBawaSendiri ? 0 : harga ?? 0,
            tanggal_pembelian: tanggal,
            notes: notes.trim(),
          }),
        }
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        toast('Perubahan disimpan.', 'success');
        router.push(detailHref);
        router.refresh();
        return;
      }

      const code = (json?.error?.code as string) || 'INTERNAL_ERROR';
      const message = (json?.error?.message as string) || 'Gagal menyimpan. Coba lagi.';
      if (code === 'NOT_FOUND') {
        toast('Hewan tidak ditemukan.', 'error');
        router.push(listHref);
        return;
      }
      if (code === 'FORBIDDEN_ROLE') {
        toast('Anda tidak punya akses untuk mengubah hewan.', 'error');
        router.push(detailHref);
        return;
      }
      // BUSINESS_HEWAN_TERMINAL / BUSINESS_EDISI_LOCKED / VALIDATION_FAILED
      setFormError(message);
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (meLoading || loading) return <Loading className="my-8" />;

  if (me && !canWriteDaftarHewan(me.user.peran)) {
    return (
      <div className="max-w-lg mx-auto">
        <BackLink href={detailHref} />
        <PageTitle title="Edit Hewan" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses untuk mengubah hewan.
            </p>
            <Link href={listHref} className="inline-block mt-4 text-emerald-600 hover:underline text-sm">
              Kembali ke Daftar Inventory
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto">
        <BackLink href={listHref} />
        <PageTitle title="Edit Hewan" />
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

  if (fetchError || !original) {
    return (
      <div className="max-w-lg mx-auto">
        <BackLink href={listHref} />
        <PageTitle title="Edit Hewan" />
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-3">{fetchError || 'Gagal memuat data.'}</p>
            <Button variant="secondary" onClick={fetchDetail}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Terminal hewan can't be edited — server rejects H4. Hide the form.
  if (isHewanTerminal(original.status)) {
    return (
      <div className="max-w-lg mx-auto">
        <BackLink href={detailHref} />
        <PageTitle title="Edit Hewan" subtitle={original.nama_display} />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Hewan berstatus {hewanStatusLabel(original.status)} tidak dapat diubah.
            </p>
            <Link href={detailHref} className="inline-block mt-4 text-emerald-600 hover:underline text-sm">
              Kembali ke detail
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <BackLink href={detailHref} />

      <div className="flex items-center gap-3 mb-4">
        <PageTitle title="Edit Hewan" subtitle={original.nama_display} />
        <span className={hewanStatusBadgeClass(original.status)}>
          {hewanStatusLabel(original.status)}
        </span>
      </div>

      {/* Read-only identity */}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-gray-500">Hewan</dt>
          <dd className="text-gray-900 text-right font-medium">{original.nama_display}</dd>
          <dt className="text-gray-500">Tipe Hewan</dt>
          <dd className="text-gray-900 text-right">
            {jenisLabel(original.jenis)} — Kelas {original.kelas}
          </dd>
          <dt className="text-gray-500">Tipe Pembelian</dt>
          <dd className="text-gray-900 text-right">{tipePembelianLabel(original.tipe_pembelian)}</dd>
        </dl>
        <p className="text-xs text-gray-400 mt-2">
          Tipe hewan, penomoran, tipe pembelian, dan status tidak dapat diubah di sini.
        </p>
      </Card>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Vendor (opsional)"
            value={vendorNama}
            onChange={(e) => setVendorNama(e.target.value)}
            placeholder="Nama vendor / penyedia"
            disabled={submitting}
          />

          <CurrencyInput
            label="Harga Beli Aktual"
            value={isBawaSendiri ? 0 : harga}
            onChange={(v) => setHarga(v)}
            disabled={submitting || isBawaSendiri}
          />
          {isBawaSendiri && (
            <p className="-mt-2 text-xs text-gray-500">Bawa Sendiri — harga beli tetap 0.</p>
          )}

          <div>
            <label htmlFor="tanggal_pembelian" className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Pembelian <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="tanggal_pembelian"
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              disabled={submitting}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan"
              disabled={submitting}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
            <Link href={detailHref}>
              <Button type="button" variant="secondary" disabled={submitting} className="w-full sm:w-auto">
                Batal
              </Button>
            </Link>
            <Button type="submit" disabled={submitting || !isDirty} className="w-full sm:w-auto">
              {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </form>
      </Card>
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
      Kembali
    </Link>
  );
}
