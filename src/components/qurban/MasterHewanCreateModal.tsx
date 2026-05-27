'use client';

import { useState, FormEvent } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { JENIS_OPTIONS, KELAS_OPTIONS } from '@/lib/qurban/master-hewan-display';
import { kapasitasSlotForJenis } from '@/lib/qurban/validators';

/**
 * MasterHewanCreateModal — "Tambah Tipe" for the Master Tipe tab (MH2).
 *
 * POST /api/qurban/master-hewan?edisi_id=… with {jenis, kelas, kapasitas_slot,
 * harga_beli, harga_bawa_sendiri}. Maps DUPLICATE_MASTER_HEWAN,
 * BUSINESS_EDISI_LOCKED, and VALIDATION_FAILED (details.errors[]) to fields.
 */

interface FormErrors {
  jenis?: string;
  kelas?: string;
  kapasitas_slot?: string;
  harga_beli?: string;
  harga_bawa_sendiri?: string;
  form?: string;
}

const FIELD_KEYS = [
  'jenis',
  'kelas',
  'kapasitas_slot',
  'harga_beli',
  'harga_bawa_sendiri',
] as const;

interface Props {
  open: boolean;
  edisiId: string;
  onSuccess: () => void;
  onClose: () => void;
}

const selectClass = (hasError: boolean) =>
  cn(
    'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white',
    'focus:outline-none focus:ring-2',
    hasError
      ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
  );

