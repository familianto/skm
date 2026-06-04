'use client';

import { useCallback, useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { formatRupiah } from '@/lib/utils';
import type {
  LaporanPesertaDTO,
  TipeGroup,
  JenisKelasGroup,
  RtGroup,
} from '@/lib/qurban/laporan-peserta';
import type { LaporanHewanDTO, InventarisRow } from '@/lib/qurban/laporan-hewan';
import type { LaporanKeuanganDTO } from '@/lib/qurban/laporan-keuangan';

/**
 * F8 Milestone B — Laporan Qurban bertab. Tab Peserta mengkonsumsi LP1
 * (`GET /api/qurban/laporan/peserta`) — ketiga grouping ada di satu payload,
 * jadi ganti grouping instan tanpa refetch. Tab Hewan & Keuangan placeholder
 * (Milestone C/D). Tanpa tab Distribusi. Mobile-first (iPad Safari).
 */

interface Props {
  edisiId: string;
}

type Tab = 'peserta' | 'hewan' | 'keuangan';
type Grouping = 'tipe' | 'jenis_kelas' | 'rt';

const TABS: { value: Tab; label: string }[] = [
  { value: 'peserta', label: 'Peserta' },
  { value: 'hewan', label: 'Hewan' },
  { value: 'keuangan', label: 'Keuangan' },
];

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: 'tipe', label: 'Tipe Qurban' },
  { value: 'jenis_kelas', label: 'Jenis–Kelas Hewan' },
  { value: 'rt', label: 'RT' },
];

export function LaporanQurban({ edisiId }: Props) {
  const [tab, setTab] = useState<Tab>('peserta');

  return (
    <div className="space-y-4">
      {/* Tab utama. */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? 'whitespace-nowrap px-4 py-2 text-sm font-medium text-emerald-700 border-b-2 border-emerald-600'
                : 'whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'peserta' && <TabPeserta edisiId={edisiId} />}
      {tab === 'hewan' && <TabHewan edisiId={edisiId} />}
      {tab === 'keuangan' && <TabKeuangan edisiId={edisiId} />}
    </div>
  );
}

// ── Tab Peserta ──────────────────────────────────────────────────────────────

function TabPeserta({ edisiId }: { edisiId: string }) {
  const [data, setData] = useState<LaporanPesertaDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>('tipe');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/laporan/peserta?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setData(json.data as LaporanPesertaDTO);
      } else {
        setError(json?.error?.message || 'Gagal memuat laporan peserta.');
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
    <div className="space-y-4">
      {/* Ringkasan kecil. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-600">
        <span className="text-lg font-bold text-gray-900">{data.total_peserta}</span>
        <span>peserta terdaftar</span>
        {data.peserta_batal > 0 && (
          <span className="text-xs text-gray-400">
            · {data.peserta_batal} peserta batal tidak dihitung
          </span>
        )}
      </div>

      {/* Pemilih grouping (segmented). */}
      <div className="flex flex-wrap gap-2">
        {GROUPINGS.map((g) => (
          <button
            key={g.value}
            onClick={() => setGrouping(g.value)}
            className={
              grouping === g.value
                ? 'rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200'
            }
          >
            {g.label}
          </button>
        ))}
      </div>

      {grouping === 'tipe' && <TabelTipe rows={data.groupings.tipe} total={data.total_peserta} />}
      {grouping === 'jenis_kelas' && (
        <TabelJenisKelas rows={data.groupings.jenis_kelas} total={data.total_peserta} />
      )}
      {grouping === 'rt' && <TabelRt rows={data.groupings.rt} total={data.total_peserta} />}
    </div>
  );
}

// ── Tabel: Tipe ──────────────────────────────────────────────────────────────

