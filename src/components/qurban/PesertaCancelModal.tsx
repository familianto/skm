'use client';

import { useEffect, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { REFUND_HANDLING_OPTIONS } from '@/lib/qurban/peserta-display';

/**
 * F4c-D — Tandai BATAL satu baris peserta (PS5). Hanya TERDAFTAR (gate di
 * pemanggil). Mengumpulkan `alasan` + `refund_handling`; server set status →
 * BATAL. Bila peserta punya pembayaran, response `meta.warning` ditampilkan.
 */

interface Props {
  open: boolean;
  edisiId: string;
  pesertaId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PesertaCancelModal({ open, edisiId, pesertaId, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [alasan, setAlasan] = useState('');
  const [refundHandling, setRefundHandling] = useState<string>(REFUND_HANDLING_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAlasan('');
      setRefundHandling(REFUND_HANDLING_OPTIONS[0]);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/peserta/${pesertaId}/cancel?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alasan: alasan.trim(), refund_handling: refundHandling }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Peserta ditandai BATAL.', 'success');
        if (json.meta?.warning) toast(json.meta.warning, 'info');
        onSuccess();
        return;
      }
      setError(json?.error?.message || 'Gagal membatalkan peserta.');
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tandai BATAL">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Slot peserta ini akan dikosongkan kembali. Tindakan ini mengubah status menjadi
          <strong> BATAL</strong> (tetap tercatat sebagai riwayat).
        </p>

        <div>
          <label htmlFor="cancel-alasan" className="block text-sm font-medium text-gray-700 mb-1">
            Alasan <span className="text-gray-400 font-normal">(opsional)</span>
          </label>
          <textarea
            id="cancel-alasan"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="mis. Pembatalan atas permintaan muqorib"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="cancel-refund" className="block text-sm font-medium text-gray-700 mb-1">
            Penanganan Dana
          </label>
          <select
            id="cancel-refund"
            value={refundHandling}
            onChange={(e) => setRefundHandling(e.target.value)}
            disabled={submitting}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {REFUND_HANDLING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className={cn('text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2')}>
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Memproses…' : 'Tandai BATAL'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
