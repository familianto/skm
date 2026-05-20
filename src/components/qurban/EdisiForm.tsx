'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

export interface EdisiFormValues {
  tahun_hijriah: string;
  tahun_masehi: string;
  tanggal_idul_adha: string;
  tanggal_pendaftaran_buka: string;
  tanggal_pendaftaran_tutup: string;
}

export interface EdisiCloneSource {
  id: string;
  tahun_hijriah: string;
}

interface Props {
  /** Mode determines submit endpoint + label. */
  mode: 'create' | 'edit';
  /** Existing edisi id (edit mode only). */
  edisiId?: string;
  /** Initial form values. */
  initial: EdisiFormValues;
  /**
   * Per-field editability. When omitted, all fields are editable (create
   * mode default). In edit mode pass `getEditableFields(status)` from the
   * caller so locked fields render disabled.
   */
  editableFields?: readonly string[];
  /** Show the clone-from section (create mode only). */
  cloneSources?: EdisiCloneSource[];
  /** Where to redirect on success. Receives the created/updated id. */
  onSuccessRedirect: (id: string) => string;
  /** Hint text shown above the form (status-derived in edit mode). */
  lockHint?: string;
}

export function EdisiForm({
  mode,
  edisiId,
  initial,
  editableFields,
  cloneSources,
  onSuccessRedirect,
  lockHint,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<EdisiFormValues>(initial);
  const [cloneFrom, setCloneFrom] = useState<string>('');
  const [cloneKonfigurasi, setCloneKonfigurasi] = useState(true);
  const [clonePanitia, setClonePanitia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(initial);
  }, [initial]);

  const isEditable = (field: keyof EdisiFormValues): boolean => {
    if (!editableFields) return true;
    return editableFields.includes(field);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const tahunMasehi = parseInt(values.tahun_masehi, 10);
      if (mode === 'create' && (!Number.isFinite(tahunMasehi) || tahunMasehi < 1900)) {
        setError('Tahun masehi tidak valid.');
        setSubmitting(false);
        return;
      }
      if (
        values.tanggal_pendaftaran_buka &&
        values.tanggal_pendaftaran_tutup &&
        values.tanggal_pendaftaran_buka > values.tanggal_pendaftaran_tutup
      ) {
        setError('Tanggal pendaftaran tutup harus ≥ tanggal pendaftaran buka.');
        setSubmitting(false);
        return;
      }

      let url = '/api/qurban/edisi';
      let method: 'POST' | 'PATCH' = 'POST';
      let payload: Record<string, unknown>;

      if (mode === 'create') {
        payload = {
          tahun_hijriah: values.tahun_hijriah.trim(),
          tahun_masehi: tahunMasehi,
          tanggal_idul_adha: values.tanggal_idul_adha,
          tanggal_pendaftaran_buka: values.tanggal_pendaftaran_buka,
          tanggal_pendaftaran_tutup: values.tanggal_pendaftaran_tutup,
        };
        if (cloneFrom) {
          payload.clone_from = cloneFrom;
          payload.clone_options = {
            konfigurasi: cloneKonfigurasi,
            panitia: clonePanitia,
          };
        }
      } else {
        if (!edisiId) {
          setError('ID edisi tidak diketahui.');
          setSubmitting(false);
          return;
        }
        url = `/api/qurban/edisi/${edisiId}`;
        method = 'PATCH';
        // Only send fields that the user can edit (server enforces too).
        const out: Record<string, unknown> = {};
        if (isEditable('tahun_hijriah') && values.tahun_hijriah !== initial.tahun_hijriah) {
          out.tahun_hijriah = values.tahun_hijriah.trim();
        }
        if (
          isEditable('tahun_masehi') &&
          values.tahun_masehi !== initial.tahun_masehi &&
          Number.isFinite(tahunMasehi)
        ) {
          out.tahun_masehi = tahunMasehi;
        }
        if (
          isEditable('tanggal_idul_adha') &&
          values.tanggal_idul_adha !== initial.tanggal_idul_adha
        ) {
          out.tanggal_idul_adha = values.tanggal_idul_adha;
        }
        if (
          isEditable('tanggal_pendaftaran_buka') &&
          values.tanggal_pendaftaran_buka !== initial.tanggal_pendaftaran_buka
        ) {
          out.tanggal_pendaftaran_buka = values.tanggal_pendaftaran_buka;
        }
        if (
          isEditable('tanggal_pendaftaran_tutup') &&
          values.tanggal_pendaftaran_tutup !== initial.tanggal_pendaftaran_tutup
        ) {
          out.tanggal_pendaftaran_tutup = values.tanggal_pendaftaran_tutup;
        }
        if (Object.keys(out).length === 0) {
          toast('Tidak ada perubahan untuk disimpan.', 'info');
          setSubmitting(false);
          return;
        }
        payload = out;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || 'Gagal menyimpan edisi.';
        setError(msg);
        toast(msg, 'error');
        setSubmitting(false);
        return;
      }

      toast(mode === 'create' ? 'Edisi berhasil dibuat.' : 'Edisi berhasil diperbarui.', 'success');
      router.push(onSuccessRedirect(json.data.id));
      router.refresh();
    } catch {
      setError('Gagal menyimpan edisi.');
      setSubmitting(false);
    }
  };

  return (
    <Card>
      {lockHint && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {lockHint}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Tahun Hijriah"
            placeholder="contoh: 1448H"
            value={values.tahun_hijriah}
            onChange={(e) =>
              setValues((v) => ({ ...v, tahun_hijriah: e.target.value }))
            }
            disabled={submitting || !isEditable('tahun_hijriah')}
            required
          />
          <Input
            label="Tahun Masehi"
            type="number"
            min={1900}
            max={3000}
            value={values.tahun_masehi}
            onChange={(e) =>
              setValues((v) => ({ ...v, tahun_masehi: e.target.value }))
            }
            disabled={submitting || !isEditable('tahun_masehi')}
            required
          />
        </div>

        <Input
          label="Tanggal Idul Adha"
          type="date"
          value={values.tanggal_idul_adha}
          onChange={(e) =>
            setValues((v) => ({ ...v, tanggal_idul_adha: e.target.value }))
          }
          disabled={submitting || !isEditable('tanggal_idul_adha')}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Pendaftaran Buka"
            type="date"
            value={values.tanggal_pendaftaran_buka}
            onChange={(e) =>
              setValues((v) => ({ ...v, tanggal_pendaftaran_buka: e.target.value }))
            }
            disabled={submitting || !isEditable('tanggal_pendaftaran_buka')}
            required
          />
          <Input
            label="Pendaftaran Tutup"
            type="date"
            value={values.tanggal_pendaftaran_tutup}
            onChange={(e) =>
              setValues((v) => ({ ...v, tanggal_pendaftaran_tutup: e.target.value }))
            }
            disabled={submitting || !isEditable('tanggal_pendaftaran_tutup')}
            required
          />
        </div>

        {mode === 'create' && cloneSources && cloneSources.length > 0 && (
          <div className="border-t pt-4 mt-4 space-y-3">
            <p className="text-sm font-medium text-gray-800">
              Salin dari edisi sebelumnya{' '}
              <span className="text-gray-500 font-normal">(opsional)</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Edisi Sumber
              </label>
              <select
                className={cn(
                  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                )}
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
                disabled={submitting}
              >
                <option value="">(Tidak menyalin)</option>
                {cloneSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.tahun_hijriah}
                  </option>
                ))}
              </select>
            </div>
            {cloneFrom && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cloneKonfigurasi}
                    onChange={(e) => setCloneKonfigurasi(e.target.checked)}
                    disabled={submitting}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Salin Konfigurasi edisi
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={clonePanitia}
                    onChange={(e) => setClonePanitia(e.target.checked)}
                    disabled={submitting}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Salin Panitia aktif
                </label>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? 'Menyimpan...'
              : mode === 'create'
              ? 'Buat Edisi'
              : 'Simpan Perubahan'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
