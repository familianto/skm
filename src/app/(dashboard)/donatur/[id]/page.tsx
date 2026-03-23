'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Modal } from '@/components/ui/modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatRupiah, formatTimestamp } from '@/lib/utils';
import type { Donatur, Reminder, ApiResponse } from '@/types';
import { DonaturKelompok, ReminderTipe, ReminderStatus } from '@/types';

const TIPE_LABELS: Record<string, string> = {
  [ReminderTipe.DONASI_RUTIN]: 'Donasi Rutin',
  [ReminderTipe.UCAPAN_TERIMA_KASIH]: 'Ucapan Terima Kasih',
  [ReminderTipe.LAPORAN_KEUANGAN]: 'Laporan Keuangan',
  [ReminderTipe.CUSTOM]: 'Custom',
};

const STATUS_VARIANT: Record<string, string> = {
  [ReminderStatus.TERKIRIM]: 'AKTIF',
  [ReminderStatus.GAGAL]: 'VOID',
  [ReminderStatus.PENDING]: 'default',
};

const TEMPLATES: Record<string, string> = {
  [ReminderTipe.DONASI_RUTIN]: 'Assalamu\'alaikum {nama},\n\nSemoga Allah SWT senantiasa melimpahkan rahmat-Nya. Kami dari pengurus masjid mengingatkan kembali untuk donasi rutin bulan ini.\n\nJazakallah khairan.',
  [ReminderTipe.UCAPAN_TERIMA_KASIH]: 'Assalamu\'alaikum {nama},\n\nTerima kasih atas donasi yang telah diberikan. Semoga Allah SWT membalas kebaikan Anda dengan berlipat ganda.\n\nJazakallah khairan.',
  [ReminderTipe.LAPORAN_KEUANGAN]: 'Assalamu\'alaikum {nama},\n\nBerikut kami sampaikan ringkasan keuangan masjid bulan ini. Terima kasih atas kepercayaan dan kontribusi Anda.\n\nJazakallah khairan.',
  [ReminderTipe.CUSTOM]: '',
};

export default function DonaturDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [donatur, setDonatur] = useState<Donatur | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [msgTipe, setMsgTipe] = useState<ReminderTipe>(ReminderTipe.DONASI_RUTIN);
  const [msgPesan, setMsgPesan] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [donaturRes, reminderRes] = await Promise.all([
        fetch(`/api/donatur/${id}`),
        fetch(`/api/reminder?donatur_id=${id}`),
      ]);
      const donaturData: ApiResponse<Donatur> = await donaturRes.json();
      const reminderData: ApiResponse<Reminder[]> = await reminderRes.json();

      if (donaturData.success && donaturData.data) {
        setDonatur(donaturData.data);
      }
      if (reminderData.success && reminderData.data) {
        setReminders(reminderData.data);
      }
    } catch {
      toast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openSendModal = () => {
    const template = TEMPLATES[ReminderTipe.DONASI_RUTIN];
    setMsgTipe(ReminderTipe.DONASI_RUTIN);
    setMsgPesan(template.replace(/\{nama\}/g, donatur?.nama || ''));
    setSendModalOpen(true);
  };

  const handleTipeChange = (tipe: ReminderTipe) => {
    setMsgTipe(tipe);
    const template = TEMPLATES[tipe];
    if (template) {
      setMsgPesan(template.replace(/\{nama\}/g, donatur?.nama || ''));
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donatur_id: id,
          tipe: msgTipe,
          pesan: msgPesan,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const status = data.data?.status;
        if (status === ReminderStatus.TERKIRIM) {
          toast('Pesan WhatsApp berhasil dikirim');
        } else {
          toast('Pesan dicatat (mode mock - Fonnte belum terkoneksi)', 'error');
        }
        setSendModalOpen(false);
        fetchData();
      } else {
        toast(data.error || 'Gagal mengirim', 'error');
      }
    } catch {
      toast('Terjadi kesalahan', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Loading className="py-12" />;
  if (!donatur) return <p className="text-gray-500 text-center py-12">Donatur tidak ditemukan.</p>;

  return (
    <div>
      <PageTitle
        title={donatur.nama}
        subtitle="Detail donatur"
        action={
          <div className="flex gap-2">
            <Button onClick={openSendModal}>Kirim WA</Button>
            <Button variant="secondary" onClick={() => router.push('/donatur')}>Kembali</Button>
          </div>
        }
      />

      {/* Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Informasi Donatur</h3>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Telepon</dt>
              <dd className="text-sm font-medium">{donatur.telepon}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Alamat</dt>
              <dd className="text-sm font-medium">{donatur.alamat || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Kelompok</dt>
              <dd>
                <Badge
                  label={donatur.kelompok}
                  variant={donatur.kelompok === DonaturKelompok.TETAP ? 'AKTIF' : 'default'}
                />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Komitmen/Bulan</dt>
              <dd className="text-sm font-medium">
                {donatur.jumlah_komitmen > 0 ? formatRupiah(donatur.jumlah_komitmen) : '-'}
              </dd>
            </div>
            {donatur.catatan && (
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Catatan</dt>
                <dd className="text-sm font-medium">{donatur.catatan}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Statistik Reminder</h3>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Total Reminder</dt>
              <dd className="text-sm font-bold">{reminders.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Terkirim</dt>
              <dd className="text-sm font-bold text-emerald-600">
                {reminders.filter((r) => r.status === ReminderStatus.TERKIRIM).length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Gagal</dt>
              <dd className="text-sm font-bold text-red-600">
                {reminders.filter((r) => r.status === ReminderStatus.GAGAL).length}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Reminder History */}
      <Card padding={false}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Riwayat Reminder</h3>
        </div>
        {reminders.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Belum ada riwayat reminder.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pesan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminders.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm whitespace-nowrap">{formatTimestamp(r.created_at)}</TableCell>
                  <TableCell>
                    <span className="text-sm">{TIPE_LABELS[r.tipe] || r.tipe}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      label={r.status}
                      variant={STATUS_VARIANT[r.status] as 'AKTIF' | 'VOID' | 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-gray-600 max-w-xs truncate">{r.pesan}</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Send WA Modal */}
      <Modal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        title="Kirim WhatsApp"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Pesan akan dikirim ke <span className="font-medium">{donatur.telepon}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Pesan</label>
            <select
              value={msgTipe}
              onChange={(e) => handleTipeChange(e.target.value as ReminderTipe)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={ReminderTipe.DONASI_RUTIN}>Reminder Donasi Rutin</option>
              <option value={ReminderTipe.UCAPAN_TERIMA_KASIH}>Ucapan Terima Kasih</option>
              <option value={ReminderTipe.LAPORAN_KEUANGAN}>Laporan Keuangan</option>
              <option value={ReminderTipe.CUSTOM}>Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pesan</label>
            <textarea
              value={msgPesan}
              onChange={(e) => setMsgPesan(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Tulis pesan..."
            />
            <p className="text-xs text-gray-400 mt-1">Gunakan {'{nama}'} untuk nama donatur otomatis</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSend} disabled={sending || !msgPesan.trim()}>
              {sending ? 'Mengirim...' : 'Kirim WhatsApp'}
            </Button>
            <Button variant="secondary" onClick={() => setSendModalOpen(false)}>
              Batal
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
