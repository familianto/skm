'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_THRESHOLD = 3;
const LS_KEY = 'skm_login_lockout';

interface LockoutState {
  attemptCount: number;
  lockoutUntil: number | null;
}

function getLockoutState(): LockoutState {
  if (typeof window === 'undefined') return { attemptCount: 0, lockoutUntil: null };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { attemptCount: 0, lockoutUntil: null };
    const state = JSON.parse(raw) as LockoutState;
    // Clear expired lockout
    if (state.lockoutUntil && state.lockoutUntil <= Date.now()) {
      localStorage.removeItem(LS_KEY);
      return { attemptCount: 0, lockoutUntil: null };
    }
    return state;
  } catch {
    return { attemptCount: 0, lockoutUntil: null };
  }
}

function saveLockoutState(state: LockoutState) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function clearLockoutState() {
  localStorage.removeItem(LS_KEY);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} menit ${seconds} detik`;
}

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState('');
  const [fadeIn, setFadeIn] = useState(false);

  const isLocked = lockoutUntil !== null && lockoutUntil > Date.now();
  const remainingAttempts = MAX_ATTEMPTS - attemptCount;
  const showWarning = attemptCount >= WARNING_THRESHOLD && !isLocked;

  // Initialize from localStorage on mount
  useEffect(() => {
    const state = getLockoutState();
    setAttemptCount(state.attemptCount);
    setLockoutUntil(state.lockoutUntil);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!lockoutUntil) {
      setCountdown('');
      return;
    }

    const tick = () => {
      const remaining = lockoutUntil - Date.now();
      if (remaining <= 0) {
        // Lockout expired
        setLockoutUntil(null);
        setAttemptCount(0);
        setCountdown('');
        setError('');
        clearLockoutState();
        setFadeIn(true);
        setTimeout(() => setFadeIn(false), 500);
        return;
      }
      setCountdown(formatCountdown(remaining));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked || loading) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (data.success) {
        clearLockoutState();
        router.push('/');
        return;
      }

      // Handle rate limiting response
      const responseData = data.data;
      if (responseData?.locked) {
        const until = responseData.lockoutUntil || Date.now() + LOCKOUT_DURATION_MS;
        setAttemptCount(MAX_ATTEMPTS);
        setLockoutUntil(until);
        saveLockoutState({ attemptCount: MAX_ATTEMPTS, lockoutUntil: until });
        setError('');
        setPin('');
      } else {
        const newCount = responseData?.attemptCount || attemptCount + 1;
        setAttemptCount(newCount);
        saveLockoutState({ attemptCount: newCount, lockoutUntil: null });
        setError(data.error || 'Login gagal.');
      }
    } catch {
      setError('Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [pin, isLocked, loading, attemptCount, router]);

  const inputBorderClass = showWarning
    ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
    : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">SKM</h1>
            <p className="text-gray-500 text-sm mt-1">Sistem Keuangan Masjid</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
                Masukkan PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="PIN 4-6 digit"
                disabled={isLocked}
                className={`block w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 transition-colors duration-300 ${inputBorderClass} ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''} ${fadeIn ? 'animate-pulse' : ''}`}
                autoFocus
              />
            </div>

            {/* Error message */}
            {error && !isLocked && (
              <p className="text-red-600 text-sm text-center mb-4 transition-opacity duration-300">
                {error}
              </p>
            )}

            {/* Warning: remaining attempts */}
            {showWarning && !isLocked && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 transition-opacity duration-300">
                <p className="text-amber-700 text-sm text-center font-medium">
                  ⚠ Sisa {remainingAttempts} percobaan sebelum akun di-lock.
                </p>
              </div>
            )}

            {/* Lockout countdown */}
            {isLocked && countdown && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 transition-opacity duration-300">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-700 text-sm font-semibold">Akun terkunci</p>
                </div>
                <p className="text-red-600 text-sm text-center">
                  Terlalu banyak percobaan login. Silakan coba lagi dalam{' '}
                  <span className="font-bold">{countdown}</span>.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || pin.length < 4 || isLocked}
              className={`w-full py-3 rounded-lg font-medium transition-colors duration-300 ${
                isLocked
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {loading ? 'Memverifikasi...' : isLocked ? 'Masuk' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
