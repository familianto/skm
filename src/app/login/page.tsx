'use client';

import { Suspense, useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * /login — F1 multi-user login per Tahap 3.E §3.1 A1 + PROMPT_F01 §6.1.
 *
 * UI:
 *   - Telepon + PIN inputs (replaces the old PIN-only form).
 *   - Mobile-first; emerald primary; large touch targets for iPad.
 *
 * Error handling (response envelope { ok:false, error:{ code, message, details? }}):
 *   - 400 VALIDATION_FAILED / VALIDATION_FORMAT → inline message, focus offending field
 *   - 401 AUTH_INVALID                          → inline "Telepon/PIN salah" + remaining_attempts hint
 *   - 423 AUTH_LOCKED                           → countdown to details.locked_until
 *   - 429 RATE_LIMITED                          → countdown to details.retry_after_sec
 *
 * No localStorage — the server's `failed_attempts` + `locked_until` columns on
 * the anggota row are the source of truth. (Decision: drop the pre-F01
 * client-side lockout state which duplicated server state and could drift.)
 *
 * No Gmail SSO button — the legacy NextAuth path is not surfaced in F1 UI.
 */

interface ErrorDetails {
  locked_until?: string;
  retry_after_sec?: number;
  remaining_attempts?: number;
  field?: string;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m > 0) return `${m} menit ${s} detik`;
  return `${s} detik`;
}

export default function LoginPage() {
  // Next 16 requires useSearchParams() callers to be wrapped in Suspense so
  // the page can statically pre-render the shell.
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 h-[420px]" />
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || null;

  const [telepon, setTelepon] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  // Error state
  const [errorMessage, setErrorMessage] = useState('');
  const [errorField, setErrorField] = useState<'telepon' | 'pin' | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Lockout state (server-driven via 423 details.locked_until OR 429 retry_after_sec)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutReason, setLockoutReason] = useState<'account' | 'rate' | null>(null);
  const [countdown, setCountdown] = useState('');

  const isLocked = lockoutUntil !== null && lockoutUntil > Date.now();

  // Countdown tick
  useEffect(() => {
    if (!lockoutUntil) {
      setCountdown('');
      return;
    }
    const tick = () => {
      const remaining = lockoutUntil - Date.now();
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutReason(null);
        setCountdown('');
        setErrorMessage('');
        return;
      }
      setCountdown(formatCountdown(remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const resetErrors = () => {
    setErrorMessage('');
    setErrorField(null);
    setRemainingAttempts(null);
  };

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (isLocked || loading) return;

      resetErrors();
      setLoading(true);

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telepon, pin }),
        });
        const json = await res.json().catch(() => ({}));

        // Success
        if (res.ok && json?.ok) {
          const landing = redirectTarget || json.data?.landing_url || '/';
          router.push(landing);
          router.refresh();
          return;
        }

        // Error envelope: { ok:false, error:{ code, message, details? }}
        const code = json?.error?.code || 'INTERNAL_ERROR';
        const msg = json?.error?.message || 'Terjadi kesalahan. Coba lagi.';
        const details: ErrorDetails = json?.error?.details || {};

        if (code === 'AUTH_LOCKED' && details.locked_until) {
          const until = new Date(details.locked_until).getTime();
          if (!isNaN(until) && until > Date.now()) {
            setLockoutUntil(until);
            setLockoutReason('account');
            setErrorMessage(msg);
            setPin('');
            return;
          }
        }

        if (code === 'RATE_LIMITED' && details.retry_after_sec) {
          setLockoutUntil(Date.now() + details.retry_after_sec * 1000);
          setLockoutReason('rate');
          setErrorMessage(msg);
          return;
        }

        if (code === 'VALIDATION_FORMAT' && details.field === 'telepon') {
          setErrorField('telepon');
          setErrorMessage(msg);
          return;
        }

        if (code === 'VALIDATION_FAILED') {
          if (details.field === 'telepon') setErrorField('telepon');
          else if (details.field === 'pin') setErrorField('pin');
          setErrorMessage(msg);
          return;
        }

        // AUTH_INVALID + others
        setErrorMessage(msg);
        if (typeof details.remaining_attempts === 'number') {
          setRemainingAttempts(details.remaining_attempts);
        }
        setPin('');
      } catch {
        setErrorMessage('Tidak dapat terhubung ke server. Coba lagi.');
      } finally {
        setLoading(false);
      }
    },
    [telepon, pin, isLocked, loading, redirectTarget, router]
  );

  const teleponBorder =
    errorField === 'telepon'
      ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500';

  const pinBorder =
    errorField === 'pin' || (remainingAttempts !== null && remainingAttempts <= 2)
      ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">SKM</h1>
            <p className="text-gray-500 text-sm mt-1">Sistem Keuangan Masjid</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Telepon */}
            <div>
              <label
                htmlFor="telepon"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Nomor Telepon
              </label>
              <input
                id="telepon"
                type="tel"
                inputMode="tel"
                autoComplete="username"
                value={telepon}
                onChange={(e) => {
                  setTelepon(e.target.value);
                  if (errorField === 'telepon') setErrorField(null);
                }}
                placeholder="08xx... atau 628xx..."
                disabled={isLocked || loading}
                className={`block w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 transition-colors ${teleponBorder} ${
                  isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                autoFocus
              />
            </div>

            {/* PIN */}
            <div>
              <label
                htmlFor="pin"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  if (errorField === 'pin') setErrorField(null);
                }}
                placeholder="4-6 digit angka"
                disabled={isLocked || loading}
                className={`block w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 transition-colors ${pinBorder} ${
                  isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Error / Warning */}
            {errorMessage && !isLocked && (
              <p className="text-red-600 text-sm" role="alert">
                {errorMessage}
              </p>
            )}

            {remainingAttempts !== null && remainingAttempts > 0 && !isLocked && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-amber-700 text-sm">
                  Sisa <span className="font-semibold">{remainingAttempts}</span>{' '}
                  percobaan sebelum akun dikunci.
                </p>
              </div>
            )}

            {/* Lockout banner */}
            {isLocked && countdown && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-red-700 text-sm font-semibold">
                    {lockoutReason === 'rate' ? 'Terlalu banyak permintaan' : 'Akun dikunci'}
                  </p>
                </div>
                <p className="text-red-600 text-sm">
                  Coba lagi dalam <span className="font-bold">{countdown}</span>.
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || isLocked || telepon.trim().length < 8 || pin.length < 4}
              className={`w-full py-3 rounded-lg font-medium text-base transition-colors ${
                isLocked
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {loading ? 'Memverifikasi...' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
