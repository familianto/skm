'use client';

import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';

import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';
import { normalizePhone, validatePhone } from '@/lib/api/phone';

/**
 * E5 — /pengaturan/anggota/[id]/edit
 *
 * Edit nama, telepon, peran. PIN goes through the Reset PIN flow (E4
 * ResetPinModal). is_active toggles go through the Deactivate / Reactivate
 * modals (E4). Email is not editable in F1 — schema supports it but the
 * F1 UI didn't surface email-only editing as a top requirement.
 *
 * Pre-fill: GET U3, populate the three fields. Submit button stays disabled
 * until at least one field differs from the original.
 *
 * Server errors mapped (per E5 spec):
 *   400 VALIDATION_FAILED       → inline by details.field
 *   404 NOT_FOUND               → toast + redirect to list
 *   409 DUPLICATE_TELEPON       → inline on telepon
 *   422 BUSINESS_LAST_SUPER_ADMIN → toast (peran change blocked)
 *
 * SA guard: useMe() — middleware also enforces but UI shows a defensive
 * "Akses ditolak" card if the hook resolves to a non-SA session.
 */

const FALLBACK_ROLES: RoleOption[] = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'BENDAHARA', label: 'Bendahara' },
  { value: 'ADMIN_QURBAN', label: 'Admin Qurban' },
  { value: 'PENDAFTARAN', label: 'Pendaftaran' },
  { value: 'DISTRIBUSI', label: 'Distribusi' },
];

interface RoleOption {
  value: string;
  label: string;
}

interface AnggotaDetail {
  id: string;
  nama: string;
  telepon: string;
  email: string;
  peran: string;
  is_active: boolean;
}

interface FormErrors {
  nama?: string;
  telepon?: string;
  peran?: string;
  form?: string;
}

