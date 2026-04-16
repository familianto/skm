'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatRupiah } from '@/lib/utils';
import type { QurbanPublikResponse, QurbanHewanItem } from '@/types/qurban';

const SLIDE_DURATION = 10_000;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const TOTAL_SLIDES = 4;

function SummarySlide({ data }: { data: QurbanPublikResponse }) {
  const { summary } = data;
  const pct = summary.total_muqorib > 0 ? Math.round((summary.total_lunas / summary.total_muqorib) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-5">
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/15">
        <div className="text-xs opacity-80 uppercase tracking-wider mb-2">{'\u{1F404}'} Sapi</div>
        <div className="text-4xl font-extrabold mb-2">{summary.total_sapi} ekor</div>
        <div className="text-sm opacity-80 leading-relaxed">
          {Object.entries(summary.sapi_breakdown).sort().map(([t, n]) => `Kelas ${t}: ${n}`).join(' \u00b7 ')}
          {summary.sapi_penitipan > 0 && <><br /><span className="opacity-70">{summary.sapi_penitipan} ekor Penitipan</span></>}
        </div>
      </div>
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/15">
        <div className="text-xs opacity-80 uppercase tracking-wider mb-2">{'\u{1F410}'} Kambing</div>
        <div className="text-4xl font-extrabold mb-2">{summary.total_kambing} ekor</div>
        <div className="text-sm opacity-80 leading-relaxed">
          {Object.entries(summary.kambing_breakdown).sort().map(([t, n]) => `Kelas ${t}: ${n}`).join(' \u00b7 ')}
          {summary.kambing_penitipan > 0 && <><br /><span className="opacity-70">{summary.kambing_penitipan} ekor Penitipan</span></>}
        </div>
      </div>
      <div className="col-span-2 bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/15">
        <div className="text-xs opacity-80 uppercase tracking-wider mb-3">Status Pembayaran</div>
        <div className="flex justify-between items-center mb-3 text-sm">
          <span>Total {summary.total_muqorib} Muqorib</span>
          <span>
            <strong className="text-emerald-300">{'\u2705'} {summary.total_lunas} Lunas</strong>
            {' \u00b7 '}
            <span className="opacity-70">{'\u23F3'} {summary.total_belum} Belum</span>
          </span>
        </div>
        <div className="h-2 bg-white/15 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs opacity-70">{pct}% muqorib sudah melunasi &middot; Jazakumullah khairan {'\u{1F319}'}</div>
      </div>
    </div>
  );
}

function HewanListSlide({ title, icon, items }: { title: string; icon: string; items: QurbanHewanItem[] }) {
  const top5 = items.slice(0, 5);

  return (
    <div>
      <div className="text-xl font-bold mb-4">{icon} {title}</div>
      <div className="grid gap-3">
        {top5.map(h => (
          <div key={h.id_hewan} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/15 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold">{h.id_hewan}</span>
                <span className="text-xs opacity-70">Kelas {h.tipe}</span>
                {h.is_penitipan && <span className="text-[10px] bg-amber-500/80 px-1.5 py-0.5 rounded font-semibold">PENITIPAN</span>}
              </div>
              <div className="text-sm opacity-80">
                {h.peserta.slice(0, 3).map(p => p.nama).join(', ')}
                {h.peserta.length > 3 && ` +${h.peserta.length - 3} lainnya`}
              </div>
            </div>
            <div className={`text-lg font-bold px-3 py-1 rounded-full ${h.terisi === h.kuota ? 'bg-emerald-500/30' : 'bg-white/10'}`}>
              {h.terisi}/{h.kuota}
            </div>
          </div>
        ))}
        {top5.length === 0 && <div className="text-center py-8 opacity-50">Belum ada data</div>}
      </div>
    </div>
  );
}

function PenitipanSlide({ items }: { items: QurbanHewanItem[] }) {
  return (
    <div>
      <div className="text-xl font-bold mb-4">{'\u{1F3F7}\uFE0F'} Daftar Penitipan</div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(h => (
          <div key={h.id_hewan} className="bg-amber-500/15 backdrop-blur-sm rounded-xl p-4 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold">{h.id_hewan}</span>
              <span className="text-xs opacity-70">{h.jenis} Kelas {h.tipe}</span>
            </div>
            <div className="text-sm opacity-80 mb-1">
              BOP: {formatRupiah(h.bop_per_ekor)}/ekor
            </div>
            {h.peserta.map(p => (
              <div key={p.slot} className="text-sm flex items-center gap-1.5 mt-1">
                <span>{p.nama}</span>
                <span>{p.status_bayar === 'Lunas' ? '\u2705' : '\u2014'}</span>
              </div>
            ))}
            {h.terisi === 0 && <div className="text-sm opacity-40 italic mt-1">Belum ada peserta</div>}
          </div>
        ))}
        {items.length === 0 && <div className="col-span-2 text-center py-8 opacity-50">Belum ada penitipan</div>}
      </div>
    </div>
  );
}

export default function QurbanTVPage() {
  const [data, setData] = useState<QurbanPublikResponse | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/publik/qurban');
        const json = await res.json();
        if (json.success && json.data) setData(json.data);
      } catch { /* retry on next interval */ }
    }
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide(prev => (prev + 1) % TOTAL_SLIDES), SLIDE_DURATION);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const sapiSorted = useMemo(() =>
    (data?.hewan || []).filter(h => h.jenis === 'Sapi').sort((a, b) => b.terisi - a.terisi),
    [data]);

  const kambingSorted = useMemo(() =>
    (data?.hewan || []).filter(h => h.jenis === 'Kambing').sort((a, b) => b.terisi - a.terisi),
    [data]);

  const penitipanList = useMemo(() =>
    (data?.hewan || []).filter(h => h.is_penitipan),
    [data]);

  const slideNames = ['Ringkasan', 'Sapi', 'Kambing', 'Penitipan'];

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 text-white p-8 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="flex justify-between items-start mb-6 relative">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 bg-white/15 rounded-full flex items-center justify-center text-3xl backdrop-blur-sm">{'\u{1F54C}'}</div>
          <div>
            <div className="text-xs opacity-80">Masjid Al Jabar Jatinegara Baru</div>
            <div className="text-xl font-bold">Qurban 1447H / 2026</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="text-sm opacity-80">{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</div>
        </div>
      </header>

      <div className="relative mb-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Laporan Progress Qurban</h1>
        <p className="text-sm opacity-75 mt-1">Transparansi pengumpulan dan pelaksanaan untuk jamaah</p>
      </div>

      {/* Slides */}
      <div className="relative min-h-[360px]">
        {currentSlide === 0 && <SummarySlide data={data} />}
        {currentSlide === 1 && <HewanListSlide title="Top Sapi" icon={'\u{1F404}'} items={sapiSorted} />}
        {currentSlide === 2 && <HewanListSlide title="Top Kambing" icon={'\u{1F410}'} items={kambingSorted} />}
        {currentSlide === 3 && <PenitipanSlide items={penitipanList} />}
      </div>

      {/* Footer */}
      <footer className="absolute bottom-5 left-8 right-8 flex justify-between items-center text-xs opacity-60 border-t border-white/15 pt-3">
        <span>{'\u{1F4F1}'} Info lengkap: skm-pi.vercel.app/publik/qurban</span>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === currentSlide ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
        <span>Slide {currentSlide + 1}/{TOTAL_SLIDES} &middot; {slideNames[currentSlide]}</span>
      </footer>
    </div>
  );
}
