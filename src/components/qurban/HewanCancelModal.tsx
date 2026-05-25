'use client';

import { useEffect, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface Props {
  open: boolean;
  edisiId: string;
  hewanId: string;
  namaDisplay: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * F5a Milestone D — batalkan satu hewan (H7). Hanya untuk hewan DRAFT/AKTIF
 * (gating di pemanggil). `notes` opsional; server set status → BATAL.
 */
export function HewanCancelModal({ open, edisiId, hewanId, namaDisplay, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNotes('');
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/hewan/${hewanId}/cancel?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: notes.trim() || undefined }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast(`Hewan ${namaDisplay} dibatalkan.`, 'success');
        onSuccess();
        return;
      }
      toast(json?.error?.message || 'Gagal membatalkan hewan.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Batalkan Hewan">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Hewan <span className="font-medium text-gray-900">{namaDisplay}</span> akan ditandai{' '}
          <span className="font-medium">BATAL</span>. Status BATAL bersifat terminal dan tidak
          dapat dikembalikan.
        </p>
        <div>
          <label htmlFor="cancel_notes" className="block text-sm font-medium text-gray-700 mb-1">
            Catatan <span className="text-gray-400 font-normal">(opsional)</span>
          </label>
          <textarea
            id="cancel_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Alasan pembatalan"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Memproses...' : 'Batalkan Hewan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
