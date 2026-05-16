'use client';

import { useState, FormEvent } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * DeactivateModal — soft-delete confirmation with optional reason textarea.
 *
 * Calls U7 POST /api/pengaturan/anggota/[id]/deactivate with optional
 * `{ notes }`. Backend persists the reason in the audit log entry's `notes`
 * field for the anggota.deactivated event (Decision #20: backend U7 extended
 * to accept this body, additive change).
 *
 * Maps server business errors:
 *   422 BUSINESS_LAST_SUPER_ADMIN      → toast "Super Admin terakhir"
 *   422 BUSINESS_CANNOT_DEACTIVATE_SELF → toast "akun sendiri" (UI also
 *                                          disables the trigger button when
 *                                          target === session.user.id)
 */

const MAX_NOTES = 200;

interface Props {
  open: boolean;
  anggotaId: string;
  anggotaNama: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function DeactivateModal({
  open,
  anggotaId,
  anggotaNama,
  onSuccess,
  onClose,
}: Props) {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setNotes('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const trimmed = notes.trim();
      const res = await fetch(
        `/api/pengaturan/anggota/${anggotaId}/deactivate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trimmed ? { notes: trimmed } : {}),
        }
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        reset();
        onSuccess();
        return;
      }

      const code = json?.error?.code as string | undefined;
      const message = json?.error?.message as string | undefined;

      if (code === 'BUSINESS_LAST_SUPER_ADMIN') {
        toast(
          'Tidak bisa nonaktifkan: ini Super Admin terakhir yang aktif.',
          'error'
        );
        handleClose();
      } else if (code === 'BUSINESS_CANNOT_DEACTIVATE_SELF') {
        toast('Tidak bisa nonaktifkan akun sendiri.', 'error');
        handleClose();
      } else if (code === 'NOT_FOUND') {
        toast('Anggota tidak ditemukan.', 'error');
        handleClose();
      } else {
        toast(message || 'Gagal. Coba lagi.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Nonaktifkan ${anggotaNama}?`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-600 flex-1">
            Anggota yang dinonaktifkan tidak bisa login. Anda bisa mengaktifkan
            kembali nanti, tapi nomor telepon mungkin perlu dilepas dulu kalau
            dipakai user lain.
          </p>
        </div>

        <div>
          <label
            htmlFor="deactivate-notes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Alasan (opsional)
          </label>
          <textarea
            id="deactivate-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
            placeholder="Mis. tidak aktif di kepengurusan, pensiun, dll"
            disabled={submitting}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
          />
          <p className="mt-1 text-xs text-gray-400 text-right">
            {notes.length}/{MAX_NOTES}
          </p>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={submitting}
          >
            {submitting ? 'Memproses...' : 'Nonaktifkan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
