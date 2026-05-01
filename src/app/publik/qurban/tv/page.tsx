'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { formatRupiah } from '@/lib/utils';
import type { QurbanPublikResponse, QurbanHewanItem } from '@/types/qurban';

const SLIDE_DURATION = 10_000;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const MAX_CARDS_PER_SLIDE = 4;
const KAMBING_COMBINE_THRESHOLD = 4;

// --- Slide builder ---

interface SlideConfig {
  type: 'ringkasan' | 'detail';
  label: string;
  subtitle?: string;
  items: QurbanHewanItem[];
}

function buildSlides(data: QurbanPublikResponse): SlideConfig[] {
  const slides: SlideConfig[] = [{ type: 'ringkasan', label: 'Ringkasan', items: [] }];

  const sapiByTipe = new Map<string, QurbanHewanItem[]>();
  const kambingAll: QurbanHewanItem[] = [];

  for (const h of data.hewan) {
    if (h.jenis === 'Sapi') {
      const list = sapiByTipe.get(h.tipe) || [];
      list.push(h);
      sapiByTipe.set(h.tipe, list);
    } else {
      kambingAll.push(h);
    }
  }

  for (const [tipe, items] of Array.from(sapiByTipe.entries()).sort()) {
    if (items.length === 0) continue;
    const ref = items[0];
    const sub = [ref.berat_rata2, `${formatRupiah(ref.harga_per_orang)}/slot`, `Total ${formatRupiah(ref.harga_qurban)}/ekor`]
      .filter(Boolean).join(' \u00b7 ');
    if (items.length <= MAX_CARDS_PER_SLIDE) {
      slides.push({ type: 'detail', label: `\u{1F404} Sapi Kelas ${tipe}`, subtitle: sub, items });
    } else {
      const totalPages = Math.ceil(items.length / MAX_CARDS_PER_SLIDE);
      for (let i = 0; i < items.length; i += MAX_CARDS_PER_SLIDE) {
        const page = Math.floor(i / MAX_CARDS_PER_SLIDE) + 1;
        slides.push({
          type: 'detail',
          label: `\u{1F404} Sapi Kelas ${tipe} (${page}/${totalPages})`,
          subtitle: sub,
          items: items.slice(i, i + MAX_CARDS_PER_SLIDE),
        });
      }
    }
  }

  if (kambingAll.length > 0 && kambingAll.length <= KAMBING_COMBINE_THRESHOLD) {
    slides.push({ type: 'detail', label: '\u{1F410} Kambing', items: kambingAll });
  } else if (kambingAll.length > KAMBING_COMBINE_THRESHOLD) {
    const kambingByTipe = new Map<string, QurbanHewanItem[]>();
    for (const h of kambingAll) {
      const list = kambingByTipe.get(h.tipe) || [];
      list.push(h);
      kambingByTipe.set(h.tipe, list);
    }
    for (const [tipe, items] of Array.from(kambingByTipe.entries()).sort()) {
      if (items.length === 0) continue;
      const ref = items[0];
      const sub = [ref.berat_rata2, `${formatRupiah(ref.harga_per_orang)}/ekor`].filter(Boolean).join(' \u00b7 ');
      if (items.length <= MAX_CARDS_PER_SLIDE) {
        slides.push({ type: 'detail', label: `\u{1F410} Kambing Kelas ${tipe}`, subtitle: sub, items });
      } else {
        const totalPages = Math.ceil(items.length / MAX_CARDS_PER_SLIDE);
        for (let i = 0; i < items.length; i += MAX_CARDS_PER_SLIDE) {
          const page = Math.floor(i / MAX_CARDS_PER_SLIDE) + 1;
          slides.push({
            type: 'detail',
            label: `\u{1F410} Kambing Kelas ${tipe} (${page}/${totalPages})`,
            subtitle: sub,
            items: items.slice(i, i + MAX_CARDS_PER_SLIDE),
          });
        }
      }
    }
  }

  return slides;
}

// --- Summary slide ---

function AnimalSummaryCard({ icon, label, total, breakdown, penitipanCount }: {
  icon: string; label: string; total: number;
  breakdown: Record<string, number>; penitipanCount: number;
}) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-[0.8vw] p-[1.5vw] border border-white/15 flex items-center">
      <div className="w-[40%] flex flex-col items-center justify-center text-center pr-[1vw]">
        <div style={{ fontSize: 'clamp(32px, 3vw, 48px)' }}>{icon}</div>
        <div className="tv-ring-num">{total}</div>
        <div className="tv-ring-label">ekor {label}</div>
      </div>
      <div className="w-[60%] border-l border-white/20 pl-[1.2vw] flex flex-col justify-center">
        {Object.entries(breakdown).sort().map(([tipe, count]) => (
          <div key={tipe} className="flex items-center gap-[0.3vw] tv-ring-breakdown leading-[1.8]">
            <span>Kelas {tipe}</span>
            <span className="flex-1 border-b border-dotted border-white/20 mx-[0.3vw]" />
            <span>{count} ekor</span>
          </div>
        ))}
        {penitipanCount > 0 && (
          <div className="tv-ring-penitipan mt-[0.5vh] opacity-60">{penitipanCount} ekor Penitipan</div>
        )}
      </div>
    </div>
  );
}

