'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
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
import { normalizePhone, validatePhone } from '@/lib/api/phone';
import { validatePin } from '@/lib/api/pin-policy';
import { PinOnceModal } from '@/components/anggota/PinOnceModal';

/**
 * E3 — /pengaturan/anggota/baru
 *
 * Create-anggota form. SUPER_ADMIN-only (middleware enforces; useMe()
 * defensive second layer). On U2 201, opens PinOnceModal and waits for
 * acknowledgement before navigating back to the list.
 *
 * Field → backend mapping:
 *   nama        → nama
 *   telepon     → telepon (normalized client-side, server re-normalizes)
 *   peran       → peran
 *   pin         → initial_pin   (NOTE: server contract field name)
 *
 * Roles dropdown: prefers GET /api/pengaturan/anggota/roles (U9) for SSOT,
 * falls back to hardcoded 5-enum list if the call fails.
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

interface FormErrors {
  nama?: string;
  telepon?: string;
  peran?: string;
  pin?: string;
  konfirmasi?: string;
  form?: string;
}

/**
 * Map backend `pin-policy` violation enum → Bahasa user-facing message.
 *
 * Backend enum (lib/api/pin-policy.ts):
 *   format    → out-of-range or non-numeric
 *   all_same  → 0000, 1111
 *   sequential→ 1234, 4321, 0123
 *   weak      → WEAK_BLOCKLIST (8686, 2580, ...)
 */
function pinViolationMessage(violation: string | undefined): string {
  switch (violation) {
    case 'format':
      return 'PIN harus 4-6 digit angka';
    case 'all_same':
      return 'PIN tidak boleh berulang (mis. 0000, 1111)';
    case 'sequential':
      return 'PIN tidak boleh berurutan (mis. 1234, 4321)';
    case 'weak':
      return 'PIN terlalu mudah ditebak';
    default:
      return 'PIN tidak memenuhi kebijakan';
  }
}

