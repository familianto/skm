'use client';

import { useState, FormEvent } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { validatePin } from '@/lib/api/pin-policy';

/**
 * ResetPinModal — SA-initiated PIN reset for another anggota.
 *
 * Calls U5 POST /api/pengaturan/anggota/[id]/reset-pin with `{ new_pin }`.
 * On success: hands the just-set PIN to the parent via `onSuccess(pin)`
 * so the parent can open the shared PinOnceModal. We echo the PIN from the
 * form (NOT from the server response) because the server only returns
 * `{ pin_reset: true }`.
 *
 * Dismissable via Cancel / overlay / ESC / X — this is a form modal, not
 * the one-shot PIN display.
 *
 * PIN policy errors map to Bahasa via the same violation enum as E3.
 */

interface Props {
  open: boolean;
  anggotaId: string;
  anggotaNama: string;
  onSuccess: (newPin: string) => void;
  onClose: () => void;
}

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

export function ResetPinModal({
  open,
  anggotaId,
  anggotaNama,
  onSuccess,
  onClose,
}: Props) {
  const { toast } = useToast();
  const [pin, setPin] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | undefined>();
  const [konfirmasiError, setKonfirmasiError] = useState<string | undefined>();

  const reset = () => {
    setPin('');
    setKonfirmasi('');
    setShowPin(false);
    setPinError(undefined);
    setKonfirmasiError(undefined);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    let hasError = false;
    setPinError(undefined);
    setKonfirmasiError(undefined);

    if (!pin) {
      setPinError('PIN wajib diisi');
      hasError = true;
    } else {
      const policy = validatePin(pin);
      if (!policy.valid) {
        setPinError(pinViolationMessage(policy.violation));
        hasError = true;
      }
    }
    if (!konfirmasi) {
      setKonfirmasiError('Konfirmasi PIN wajib diisi');
      hasError = true;
    } else if (konfirmasi !== pin) {
      setKonfirmasiError('Konfirmasi tidak cocok dengan PIN');
      hasError = true;
    }
    if (hasError) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/pengaturan/anggota/${anggotaId}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_pin: pin }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        const newPin = pin;
        reset();
        onSuccess(newPin);
        return;
      }

      const code = json?.error?.code as string | undefined;
      const violation = json?.error?.details?.violation as string | undefined;
      const message = json?.error?.message as string | undefined;

      if (code === 'VALIDATION_PIN_POLICY') {
        setPinError(pinViolationMessage(violation));
      } else if (code === 'NOT_FOUND') {
        toast('Anggota tidak ditemukan.', 'error');
        handleClose();
      } else {
        toast(message || 'Gagal reset PIN. Coba lagi.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Reset PIN — ${anggotaNama}`}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-gray-600">
          Buat PIN baru. PIN lama tidak bisa dipakai lagi dan kunci akun akan
          dibuka.
        </p>

        {/* PIN Baru */}
        <div>
          <label
            htmlFor="reset-pin"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            PIN Baru
          </label>
          <div className="relative">
            <input
              id="reset-pin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setPinError(undefined);
              }}
              onBlur={() => {
                if (pin) {
                  const policy = validatePin(pin);
                  if (!policy.valid) {
                    setPinError(pinViolationMessage(policy.violation));
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
                pinError
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
          {pinError && <p className="mt-1 text-sm text-red-600">{pinError}</p>}
          <ul className="mt-2 text-xs text-gray-500 space-y-0.5 list-disc list-inside">
            <li>4-6 digit angka</li>
            <li>Tidak boleh berurutan (1234, 4321) atau berulang (0000, 1111)</li>
            <li>PIN umum lemah (8686, 2580, dll) akan ditolak</li>
          </ul>
        </div>

        {/* Konfirmasi PIN */}
        <div>
          <label
            htmlFor="reset-pin-confirm"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Konfirmasi PIN Baru
          </label>
          <input
            id="reset-pin-confirm"
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={6}
            value={konfirmasi}
            onChange={(e) => {
              setKonfirmasi(e.target.value.replace(/\D/g, ''));
              setKonfirmasiError(undefined);
            }}
            placeholder="Ulangi PIN"
            autoComplete="new-password"
            disabled={submitting}
            required
            className={cn(
              'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400',
              'focus:outline-none focus:ring-2',
              konfirmasiError
                ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 focus:ring-emerald-500 focus:border-emerald-500'
            )}
          />
          {konfirmasiError && (
            <p className="mt-1 text-sm text-red-600">{konfirmasiError}</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Memproses...' : 'Reset PIN'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
