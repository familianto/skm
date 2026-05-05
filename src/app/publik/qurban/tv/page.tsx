'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { formatRupiah } from '@/lib/utils';
import type { QurbanPublikResponse, QurbanHewanItem } from '@/types/qurban';

const SLIDE_DURATION = 10_000;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const SAPI_PER_SLIDE = 4;
const KAMBING_PER_SLIDE = 6;

// --- Slide builder ---

interface SlideConfig {
  type: 'ringkasan' | 'sapi' | 'kambing';
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
      .filter(Boolean).join(' · ');
    if (items.length <= SAPI_PER_SLIDE) {
      slides.push({ type: 'sapi', label: `\u{1F404} Sapi Kelas ${tipe}`, subtitle: sub, items });
    } else {
      const totalPages = Math.ceil(items.length / SAPI_PER_SLIDE);
      for (let i = 0; i < items.length; i += SAPI_PER_SLIDE) {
        const page = Math.floor(i / SAPI_PER_SLIDE) + 1;
        slides.push({
          type: 'sapi',
          label: `\u{1F404} Sapi Kelas ${tipe} (${page}/${totalPages})`,
          subtitle: sub,
          items: items.slice(i, i + SAPI_PER_SLIDE),
        });
      }
    }
  }

  if (kambingAll.length > 0) {
    if (kambingAll.length <= KAMBING_PER_SLIDE) {
      slides.push({ type: 'kambing', label: '\u{1F410} Kambing', items: kambingAll });
    } else {
      const totalPages = Math.ceil(kambingAll.length / KAMBING_PER_SLIDE);
      for (let i = 0; i < kambingAll.length; i += KAMBING_PER_SLIDE) {
        const page = Math.floor(i / KAMBING_PER_SLIDE) + 1;
        slides.push({
          type: 'kambing',
          label: `\u{1F410} Kambing (${page}/${totalPages})`,
          items: kambingAll.slice(i, i + KAMBING_PER_SLIDE),
        });
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
    <div className="tv-card flex items-center">
      <div className="w-[40%] flex flex-col items-center justify-center text-center pr-[1cqw]">
        <div style={{ fontSize: '3cqw' }}>{icon}</div>
        <div className="tv-ring-num">{total}</div>
        <div className="tv-ring-label">ekor {label}</div>
      </div>
      <div className="w-[60%] border-l border-white/20 pl-[1.2cqw] flex flex-col justify-center">
        {Object.entries(breakdown).sort().map(([tipe, count]) => (
          <div key={tipe} className="flex items-center gap-[0.3cqw] tv-ring-breakdown leading-[1.8]">
            <span>Kelas {tipe}</span>
            <span className="flex-1 border-b border-dotted border-white/20 mx-[0.3cqw]" />
            <span>{count} ekor</span>
          </div>
        ))}
        {penitipanCount > 0 && (
          <div className="tv-ring-penitipan mt-[0.4cqw] opacity-60">{penitipanCount} ekor Penitipan</div>
        )}
      </div>
    </div>
  );
}

function SummarySlide({ data }: { data: QurbanPublikResponse }) {
  const { summary } = data;
  const pct = summary.total_muqorib > 0 ? Math.round((summary.total_lunas / summary.total_muqorib) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-[1.2cqw] h-full grid-rows-[1fr_auto]">
      <AnimalSummaryCard icon={'\u{1F404}'} label="Sapi" total={summary.total_sapi}
        breakdown={summary.sapi_breakdown} penitipanCount={summary.sapi_penitipan} />
      <AnimalSummaryCard icon={'\u{1F410}'} label="Kambing" total={summary.total_kambing}
        breakdown={summary.kambing_breakdown} penitipanCount={summary.kambing_penitipan} />
      <div className="col-span-2 tv-card flex flex-col justify-center">
        <div className="tv-label-text mb-[0.5cqw]">Status Pembayaran</div>
        <div className="flex justify-between items-center mb-[0.5cqw] tv-ring-breakdown">
          <span>Total {summary.total_muqorib} Muqorib</span>
          <span>
            <strong className="text-emerald-300">{'✅'} {summary.total_lunas} Lunas</strong>
            {' · '}
            <span className="opacity-70">{'⏳'} {summary.total_belum} Belum</span>
          </span>
        </div>
        <div className="h-[0.5cqw] bg-white/15 rounded-full overflow-hidden mb-[0.5cqw]">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="tv-small opacity-70">{pct}% muqorib sudah melunasi &middot; Jazakumullah khairan {'\u{1F319}'}</div>
      </div>
    </div>
  );
}

// --- Detail cards ---

function SlotRow({ slot, nama, statusBayar }: { slot: number; nama: string | null; statusBayar: string | null }) {
  return (
    <div className="flex items-center gap-[0.3cqw] py-[0.15cqw]">
      <span className="tv-slot-num opacity-40 w-[1.2cqw] flex-shrink-0 text-right">{slot}</span>
      {nama ? (
        <>
          <span className="tv-muqorib-name flex-1 truncate">{nama}</span>
          <span className="tv-muqorib-status flex-shrink-0">{statusBayar === 'Lunas' ? '✓' : '—'}</span>
        </>
      ) : (
        <span className="tv-muqorib-name flex-1 opacity-30 italic">(tersedia)</span>
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
    <div className={`tv-card flex flex-col ${isPenitipan ? 'tv-card-penitipan' : ''}`}>
      <div className="flex justify-between items-center mb-[0.3cqw]">
        <div className="flex items-center gap-[0.4cqw]">
          <span className="tv-card-id">{hewan.id_hewan}</span>
          {isPenitipan && <span className="tv-penitipan-badge">PENITIPAN</span>}
        </div>
        <span className={`tv-card-counter px-[0.5cqw] py-[0.1cqw] rounded-full ${
          isFull ? 'bg-emerald-500/30' : hewan.terisi === 0 ? 'bg-white/10 opacity-50' : 'bg-white/10'
        }`}>{hewan.terisi}/{hewan.kuota}{isFull && ' ✓'}</span>
      </div>

      {isPenitipan && (
        <div className="tv-card-info text-amber-400 mb-[0.2cqw]">BOP: {formatRupiah(hewan.bop_per_ekor)}/ekor</div>
      )}

      <div className="grid grid-cols-2 gap-x-[0.6cqw] flex-1 content-start">
        <div>{leftCol.map(s => <SlotRow key={s.slot} {...s} />)}</div>
        <div>{rightCol.map(s => <SlotRow key={s.slot} {...s} />)}</div>
      </div>
    </div>
  );
}

function KambingCard({ hewan }: { hewan: QurbanHewanItem }) {
  const isPenitipan = hewan.is_penitipan;
  const isFull = hewan.terisi === hewan.kuota && hewan.kuota > 0;
  const peserta = hewan.peserta[0];

  return (
    <div className={`tv-card flex flex-col ${isPenitipan ? 'tv-card-penitipan' : ''}`}>
      <div className="flex justify-between items-center mb-[0.2cqw]">
        <div className="flex items-center gap-[0.4cqw]">
          <span className="tv-card-id">{hewan.id_hewan}</span>
          <span className="tv-card-kelas opacity-60">Kelas {hewan.tipe}</span>
          {isPenitipan && <span className="tv-penitipan-badge">PENITIPAN</span>}
        </div>
        <span className={`tv-card-counter px-[0.5cqw] py-[0.1cqw] rounded-full ${
          isFull ? 'bg-emerald-500/30' : hewan.terisi === 0 ? 'bg-white/10 opacity-50' : 'bg-white/10'
        }`}>{hewan.terisi}/{hewan.kuota}{isFull && ' ✓'}</span>
      </div>

      <div className={`tv-card-info mb-[0.3cqw] ${isPenitipan ? 'text-amber-400' : 'text-emerald-300'}`}>
        {isPenitipan ? `BOP: ${formatRupiah(hewan.bop_per_ekor)}` : formatRupiah(hewan.harga_per_orang)}
        {hewan.berat_rata2 && ` · ${hewan.berat_rata2}`}
      </div>

      <div className="flex-1 flex items-center">
        {peserta ? (
          <div className="flex items-center gap-[0.4cqw]">
            <span className="tv-kambing-nama">{peserta.nama}</span>
            <span className="tv-kambing-status">{peserta.status_bayar === 'Lunas' ? '✓' : '—'}</span>
          </div>
        ) : (
          <span className="tv-card-info opacity-40 italic">(belum ada muqorib)</span>
        )}
      </div>
    </div>
  );
}

function DetailSlide({ slide }: { slide: SlideConfig }) {
  const { items, type } = slide;
  const gridClass = type === 'kambing' ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="flex flex-col h-full">
      <div className="mb-[0.8cqw] flex-shrink-0">
        <div className="tv-section-title font-bold">{slide.label}</div>
        {slide.subtitle && <div className="tv-section-meta opacity-70 mt-[0.2cqw]">{slide.subtitle}</div>}
      </div>
      <div className={`grid ${gridClass} gap-[0.8cqw] flex-1 content-stretch`}>
        {items.map(h => type === 'sapi'
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
        .tv-container { container-type: inline-size; flex: 1; min-height: 0; }

        /* Cards */
        .tv-card {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 0.6cqw;
          padding: 1cqw;
        }
        .tv-card-penitipan {
          border-left: 1.5px solid #f59e0b;
          background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(255,255,255,0.06));
        }

        /* Section title & meta */
        .tv-section-title { font-size: 2.6cqw; }
        .tv-section-meta { font-size: 1cqw; }

        /* Sapi card elements */
        .tv-card-id { font-size: 1.7cqw; font-weight: 800; }
        .tv-card-counter { font-size: 1.1cqw; font-weight: 700; }
        .tv-card-info { font-size: 0.95cqw; }
        .tv-card-kelas { font-size: 1cqw; }
        .tv-muqorib-name { font-size: 1.15cqw; font-weight: 600; }
        .tv-slot-num { font-size: 0.9cqw; }
        .tv-muqorib-status { font-size: 1cqw; color: #6ee7b7; }

        /* Kambing card elements */
        .tv-kambing-nama { font-size: 1.5cqw; font-weight: 700; }
        .tv-kambing-status { font-size: 1.4cqw; color: #6ee7b7; }

        /* Summary slide */
        .tv-ring-num { font-size: 4cqw; font-weight: 800; line-height: 1.1; }
        .tv-ring-label { font-size: 1.3cqw; opacity: 0.85; }
        .tv-ring-breakdown { font-size: 1.3cqw; }
        .tv-ring-penitipan { font-size: 1.1cqw; }
        .tv-label-text { font-size: 0.9cqw; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.08em; }
        .tv-small { font-size: 0.85cqw; }

        /* Header */
        .tv-header-sub { font-size: 0.9cqw; }
        .tv-header-title { font-size: 1.4cqw; }
        .tv-header-date { font-size: 1.1cqw; }
        .tv-main-title { font-size: 2.8cqw; }

        /* Badge */
        .tv-penitipan-badge {
          font-size: 0.75cqw; font-weight: 700;
          background: #d4a017; color: #1a1a1a;
          border-radius: 4px; padding: 0.1cqw 0.35cqw;
          letter-spacing: 0.03em;
        }

        /* Disclaimer */
        .tv-disclaimer {
          font-size: 1.21cqw;
          color: rgba(255,255,255,0.7);
          text-align: center;
          line-height: 1.4;
          margin-bottom: 0.8cqw;
          padding: 0 5cqw;
        }

        /* Progress */
        .tv-progress-label { font-size: 0.9cqw; }
        .tv-footer-url { font-size: 0.85cqw; }
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
          <div className="relative mb-[0.8vh] flex-shrink-0">
            <h1 className="tv-main-title font-extrabold tracking-tight">Laporan Progress Qurban</h1>
          </div>

          {/* Slide content — container for cqw units */}
          <div className="tv-container">
            {slide.type === 'ringkasan' ? <SummarySlide data={data} /> : <DetailSlide slide={slide} />}
          </div>

          {/* Footer — disclaimer + progress bar + URL */}
          <footer className="flex-shrink-0 mt-[0.6vh]">
            <div className="tv-disclaimer">
              Penomoran slot dan pengelompokan muqorib pada daftar ini bersifat sementara.
              <br />
              Panitia berhak mengatur ulang untuk kebutuhan operasional penyembelihan.
            </div>

            <div className="flex items-center gap-[0.8vw] mb-[0.3vh]">
              <div className="flex-1 h-[0.35vh] bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/70 rounded-full"
                  style={{ width: `${slides.length > 0 ? ((safeSlide + progress) / slides.length) * 100 : 0}%` }}
                />
              </div>
              <span className="tv-progress-label opacity-60 flex-shrink-0">Slide {safeSlide + 1} / {slides.length}</span>
            </div>
            <div className="tv-footer-url opacity-50 text-center">
              {'\u{1F4F1}'} Info lengkap: skm-pi.vercel.app/publik/qurban
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
