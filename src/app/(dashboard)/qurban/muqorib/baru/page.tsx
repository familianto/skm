'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';
import { canWriteMuqorib, RT_OPTIONS } from '@/lib/qurban/muqorib-display';

/**
 * F03 Milestone D — /qurban/muqorib/baru (create form, M2).
 *
 * Mirrors the F01 anggota "baru" form. `no_hp` is sent as-is; the server
 * normalizes to 628…. On 201 we redirect straight to the new detail page.
 */

interface FormErrors {
  nama_lengkap?: string;
  alamat?: string;
  rt?: string;
  no_hp?: string;
  notes?: string;
  form?: string;
}

const FIELD_KEYS = ['nama_lengkap', 'alamat', 'rt', 'no_hp', 'notes'] as const;

export default function MuqoribBaruPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();

  const [namaLengkap, setNamaLengkap] = useState('');
  const [alamat, setAlamat] = useState('');
  const [rt, setRt] = useState('');
  const [noHp, setNoHp] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const clearError = (field: keyof FormErrors) =>
    setErrors((s) => ({ ...s, [field]: undefined, form: undefined }));

  const applyServerErrors = (
    code: string,
    message: string,
    details: { field?: string; errors?: { field: string; message: string }[] }
  ) => {
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
      } else if (
        details.field &&
        (FIELD_KEYS as readonly string[]).includes(details.field)
      ) {
        next[details.field as keyof FormErrors] = message;
      } else {
        next.form = message;
      }
      setErrors(next);
      return;
    }
    if (code === 'FORBIDDEN_ROLE') {
      toast('Anda tidak punya akses untuk menambah muqorib.', 'error');
      router.push('/qurban/muqorib');
      return;
    }
    toast(message || 'Gagal menyimpan. Coba lagi.', 'error');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors: FormErrors = {};
    if (!namaLengkap.trim()) newErrors.nama_lengkap = 'Nama lengkap wajib diisi.';
    if (!alamat.trim()) newErrors.alamat = 'Alamat wajib diisi.';
    if (!rt) newErrors.rt = 'RT wajib dipilih.';
    if (!noHp.trim()) newErrors.no_hp = 'No. HP wajib diisi.';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/qurban/muqorib', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_lengkap: namaLengkap.trim(),
          alamat: alamat.trim(),
          rt,
          no_hp: noHp.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        toast('Muqorib ditambahkan.', 'success');
        router.push(`/qurban/muqorib/${json.data.id}`);
        router.refresh();
        return;
      }

      applyServerErrors(
        (json?.error?.code as string) || 'INTERNAL_ERROR',
        (json?.error?.message as string) || 'Terjadi kesalahan.',
        (json?.error?.details ?? {}) as {
          field?: string;
          errors?: { field: string; message: string }[];
        }
      );
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (meLoading) return <Loading className="my-8" />;

  // Defensive: middleware lets read roles reach this page, but only write
  // roles can submit. Show an access card for read-only roles (e.g. BENDAHARA).
  if (me && !canWriteMuqorib(me.user.peran)) {
    return (
      <div>
        <PageTitle title="Tambah Muqorib" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses untuk menambah muqorib.
            </p>
            <Link
              href="/qurban/muqorib"
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke Daftar Muqorib
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href="/qurban/muqorib"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
      >
        <ArrowLeftIcon />
        Kembali ke Daftar Muqorib
      </Link>

      <PageTitle title="Tambah Muqorib" subtitle="Tambah jamaah qurban baru" />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Nama Lengkap */}
          <Input
            label="Nama Lengkap"
            value={namaLengkap}
            onChange={(e) => {
              setNamaLengkap(e.target.value);
              clearError('nama_lengkap');
            }}
            error={errors.nama_lengkap}
            placeholder="Nama lengkap muqorib"
            autoComplete="name"
            disabled={submitting}
            required
          />

          {/* Alamat */}
          <div>
            <label
              htmlFor="alamat"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Alamat
            </label>
            <textarea
              id="alamat"
              value={alamat}
              onChange={(e) => {
                setAlamat(e.target.value);
                clearError('alamat');
              }}
              placeholder="Alamat tempat tinggal"
              disabled={submitting}
              rows={2}
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none',
                'focus:outline-none focus:ring-2',
                errors.alamat
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
              )}
            />
            {errors.alamat && (
              <p className="mt-1 text-sm text-red-600">{errors.alamat}</p>
            )}
          </div>

          {/* RT */}
          <div>
            <label
              htmlFor="rt"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              RT
            </label>
            <select
              id="rt"
              value={rt}
              onChange={(e) => {
                setRt(e.target.value);
                clearError('rt');
              }}
              disabled={submitting}
              required
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white',
                'focus:outline-none focus:ring-2',
                errors.rt
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
              )}
            >
              <option value="">— Pilih RT —</option>
              {RT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {errors.rt && <p className="mt-1 text-sm text-red-600">{errors.rt}</p>}
          </div>

          {/* No. HP */}
          <div>
            <Input
              label="No. HP"
              value={noHp}
              onChange={(e) => {
                setNoHp(e.target.value);
                clearError('no_hp');
              }}
              error={errors.no_hp}
              placeholder="08xxx atau 628xxx"
              inputMode="tel"
              autoComplete="tel"
              disabled={submitting}
              required
            />
            {!errors.no_hp && (
              <p className="text-xs text-gray-500 mt-1">
                Format: <span className="font-mono">08xx…</span> atau{' '}
                <span className="font-mono">628xx…</span>
              </p>
            )}
          </div>

          {/* Catatan */}
          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                clearError('notes');
              }}
              placeholder="Catatan tambahan"
              disabled={submitting}
              rows={3}
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none',
                'focus:outline-none focus:ring-2',
                errors.notes
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
              )}
            />
            {errors.notes && (
              <p className="mt-1 text-sm text-red-600">{errors.notes}</p>
            )}
          </div>

          {/* Form-level error */}
          {errors.form && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errors.form}
            </p>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
            <Link href="/qurban/muqorib">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Batal
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Menyimpan...
                </span>
              ) : (
                'Simpan Muqorib'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