export default function AnggotaEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();
  const anggotaId = params?.id || '';

  // Initial fetch
  const [original, setOriginal] = useState<AnggotaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Form fields
  const [nama, setNama] = useState('');
  const [telepon, setTelepon] = useState('');
  const [peran, setPeran] = useState('');

  // Form state
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>(FALLBACK_ROLES);

  // Fetch roles dropdown (U9) — silent fallback to hardcoded
  useEffect(() => {
    let cancelled = false;
    fetch('/api/pengaturan/anggota/roles')
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: RoleOption[] }
          | null;
        if (cancelled) return;
        if (json?.ok && Array.isArray(json.data)) {
          setRoles(json.data.map((r) => ({ value: r.value, label: r.label })));
        }
      })
      .catch(() => {
        // silent fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the anggota record to pre-fill
  const fetchAnggota = useCallback(async () => {
    if (!anggotaId) return;
    setLoading(true);
    setFetchError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/pengaturan/anggota/${anggotaId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        const data = json.data as AnggotaDetail;
        setOriginal(data);
        setNama(data.nama);
        setTelepon(data.telepon);
        setPeran(data.peran);
      } else if (res.status === 404) {
        setNotFound(true);
      } else {
        setFetchError(json?.error?.message || 'Gagal memuat detail anggota.');
      }
    } catch {
      setFetchError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [anggotaId]);

  useEffect(() => {
    fetchAnggota();
  }, [fetchAnggota]);

  // Live telepon preview — only show when value differs from original
  const teleponPreview = useMemo(() => {
    if (!original) return null;
    const trimmed = telepon.trim();
    if (!trimmed) return null;
    const normalized = normalizePhone(trimmed);
    if (normalized === original.telepon) return null; // unchanged
    if (!validatePhone(normalized)) return null;
    return normalized;
  }, [telepon, original]);

  // Dirty detection — at least one field differs after normalization
  const isDirty = useMemo(() => {
    if (!original) return false;
    const teleponNormalized = normalizePhone(telepon.trim());
    return (
      nama.trim() !== original.nama ||
      teleponNormalized !== original.telepon ||
      peran !== original.peran
    );
  }, [nama, telepon, peran, original]);

  const clearError = (field: keyof FormErrors) =>
    setErrors((s) => ({ ...s, [field]: undefined, form: undefined }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!original) return;

    // Client-side validation
    const newErrors: FormErrors = {};
    const namaTrim = nama.trim();
    if (namaTrim.length < 2) newErrors.nama = 'Nama wajib diisi (min. 2 karakter)';
    else if (namaTrim.length > 80) newErrors.nama = 'Nama maksimal 80 karakter';

    const teleponNormalized = normalizePhone(telepon.trim());
    if (!telepon.trim()) newErrors.telepon = 'Telepon wajib diisi';
    else if (!validatePhone(teleponNormalized))
      newErrors.telepon = 'Format nomor tidak valid';

    if (!peran) newErrors.peran = 'Peran wajib dipilih';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/pengaturan/anggota/${anggotaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: namaTrim,
          telepon: teleponNormalized,
          peran,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        toast('Perubahan disimpan.', 'success');
        router.push(`/pengaturan/anggota/${anggotaId}`);
        router.refresh();
        return;
      }

      const code = (json?.error?.code as string) || 'INTERNAL_ERROR';
      const message = (json?.error?.message as string) || 'Terjadi kesalahan.';
      const details = (json?.error?.details ?? {}) as { field?: string };

      if (code === 'DUPLICATE_TELEPON') {
        setErrors({ telepon: 'Nomor sudah dipakai anggota aktif lain' });
      } else if (code === 'BUSINESS_LAST_SUPER_ADMIN') {
        toast(
          'Tidak bisa ubah peran: ini Super Admin terakhir yang aktif. Tunjuk Super Admin lain dulu.',
          'error'
        );
      } else if (code === 'VALIDATION_FORMAT' && details.field === 'telepon') {
        setErrors({ telepon: 'Format nomor tidak valid' });
      } else if (code === 'VALIDATION_FAILED') {
        const fieldErrors: FormErrors = {};
        const field = details.field as keyof FormErrors | undefined;
        if (field === 'nama' || field === 'telepon' || field === 'peran') {
          fieldErrors[field] = message;
        } else {
          fieldErrors.form = message;
        }
        setErrors(fieldErrors);
      } else if (code === 'NOT_FOUND') {
        toast('Anggota tidak ditemukan.', 'error');
        router.push('/pengaturan/anggota');
      } else if (code === 'FORBIDDEN_ROLE') {
        toast('Hanya Super Admin yang dapat mengubah anggota.', 'error');
        router.push('/');
      } else {
        toast('Gagal menyimpan. Coba lagi.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── render states ────────────────────────────────────────────────

  if (meLoading || loading) return <Loading className="my-8" />;

  // Defensive non-SA fallback
  if (me && !me.permissions.can_manage_anggota) {
    return (
      <div>
        <PageTitle title="Edit Anggota" />
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
      <div className="max-w-lg mx-auto">
        <Link
          href="/pengaturan/anggota"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
        >
          <ArrowLeftIcon />
          Kembali ke Daftar Anggota
        </Link>
        <PageTitle title="Edit Anggota" />
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

  // Fetch error fallback
  if (fetchError || !original) {
    return (
      <div className="max-w-lg mx-auto">
        <Link
          href="/pengaturan/anggota"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
        >
          <ArrowLeftIcon />
          Kembali ke Daftar Anggota
        </Link>
        <PageTitle title="Edit Anggota" />
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-3">
              {fetchError || 'Gagal memuat data.'}
            </p>
            <Button variant="secondary" onClick={fetchAnggota}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href={`/pengaturan/anggota/${anggotaId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
      >
        <ArrowLeftIcon />
        Kembali ke Detail Anggota
      </Link>

      <PageTitle title="Edit Profil" subtitle={original.nama} />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Nama */}
          <Input
            label="Nama"
            value={nama}
            onChange={(e) => {
              setNama(e.target.value);
              clearError('nama');
            }}
            error={errors.nama}
            placeholder="Nama lengkap anggota"
            autoComplete="name"
            maxLength={80}
            disabled={submitting}
            required
          />

          {/* Telepon */}
          <div>
            <Input
              label="Telepon"
              value={telepon}
              onChange={(e) => {
                setTelepon(e.target.value);
                clearError('telepon');
              }}
              error={errors.telepon}
              placeholder="08xxx atau 628xxx"
              inputMode="tel"
              autoComplete="tel"
              disabled={submitting}
              required
            />
            {teleponPreview && !errors.telepon && (
              <p className="text-xs text-gray-500 mt-1">
                Akan disimpan: <span className="font-mono">{teleponPreview}</span>
              </p>
            )}
          </div>

          {/* Peran */}
          <div>
            <label
              htmlFor="peran"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Peran
            </label>
            <select
              id="peran"
              value={peran}
              onChange={(e) => {
                setPeran(e.target.value);
                clearError('peran');
              }}
              disabled={submitting}
              required
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white',
                'focus:outline-none focus:ring-2',
                errors.peran
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
              )}
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {errors.peran && (
              <p className="mt-1 text-sm text-red-600">{errors.peran}</p>
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
            <Link href={`/pengaturan/anggota/${anggotaId}`}>
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
              disabled={submitting || !isDirty}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
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
                  Menyimpan...
                </span>
              ) : (
                'Simpan Perubahan'
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
