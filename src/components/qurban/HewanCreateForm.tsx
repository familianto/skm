'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
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
import { cn } from '@/lib/utils';
import {
  canWriteDaftarHewan,
  masterHewanOptionLabel,
} from '@/lib/qurban/daftar-hewan-display';
import type { MasterHewan } from '@/lib/qurban/master-hewan-display';

type TipePembelian = 'BELI' | 'BAWA_SENDIRI';
type StatusCreate = 'DRAFT' | 'AKTIF';

interface Props {
  edisiId: string;
}

export function HewanCreateForm({ edisiId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();

  const listHref = `/qurban/hewan?tab=inventory&edisi=${encodeURIComponent(edisiId)}`;

  const [masterList, setMasterList] = useState<MasterHewan[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);

  const [masterHewanId, setMasterHewanId] = useState('');
  const [tipePembelian, setTipePembelian] = useState<TipePembelian>('BELI');
  const [vendorNama, setVendorNama] = useState('');
  const [harga, setHarga] = useState<number | null>(null);
  const [tanggal, setTanggal] = useState('');
  const [status, setStatus] = useState<StatusCreate>('AKTIF');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedMaster = masterList.find((m) => m.id === masterHewanId) || null;
  const isBawaSendiri = tipePembelian === 'BAWA_SENDIRI';

  const fetchMaster = useCallback(async () => {
    setMasterLoading(true);
    try {
      const res = await fetch(
        `/api/qurban/master-hewan?edisi_id=${encodeURIComponent(edisiId)}&status=active`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setMasterList(json.data as MasterHewan[]);
      } else {
        toast(json?.error?.message || 'Gagal memuat daftar tipe hewan.', 'error');
      }
    } catch {
      toast('Gagal memuat daftar tipe hewan.', 'error');
    } finally {
      setMasterLoading(false);
    }
  }, [edisiId, toast]);

  useEffect(() => {
    fetchMaster();
  }, [fetchMaster]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!masterHewanId) {
      setFormError('Tipe hewan wajib dipilih.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/hewan?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            master_hewan_id: masterHewanId,
            tipe_pembelian: tipePembelian,
            vendor_nama: vendorNama.trim() || undefined,
            harga_beli_aktual: isBawaSendiri ? 0 : harga ?? 0,
            tanggal_pembelian: tanggal || undefined,
            status,
            notes: notes.trim() || undefined,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        toast(`Hewan ${json.data.nama_display} ditambahkan.`, 'success');
        router.push(`/qurban/hewan/${json.data.id}?edisi=${encodeURIComponent(edisiId)}`);
        router.refresh();
        return;
      }

      const code = (json?.error?.code as string) || 'INTERNAL_ERROR';
      const message = (json?.error?.message as string) || 'Gagal menyimpan. Coba lagi.';
      if (code === 'FORBIDDEN_ROLE') {
        toast('Anda tidak punya akses untuk menambah hewan.', 'error');
        router.push(listHref);
        return;
      }
      setFormError(message);
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (meLoading) return <Loading className="my-8" />;

  if (me && !canWriteDaftarHewan(me.user.peran)) {
    return (
      <div>
        <PageTitle title="Tambah Hewan" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses untuk menambah hewan.
            </p>
            <Link href={listHref} className="inline-block mt-4 text-emerald-600 hover:underline text-sm">
              Kembali ke Daftar Inventory
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
      >
        <ArrowLeftIcon />
        Kembali ke Daftar Inventory
      </Link>

      <PageTitle title="Tambah Hewan" subtitle="Catat satu ekor hewan fisik" />

      <Card>
        {masterLoading ? (
          <Loading className="my-6" />
        ) : masterList.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-600">
              Belum ada tipe hewan aktif untuk edisi ini. Tambahkan tipe di tab
              &ldquo;Master Tipe&rdquo; terlebih dahulu.
            </p>
            <Link href={listHref} className="inline-block mt-4 text-emerald-600 hover:underline text-sm">
              Kembali
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Tipe Hewan */}
            <div>
              <label htmlFor="master_hewan_id" className="block text-sm font-medium text-gray-700 mb-1">
                Tipe Hewan
              </label>
              <select
                id="master_hewan_id"
                value={masterHewanId}
                onChange={(e) => setMasterHewanId(e.target.value)}
                disabled={submitting}
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">— Pilih Tipe Hewan —</option>
                {masterList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {masterHewanOptionLabel(m)}
                  </option>
                ))}
              </select>
              {selectedMaster && (
                <p className="text-xs text-gray-500 mt-1">
                  Jenis & kelas serta kapasitas {selectedMaster.kapasitas_slot} slot disalin
                  otomatis dari tipe ini.
                </p>
              )}
            </div>

            {/* Tipe Pembelian */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-1">Tipe Pembelian</span>
              <div className="space-y-2">
                <RadioRow
                  name="tipe_pembelian"
                  checked={tipePembelian === 'BELI'}
                  onChange={() => setTipePembelian('BELI')}
                  disabled={submitting}
                  label="Beli"
                  hint="Hewan disediakan masjid."
                />
                <RadioRow
                  name="tipe_pembelian"
                  checked={tipePembelian === 'BAWA_SENDIRI'}
                  onChange={() => {
                    setTipePembelian('BAWA_SENDIRI');
                    setHarga(0);
                  }}
                  disabled={submitting}
                  label="Bawa Sendiri"
                  hint="Hewan dibawa muqorib; harga beli 0."
                />
              </div>
            </div>

            {/* Vendor */}
            <Input
              label="Vendor (opsional)"
              value={vendorNama}
              onChange={(e) => setVendorNama(e.target.value)}
              placeholder="Nama vendor / penyedia"
              disabled={submitting}
            />

            {/* Harga Beli Aktual */}
            <CurrencyInput
              label="Harga Beli Aktual"
              value={isBawaSendiri ? 0 : harga}
              onChange={(v) => setHarga(v)}
              disabled={submitting || isBawaSendiri}
            />
            {isBawaSendiri && (
              <p className="-mt-2 text-xs text-gray-500">
                Bawa Sendiri — harga beli dipaksa 0.
              </p>
            )}

            {/* Tanggal Pembelian */}
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

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusCreate)}
                disabled={submitting}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="AKTIF">AKTIF (dikonfirmasi)</option>
                <option value="DRAFT">DRAFT (direncanakan)</option>
              </select>
            </div>

            {/* Catatan */}
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
              <Link href={listHref}>
                <Button type="button" variant="secondary" disabled={submitting} className="w-full sm:w-auto">
                  Batal
                </Button>
              </Link>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? 'Menyimpan...' : 'Simpan Hewan'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function RadioRow({
  name,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer',
        checked ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-200 hover:bg-gray-50'
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 text-emerald-600 focus:ring-emerald-500"
      />
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
