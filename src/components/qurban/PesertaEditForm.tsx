'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { type QurbanPeserta } from '@/lib/qurban/peserta-display';
import { composeBagian, parseBagian } from '@/lib/qurban/bagian-options';
import { BagianChecklist } from '@/components/qurban/BagianChecklist';

/**
 * F4c-D — /qurban/peserta/[id]/edit (PS4 PATCH).
 *
 * Edits the NON-STRUCTURAL fields of one peserta row (per the PS4 contract:
 * `nama_atas_nama`, `keterangan_bagian`, `notes`). Hewan/slot/tipe/jumlah/muqorib
 * are structural and NOT editable here (change = batalkan + daftar ulang).
 * Pre-fills from PS3; BATAL rows are read-only (PS4 rejects them).
 */

interface Props {
  edisiId: string;
  pesertaId: string;
}

export function PesertaEditForm({ edisiId, pesertaId }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const edisiParam = `edisi_id=${encodeURIComponent(edisiId)}`;
  const detailHref = `/qurban/peserta/${pesertaId}?edisi=${encodeURIComponent(edisiId)}`;

  const [peserta, setPeserta] = useState<QurbanPeserta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [namaAtasNama, setNamaAtasNama] = useState('');
  // Bagian hewan → checklist + Lainnya (string historis di-parse saat load).
  const [bagianSelected, setBagianSelected] = useState<string[]>([]);
  const [bagianLainnya, setBagianLainnya] = useState('');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/qurban/peserta/${pesertaId}?${edisiParam}`);
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok || !json?.ok) {
        setLoadError(json?.error?.message || 'Gagal memuat data peserta.');
        return;
      }
      const p = json.data as QurbanPeserta;
      setPeserta(p);
      setNamaAtasNama(p.nama_atas_nama || '');
      const bagian = parseBagian(p.keterangan_bagian || '');
      setBagianSelected(bagian.selected);
      setBagianLainnya(bagian.lainnya);
      setNotes(p.notes || '');
    } catch {
      setLoadError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [pesertaId, edisiParam]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleSubmit = async () => {
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/qurban/peserta/${pesertaId}?${edisiParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_atas_nama: namaAtasNama.trim(),
          keterangan_bagian: composeBagian(bagianSelected, bagianLainnya),
          notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Perubahan peserta disimpan.', 'success');
        router.push(detailHref);
        router.refresh();
        return;
      }

      const code = (json?.error?.code as string) || 'INTERNAL_ERROR';
      const message = (json?.error?.message as string) || 'Gagal menyimpan perubahan.';
      const details = (json?.error?.details ?? {}) as {
        errors?: { field: string; message: string }[];
      };
      if (code === 'VALIDATION_FAILED') {
        const next: Record<string, string> = {};
        for (const e of details.errors || []) next[e.field] = e.message;
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setFormError(message);
        return;
      }
      if (code === 'FORBIDDEN_ROLE') {
        toast('Anda tidak punya akses untuk mengubah peserta.', 'error');
        router.push(detailHref);
        return;
      }
      setFormError(message);
    } catch {
      setFormError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading className="my-8" />;

  if (notFound || loadError || !peserta) {
    return (
      <div className="max-w-lg mx-auto">
        <BackLink detailHref={detailHref} />
        <PageTitle title="Edit Peserta" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              {notFound ? 'Peserta tidak ditemukan.' : loadError || 'Gagal memuat data.'}
            </p>
            <Link href={detailHref} className="inline-block mt-4 text-emerald-600 hover:underline text-sm">
              Kembali ke detail
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // BATAL rows are historical — PS4 rejects edits.
  if (peserta.status_pendaftaran === 'BATAL') {
    return (
      <div className="max-w-lg mx-auto">
        <BackLink detailHref={detailHref} />
        <PageTitle title="Edit Peserta" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Peserta berstatus <strong>BATAL</strong> tidak dapat diubah.
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
      <BackLink detailHref={detailHref} />
      <PageTitle title="Edit Peserta" subtitle={`Kode bayar: ${peserta.kode_bayar}`} />

      <Card>
        <div className="space-y-4">
          <Input
            label="Atas Nama (opsional)"
            value={namaAtasNama}
            onChange={(e) => setNamaAtasNama(e.target.value)}
            error={fieldErrors.nama_atas_nama}
            placeholder="Kosongkan untuk pakai nama muqorib"
            disabled={submitting}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Keterangan Bagian <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <BagianChecklist
              selected={bagianSelected}
              lainnya={bagianLainnya}
              onChange={(sel, lain) => {
                setBagianSelected(sel);
                setBagianLainnya(lain);
              }}
              idPrefix="peserta-edit-bagian"
              disabled={submitting}
            />
            {fieldErrors.keterangan_bagian && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.keterangan_bagian}</p>
            )}
          </div>
          <div>
            <label htmlFor="peserta-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              id="peserta-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              rows={3}
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
                fieldErrors.notes ? 'border-red-300' : 'border-gray-300'
              )}
            />
            {fieldErrors.notes && <p className="mt-1 text-sm text-red-600">{fieldErrors.notes}</p>}
          </div>

          <p className="text-xs text-gray-400">
            Hewan, slot, tipe, dan muqorib tidak dapat diubah di sini. Untuk perubahan itu,
            batalkan lalu daftarkan ulang.
          </p>

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
            <Button type="button" onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
              {submitting ? 'Menyimpan…' : 'Simpan Perubahan'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BackLink({ detailHref }: { detailHref: string }) {
  return (
    <Link
      href={detailHref}
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Kembali ke Detail Peserta
    </Link>
  );
}
