'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PageTitle } from '@/components/layout/page-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatTimestamp } from '@/lib/utils';
import { chunk, classifyTargets, REMINDER_CHUNK_SIZE } from '@/lib/reminder/bulk';
import type { Donatur, Reminder, ReminderBulkResult, ApiResponse } from '@/types';
import { DonaturKelompok, ReminderTipe, ReminderStatus } from '@/types';

const TIPE_LABELS: Record<string, string> = {
  [ReminderTipe.DONASI_RUTIN]: 'Donasi Rutin',
  [ReminderTipe.UCAPAN_TERIMA_KASIH]: 'Terima Kasih',
  [ReminderTipe.LAPORAN_KEUANGAN]: 'Laporan Keuangan',
  [ReminderTipe.CUSTOM]: 'Custom',
};

// "Masuk Antrean", bukan "Terkirim": respons sukses Fonnte hanya berarti pesan
// diterima antreannya. Pada insiden 2026-09-03, 10 dari 14 pesan berstatus
// sukses di SKM ternyata `expired` di Fonnte — tidak pernah sampai ke WhatsApp.
const STATUS_LABELS: Record<string, string> = {
  [ReminderStatus.TERKIRIM]: 'Masuk Antrean',
  [ReminderStatus.GAGAL]: 'Gagal',
  [ReminderStatus.PENDING]: 'Pending',
  [ReminderStatus.DILEWATI]: 'Dilewati',
};

const STATUS_VARIANT: Record<string, string> = {
  [ReminderStatus.TERKIRIM]: 'AKTIF',
  [ReminderStatus.GAGAL]: 'VOID',
  [ReminderStatus.PENDING]: 'default',
  [ReminderStatus.DILEWATI]: 'default',
};

/** Di atas ambang ini, pengiriman minta konfirmasi eksplisit dulu. */
const KONFIRMASI_DI_ATAS = 50;

const TEMPLATES: Record<string, string> = {
  [ReminderTipe.DONASI_RUTIN]: 'Assalamu\'alaikum Bapak/Ibu {nama},\n\nSemoga Allah SWT senantiasa melimpahkan rahmat-Nya. Kami dari pengurus masjid mengingatkan kembali untuk donasi rutin bulan ini.\n\nJazakallah khairan.',
  [ReminderTipe.UCAPAN_TERIMA_KASIH]: 'Assalamu\'alaikum Bapak/Ibu {nama},\n\nTerima kasih atas donasi yang telah diberikan. Semoga Allah SWT membalas kebaikan Anda dengan berlipat ganda.\n\nJazakallah khairan.',
  [ReminderTipe.LAPORAN_KEUANGAN]: 'Assalamu\'alaikum Bapak/Ibu {nama},\n\nBerikut kami sampaikan ringkasan keuangan masjid bulan ini. Terima kasih atas kepercayaan dan kontribusi Anda.\n\nJazakallah khairan.',
  [ReminderTipe.CUSTOM]: '',
};

