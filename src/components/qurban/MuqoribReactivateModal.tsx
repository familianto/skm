'use client';

import { useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * MuqoribReactivateModal — simple confirm. Calls M6 with empty body.
 * Mirrors F01 `ReactivateModal` (anggota).
 */

interface Props {
  open: boolean;
  muqoribId: string;
  muqoribNama: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function MuqoribReactivateModal({
  open,
  muqoribId,
  muqoribNama,
  onSuccess,
  onClose,
}: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/qurban/muqorib/${muqoribId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        onSuccess();
        return;
      }

      const code = json?.error?.code as string | undefined;
      const message = json?.error?.message as string | undefined;

      if (code === 'NOT_FOUND') {
        toast('Muqorib tidak ditemukan.', 'error');
        handleClose();
      } else {
        toast(message || 'Gagal mengaktifkan. Coba lagi.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Aktifkan kembali ${muqoribNama}?`}
      className="max-w-sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Muqorib akan muncul kembali di daftar aktif dan bisa dipilih saat
          pendaftaran.
        </p>
        <div className="flex gap-3 justify-end pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Memproses...' : 'Aktifkan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
