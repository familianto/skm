'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { peranLabel } from '@/lib/anggota-display';

/**
 * PinOnceModal — display a freshly-generated PIN exactly once.
 *
 * Used by:
 *   - E3 /pengaturan/anggota/baru after U2 create success
 *   - E4 /pengaturan/anggota/[id] after U5 reset-pin success (planned)
 *
 * Critical UX (per PROMPT_F01 §6.2):
 *   - NO overlay click / ESC / X dismissal — the user MUST press the
 *     acknowledge button. We don't render a close button, the backdrop has no
 *     click handler, and we don't bind a global ESC listener. The browser's
 *     native ESC behavior only dismisses <dialog> elements, not arbitrary
 *     divs, so a plain div modal cannot be dismissed by ESC anyway.
 *   - If the user force-refreshes the page or kills the tab, the PIN is lost
 *     permanently. That is the intended security trade-off.
 *
 * Built standalone (NOT using @/components/ui/modal.tsx) because that shared
 * modal exposes overlay-click-to-close and an X icon — both unwanted here.
 */

interface Props {
  open: boolean;
  nama: string;
  pin: string;
  telepon: string;
  peran: string;
  /** Heading text. Defaults to the E3 (create) copy. */
  title?: string;
  /** Label rendered above the large PIN display. Defaults to "PIN Awal". */
  pinLabel?: string;
  onAcknowledge: () => void;
}

export function PinOnceModal({
  open,
  nama,
  pin,
  telepon,
  peran,
  title = 'PIN Awal Berhasil Dibuat',
  pinLabel = 'PIN Awal',
  onAcknowledge,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (insecure context, iframe).
      // Silent — user can manually select & copy the displayed PIN.
    }
  };

  return (
    <>
      {/* Backdrop — intentionally NO onClick: forced acknowledge. */}
      <div className="fixed inset-0 z-40 bg-black/60" aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-once-title"
          className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="pin-once-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Catat atau salin PIN ini sekarang.
                </p>
              </div>
            </div>
          </div>

          {/* Anggota info card */}
          <div className="px-6 pt-4 pb-3">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Anggota</span>
                <span className="text-gray-900 font-medium text-right break-words max-w-[14rem]">
                  {nama}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Telepon</span>
                <span className="text-gray-900 font-medium font-mono">{telepon}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Peran</span>
                <span className="text-gray-900 font-medium">{peranLabel(peran)}</span>
              </div>
            </div>
          </div>

          {/* PIN block */}
          <div className="px-6 py-3">
            <div className="border-2 border-emerald-200 rounded-lg p-5 bg-emerald-50/40 text-center">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                {pinLabel}
              </p>
              <p
                className="font-mono text-3xl sm:text-4xl font-bold text-gray-900 tracking-[0.35em]"
                aria-label={`PIN ${pin.split('').join(' ')}`}
              >
                {pin}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`mt-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                copied
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {copied ? (
                <span className="inline-flex items-center gap-1.5">
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Tersalin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Salin PIN
                </span>
              )}
            </button>
          </div>

          {/* Warning */}
          <div className="px-6 pb-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-semibold mb-1">
                ⚠ PIN ini hanya ditampilkan sekali
              </p>
              <p className="text-xs text-amber-700">
                Kirim PIN ke anggota via WhatsApp atau sampaikan langsung. Setelah
                modal ini ditutup, PIN tidak dapat dilihat lagi.
              </p>
            </div>
          </div>

          {/* Acknowledge button */}
          <div className="px-6 pb-6 pt-2">
            <Button onClick={onAcknowledge} className="w-full justify-center">
              Saya sudah catat &amp; komunikasikan
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