function SummarySlide({ data }: { data: QurbanPublikResponse }) {
  const { summary } = data;
  const pct = summary.total_muqorib > 0 ? Math.round((summary.total_lunas / summary.total_muqorib) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-[1.2vw] h-full grid-rows-[1fr_auto]">
      <AnimalSummaryCard icon={'\u{1F404}'} label="Sapi" total={summary.total_sapi}
        breakdown={summary.sapi_breakdown} penitipanCount={summary.sapi_penitipan} />
      <AnimalSummaryCard icon={'\u{1F410}'} label="Kambing" total={summary.total_kambing}
        breakdown={summary.kambing_breakdown} penitipanCount={summary.kambing_penitipan} />
      <div className="col-span-2 bg-white/10 backdrop-blur-sm rounded-[0.8vw] p-[1.5vw] border border-white/15 flex flex-col justify-center">
        <div className="tv-label-text mb-[0.6vh]">Status Pembayaran</div>
        <div className="flex justify-between items-center mb-[0.6vh] tv-ring-breakdown">
          <span>Total {summary.total_muqorib} Muqorib</span>
          <span>
            <strong className="text-emerald-300">{'\u2705'} {summary.total_lunas} Lunas</strong>
            {' \u00b7 '}
            <span className="opacity-70">{'\u23F3'} {summary.total_belum} Belum</span>
          </span>
        </div>
        <div className="h-[0.6vh] bg-white/15 rounded-full overflow-hidden mb-[0.6vh]">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="tv-small opacity-70">{pct}% muqorib sudah melunasi &middot; Jazakumullah khairan {'\u{1F319}'}</div>
        <div className="opacity-60 mt-[0.4vh]" style={{ fontSize: 'clamp(10px, 0.9vw, 14px)' }}>Penomoran &amp; pengelompokan muqorib dapat diatur ulang oleh Panitia</div>
      </div>
    </div>
  );
}

// --- Detail cards ---

function SlotRow({ slot, nama, statusBayar }: { slot: number; nama: string | null; statusBayar: string | null }) {
  return (
    <div className="flex items-center gap-[0.3vw] py-[0.2vh]">
      <span className="tv-slot-num opacity-40 w-[1.2vw] flex-shrink-0 text-right">{slot}</span>
      {nama ? (
        <>
          <span className="tv-muqorib-sapi flex-1 truncate font-medium">{nama}</span>
          <span className="tv-status flex-shrink-0">{statusBayar === 'Lunas' ? '\u2705' : '\u2014'}</span>
        </>
      ) : (
        <span className="tv-muqorib-sapi flex-1 opacity-30 italic">(tersedia)</span>
      )}
    </div>
  );
}

function SapiCard({ hewan }: { hewan: QurbanHewanItem }) {
  const isPenitipan = hewan.is_penitipan;
  const isFull = hewan.terisi === hewan.kuota && hewan.kuota > 0;

  const allSlots = useMemo(() => {
    const result: { slot: number; nama: string | null; statusBayar: string | null }[] = [];
    const maxSlot = Math.max(hewan.kuota, ...hewan.peserta.map(p => p.slot));
    for (let i = 1; i <= maxSlot; i++) {
      const p = hewan.peserta.find(s => s.slot === i);
      result.push({ slot: i, nama: p?.nama || null, statusBayar: p?.status_bayar || null });
    }
    return result;
  }, [hewan]);

  const mid = Math.ceil(allSlots.length / 2);
  const leftCol = allSlots.slice(0, mid);
  const rightCol = allSlots.slice(mid);

  return (
    <div className={`rounded-[0.6vw] p-[1vw] border flex flex-col ${
      isPenitipan
        ? 'border-l-[3px] border-amber-500 bg-gradient-to-br from-amber-500/8 to-white/6'
        : 'bg-white/8 border-white/15'
    }`}>
      <div className="flex justify-between items-center mb-[0.5vh]">
        <div className="flex items-center gap-[0.4vw]">
          <span className="tv-hewan-id font-bold">{hewan.id_hewan}</span>
          {isPenitipan && <span className="tv-penitipan-badge">PENITIPAN</span>}
        </div>
        <span className={`tv-slot-badge font-bold px-[0.6vw] py-[0.15vh] rounded-full ${
          isFull ? 'bg-emerald-500/30' : hewan.terisi === 0 ? 'bg-white/10 opacity-50' : 'bg-white/10'
        }`}>{hewan.terisi}/{hewan.kuota}{isFull && ' \u2705'}</span>
      </div>

      {isPenitipan && (
        <div className="tv-price text-amber-400 mb-[0.4vh]">BOP: {formatRupiah(hewan.bop_per_ekor)}/ekor</div>
      )}

      {hewan.terisi > 0 || hewan.kuota > 0 ? (
        <div className="grid grid-cols-2 gap-x-[0.8vw] flex-1 content-start">
          <div>{leftCol.map(s => <SlotRow key={s.slot} {...s} />)}</div>
          <div>{rightCol.map(s => <SlotRow key={s.slot} {...s} />)}</div>
        </div>
      ) : null}
    </div>
  );
}