function TabelTipe({ rows, total }: { rows: TipeGroup[]; total: number }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">Tipe</th>
            <th className="px-4 py-2.5 text-right font-medium">Peserta</th>
            <th className="px-4 py-2.5 text-right font-medium">Porsi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-100">
              <td className="px-4 py-2.5 text-gray-700">{r.label}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.peserta}</td>
              <td className="px-4 py-2.5 text-right text-gray-500">{fmtPct(r.persen)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right">{total}</td>
            <td className="px-4 py-2.5 text-right">{total > 0 ? '100%' : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ── Tabel: Jenis–Kelas ───────────────────────────────────────────────────────

function TabelJenisKelas({ rows, total }: { rows: JenisKelasGroup[]; total: number }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">Hewan</th>
            <th className="px-4 py-2.5 text-right font-medium">Peserta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.jenis}-${r.kelas}-${r.label}`}
              className={`border-b border-gray-100 ${r.jenis ? '' : 'text-gray-400'}`}
            >
              <td className="px-4 py-2.5 text-gray-700">{r.label}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.peserta}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right">{total}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ── Tabel: RT ────────────────────────────────────────────────────────────────

function TabelRt({ rows, total }: { rows: RtGroup[]; total: number }) {
  const max = rows.reduce((m, r) => Math.max(m, r.peserta), 0);
  const totalMuqorib = rows.reduce((s, r) => s + r.muqorib, 0);
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">RT</th>
            <th className="px-4 py-2.5 font-medium">Sebaran</th>
            <th className="px-4 py-2.5 text-right font-medium">Peserta</th>
            <th className="px-4 py-2.5 text-right font-medium">Muqorib</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lainnya = r.rt === 'LAINNYA';
            const pct = max > 0 ? Math.round((r.peserta / max) * 100) : 0;
            return (
              <tr key={r.rt} className={`border-b border-gray-100 ${lainnya ? 'text-gray-400' : ''}`}>
                <td className={`px-4 py-2.5 ${lainnya ? '' : 'text-gray-700'}`}>{r.label}</td>
                <td className="px-4 py-2.5">
                  <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${lainnya ? 'bg-gray-300' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.peserta}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{r.muqorib}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5 text-right">{total}</td>
            <td className="px-4 py-2.5 text-right">{totalMuqorib}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/** Persen 1-desimal → string. mis. 59 → "59%", 59.5 → "59,5%". */
function fmtPct(p: number): string {
  if (Number.isInteger(p)) return `${p}%`;
  return `${p.toString().replace('.', ',')}%`;
}

// ── Tab Hewan (LP2) ──────────────────────────────────────────────────────────

function TabHewan({ edisiId }: { edisiId: string }) {
  const [data, setData] = useState<LaporanHewanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/laporan/hewan?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setData(json.data as LaporanHewanDTO);
      } else {
        setError(json?.error?.message || 'Gagal memuat laporan hewan.');
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

  const r = data.ringkasan;
  return (
    <div className="space-y-4">
      {/* Ringkasan kecil. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-600">
        <span className="text-lg font-bold text-gray-900">{r.total}</span>
        <span>hewan</span>
        <span className="text-xs text-gray-400">
          · {r.aktif} aktif · {r.batal} batal
        </span>
      </div>

      {/* Matriks inventaris. */}
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">Hewan</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
              <th className="px-3 py-2.5 text-right font-medium">Aktif</th>
              <th className="px-3 py-2.5 text-right font-medium">Beli</th>
              <th className="px-3 py-2.5 text-right font-medium">Bawa Sendiri</th>
              <th className="px-4 py-2.5 text-right font-medium">Biaya Pengadaan</th>
            </tr>
          </thead>
          <tbody>
            {data.inventaris.map((row) => (
              <InventarisTr key={`${row.jenis}-${row.kelas}`} row={row} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold text-gray-900">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{r.total}</td>
              <td className="px-3 py-2.5 text-right">{r.aktif}</td>
              <td className="px-3 py-2.5 text-right">{r.beli}</td>
              <td className="px-3 py-2.5 text-right">{r.bawa_sendiri}</td>
              <td className="px-4 py-2.5 text-right">
                {r.biaya_pengadaan_total > 0 ? formatRupiah(r.biaya_pengadaan_total) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Ringkasan Biaya Pengadaan. */}
      <Card className="space-y-2">
        <p className="text-sm font-semibold text-gray-900">Ringkasan Biaya Pengadaan</p>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-600">Total</span>
          <span className="text-lg font-bold text-emerald-700">
            {r.biaya_pengadaan_total > 0 ? formatRupiah(r.biaya_pengadaan_total) : 'Rp 0'}
          </span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2 text-sm text-gray-600">
          <span>Sapi</span>
          <span className="font-medium text-gray-800">
            {r.biaya_pengadaan_sapi > 0 ? formatRupiah(r.biaya_pengadaan_sapi) : '—'}
          </span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Kambing</span>
          <span className="font-medium text-gray-800">
            {r.biaya_pengadaan_kambing > 0 ? formatRupiah(r.biaya_pengadaan_kambing) : '—'}
          </span>
        </div>
        {r.hewan_beli_tanpa_harga > 0 && (
          <p className="border-t border-gray-100 pt-2 text-xs text-amber-600">
            {r.hewan_beli_tanpa_harga} hewan beli belum ada harga pengadaan
          </p>
        )}
        <p className="text-xs text-gray-400">
          Biaya dihitung dari hewan beli berstatus aktif (bawa sendiri tanpa biaya).
        </p>
      </Card>
    </div>
  );
}

function InventarisTr({ row }: { row: InventarisRow }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-2.5 text-gray-700">{row.label}</td>
      <td className="px-3 py-2.5 text-right font-medium text-gray-900">{row.total}</td>
      <td className="px-3 py-2.5 text-right text-gray-600">{row.aktif}</td>
      <td className="px-3 py-2.5 text-right text-gray-600">{row.beli}</td>
      <td className="px-3 py-2.5 text-right text-gray-600">{row.bawa_sendiri}</td>
      <td className="px-4 py-2.5 text-right text-gray-700">
        {row.biaya_pengadaan > 0 ? formatRupiah(row.biaya_pengadaan) : '—'}
      </td>
    </tr>
  );
}

// ── Tab Keuangan (LP4) ───────────────────────────────────────────────────────

function TabKeuangan({ edisiId }: { edisiId: string }) {
  const [data, setData] = useState<LaporanKeuanganDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/qurban/laporan/keuangan?edisi_id=${encodeURIComponent(edisiId)}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setData(json.data as LaporanKeuanganDTO);
      } else {
        setError(json?.error?.message || 'Gagal memuat laporan keuangan.');
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

  const dana = data.dana_terhimpun;
  const biaya = data.biaya_pengadaan;
  const kor = data.korelasi_ledger;
  const arsip = data.mode === 'arsip';
  const lunasPct =
    dana.nilai_pendaftaran > 0
      ? Math.round((dana.total / dana.nilai_pendaftaran) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Banner mode arsip. */}
      {arsip && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Mode Arsip — tak tertaut ledger SKM.</span>{' '}
          Pembayaran {data.edisi.nama} diimpor sebagai histori; sengaja tidak
          ditautkan ke ledger. Dana Terhimpun berdiri sendiri — tidak ada selisih
          untuk dialarmkan.
        </div>
      )}

      {/* Dana Terhimpun per kategori. */}
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">Kategori</th>
              <th className="px-3 py-2.5 text-right font-medium">Peserta</th>
              <th className="px-4 py-2.5 text-right font-medium">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {dana.per_kategori.map((k) => (
              <tr key={k.key} className="border-b border-gray-100">
                <td className="px-4 py-2.5 text-gray-700">{k.label}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{k.peserta}</td>
                <td className="px-4 py-2.5 text-right text-gray-900">{formatRupiah(k.nominal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold text-gray-900">
              <td className="px-4 py-2.5">Dana Terhimpun</td>
              <td className="px-3 py-2.5 text-right" />
              <td className="px-4 py-2.5 text-right">{formatRupiah(dana.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="px-4 py-2 text-xs text-gray-400">
          {dana.jumlah_pembayaran_lunas} pembayaran · {lunasPct}% LUNAS
        </p>
      </Card>

      {/* Biaya Pengadaan. */}
      <Card className="space-y-2">
        <p className="text-sm font-semibold text-gray-900">Biaya Pengadaan</p>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Sapi</span>
          <span className="font-medium text-gray-800">
            {biaya.sapi > 0 ? formatRupiah(biaya.sapi) : '—'}
          </span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Kambing</span>
          <span className="font-medium text-gray-800">
            {biaya.kambing > 0 ? formatRupiah(biaya.kambing) : '—'}
          </span>
        </div>
        <div className="flex items-baseline justify-between border-t border-gray-100 pt-2">
          <span className="text-sm font-medium text-gray-700">Total</span>
          <span className="text-base font-bold text-gray-900">
            {biaya.total > 0 ? formatRupiah(biaya.total) : 'Rp 0'}
          </span>
        </div>
        {biaya.hewan_beli_tanpa_harga > 0 && (
          <p className="text-xs text-amber-600">
            {biaya.hewan_beli_tanpa_harga} hewan beli belum ada harga pengadaan
          </p>
        )}
      </Card>

      {/* Saldo Qurban. */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-sm">
        <p className="text-sm font-medium text-emerald-50/90">
          Saldo Qurban (Dana Terhimpun − Biaya Pengadaan)
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{formatRupiah(data.saldo_qurban)}</p>
        <p className="mt-1 text-xs text-emerald-50/80">belum termasuk BOP &amp; biaya operasional</p>
      </div>

      {/* Korelasi Ledger SKM. */}
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Korelasi Ledger SKM</p>
          <span
            className={
              kor.mode === 'arsip'
                ? 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700'
                : 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
            }
          >
            {kor.mode === 'arsip' ? 'N/A · Arsip' : 'Live'}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Pembayaran tertaut ledger: {kor.pembayaran_tertaut} / {kor.pembayaran_total}
        </p>
        <p className="text-xs text-gray-400">
          {kor.mode === 'arsip'
            ? 'Untuk edisi live, blok ini berisi korelasi nyata Dana Terhimpun ↔ ledger SKM.'
            : 'Rekonsiliasi penuh Dana Terhimpun ↔ ledger SKM menyusul saat ada edisi live.'}
        </p>
      </Card>
    </div>
  );
}
