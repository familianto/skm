'use client';

import { useEffect, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatRupiah } from '@/lib/utils';

/**
 * F6 D2 — PY2 "Terima Panitia": TUNAI BELUM_BAYAR → TERIMA_PANITIA.
 * Input: panitia penerima (anggota_id), tanggal terima (default sekarang),
 * bukti_url opsional.
 */

interface PanitiaOption {
  anggota_id: string;
  anggota_nama: string;
}

interface Props {
  open: boolean;
  edisiId: string;
  pembayaran: { id: string; kode_bayar: string; nominal_total: number; muqorib_nama: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** ISO-Z untuk kolom tanggal_terima_panitia; input date (YYYY-MM-DD) → midnight Z. */
function dateToIsoZ(d: string): string {
  return d ? `${d}T00:00:00.000Z` : new Date().toISOString();
}
function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TerimaPanitiaModal({ open, edisiId, pembayaran, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [panitia, setPanitia] = useState<PanitiaOption[]>([]);
  const [panitiaId, setPanitiaId] = useState('');
  const [tanggal, setTanggal] = useState(todayInput());
  const [buktiUrl, setBuktiUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPanitiaId('');
    setTanggal(todayInput());
    setBuktiUrl('');
    setSubmitting(false);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/qurban/panitia?edisi_id=${encodeURIComponent(edisiId)}`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.ok) {
          setPanitia(
            ((json.data as { anggota_id: string; anggota_nama: string }[]) || []).map((p) => ({
              anggota_id: p.anggota_id,
              anggota_nama: p.anggota_nama,
            }))
          );
        }
      } catch {
        // Daftar panitia gagal dimuat — field tetap bisa diisi manual via fallback.
      }
    })();
  }, [open, edisiId]);

  const handleConfirm = async () => {
    if (!pembayaran) return;
    if (!panitiaId) {
      setError('Pilih panitia penerima.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/pembayaran/${pembayaran.id}/terima-panitia?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            panitia_terima_id: panitiaId,
            tanggal_terima_panitia: dateToIsoZ(tanggal),
            bukti_url: buktiUrl.trim() || undefined,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Pembayaran ditandai diterima panitia.', 'success');
        onSuccess();
        return;
      }
      setError(json?.error?.message || 'Gagal menandai diterima panitia.');
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Terima Pembayaran Tunai">
      <div className="space-y-3">
        {pembayaran && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Kode Bayar</span>
              <span className="font-mono font-medium text-gray-900">{pembayaran.kode_bayar}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Muqorib</span>
              <span className="text-gray-900">{pembayaran.muqorib_nama || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Jumlah</span>
              <span className="font-semibold text-gray-900">{formatRupiah(pembayaran.nominal_total)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Diterima oleh (panitia)</label>
          <select
            value={panitiaId}
            onChange={(e) => { setPanitiaId(e.target.value); setError(null); }}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="">— Pilih panitia —</option>
            {panitia.map((p) => (
              <option key={p.anggota_id} value={p.anggota_id}>{p.anggota_nama || p.anggota_id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal diterima</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bukti (URL, opsional)</label>
          <input
            value={buktiUrl}
            onChange={(e) => setBuktiUrl(e.target.value)}
            placeholder="mis. link foto kuitansi"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Batal</Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Menyimpan…' : 'Tandai Diterima'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