function KambingCard({ hewan }: { hewan: QurbanHewanItem }) {
  const isPenitipan = hewan.is_penitipan;
  const isFull = hewan.terisi === hewan.kuota && hewan.kuota > 0;
  const peserta = hewan.peserta[0];

  return (
    <div className={`rounded-[0.6vw] p-[1vw] border flex flex-col ${
      isPenitipan
        ? 'border-l-[3px] border-amber-500 bg-gradient-to-br from-amber-500/8 to-white/6'
        : 'bg-white/8 border-white/15'
    }`}>
      <div className="flex justify-between items-center mb-[0.3vh]">
        <div className="flex items-center gap-[0.4vw]">
          <span className="tv-hewan-id font-bold">{hewan.id_hewan}</span>
          <span className="tv-small opacity-60">Kelas {hewan.tipe}</span>
          {isPenitipan && <span className="tv-penitipan-badge">PENITIPAN</span>}
        </div>
        <span className={`tv-slot-badge font-bold px-[0.6vw] py-[0.15vh] rounded-full ${
          isFull ? 'bg-emerald-500/30' : hewan.terisi === 0 ? 'bg-white/10 opacity-50' : 'bg-white/10'
        }`}>{hewan.terisi}/{hewan.kuota}{isFull && ' \u2705'}</span>
      </div>

      <div className={`tv-price mb-[0.6vh] ${isPenitipan ? 'text-amber-400' : 'text-emerald-300'}`}>
        {isPenitipan ? `BOP: ${formatRupiah(hewan.bop_per_ekor)}` : formatRupiah(hewan.harga_per_orang)}
        {hewan.berat_rata2 && ` \u00b7 ${hewan.berat_rata2}`}
      </div>

      <div className="flex-1 flex items-center">
        {peserta ? (
          <div className="flex items-center gap-[0.5vw]">
            <span className="tv-muqorib-kambing font-medium">{peserta.nama}</span>
            <span className="tv-status">{peserta.status_bayar === 'Lunas' ? '\u2705' : '\u2014'}</span>
          </div>
        ) : (
          <span className="tv-small opacity-40 italic">(belum ada muqorib)</span>
        )}
      </div>
    </div>
  );
}

function DetailSlide({ slide }: { slide: SlideConfig }) {
  const { items } = slide;
  const isSapi = items[0]?.jenis === 'Sapi';
  const gridCols = items.length === 3 ? 'grid-cols-3' : items.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className="flex flex-col h-full">
      <div className="mb-[1vh] flex-shrink-0">
        <div className="tv-slide-title font-bold">{slide.label}</div>
        {slide.subtitle && <div className="tv-slide-sub opacity-70 mt-[0.2vh]">{slide.subtitle}</div>}
      </div>
      <div className={`grid ${gridCols} gap-[1vw] flex-1 content-stretch`}>
        {items.map(h => isSapi
          ? <SapiCard key={h.id_hewan} hewan={h} />
          : <KambingCard key={h.id_hewan} hewan={h} />
        )}
      </div>
    </div>
  );
}

// --- Main ---

