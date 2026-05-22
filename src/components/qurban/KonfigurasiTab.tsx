'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { FormSkeleton } from '@/components/qurban/TabSkeleton';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface Konfigurasi {
  id: string;
  edisi_id: string;
  bop_per_ekor_sapi: number;
  bop_per_ekor_kambing: number;
  target_bungkus_total: number;
  berat_target_per_bungkus: number;
  tanggal_distribusi_mulai: string;
  tanggal_distribusi_selesai: string;
  payment_suffix: number;
  wa_send_on_pendaftaran: boolean;
  wa_send_on_pembayaran_confirmed: boolean;
  notes: string;
}

interface FormState {
  bop_per_ekor_sapi: number | null;
  bop_per_ekor_kambing: number | null;
  target_bungkus_total: string;
  berat_target_per_bungkus: string;
  tanggal_distribusi_mulai: string;
  tanggal_distribusi_selesai: string;
  payment_suffix: string;
  wa_send_on_pendaftaran: boolean;
  wa_send_on_pembayaran_confirmed: boolean;
  notes: string;
}

const DEFAULT_FORM: FormState = {
  bop_per_ekor_sapi: null,
  bop_per_ekor_kambing: null,
  target_bungkus_total: '',
  berat_target_per_bungkus: '',
  tanggal_distribusi_mulai: '',
  tanggal_distribusi_selesai: '',
  payment_suffix: '3',
  wa_send_on_pendaftaran: true,
  wa_send_on_pembayaran_confirmed: true,
  notes: '',
};

function konfigurasiToForm(k: Konfigurasi): FormState {
  return {
    bop_per_ekor_sapi: k.bop_per_ekor_sapi || 0,
    bop_per_ekor_kambing: k.bop_per_ekor_kambing || 0,
    target_bungkus_total: String(k.target_bungkus_total ?? 0),
    berat_target_per_bungkus: String(k.berat_target_per_bungkus ?? 0),
    tanggal_distribusi_mulai: k.tanggal_distribusi_mulai || '',
    tanggal_distribusi_selesai: k.tanggal_distribusi_selesai || '',
    payment_suffix: String(k.payment_suffix ?? 3),
    wa_send_on_pendaftaran: k.wa_send_on_pendaftaran ?? true,
    wa_send_on_pembayaran_confirmed: k.wa_send_on_pembayaran_confirmed ?? true,
    notes: k.notes || '',
  };
}

interface Props {
  edisiId: string;
  edisiStatus: EdisiStatus;
  /** True when the current session may submit the form (SA/AQ + status != SELESAI). */
  canEdit: boolean;
  /** Hint shown above the form when the form is read-only. */
  readOnlyReason?: string;
}

