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
    <div className="grid grid-cols-2 gap-[1.2vw] h-full">
      <div className="bg-white/10 backdrop-blur-sm rounded-[0.8vw] p-[1.5vw] border border-white/15 flex flex-col justify-center">
        <div className="tv-label mb-[0.5vh]">{'\u{1F404}'} Sapi</div>
        <div className="tv-hero mb-[0.5vh]">{summary.total_sapi} ekor</div>
        <div className="tv-body opacity-80 leading-relaxed">
          {Object.entries(summary.sapi_breakdown).sort().map(([t, n]) => `Kelas ${t}: ${n}`).join(' \u00b7 ')}
          {summary.sapi_penitipan > 0 && <><br /><span className="opacity-70">{summary.sapi_penitipan} ekor Penitipan</span></>}
        </div>
      </div>
      <div className="bg-white/10 backdrop-blur-sm rounded-[0.8vw] p-[1.5vw] border border-white/15 flex flex-col justify-center">
        <div className="tv-label mb-[0.5vh]">{'\u{1F410}'} Kambing</div>
        <div className="tv-hero mb-[0.5vh]">{summary.total_kambing} ekor</div>
        <div className="tv-body opacity-80 leading-relaxed">
          {Object.entries(summary.kambing_breakdown).sort().map(([t, n]) => `Kelas ${t}: ${n}`).join(' \u00b7 ')}
          {summary.kambing_penitipan > 0 && <><br /><span className="opacity-70">{summary.kambing_penitipan} ekor Penitipan</span></>}
        </div>
      </div>
      <div className="col-span-2 bg-white/10 backdrop-blur-sm rounded-[0.8vw] p-[1.5vw] border border-white/15 flex flex-col justify-center">
        <div className="tv-label mb-[0.8vh]">Status Pembayaran</div>
        <div className="flex justify-between items-center mb-[0.8vh] tv-body">
          <span>Total {summary.total_muqorib} Muqorib</span>
          <span>
            <strong className="text-emerald-300">{'\u2705'} {summary.total_lunas} Lunas</strong>
            {' \u00b7 '}
            <span className="opacity-70">{'\u23F3'} {summary.total_belum} Belum</span>
          </span>
        </div>
        <div className="h-[0.6vh] bg-white/15 rounded-full overflow-hidden mb-[0.8vh]">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="tv-small opacity-70">{pct}% muqorib sudah melunasi &middot; Jazakumullah khairan {'\u{1F319}'}</div>
      </div>
    </div>
  );
}

function HewanListSlide({ title, icon, items }: { title: string; icon: string; items: QurbanHewanItem[] }) {
  const top5 = items.slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      <div className="tv-subtitle font-bold mb-[1vh]">{icon} {title}</div>
      <div className="grid gap-[0.8vh] flex-1">
        {top5.map(h => (
          <div key={h.id_hewan} className="bg-white/10 backdrop-blur-sm rounded-[0.6vw] px-[1.2vw] py-[0.8vh] border border-white/15 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-[0.5vw] mb-[0.2vh]">
                <span className="font-bold tv-body">{h.id_hewan}</span>
                <span className="tv-small opacity-70">Kelas {h.tipe}</span>
                {h.is_penitipan && <span className="tv-small bg-amber-500/80 px-[0.4vw] py-[0.1vh] rounded font-semibold">PENITIPAN</span>}
              </div>
              <div className="tv-small opacity-80">
                {h.peserta.slice(0, 3).map(p => p.nama).join(', ')}
                {h.peserta.length > 3 && ` +${h.peserta.length - 3} lainnya`}
              </div>
            </div>
            <div className={`tv-body font-bold px-[0.8vw] py-[0.3vh] rounded-full ${h.terisi === h.kuota ? 'bg-emerald-500/30' : 'bg-white/10'}`}>
              {h.terisi}/{h.kuota}
            </div>
          </div>
        ))}
        {top5.length === 0 && <div className="text-center tv-body opacity-50 flex items-center justify-center">Belum ada data</div>}
      </div>
    </div>
  );
}

