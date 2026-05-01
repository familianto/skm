'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatRupiah } from '@/lib/utils';
import { generateQurbanWAText } from '@/lib/qurban-wa-text';
import type { QurbanPublikResponse, QurbanHewanItem } from '@/types/qurban';

type TabType = 'semua' | 'sapi' | 'kambing' | 'penitipan';

function HewanCard({ hewan, searchQuery }: { hewan: QurbanHewanItem; searchQuery: string }) {
  const isPenitipan = hewan.is_penitipan;
  const isFull = hewan.terisi === hewan.kuota && hewan.kuota > 0;
  const isEmpty = hewan.terisi === 0;

  const slots = useMemo(() => {
    const result: { slot: number; nama: string | null; status_bayar: string | null }[] = [];
    for (let i = 1; i <= hewan.kuota; i++) {
      const p = hewan.peserta.find(s => s.slot === i);
      result.push(p ? { slot: i, nama: p.nama, status_bayar: p.status_bayar } : { slot: i, nama: null, status_bayar: null });
    }
    return result;
  }, [hewan]);

  const isHighlighted = useCallback((nama: string) => {
    if (!searchQuery) return false;
    return nama.toLowerCase().includes(searchQuery.toLowerCase());
  }, [searchQuery]);

  return (
    <div className={`bg-white rounded-xl overflow-hidden shadow-sm mb-3 ${isPenitipan ? 'border-l-[3px] border-amber-500 bg-gradient-to-r from-amber-50/50 to-white' : 'border border-gray-100'}`}>
      <div className="p-3.5 flex justify-between items-start gap-2 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-gray-900">{hewan.id_hewan}</span>
            {isPenitipan && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 tracking-wide">PENITIPAN</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 leading-relaxed">
            {hewan.jenis} Kelas {hewan.tipe} {hewan.berat_rata2 && <>&middot; {hewan.berat_rata2}</>}
            <br />
            {isPenitipan ? (
              <span className="text-amber-700 font-semibold">BOP: {formatRupiah(hewan.bop_per_ekor)}/ekor</span>
            ) : (
              <>
                <span className="text-emerald-700 font-semibold">{formatRupiah(hewan.harga_per_orang)}/slot</span>
                {' '}&middot; Total {formatRupiah(hewan.harga_qurban)}
              </>
            )}
          </div>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
          isFull ? 'bg-emerald-100 text-emerald-800' :
          isEmpty ? 'bg-gray-100 text-gray-400' :
          'bg-emerald-50 text-emerald-700'
        }`}>
          {hewan.terisi}/{hewan.kuota}{isFull && ' \u2705'}
        </span>
      </div>

      {hewan.terisi > 0 && (
        <div className="px-3.5 py-1">
          {slots.map(s => (
            <div key={s.slot} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
              <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                {s.slot}
              </div>
              {s.nama ? (
                <>
                  <span className={`flex-1 text-xs ${isHighlighted(s.nama) ? 'text-emerald-700 font-bold' : 'text-gray-700'}`}>
                    {s.nama}
                  </span>
                  {s.status_bayar === 'Lunas' ? (
                    <span className="text-emerald-600 font-semibold text-[13px]">{'\u2705'}</span>
                  ) : (
                    <span className="text-gray-300 font-bold text-sm">&mdash;</span>
                  )}
                </>
              ) : (
                <span className="flex-1 text-xs text-gray-300 italic">(slot tersedia)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ data }: { data: QurbanPublikResponse }) {
  const { summary } = data;
  const updateTime = new Date(data.updated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white -mt-3.5 mx-3 rounded-xl p-4 shadow-md">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-[#0d5c3f]">{'\u{1F4CA}'} Ringkasan Total</span>
        <span className="text-[10px] text-gray-400">Update {updateTime}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-emerald-50/60 rounded-lg p-2.5 border border-emerald-100">
          <div className="text-lg">{'\u{1F404}'}</div>
          <div className="text-[10px] text-gray-500">Sapi</div>
          <div className="text-lg font-bold text-[#0d5c3f]">{summary.total_sapi} ekor</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {Object.entries(summary.sapi_breakdown).sort().map(([t, n]) => `${t}: ${n}`).join(' \u00b7 ')}
          </div>
        </div>
        <div className="bg-emerald-50/60 rounded-lg p-2.5 border border-emerald-100">
          <div className="text-lg">{'\u{1F410}'}</div>
          <div className="text-[10px] text-gray-500">Kambing</div>
          <div className="text-lg font-bold text-[#0d5c3f]">{summary.total_kambing} ekor</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {Object.entries(summary.kambing_breakdown).sort().map(([t, n]) => `${t}: ${n}`).join(' \u00b7 ')}
          </div>
        </div>
      </div>
      <div className="flex justify-around text-center mt-3 pt-3 border-t border-dashed border-gray-200">
        <div><div className="text-base font-bold text-gray-800">{summary.total_muqorib}</div><div className="text-[10px] text-gray-500">Muqorib</div></div>
        <div><div className="text-base font-bold text-[#0d5c3f]">{'\u2705'} {summary.total_lunas}</div><div className="text-[10px] text-gray-500">Lunas</div></div>
        <div><div className="text-base font-bold text-amber-600">{'\u23F3'} {summary.total_belum}</div><div className="text-[10px] text-gray-500">Belum</div></div>
      </div>
    </div>
  );
}

function PaymentCard({ data }: { data: QurbanPublikResponse }) {
  const { payment } = data;
  return (
    <div className="mx-3 mt-4 bg-white rounded-xl p-4 shadow-sm">
      <div className="text-[13px] font-bold text-[#0d5c3f] flex items-center gap-1.5 mb-3">
        {'\u{1F4B3}'} Cara Pembayaran Qurban
      </div>
      <div className="bg-emerald-50/60 rounded-lg p-3 text-center mb-3">
        <div className="text-[10px] text-gray-500">Transfer ke Rekening</div>
        <div className="text-lg font-extrabold text-[#0d5c3f] tracking-wider font-mono mt-0.5">
          {payment.bank_name} {payment.account_number}
        </div>
        <div className="text-[11px] text-gray-500">a.n. {payment.account_holder}</div>
      </div>
      <div className="bg-amber-50 rounded-lg p-3 text-center border border-dashed border-amber-400">
        <div className="text-[11px] text-amber-700 mb-1">{'\u26A0\uFE0F'} Isi Berita/Keterangan Transfer</div>
        <div className="font-mono text-sm font-bold text-gray-900 tracking-wider">QRB [Nama Anda] atau QURBAN [Nama Anda]</div>
        <div className="text-[10px] text-amber-600 mt-1">Contoh: QRB Fulan, atau QURBAN Fulan</div>
      </div>
      {payment.panitia_hp && (
        <div className="text-[11px] text-gray-500 mt-2.5 pt-2.5 border-t border-dashed border-gray-200 leading-relaxed">
          Jika transfer via ATM tanpa kolom keterangan, mohon kirim bukti transfer ke panitia: <strong>{payment.panitia_hp}</strong>
        </div>
      )}
    </div>
  );
}

export default function QurbanPage() {
  const [data, setData] = useState<QurbanPublikResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('semua');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/publik/qurban');
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error || 'Gagal memuat data');
        }
      } catch {
        setError('Gagal memuat data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredHewan = useMemo(() => {
    if (!data) return [];
    let result = data.hewan;

    if (activeTab === 'sapi') result = result.filter(h => h.jenis === 'Sapi');
    else if (activeTab === 'kambing') result = result.filter(h => h.jenis === 'Kambing');
    else if (activeTab === 'penitipan') result = result.filter(h => h.is_penitipan);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(h => h.peserta.some(p => p.nama.toLowerCase().includes(q)));
    }

    return result;
  }, [data, activeTab, search]);

  const sapiHewan = useMemo(() => filteredHewan.filter(h => h.jenis === 'Sapi'), [filteredHewan]);
  const kambingHewan = useMemo(() => filteredHewan.filter(h => h.jenis === 'Kambing'), [filteredHewan]);
  const showSections = activeTab === 'semua' || activeTab === 'penitipan';

  function handleShareWA() {
    if (!data) return;
    const text = generateQurbanWAText(data, window.location.href);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Memuat data Qurban...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-2">{error || 'Data tidak tersedia'}</p>
          <button onClick={() => window.location.reload()} className="text-sm text-emerald-600 underline">Coba lagi</button>
        </div>
      </div>
    );
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'sapi', label: '\u{1F404} Sapi' },
    { key: 'kambing', label: '\u{1F410} Kambing' },
    { key: 'penitipan', label: '\u{1F3F7}\uFE0F Penitipan' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 text-white px-4 py-5 pb-7">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-lg">{'\u{1F54C}'}</div>
            <div>
              <div className="text-[11px] opacity-85">Masjid Al Jabar Jatinegara Baru</div>
              <div className="text-[13px] font-semibold">Qurban 1447H &middot; 2026</div>
            </div>
          </div>
          <h1 className="text-[22px] font-bold leading-tight">Laporan Progress Qurban</h1>
          <p className="text-xs opacity-80 mt-1">Transparansi pengumpulan & pelaksanaan</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto">
        <SummaryCard data={data} />

        {/* Search */}
        <div className="mx-3 mt-4 flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 shadow-sm">
          <span className="text-sm text-gray-400">{'\u{1F50D}'}</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama muqorib..."
            className="flex-1 text-[13px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 text-sm hover:text-gray-600">&times;</button>
          )}
        </div>

        {/* Tabs */}
        <div className="mx-3 mt-3 flex gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                activeTab === tab.key
                  ? tab.key === 'penitipan'
                    ? 'bg-amber-600 text-white'
                    : 'bg-[#0d5c3f] text-white'
                  : 'bg-white text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Hewan List */}
        <div className="px-3 mt-2 pb-2">
          {filteredHewan.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              {search ? 'Tidak ditemukan peserta dengan nama tersebut' : 'Tidak ada data'}
            </div>
          ) : showSections ? (
            <>
              {sapiHewan.length > 0 && (
                <>
                  <div className="text-[13px] font-bold text-[#0d5c3f] py-3 px-2 flex items-center gap-1.5">
                    {'\u{1F404}'} Detail Sapi
                    <span className="text-[11px] bg-emerald-50 text-[#0d5c3f] px-2 py-0.5 rounded-full font-semibold">{sapiHewan.length} ekor</span>
                  </div>
                  {sapiHewan.map(h => <HewanCard key={h.id_hewan} hewan={h} searchQuery={search} />)}
                </>
              )}
              {kambingHewan.length > 0 && (
                <>
                  <div className="text-[13px] font-bold text-[#0d5c3f] py-3 px-2 flex items-center gap-1.5">
                    {'\u{1F410}'} Detail Kambing
                    <span className="text-[11px] bg-emerald-50 text-[#0d5c3f] px-2 py-0.5 rounded-full font-semibold">{kambingHewan.length} ekor</span>
                  </div>
                  {kambingHewan.map(h => <HewanCard key={h.id_hewan} hewan={h} searchQuery={search} />)}
                </>
              )}
            </>
          ) : (
            filteredHewan.map(h => <HewanCard key={h.id_hewan} hewan={h} searchQuery={search} />)
          )}
        </div>

        <PaymentCard data={data} />

        {/* Share Buttons */}
        <div className="mx-3 mt-3 p-3 bg-[#0d5c3f] rounded-xl flex gap-2">
          <button onClick={handleShareWA} className="flex-1 py-2.5 bg-white/15 text-white text-xs font-semibold rounded-lg hover:bg-white/25 transition-colors">
            {'\u{1F4F1}'} Share ke WA
          </button>
          <button onClick={handleCopyLink} className="flex-1 py-2.5 bg-white/15 text-white text-xs font-semibold rounded-lg hover:bg-white/25 transition-colors">
            {copied ? '\u2705 Tersalin!' : '\u{1F517} Copy Link'}
          </button>
        </div>

        {/* Footer */}
        <footer className="text-center py-6 px-3 text-[10px] text-gray-400 leading-relaxed">
          Laporan diupdate otomatis dari data panitia Qurban.
          <br />&copy; Masjid Al Jabar Jatinegara Baru
        </footer>
      </div>
    </div>
  );
}