export function KonfigurasiTab({
  edisiId,
  edisiStatus,
  canEdit,
  readOnlyReason,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exists, setExists] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/konfigurasi?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        toast(json?.error?.message || 'Gagal memuat konfigurasi.', 'error');
        return;
      }
      const data = json.data as Konfigurasi | null;
      if (data) {
        setExists(true);
        setForm(konfigurasiToForm(data));
      } else {
        setExists(false);
        setForm(DEFAULT_FORM);
      }
    } catch {
      toast('Gagal memuat konfigurasi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [edisiId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Local parse + validation before hitting the API.
    const targetBungkus = parseInt(form.target_bungkus_total, 10);
    const beratTarget = parseInt(form.berat_target_per_bungkus, 10);
    const paySuffix = parseInt(form.payment_suffix, 10);

    if (form.target_bungkus_total !== '' && (!Number.isFinite(targetBungkus) || targetBungkus < 0)) {
      setError('Target bungkus harus angka ≥ 0.');
      return;
    }
    if (form.berat_target_per_bungkus !== '' && (!Number.isFinite(beratTarget) || beratTarget < 0)) {
      setError('Berat target harus angka ≥ 0.');
      return;
    }
    if (!Number.isFinite(paySuffix) || paySuffix < 0 || paySuffix > 9) {
      setError('Payment suffix harus angka 0–9.');
      return;
    }
    if (
      form.tanggal_distribusi_mulai &&
      form.tanggal_distribusi_selesai &&
      form.tanggal_distribusi_mulai > form.tanggal_distribusi_selesai
    ) {
      setError('Tanggal distribusi selesai harus ≥ tanggal mulai.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        bop_per_ekor_sapi: form.bop_per_ekor_sapi ?? 0,
        bop_per_ekor_kambing: form.bop_per_ekor_kambing ?? 0,
        target_bungkus_total: Number.isFinite(targetBungkus) ? targetBungkus : 0,
        berat_target_per_bungkus: Number.isFinite(beratTarget) ? beratTarget : 0,
        tanggal_distribusi_mulai: form.tanggal_distribusi_mulai,
        tanggal_distribusi_selesai: form.tanggal_distribusi_selesai,
        payment_suffix: paySuffix,
        wa_send_on_pendaftaran: form.wa_send_on_pendaftaran,
        wa_send_on_pembayaran_confirmed: form.wa_send_on_pembayaran_confirmed,
        notes: form.notes,
      };

      const res = await fetch(
        `/api/qurban/konfigurasi?edisi_id=${encodeURIComponent(edisiId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || 'Gagal menyimpan konfigurasi.';
        setError(msg);
        toast(msg, 'error');
        return;
      }
      const saved = json.data as Konfigurasi;
      setExists(true);
      setForm(konfigurasiToForm(saved));
      toast('Konfigurasi tersimpan.', 'success');
    } catch {
      setError('Gagal menyimpan konfigurasi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormSkeleton />;

  const formDisabled = !canEdit || submitting;
  const lockHint =
    readOnlyReason ??
    (edisiStatus === 'SELESAI'
      ? 'Edisi sudah SELESAI — konfigurasi tidak dapat diubah.'
      : !canEdit
      ? 'Anda tidak memiliki izin untuk mengubah konfigurasi edisi ini.'
      : undefined);

  return (
    <Card>
      {lockHint && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {lockHint}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
            Biaya Operasional Per Hewan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput
              label="BOP per Ekor Sapi (Rp)"
              value={form.bop_per_ekor_sapi}
              onChange={(v) => setForm((s) => ({ ...s, bop_per_ekor_sapi: v }))}
              disabled={formDisabled}
              placeholder="0"
            />
            <CurrencyInput
              label="BOP per Ekor Kambing (Rp)"
              value={form.bop_per_ekor_kambing}
              onChange={(v) => setForm((s) => ({ ...s, bop_per_ekor_kambing: v }))}
              disabled={formDisabled}
              placeholder="0"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
            Target Distribusi
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Target Bungkus Total"
              type="number"
              min={0}
              value={form.target_bungkus_total}
              onChange={(e) =>
                setForm((s) => ({ ...s, target_bungkus_total: e.target.value }))
              }
              disabled={formDisabled}
              placeholder="0"
            />
            <Input
              label="Berat Target per Bungkus (gram)"
              type="number"
              min={0}
              value={form.berat_target_per_bungkus}
              onChange={(e) =>
                setForm((s) => ({ ...s, berat_target_per_bungkus: e.target.value }))
              }
              disabled={formDisabled}
              placeholder="0"
            />
            <Input
              label="Tanggal Distribusi Mulai"
              type="date"
              value={form.tanggal_distribusi_mulai}
              onChange={(e) =>
                setForm((s) => ({ ...s, tanggal_distribusi_mulai: e.target.value }))
              }
              disabled={formDisabled}
            />
            <Input
              label="Tanggal Distribusi Selesai"
              type="date"
              value={form.tanggal_distribusi_selesai}
              onChange={(e) =>
                setForm((s) => ({ ...s, tanggal_distribusi_selesai: e.target.value }))
              }
              disabled={formDisabled}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
            Pembayaran
          </h3>
          <div className="max-w-xs">
            <Input
              label="Payment Suffix"
              type="number"
              min={0}
              max={9}
              value={form.payment_suffix}
              onChange={(e) =>
                setForm((s) => ({ ...s, payment_suffix: e.target.value }))
              }
              disabled={formDisabled}
            />
            <p className="mt-1 text-xs text-gray-500">
              Digit terakhir kode bayar untuk auto-match transaksi bank. Default
              3. Jangan ubah kecuali ada konflik.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
            Notifikasi WhatsApp
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.wa_send_on_pendaftaran}
                onChange={(e) =>
                  setForm((s) => ({ ...s, wa_send_on_pendaftaran: e.target.checked }))
                }
                disabled={formDisabled}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Kirim WA saat pendaftaran
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.wa_send_on_pembayaran_confirmed}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    wa_send_on_pembayaran_confirmed: e.target.checked,
                  }))
                }
                disabled={formDisabled}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Kirim WA saat pembayaran terkonfirmasi
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <label
            htmlFor="konfigurasi-notes"
            className="block text-sm font-medium text-gray-700"
          >
            Catatan
          </label>
          <textarea
            id="konfigurasi-notes"
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
            disabled={formDisabled}
            rows={3}
            maxLength={500}
            placeholder="Catatan opsional..."
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {canEdit && (
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={formDisabled}>
              {submitting ? 'Menyimpan...' : exists ? 'Simpan Perubahan' : 'Simpan'}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
