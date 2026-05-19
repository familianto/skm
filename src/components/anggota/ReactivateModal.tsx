'use client';

import { useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * ReactivateModal — simpler confirm. Calls U8 with empty body.
 *
 * 409 DUPLICATE_TELEPON surfaces a specific message because telepon
 * uniqueness is scoped to is_active=TRUE rows — another active anggota may
 * have grabbed this telepon while this account was inactive.
 */

interface Props {
  open: boolean;
  anggotaId: string;
  anggotaNama: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function ReactivateModal({
  open,
  anggotaId,
  anggotaNama,
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
      const res = await fetch(
        `/api/pengaturan/anggota/${anggotaId}/reactivate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        onSuccess();
        return;
      }

      const code = json?.error?.code as string | undefined;
      const message = json?.error?.message as string | undefined;

      if (code === 'DUPLICATE_TELEPON') {
        toast(
          'Nomor sudah dipakai anggota aktif lain. Lepas dulu dari anggota lain sebelum mengaktifkan.',
          'error'
        );
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
    <Modal
      open={open}
      onClose={handleClose}
      title={`Aktifkan kembali ${anggotaNama}?`}
      className="max-w-sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Anggota akan bisa login lagi. Pastikan tidak ada konflik nomor
          telepon dengan user aktif lain.
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
