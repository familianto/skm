'use client';

import { useEffect, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

type TargetStatus = 'AKTIF' | 'TERPOTONG' | 'BATAL';

interface Props {
  open: boolean;
  edisiId: string;
  hewanIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * F5a Milestone D — batch ubah status (H6). target TERPOTONG menampilkan date
 * picker `tanggal_pemotongan` (default hari ini; mendukung hari Tasyrik).
 * Validasi transisi/atomik dilakukan server — modal hanya mengirim & menampilkan
 * error. TERPOTONG/BATAL bersifat destruktif (tombol danger + peringatan).
 */
export function HewanBatchStatusModal({ open, edisiId, hewanIds, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [target, setTarget] = useState<TargetStatus | ''>('');
  const [tanggal, setTanggal] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget('');
      setTanggal(todayYmd());
      setNotes('');
      setSubmitting(false);
    }
  }, [open]);

  const isDestructive = target === 'TERPOTONG' || target === 'BATAL';
  const count = hewanIds.length;

  const handleSubmit = async () => {
    if (!target) {
      toast('Pilih status tujuan terlebih dahulu.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/qurban/hewan/batch-status?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hewan_ids: hewanIds,
            target_status: target,
            tanggal_pemotongan: target === 'TERPOTONG' ? tanggal : undefined,
            notes: notes.trim() || undefined,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast(`Status ${count} hewan diperbarui ke ${target}.`, 'success');
        onSuccess();
        return;
      }
      toast(json?.error?.message || 'Gagal memperbarui status.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Ubah Status — ${count} hewan`}>
      <div className="space-y-4">
        <div>
          <label htmlFor="target_status" className="block text-sm font-medium text-gray-700 mb-1">
            Status Tujuan
          </label>
          <select
            id="target_status"
            value={target}
            onChange={(e) => setTarget(e.target.value as TargetStatus | '')}
            disabled={submitting}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="">— Pilih status —</option>
            <option value="AKTIF">AKTIF (aktifkan hewan DRAFT)</option>
            <option value="TERPOTONG">TERPOTONG (sudah disembelih)</option>
            <option value="BATAL">BATAL (batalkan hewan)</option>
          </select>
        </div>

        {target === 'TERPOTONG' && (
          <div>
            <label htmlFor="tanggal_pemotongan" className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Pemotongan
            </label>
            <input
              id="tanggal_pemotongan"
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              disabled={submitting}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default hari ini. Dapat diubah untuk hari Tasyrik. Direkam di audit log.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="batch_notes" className="block text-sm font-medium text-gray-700 mb-1">
            Catatan <span className="text-gray-400 font-normal">(opsional)</span>
          </label>
          <textarea
            id="batch_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {isDestructive && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Aksi ini mengubah status {count} hewan secara permanen
            {target === 'TERPOTONG' ? ' menjadi TERPOTONG' : ' menjadi BATAL'}. Status terminal
            tidak dapat dikembalikan.
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={handleSubmit}
            disabled={submitting || !target}
          >
            {submitting ? 'Memproses...' : `Terapkan ke ${count} hewan`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