export default function ReminderPage() {
  const { toast } = useToast();

  // Data
  const [donaturs, setDonaturs] = useState<Donatur[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [fonnteStatus, setFonnteStatus] = useState<{
    connected: boolean; mock: boolean; device_status: string; device_checked: boolean; quota: string;
  }>({ connected: false, mock: true, device_status: '', device_checked: false, quota: '' });
  const [loading, setLoading] = useState(true);

  // Send form
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tipe, setTipe] = useState<ReminderTipe>(ReminderTipe.DONASI_RUTIN);
  const [pesan, setPesan] = useState(TEMPLATES[ReminderTipe.DONASI_RUTIN]);
  const [sending, setSending] = useState(false);
  const [filterKelompok, setFilterKelompok] = useState('');
  const [progress, setProgress] = useState<{ selesai: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  // Ref, bukan state: dibaca di tengah loop pengiriman yang sedang berjalan.
  const stopRef = useRef(false);

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

  // Pratinjau pra-kirim: nomor divalidasi di klien memakai aturan yang sama
  // dengan server, jadi jumlah yang akan dilewati terlihat SEBELUM mengirim.
  const pratinjau = useMemo(() => {
    const dipilih = donaturs.filter((d) => selectedIds.includes(d.id));
    const classified = classifyTargets(dipilih);
    const invalid = classified.filter((c) => !c.valid);
    return {
      total: dipilih.length,
      valid: classified.length - invalid.length,
      invalid: invalid.length,
      contohInvalid: invalid.slice(0, 3).map((c) => `${c.donatur.nama} (${c.donatur.telepon || 'kosong'})`),
      chunkCount: Math.ceil(dipilih.length / REMINDER_CHUNK_SIZE),
    };
  }, [donaturs, selectedIds]);

  /**
   * Kirim bertahap per chunk.
   *
   * Insiden 2026-09-03: satu request berisi 287 target, device WhatsApp putus
   * di detik ke-4, dan 244 request sisanya tetap ditembakkan. Sekarang UI
   * memecah sendiri, berhenti begitu server melaporkan blast dihentikan, dan
   * menyisakan target yang belum diproses tetap terpilih agar bisa dilanjutkan.
   */
  const runSend = async () => {
    const antrean = [...selectedIds];
    const chunks = chunk(antrean, REMINDER_CHUNK_SIZE);

    setSending(true);
    stopRef.current = false;
    setProgress({ selesai: 0, total: antrean.length });

    const total = { terkirim: 0, gagal: 0, dilewati: 0 };
    const diproses: string[] = [];
    let dihentikan = '';
    let logHilang = false;

    try {
      for (const potongan of chunks) {
        if (stopRef.current) {
          dihentikan = 'dihentikan oleh pengguna';
          break;
        }

        const res = await fetch('/api/reminder/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ donatur_ids: potongan, tipe, pesan }),
        });
        const data: ApiResponse<ReminderBulkResult> = await res.json();

        if (!data.success || !data.data) {
          toast(data.error || 'Gagal mengirim reminder', 'error');
          dihentikan = data.error || 'permintaan ditolak server';
          break;
        }

        diproses.push(...potongan);
        total.terkirim += data.data.terkirim;
        total.gagal += data.data.gagal;
        total.dilewati += data.data.dilewati;
        if (!data.data.log_persisted) logHilang = true;
        setProgress({ selesai: diproses.length, total: antrean.length });

        if (data.data.stopped) {
          dihentikan = data.data.stopped_reason || 'pengiriman dihentikan server';
          break;
        }
      }

      const sisa = antrean.filter((id) => !diproses.includes(id));
      setSelectedIds(sisa);

      const ringkas = `Masuk antrean: ${total.terkirim}, Gagal: ${total.gagal}, Dilewati: ${total.dilewati}`;
      if (dihentikan) {
        toast(`Pengiriman berhenti (${dihentikan}). ${ringkas}. Sisa ${sisa.length} donatur tetap terpilih.`, 'error');
      } else if (total.gagal > 0) {
        toast(`${ringkas}.`, 'info');
      } else {
        toast(`${total.terkirim} pesan masuk antrean WhatsApp.`, 'success');
      }
      if (logHilang) {
        toast('Sebagian baris riwayat gagal ditulis ke Sheet — rinciannya ada di audit_log.', 'error');
      }

      fetchData();
    } catch {
      toast('Terjadi kesalahan jaringan', 'error');
    } finally {
      setSending(false);
      setProgress(null);
      stopRef.current = false;
    }
  };

  const handleSend = () => {
    if (selectedIds.length === 0) {
      toast('Pilih minimal 1 donatur', 'error');
      return;
    }
    if (!pesan.trim()) {
      toast('Pesan tidak boleh kosong', 'error');
      return;
    }
    if (selectedIds.length > KONFIRMASI_DI_ATAS) {
      setConfirmOpen(true);
      return;
    }
    runSend();
  };

  const donaturNameMap = new Map(donaturs.map((d) => [d.id, d.nama]));
  const donaturPhoneMap = new Map(donaturs.map((d) => [d.id, d.telepon]));

  // Device dianggap terputus HANYA bila statusnya benar-benar terbaca sebagai
  // 'disconnect' — status yang gagal dibaca tidak boleh mengunci tombol kirim.
  const deviceTerputus =
    !fonnteStatus.mock && fonnteStatus.device_checked && fonnteStatus.device_status !== 'connect';

  if (loading) return <Loading className="py-12" />;

  return (
    <div>
      <PageTitle
        title="Reminder WhatsApp"
        subtitle="Kirim pengingat donasi via WhatsApp"
      />

      {/* Fonnte + status device WhatsApp */}
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${deviceTerputus ? 'bg-red-500' : fonnteStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <div>
            <span className="text-sm font-medium">
              {fonnteStatus.mock
                ? 'Fonnte Mode Mock'
                : deviceTerputus
                  ? 'Device WhatsApp Terputus'
                  : 'Fonnte Terkoneksi'}
            </span>
            {fonnteStatus.mock && (
              <p className="text-xs text-amber-600 mt-0.5">
                Device belum terkoneksi. Pesan akan dicatat tapi tidak terkirim ke WhatsApp.
              </p>
            )}
            {deviceTerputus && (
              <p className="text-xs text-red-600 mt-0.5">
                Sesi WhatsApp putus — hubungkan ulang di dashboard Fonnte sebelum mengirim. Pengiriman akan ditolak.
              </p>
            )}
            {!fonnteStatus.mock && !fonnteStatus.device_checked && (
              <p className="text-xs text-gray-500 mt-0.5">
                Status device tidak terbaca. Pengiriman tetap bisa jalan dan akan berhenti sendiri bila device ternyata terputus.
              </p>
            )}
            {!fonnteStatus.mock && fonnteStatus.quota && (
              <p className="text-xs text-gray-500 mt-0.5">Sisa kuota Fonnte: {fonnteStatus.quota}</p>
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

            {selectedIds.length > 0 && !sending && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 space-y-1">
                <p>
                  <span className="font-medium text-gray-900">{pratinjau.valid}</span> nomor siap dikirim
                  {pratinjau.chunkCount > 1 && ` — bertahap dalam ${pratinjau.chunkCount} tahap @ ${REMINDER_CHUNK_SIZE}`}
                </p>
                {pratinjau.invalid > 0 && (
                  <p className="text-amber-700">
                    {pratinjau.invalid} nomor tidak valid dan akan dilewati
                    {pratinjau.contohInvalid.length > 0 && `: ${pratinjau.contohInvalid.join(', ')}`}
                    {pratinjau.invalid > pratinjau.contohInvalid.length && ', dst.'}
                  </p>
                )}
              </div>
            )}

            {sending && progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Mengirim {progress.selesai}/{progress.total} donatur…</span>
                  <button
                    onClick={() => { stopRef.current = true; }}
                    className="text-red-600 hover:text-red-700 font-medium"
                  >
                    Hentikan
                  </button>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${progress.total ? (progress.selesai / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={sending || selectedIds.length === 0 || !pesan.trim() || deviceTerputus}
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
                  <TableCell className="text-sm font-medium">{donaturNameMap.get(r.donatur_id) || r.donatur_id}</TableCell>
                  <TableCell className="text-sm">{TIPE_LABELS[r.jenis_reminder] || r.jenis_reminder}</TableCell>
                  <TableCell className="text-sm">{donaturPhoneMap.get(r.donatur_id) || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      label={STATUS_LABELS[r.status_kirim] || r.status_kirim}
                      variant={STATUS_VARIANT[r.status_kirim] as 'AKTIF' | 'VOID' | 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {/* Alasan gagal harus bisa dibaca UTUH — pada insiden lalu
                        penyebabnya terpotong dan hanya tersisa di log Vercel. */}
                    <button
                      onClick={() => setExpandedDetail(expandedDetail === r.id ? null : r.id)}
                      className="text-left text-xs text-gray-500 hover:text-gray-700"
                      title={r.error_message}
                    >
                      <span className={expandedDetail === r.id ? 'block max-w-xs whitespace-pre-wrap' : 'block max-w-xs truncate'}>
                        {r.error_message}
                      </span>
                      {r.target && expandedDetail === r.id && (
                        <span className="block mt-1 text-gray-400">
                          Nomor: {r.target}
                          {r.http_status && ` · HTTP ${r.http_status}`}
                          {r.fonnte_id && ` · id ${r.fonnte_id}`}
                        </span>
                      )}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={`Kirim ke ${selectedIds.length} donatur?`}
        message={
          `${pratinjau.valid} nomor akan dikirimi pesan` +
          (pratinjau.invalid > 0 ? `, ${pratinjau.invalid} nomor tidak valid dilewati` : '') +
          `. Pengiriman dilakukan bertahap dalam ${pratinjau.chunkCount} tahap dan akan berhenti otomatis bila sesi WhatsApp terputus. ` +
          'Pastikan device Fonnte terhubung sebelum melanjutkan.'
        }
        confirmLabel="Kirim sekarang"
        onConfirm={() => { setConfirmOpen(false); runSend(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
