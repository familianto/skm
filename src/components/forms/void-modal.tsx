'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface VoidModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  transaksiId: string;
}

export function VoidModal({ open, onClose, onConfirm, transaksiId }: VoidModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Alasan void wajib diisi');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melakukan void');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setReason('');
    setError('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Void Transaksi">
      <div className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium">
            Transaksi yang di-void tidak bisa di-undo.
          </p>
          <p className="text-xs text-red-600 mt-1">
            ID: {transaksiId}
          </p>
        </div>

        <Input
          label="Alasan Void"
          placeholder="Masukkan alasan void transaksi..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error}
        />

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Memproses...' : 'Void Transaksi'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