export default function AnggotaBaruPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading } = useMe();

  const [nama, setNama] = useState('');
  const [telepon, setTelepon] = useState('');
  const [peran, setPeran] = useState('');
  const [pin, setPin] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [showPin, setShowPin] = useState(false);

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>(FALLBACK_ROLES);

  const [createdData, setCreatedData] = useState<{
    nama: string;
    pin: string;
    telepon: string;
    peran: string;
  } | null>(null);

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
        // silent — fallback already set
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live telepon preview ("Akan disimpan: 628xxx")
  const teleponPreview = useMemo(() => {
    const trimmed = telepon.trim();
    if (!trimmed) return null;
    const normalized = normalizePhone(trimmed);
    if (!validatePhone(normalized)) return null;
    return normalized;
  }, [telepon]);

  const clearError = (field: keyof FormErrors) =>
    setErrors((s) => ({ ...s, [field]: undefined, form: undefined }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

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

    if (!pin) {
      newErrors.pin = 'PIN wajib diisi';
    } else {
      const policy = validatePin(pin);
      if (!policy.valid) newErrors.pin = pinViolationMessage(policy.violation);
    }

    if (!konfirmasi) newErrors.konfirmasi = 'Konfirmasi PIN wajib diisi';
    else if (konfirmasi !== pin)
      newErrors.konfirmasi = 'Konfirmasi tidak cocok dengan PIN';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/pengaturan/anggota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: namaTrim,
          telepon: teleponNormalized,
          peran,
          initial_pin: pin,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        // Open modal — wait for acknowledge before navigating away
        setCreatedData({
          nama: namaTrim,
          pin,
          telepon: teleponNormalized,
          peran,
        });
        return;
      }

      const code = (json?.error?.code as string) || 'INTERNAL_ERROR';
      const message = (json?.error?.message as string) || 'Terjadi kesalahan.';
      const details = (json?.error?.details ?? {}) as {
        field?: string;
        violation?: string;
      };

      if (code === 'VALIDATION_PIN_POLICY') {
        setErrors({ pin: pinViolationMessage(details.violation) });
      } else if (code === 'DUPLICATE_TELEPON') {
        setErrors({ telepon: 'Nomor sudah dipakai anggota aktif lain' });
      } else if (code === 'VALIDATION_FORMAT' && details.field === 'telepon') {
        setErrors({ telepon: 'Format nomor tidak valid' });
      } else if (code === 'VALIDATION_FAILED') {
        const fieldErrors: FormErrors = {};
        const field = details.field as keyof FormErrors | undefined;
        if (field && field in ({} as FormErrors)) {
          fieldErrors[field] = message;
        } else {
          fieldErrors.form = message;
        }
        setErrors(fieldErrors);
      } else if (code === 'FORBIDDEN_ROLE') {
        toast('Hanya Super Admin yang dapat menambah anggota.', 'error');
        router.push('/');
      } else if (code === 'RATE_LIMITED') {
        toast('Terlalu banyak permintaan. Coba lagi sebentar.', 'error');
      } else {
        toast('Gagal menyimpan. Coba lagi.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledgeModal = () => {
    setCreatedData(null);
    router.push('/pengaturan/anggota');
    router.refresh();
  };

  if (meLoading) return <Loading className="my-8" />;

  // Defensive non-SA fallback (middleware should already block)
  if (me && !me.permissions.can_manage_anggota) {
    return (
      <div>
        <PageTitle title="Tambah Anggota" />
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

  return (
    <div className="max-w-lg mx-auto">
      {/* Back link */}
      <Link
        href="/pengaturan/anggota"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
      >
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
        Kembali ke Daftar Anggota
      </Link>

      <PageTitle
        title="Tambah Anggota"
        subtitle="Buat akun pengurus baru dengan PIN awal"
      />

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
              <option value="">— Pilih peran —</option>
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

          {/* PIN */}
          <div>
            <label
              htmlFor="pin"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              PIN Awal
            </label>
            <div className="relative">
              <input
                id="pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  clearError('pin');
                }}
                onBlur={() => {
                  if (pin) {
                    const policy = validatePin(pin);
                    if (!policy.valid) {
                      setErrors((s) => ({
                        ...s,
                        pin: pinViolationMessage(policy.violation),
                      }));
                    }
                  }
                }}
                placeholder="4-6 digit angka"
                autoComplete="new-password"
                disabled={submitting}
                required
                className={cn(
                  'block w-full rounded-lg border px-3 py-2 pr-10 text-sm text-gray-900 placeholder:text-gray-400',
                  'focus:outline-none focus:ring-2',
                  errors.pin
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                tabIndex={-1}
                aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showPin ? (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {errors.pin && (
              <p className="mt-1 text-sm text-red-600">{errors.pin}</p>
            )}
            <ul className="mt-2 text-xs text-gray-500 space-y-0.5 list-disc list-inside">
              <li>4-6 digit angka</li>
              <li>Tidak boleh berurutan (1234, 4321) atau berulang (0000, 1111)</li>
              <li>PIN umum lemah (8686, 2580, dll) akan ditolak</li>
            </ul>
          </div>

          {/* Konfirmasi PIN */}
          <Input
            label="Konfirmasi PIN Awal"
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={6}
            value={konfirmasi}
            onChange={(e) => {
              setKonfirmasi(e.target.value.replace(/\D/g, ''));
              clearError('konfirmasi');
            }}
            error={errors.konfirmasi}
            placeholder="Ulangi PIN"
            autoComplete="new-password"
            disabled={submitting}
            required
          />

          {/* Form-level error */}
          {errors.form && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errors.form}
            </p>
          )}

          {/* Submit */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={submitting}
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
                  Membuat...
                </span>
              ) : (
                'Buat Anggota'
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* PIN-once modal */}
      {createdData && (
        <PinOnceModal
          open
          nama={createdData.nama}
          pin={createdData.pin}
          telepon={createdData.telepon}
          peran={createdData.peran}
          onAcknowledge={handleAcknowledgeModal}
        />
      )}
    </div>
  );
}