export default function QurbanTVPage() {
  const [data, setData] = useState<QurbanPublikResponse | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [now, setNow] = useState(new Date());
  const [progress, setProgress] = useState(0);
  const slideStartRef = useRef(0);

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

  const slides = useMemo(() => data ? buildSlides(data) : [], [data]);
  const safeSlide = slides.length > 0 ? currentSlide % slides.length : 0;

  useEffect(() => {
    if (slides.length === 0) return;
    slideStartRef.current = Date.now();
    const frame = () => {
      const elapsed = Date.now() - slideStartRef.current;
      const p = Math.min(elapsed / SLIDE_DURATION, 1);
      setProgress(p);
      if (p < 1) rafId = requestAnimationFrame(frame);
    };
    let rafId = requestAnimationFrame(frame);
    const timer = setTimeout(() => {
      setCurrentSlide(prev => (prev + 1) % slides.length);
    }, SLIDE_DURATION);
    return () => { cancelAnimationFrame(rafId); clearTimeout(timer); };
  }, [safeSlide, slides.length]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!data) {
    return (
      <div className="w-screen h-screen bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 flex items-center justify-center text-white overflow-hidden">
        <div className="animate-spin rounded-full h-[4vw] w-[4vw] border-b-2 border-white" />
      </div>
    );
  }

  const slide = slides[safeSlide] || slides[0];

  return (
    <>
      <style>{`
        .tv-screen { width: 100vw; height: 100vh; overflow: hidden; cursor: none; user-select: none; }
        .tv-safe { padding: 5vh 5vw; width: 100%; height: 100%; display: flex; flex-direction: column; }

        .tv-slide-title { font-size: clamp(24px, 2.5vw, 38px); }
        .tv-slide-sub { font-size: clamp(11px, 1vw, 14px); }
        .tv-hewan-id { font-size: clamp(15px, 1.4vw, 20px); }
        .tv-muqorib-sapi { font-size: clamp(12px, 1.1vw, 16px); }
        .tv-muqorib-kambing { font-size: clamp(14px, 1.3vw, 18px); }
        .tv-status { font-size: clamp(11px, 1vw, 15px); }
        .tv-slot-num { font-size: clamp(10px, 0.85vw, 14px); }
        .tv-slot-badge { font-size: clamp(12px, 1.1vw, 16px); }
        .tv-price { font-size: clamp(11px, 0.9vw, 14px); }
        .tv-ring-num { font-size: clamp(40px, 4vw, 60px); font-weight: 800; line-height: 1.1; }
        .tv-ring-label { font-size: clamp(14px, 1.3vw, 20px); opacity: 0.85; }
        .tv-ring-breakdown { font-size: clamp(14px, 1.3vw, 20px); }
        .tv-ring-penitipan { font-size: clamp(12px, 1.1vw, 17px); }
        .tv-label-text { font-size: clamp(10px, 0.8vw, 16px); opacity: 0.85; text-transform: uppercase; letter-spacing: 0.08em; }
        .tv-small { font-size: clamp(10px, 0.85vw, 17px); }
        .tv-header-sub { font-size: clamp(10px, 0.85vw, 16px); }
        .tv-header-title { font-size: clamp(14px, 1.4vw, 26px); }
        .tv-header-date { font-size: clamp(12px, 1.1vw, 20px); }
        .tv-main-title { font-size: clamp(24px, 2.8vw, 48px); }
        .tv-penitipan-badge {
          font-size: clamp(8px, 0.7vw, 12px); font-weight: 700;
          background: #d4a017; color: #1a1a1a;
          border-radius: 4px; padding: 0.15vh 0.4vw;
          letter-spacing: 0.03em;
        }
      `}</style>

      <div className="tv-screen bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 text-white relative">
        <div className="absolute -top-[6vw] -right-[6vw] w-[25vw] h-[25vw] bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="tv-safe">
          {/* Header */}
          <header className="flex justify-between items-start mb-[1vh] relative flex-shrink-0">
            <div className="flex items-center gap-[1vw]">
              <div className="w-[3.2vw] h-[3.2vw] bg-white/15 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ fontSize: 'clamp(16px, 1.8vw, 32px)' }}>{'\u{1F54C}'}</div>
              <div>
                <div className="tv-header-sub opacity-80">Masjid Al Jabar Jatinegara Baru</div>
                <div className="tv-header-title font-bold">Qurban 1447H / 2026</div>
              </div>
            </div>
            <div className="text-right">
              <div className="tv-header-date font-bold">{now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="tv-header-sub opacity-80">{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</div>
            </div>
          </header>

          {/* Title */}
          <div className="relative mb-[1vh] flex-shrink-0">
            <h1 className="tv-main-title font-extrabold tracking-tight">Laporan Progress Qurban</h1>
            <p className="tv-small opacity-75 mt-[0.2vh]">Transparansi pengumpulan dan pelaksanaan untuk jamaah</p>
          </div>

          {/* Slide content */}
          <div className="relative flex-1 min-h-0">
            {slide.type === 'ringkasan' ? <SummarySlide data={data} /> : <DetailSlide slide={slide} />}
          </div>

          {/* Footer */}
          <footer className="mt-[0.8vh] flex-shrink-0">
            <div className="flex items-center gap-[0.8vw] mb-[0.5vh]">
              <div className="flex-1 h-[0.4vh] bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/70 rounded-full"
                  style={{ width: `${slides.length > 0 ? ((safeSlide + progress) / slides.length) * 100 : 0}%` }}
                />
              </div>
              <span className="tv-small opacity-60 flex-shrink-0">Slide {safeSlide + 1} / {slides.length}</span>
            </div>
            <div className="tv-small opacity-50">
              {'\u{1F4F1}'} Info lengkap: skm-pi.vercel.app/publik/qurban
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
