'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatTimestamp } from '@/lib/utils';
import type { Donatur, Reminder, ApiResponse } from '@/types';
import { DonaturKelompok, ReminderTipe, ReminderStatus } from '@/types';

const TIPE_LABELS: Record<string, string> = {
  [ReminderTipe.DONASI_RUTIN]: 'Donasi Rutin',
  [ReminderTipe.UCAPAN_TERIMA_KASIH]: 'Terima Kasih',
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

export default function ReminderPage() {
  const { toast } = useToast();

  // Data
  const [donaturs, setDonaturs] = useState<Donatur[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [fonnteStatus, setFonnteStatus] = useState<{ connected: boolean; mock: boolean }>({ connected: false, mock: true });
  const [loading, setLoading] = useState(true);

  // Send form
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tipe, setTipe] = useState<ReminderTipe>(ReminderTipe.DONASI_RUTIN);
  const [pesan, setPesan] = useState(TEMPLATES[ReminderTipe.DONASI_RUTIN]);
  const [sending, setSending] = useState(false);
  const [filterKelompok, setFilterKelompok] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [donaturRes, reminderRes, statusRes] = await Promise.all([
        fetch('/api/donatur'),
        fetch('/api/reminder'),
        fetch('/api/reminder/send'),
      ]);
      const donaturData: ApiResponse<Donatur[]> = await donaturRes.json();
      const reminderData: ApiResponse<Reminder[]> = await reminderRes.json();
      const statusData = await statusRes.json();

      if (donaturData.success && donaturData.data) setDonaturs(donaturData.data);
      if (reminderData.success && reminderData.data) setReminders(reminderData.data);
      if (statusData.success && statusData.data) setFonnteStatus(statusData.data);
    } catch {
      toast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredDonaturs = donaturs.filter((d) => {
    if (filterKelompok && d.kelompok !== filterKelompok) return false;
    return !!d.telepon;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filteredDonaturs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDonaturs.map((d) => d.id));
    }
  };

  const handleTipeChange = (newTipe: ReminderTipe) => {
    setTipe(newTipe);
    const template = TEMPLATES[newTipe];
    if (template) setPesan(template);
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      toast('Pilih minimal 1 donatur', 'error');
      return;
    }
    if (!pesan.trim()) {
      toast('Pesan tidak boleh kosong', 'error');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/reminder/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donatur_ids: selectedIds,
          tipe,
          pesan,
        }),
      });
      const data: ApiResponse<Reminder[]> = await res.json();
      if (data.success && data.data) {
        const terkirim = data.data.filter((r) => r.status === ReminderStatus.TERKIRIM).length;
        const gagal = data.data.filter((r) => r.status === ReminderStatus.GAGAL).length;

        if (terkirim > 0 && gagal === 0) {
          toast(`Berhasil mengirim ke ${terkirim} donatur`, 'success');
        } else if (terkirim > 0 && gagal > 0) {
          toast(`Berhasil: ${terkirim}, Gagal: ${gagal}`, 'info');
        } else {
          toast(`Gagal mengirim ke ${gagal} donatur`, 'error');
        }

        setSelectedIds([]);
        fetchData();
      } else {
        toast(data.error || 'Gagal mengirim reminder', 'error');
      }
    } catch {
      toast('Terjadi kesalahan jaringan', 'error');
    } finally {
      setSending(false);
    }
  };

  // Build donatur name lookup for reminder history
  const donaturMap = new Map(donaturs.map((d) => [d.id, d.nama]));

  if (loading) return <Loading className="py-12" />;

  return (
    <div>
      <PageTitle
        title="Reminder WhatsApp"
        subtitle="Kirim pengingat donasi via WhatsApp"
      />

      {/* Fonnte Status */}
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${fonnteStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <div>
            <span className="text-sm font-medium">
              {fonnteStatus.connected ? 'Fonnte Terkoneksi' : 'Fonnte Mode Mock'}
            </span>
            {fonnteStatus.mock && (
              <p className="text-xs text-amber-600 mt-0.5">
                Device belum terkoneksi. Pesan akan dicatat tapi tidak terkirim ke WhatsApp.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Send Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: Select Donatur */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">Pilih Donatur</h3>
            <div className="flex items-center gap-3">
              <select
                value={filterKelompok}
                onChange={(e) => setFilterKelompok(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Semua</option>
                <option value={DonaturKelompok.TETAP}>Tetap</option>
                <option value={DonaturKelompok.INSIDENTAL}>Insidental</option>
              </select>
              <button
                onClick={selectAll}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {selectedIds.length === filteredDonaturs.length ? 'Batal Semua' : 'Pilih Semua'}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredDonaturs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Tidak ada donatur dengan nomor telepon.</p>
            ) : (
              filteredDonaturs.map((d) => (
                <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(d.id)}
                    onChange={() => toggleSelect(d.id)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{d.nama}</div>
                    <div className="text-xs text-gray-500">{d.telepon}</div>
                  </div>
                  <Badge
                    label={d.kelompok}
                    variant={d.kelompok === DonaturKelompok.TETAP ? 'AKTIF' : 'default'}
                  />
                </label>
              ))
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-emerald-600 font-medium">
              {selectedIds.length} donatur dipilih
            </div>
          )}
        </Card>

        {/* Right: Message */}
        <Card>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Pesan</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Pesan</label>
              <select
                value={tipe}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Isi Pesan</label>
              <textarea
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Tulis pesan..."
              />
              <p className="text-xs text-gray-400 mt-1">Gunakan {'{nama}'} untuk nama donatur otomatis</p>
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || selectedIds.length === 0 || !pesan.trim()}
              className="w-full"
            >
              {sending ? 'Mengirim...' : `Kirim ke ${selectedIds.length} Donatur`}
            </Button>
          </div>
        </Card>
      </div>

      {/* Reminder History */}
      <Card padding={false}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Riwayat Pengiriman</h3>
        </div>
        {reminders.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Belum ada riwayat reminder.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Donatur</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Nomor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminders.slice(0, 50).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm whitespace-nowrap">{formatTimestamp(r.created_at)}</TableCell>
                  <TableCell className="text-sm font-medium">{donaturMap.get(r.donatur_id) || r.donatur_id}</TableCell>
                  <TableCell className="text-sm">{TIPE_LABELS[r.tipe] || r.tipe}</TableCell>
                  <TableCell className="text-sm">{r.nomor_tujuan}</TableCell>
                  <TableCell>
                    <Badge
                      label={r.status}
                      variant={STATUS_VARIANT[r.status] as 'AKTIF' | 'VOID' | 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="text-xs text-gray-500 max-w-xs truncate">{r.response}</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
