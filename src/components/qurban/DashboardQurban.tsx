'use client';

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { formatRupiah } from '@/lib/utils';
import type {
  DashboardDTO,
  AktivitasItem,
  AktivitasTipe,
  PersiapanJenis,
} from '@/lib/qurban/laporan-dashboard';

/**
 * F8 Milestone A — Dashboard Qurban (`/qurban`). Mengkonsumsi LP5
 * (`GET /api/qurban/laporan/dashboard?edisi_id=`). Sadar-arsip: badge "Arsip",
 * label "Aktif" (bukan "Terpotong"), placeholder distribusi F7, tanpa trend
 * palsu. Mobile-first (diuji di iPad Safari).
 */

interface Props {
  edisiId: string;
}

const FASE_LABEL: Record<string, string> = {
  preparation: 'Persiapan',
  pendaftaran: 'Pendaftaran',
  hari_h: 'Hari-H',
  distribusi: 'Distribusi',
  finalisasi: 'Finalisasi',
};

export function DashboardQurban({ edisiId }: Props) {
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/laporan/dashboard?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setData(json.data as DashboardDTO);
      } else {
        setError(json?.error?.message || 'Gagal memuat dashboard qurban.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [edisiId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoading />;

  if (error || !data) {
    return (
      <Card>
        <p className="text-sm text-red-600">{error || 'Data tidak tersedia.'}</p>
        <button
          onClick={() => void load()}
          className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Coba lagi
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ExecutiveSummary data={data} />
      <Persiapan data={data} />
      <Operasional data={data} />
      <AktivitasTerakhir items={data.aktivitas_terakhir} />
    </div>
  );
}

// ── Executive Summary ────────────────────────────────────────────────────────

function ExecutiveSummary({ data }: { data: DashboardDTO }) {
  const { kartu, edisi } = data;
  const fase = FASE_LABEL[edisi.fase] || edisi.fase;

  return (
    <section className="space-y-4">
      {/* Kartu utama — Dana Terhimpun (emerald, menonjol). */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-emerald-50/90">Dana Terhimpun</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {formatRupiah(kartu.dana_terhimpun.nominal)}
            </p>
            <p className="mt-2 text-sm text-emerald-50/90">
              {kartu.dana_terhimpun.jumlah_pembayaran} pembayaran ·{' '}
              {kartu.dana_terhimpun.persen_lunas}% LUNAS
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {edisi.is_arsip && (
              <span className="inline-flex items-center rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-semibold text-amber-950">
                Arsip
              </span>
            )}
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
              {fase}
            </span>
          </div>
        </div>
      </div>

      {/* Kartu sekunder. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Peserta Terdaftar"
          value={String(kartu.peserta.total)}
          subtitle={`Beli ${kartu.peserta.beli} · Bawa Sendiri ${kartu.peserta.bawa_sendiri}`}
          icon="👥"
        />
        <StatCard
          title="Hewan Aktif"
          value={`${kartu.hewan.aktif} / ${kartu.hewan.total}`}
          subtitle={kartu.hewan.batal > 0 ? `${kartu.hewan.batal} batal` : 'Tidak ada batal'}
          icon="🐮"
        />
        <JenisCard jenis={data.persiapan.per_jenis} target="SAPI" label="Sapi" icon="🐄" />
        <JenisCard jenis={data.persiapan.per_jenis} target="KAMBING" label="Kambing" icon="🐐" />
      </div>
    </section>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{title}</p>
        <span className="text-base leading-none">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
    </Card>
  );
}

function JenisCard({
  jenis,
  target,
  label,
  icon,
}: {
  jenis: PersiapanJenis[];
  target: string;
  label: string;
  icon: string;
}) {
  const row = jenis.find((j) => j.jenis === target);
  const total = row?.total ?? 0;
  const beli = row?.beli ?? 0;
  const bawa = row?.bawa_sendiri ?? 0;
  return (
    <StatCard
      title={label}
      value={String(total)}
      subtitle={`Beli ${beli} · Bawa Sendiri ${bawa}`}
      icon={icon}
    />
  );
}

// ── Persiapan ────────────────────────────────────────────────────────────────

function Persiapan({ data }: { data: DashboardDTO }) {
  const { per_jenis, beli, bawa_sendiri } = data.persiapan;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-gray-900">
        Persiapan — Kesiapan Inventaris
      </h2>
      <Card className="space-y-4">
        {per_jenis.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada data hewan.</p>
        ) : (
          per_jenis.map((j) => <JenisBar key={j.jenis} jenis={j} />)
        )}
        <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
          <span>
            <span className="font-semibold text-gray-700">{beli}</span> Beli
          </span>
          <span>
            <span className="font-semibold text-gray-700">{bawa_sendiri}</span> Bawa Sendiri
          </span>
        </div>
      </Card>
    </section>
  );
}

function JenisBar({ jenis }: { jenis: PersiapanJenis }) {
  const label = jenis.jenis.charAt(0) + jenis.jenis.slice(1).toLowerCase();
  const pct = jenis.total > 0 ? Math.round((jenis.aktif / jenis.total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {jenis.aktif} / {jenis.total} aktif
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Operasionalisasi ─────────────────────────────────────────────────────────

function Operasional({ data }: { data: DashboardDTO }) {
  const { ter_assign, total_aktif } = data.operasional.urutan_pemotongan;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-gray-900">Operasionalisasi</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="!p-4">
          <p className="text-xs font-medium text-gray-500">Urutan Pemotongan</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {ter_assign} / {total_aktif}
          </p>
          <p className="mt-1 text-xs text-gray-400">Hewan aktif ter-assign urutan</p>
        </Card>
        <div className="flex flex-col justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <p className="text-sm font-medium text-gray-500">Distribusi &amp; Pemotongan</p>
          <p className="mt-1 text-xs text-gray-400">Menyusul di Sprint F7</p>
        </div>
      </div>
    </section>
  );
}

// ── Aktivitas Terakhir ───────────────────────────────────────────────────────

const TIPE_ICON: Record<AktivitasTipe, string> = {
  peserta: '👤',
  pembayaran: '💰',
  hewan: '🐮',
  pemetaan: '🗂️',
  muqorib: '🙋',
  import: '📥',
  lainnya: '•',
};

function AktivitasTerakhir({ items }: { items: AktivitasItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-gray-900">Aktivitas Terakhir</h2>
      <Card className="!p-0">
        <ul className="divide-y divide-gray-100">
          {items.map((it, i) => (
            <li key={`${it.waktu}-${i}`} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg leading-none">{TIPE_ICON[it.tipe] || '•'}</span>
              <span className="flex-1 text-sm text-gray-700">{it.label}</span>
              <span className="text-xs text-gray-400">{relativeTime(it.waktu)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Waktu relatif ringkas (Bahasa Indonesia). Fallback: tanggal ISO. */
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso || '';
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const jam = Math.round(min / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.round(jam / 24);
  if (hari < 30) return `${hari} hari lalu`;
  return new Date(t).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