export function MasterHewanCreateModal({ open, edisiId, onSuccess, onClose }: Props) {
  const { toast } = useToast();
  const [jenis, setJenis] = useState('');
  const [kelas, setKelas] = useState('');
  const [hargaBeli, setHargaBeli] = useState<number | null>(null);
  const [hargaBawa, setHargaBawa] = useState<number | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Kapasitas slot adalah konstanta yang diturunkan dari jenis (Kambing 1,
  // Sapi 7) — read-only, tidak diisi manual.
  const kapasitasSlot = jenis ? kapasitasSlotForJenis(jenis) ?? null : null;

  const reset = () => {
    setJenis('');
    setKelas('');
    setHargaBeli(null);
    setHargaBawa(null);
    setErrors({});
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const clearError = (field: keyof FormErrors) =>
    setErrors((s) => ({ ...s, [field]: undefined, form: undefined }));

  const applyServerErrors = (
    code: string,
    message: string,
    details: {
      field?: string;
      errors?: { field: string; message: string }[];
      jenis?: string;
      kelas?: string;
    }
  ) => {
    if (code === 'DUPLICATE_MASTER_HEWAN') {
      setErrors({
        form: `Tipe ${details.jenis ?? jenis} kelas ${details.kelas ?? kelas} sudah ada untuk edisi ini.`,
      });
      return;
    }
    if (code === 'BUSINESS_EDISI_LOCKED') {
      setErrors({ form: message || 'Edisi sudah SELESAI — tidak dapat menambah tipe.' });
      return;
    }
    if (code === 'VALIDATION_FAILED') {
      const next: FormErrors = {};
      const list = Array.isArray(details.errors) ? details.errors : [];
      if (list.length > 0) {
        for (const e of list) {
          if ((FIELD_KEYS as readonly string[]).includes(e.field)) {
            next[e.field as keyof FormErrors] = e.message;
          } else {
            next.form = e.message;
          }
        }
      } else if (details.field && (FIELD_KEYS as readonly string[]).includes(details.field)) {
        next[details.field as keyof FormErrors] = message;
      } else {
        next.form = message;
      }
      setErrors(next);
      return;
    }
    toast(message || 'Gagal menyimpan. Coba lagi.', 'error');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors: FormErrors = {};
    if (!jenis) newErrors.jenis = 'Jenis wajib dipilih.';
    if (!kelas) newErrors.kelas = 'Kelas wajib dipilih.';
    if (jenis && kapasitasSlot == null) {
      newErrors.jenis = 'Jenis tidak dikenal — kapasitas slot tidak dapat ditentukan.';
    }
    if (hargaBeli == null || hargaBeli < 0) {
      newErrors.harga_beli = 'Harga beli wajib diisi (≥ 0).';
    }
    if (hargaBawa == null || hargaBawa < 0) {
      newErrors.harga_bawa_sendiri = 'Harga bawa sendiri wajib diisi (≥ 0).';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/master-hewan?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jenis,
            kelas,
            kapasitas_slot: kapasitasSlot,
            harga_beli: hargaBeli,
            harga_bawa_sendiri: hargaBawa,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        toast('Tipe hewan ditambahkan.', 'success');
        reset();
        onSuccess();
        return;
      }

      applyServerErrors(
        (json?.error?.code as string) || 'INTERNAL_ERROR',
        (json?.error?.message as string) || 'Terjadi kesalahan.',
        (json?.error?.details ?? {}) as {
          field?: string;
          errors?: { field: string; message: string }[];
          jenis?: string;
          kelas?: string;
        }
      );
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Tambah Tipe Hewan">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Jenis */}
          <div>
            <label htmlFor="mh-jenis" className="block text-sm font-medium text-gray-700 mb-1">
              Jenis
            </label>
            <select
              id="mh-jenis"
              value={jenis}
              onChange={(e) => {
                setJenis(e.target.value);
                clearError('jenis');
                clearError('kapasitas_slot');
              }}
              disabled={submitting}
              required
              className={selectClass(!!errors.jenis)}
            >
              <option value="">— Pilih jenis —</option>
              {JENIS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {errors.jenis && <p className="mt-1 text-sm text-red-600">{errors.jenis}</p>}
          </div>

          {/* Kelas */}
          <div>
            <label htmlFor="mh-kelas" className="block text-sm font-medium text-gray-700 mb-1">
              Kelas
            </label>
            <select
              id="mh-kelas"
              value={kelas}
              onChange={(e) => {
                setKelas(e.target.value);
                clearError('kelas');
              }}
              disabled={submitting}
              required
              className={selectClass(!!errors.kelas)}
            >
              <option value="">— Pilih kelas —</option>
              {KELAS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {errors.kelas && <p className="mt-1 text-sm text-red-600">{errors.kelas}</p>}
          </div>
        </div>

        {/* Kapasitas slot — terkunci, diturunkan dari jenis (Kambing 1, Sapi 7) */}
        <div>
          <label htmlFor="mh-kapasitas" className="block text-sm font-medium text-gray-700 mb-1">
            Kapasitas Slot
          </label>
          <input
            id="mh-kapasitas"
            type="text"
            value={kapasitasSlot ?? ''}
            readOnly
            disabled
            aria-readonly="true"
            placeholder="Pilih jenis dahulu"
            className={cn(
              'block w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm',
              'text-gray-700 placeholder:text-gray-400 cursor-not-allowed'
            )}
          />
          <p className="mt-1 text-xs text-gray-500">
            Otomatis dari jenis &mdash; Kambing 1, Sapi 7. Tidak dapat diubah.
          </p>
          {errors.kapasitas_slot && (
            <p className="mt-1 text-sm text-red-600">{errors.kapasitas_slot}</p>
          )}
        </div>

        {/* Harga */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CurrencyInput
            label="Harga Beli"
            value={hargaBeli}
            onChange={(v) => {
              setHargaBeli(v);
              clearError('harga_beli');
            }}
            error={errors.harga_beli}
            placeholder="0"
            disabled={submitting}
          />
          <CurrencyInput
            label="Harga Bawa Sendiri"
            value={hargaBawa}
            onChange={(v) => {
              setHargaBawa(v);
              clearError('harga_bawa_sendiri');
            }}
            error={errors.harga_bawa_sendiri}
            placeholder="0"
            disabled={submitting}
          />
        </div>

        {errors.form && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {errors.form}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan Tipe'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