function PenitipanSlide({ items }: { items: QurbanHewanItem[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="tv-subtitle font-bold mb-[1vh]">{'\u{1F3F7}\uFE0F'} Daftar Penitipan</div>
      <div className="grid grid-cols-2 gap-[1vw] flex-1 content-start">
        {items.map(h => (
          <div key={h.id_hewan} className="bg-amber-500/15 backdrop-blur-sm rounded-[0.6vw] p-[1.2vw] border border-amber-500/20">
            <div className="flex items-center gap-[0.5vw] mb-[0.5vh]">
              <span className="font-bold tv-body">{h.id_hewan}</span>
              <span className="tv-small opacity-70">{h.jenis} Kelas {h.tipe}</span>
            </div>
            <div className="tv-small opacity-80 mb-[0.3vh]">
              BOP: {formatRupiah(h.bop_per_ekor)}/ekor
            </div>
            {h.peserta.map(p => (
              <div key={p.slot} className="tv-small flex items-center gap-[0.3vw] mt-[0.2vh]">
                <span>{p.nama}</span>
                <span>{p.status_bayar === 'Lunas' ? '\u2705' : '\u2014'}</span>
              </div>
            ))}
            {h.terisi === 0 && <div className="tv-small opacity-40 italic mt-[0.2vh]">Belum ada peserta</div>}
          </div>
        ))}
        {items.length === 0 && <div className="col-span-2 text-center tv-body opacity-50 flex items-center justify-center">Belum ada penitipan</div>}
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
      <div className="w-screen h-screen bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 flex items-center justify-center text-white overflow-hidden">
        <div className="animate-spin rounded-full h-[4vw] w-[4vw] border-b-2 border-white" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tv-screen {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          cursor: none;
          user-select: none;
        }
        .tv-safe {
          padding: 5vh 5vw;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .tv-title { font-size: clamp(24px, 2.8vw, 56px); }
        .tv-subtitle { font-size: clamp(14px, 1.4vw, 28px); }
        .tv-hero { font-size: clamp(20px, 2.2vw, 44px); font-weight: 800; }
        .tv-body { font-size: clamp(12px, 1.1vw, 22px); }
        .tv-small { font-size: clamp(10px, 0.85vw, 17px); }
        .tv-label { font-size: clamp(10px, 0.8vw, 16px); opacity: 0.85; text-transform: uppercase; letter-spacing: 0.08em; }
      `}</style>

      <div className="tv-screen bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 text-white relative">
        <div className="absolute -top-[6vw] -right-[6vw] w-[25vw] h-[25vw] bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="tv-safe">
          {/* Header */}
          <header className="flex justify-between items-start mb-[1.5vh] relative flex-shrink-0">
            <div className="flex items-center gap-[1vw]">
              <div className="w-[3.5vw] h-[3.5vw] bg-white/15 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ fontSize: 'clamp(16px, 1.8vw, 36px)' }}>{'\u{1F54C}'}</div>
              <div>
                <div className="tv-small opacity-80">Masjid Al Jabar Jatinegara Baru</div>
                <div className="tv-subtitle font-bold">Qurban 1447H / 2026</div>
              </div>
            </div>
            <div className="text-right">
              <div className="tv-body font-bold">{now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="tv-small opacity-80">{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</div>
            </div>
          </header>

          {/* Title */}
          <div className="relative mb-[1.5vh] flex-shrink-0">
            <h1 className="tv-title font-extrabold tracking-tight">Laporan Progress Qurban</h1>
            <p className="tv-small opacity-75 mt-[0.3vh]">Transparansi pengumpulan dan pelaksanaan untuk jamaah</p>
          </div>

          {/* Slides — flex-1 fills remaining space */}
          <div className="relative flex-1 min-h-0">
            {currentSlide === 0 && <SummarySlide data={data} />}
            {currentSlide === 1 && <HewanListSlide title="Top Sapi" icon={'\u{1F404}'} items={sapiSorted} />}
            {currentSlide === 2 && <HewanListSlide title="Top Kambing" icon={'\u{1F410}'} items={kambingSorted} />}
            {currentSlide === 3 && <PenitipanSlide items={penitipanList} />}
          </div>

          {/* Footer — pinned at bottom of safe zone */}
          <footer className="flex justify-between items-center tv-small opacity-60 border-t border-white/15 pt-[0.8vh] mt-[1vh] flex-shrink-0">
            <span>{'\u{1F4F1}'} Info lengkap: skm-pi.vercel.app/publik/qurban</span>
            <div className="flex gap-[0.4vw]">
              {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
                <div key={i} className={`w-[0.5vw] h-[0.5vw] rounded-full ${i === currentSlide ? 'bg-white' : 'bg-white/30'}`} />
              ))}
            </div>
            <span>Slide {currentSlide + 1}/{TOTAL_SLIDES} &middot; {slideNames[currentSlide]}</span>
          </footer>
        </div>
      </div>
    </>
  );
}
