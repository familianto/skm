'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useMe } from '@/hooks/use-me';
import { formatRupiah } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  canWritePeserta,
  filterPeserta,
  formatPesertaDateID,
  hewanSlotLabel,
  pesertaDisplayNama,
  statusPendaftaranBadgeClass,
  statusPendaftaranLabel,
  tipeQurbanBadgeClass,
  tipeQurbanLabel,
  type PesertaListRow,
  type QurbanPeserta,
  type StatusFilterValue,
} from '@/lib/qurban/peserta-display';
import { PembayaranStatusBadge } from './PembayaranStatusBadge';

/**
 * F4c-A — /qurban/peserta list view (PS1, read-only).
 *
 * PS1 returns raw `qurban_peserta` rows, so this enriches client-side:
 *   - `hewan_id` → `nama_display` via H1 (`/api/qurban/hewan`)
 *   - `muqorib_id` → `nama_lengkap` via M1 (`/api/qurban/muqorib`, all pages)
 * Name follows the schema rule (`nama_atas_nama` → muqorib nama). Filtering and
 * search run client-side over the enriched rows (`filterPeserta`). No write
 * actions — Tambah/Edit/Batal land in Milestone B.
 */

interface Props {
  edisiId: string;
}

const STATUS_FILTERS: { value: StatusFilterValue; label: string }[] = [
  { value: 'ALL', label: 'Semua' },
  { value: 'TERDAFTAR', label: 'Terdaftar' },
  { value: 'BATAL', label: 'Batal' },
];

interface HewanLite {
  id: string;
  nama_display: string;
}

interface MuqoribLite {
  id: string;
  nama_lengkap: string;
}

const MUQORIB_PAGE_SIZE = 200;
const MUQORIB_MAX_PAGES = 25; // safety cap (≤ 5000 muqorib)

async function fetchMuqoribMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; page <= MUQORIB_MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      status: 'all',
      page: String(page),
      page_size: String(MUQORIB_PAGE_SIZE),
    });
    const res = await fetch(`/api/qurban/muqorib?${qs.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) break;
    for (const m of (json.data as MuqoribLite[]) || []) {
      map.set(m.id, m.nama_lengkap);
    }
    if (!json.meta?.has_more) break;
  }
  return map;
}

export function PesertaList({ edisiId }: Props) {
  const router = useRouter();
  const { me } = useMe();
  const canWrite = canWritePeserta(me?.user.peran);

  const [rows, setRows] = useState<PesertaListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // F6 D2: status pembayaran per kode_bayar (best-effort; PY4).
  const [payByKode, setPayByKode] = useState<Map<string, string>>(new Map());

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilterValue>('ALL');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const edisiParam = `edisi_id=${encodeURIComponent(edisiId)}`;
      const [pesertaRes, hewanRes, muqoribMap] = await Promise.all([
        fetch(`/api/qurban/peserta?${edisiParam}`),
        fetch(`/api/qurban/hewan?${edisiParam}`),
        fetchMuqoribMap(),
      ]);

      const pesertaJson = await pesertaRes.json().catch(() => ({}));
      if (!pesertaRes.ok || !pesertaJson?.ok) {
        setError(pesertaJson?.error?.message || 'Gagal memuat daftar peserta.');
        return;
      }

      const hewanJson = await hewanRes.json().catch(() => ({}));
      const hewanMap = new Map<string, string>();
      if (hewanRes.ok && hewanJson?.ok) {
        for (const h of (hewanJson.data as HewanLite[]) || []) {
          hewanMap.set(h.id, h.nama_display);
        }
      }

      const items = (pesertaJson.data as QurbanPeserta[]) || [];
      const enriched: PesertaListRow[] = items.map((p) => ({
        ...p,
        display_nama: pesertaDisplayNama(p.nama_atas_nama, muqoribMap.get(p.muqorib_id)),
        hewan_label: hewanSlotLabel(hewanMap.get(p.hewan_id), p.slot_number, p.hewan_id),
      }));
      setRows(enriched);

      // F6 D2: status pembayaran per kode_bayar — best-effort, tak memblokir list.
      try {
        const payRes = await fetch(`/api/qurban/pembayaran?${edisiParam}`);
        const payJson = await payRes.json().catch(() => ({}));
        if (payRes.ok && payJson?.ok) {
          const m = new Map<string, string>();
          for (const p of (payJson.data as { kode_bayar: string; status: string }[]) || []) {
            m.set(p.kode_bayar, p.status);
          }
          setPayByKode(m);
        }
      } catch {
        // abaikan — kolom status pembayaran sekadar tak tampil.
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [edisiId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(
    () => filterPeserta(rows, { status, search }),
    [rows, status, search]
  );

  const isFiltering = !!search || status !== 'ALL';
  const detailHref = (id: string) =>
    `/qurban/peserta/${id}?edisi=${encodeURIComponent(edisiId)}`;

  return (
    <div>
      {canWrite && (
        <div className="flex justify-end mb-4">
          <Link href={`/qurban/peserta/baru?edisi=${encodeURIComponent(edisiId)}`}>
            <Button>
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Tambah Peserta</span>
              <span className="sm:hidden">Tambah</span>
            </Button>
          </Link>
        </div>
      )}

      {/* Search + status filter */}
      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Cari nama atau kode bayar..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Cari peserta"
          />
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                type="button"
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  status === f.value
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading && <Loading className="my-8" />}

      {error && !loading && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-3">{error}</p>
            <Button variant="secondary" onClick={fetchData}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">
              {isFiltering
                ? 'Tidak ada peserta yang cocok dengan filter.'
                : 'Belum ada peserta pada edisi ini.'}
            </p>
          </div>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          {/* Desktop table (lg+) */}
          <div className="hidden lg:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <Th>Nama</Th>
                      <Th>Tipe</Th>
                      <Th>Hewan & Slot</Th>
                      <Th>Kode Bayar</Th>
                      <Th className="text-right">Harga</Th>
                      <Th>Status</Th>
                      <Th>Tgl Daftar</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => router.push(detailHref(p.id))}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-2 py-3 text-sm font-medium text-gray-900">
                          {p.display_nama}
                        </td>
                        <td className="px-2 py-3">
                          <span className={tipeQurbanBadgeClass(p.tipe_qurban)}>
                            {tipeQurbanLabel(p.tipe_qurban)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600">
                          {p.hewan_label}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600">
                          <span className="font-mono">{p.kode_bayar}</span>
                          {payByKode.has(p.kode_bayar) && (
                            <div className="mt-1">
                              <PembayaranStatusBadge status={payByKode.get(p.kode_bayar)!} />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                          {formatRupiah(p.harga_disepakati)}
                        </td>
                        <td className="px-2 py-3">
                          <span className={statusPendaftaranBadgeClass(p.status_pendaftaran)}>
                            {statusPendaftaranLabel(p.status_pendaftaran)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatPesertaDateID(p.tanggal_daftar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Card stack below lg */}
          <div className="lg:hidden space-y-3">
            {filtered.map((p) => (
              <Link key={p.id} href={detailHref(p.id)} className="block">
                <Card className="hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.display_nama}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={tipeQurbanBadgeClass(p.tipe_qurban)}>
                          {tipeQurbanLabel(p.tipe_qurban)}
                        </span>
                        <span className="text-xs text-gray-500">{p.hewan_label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        <span className="font-mono">{p.kode_bayar}</span> ·{' '}
                        {formatRupiah(p.harga_disepakati)}
                      </p>
                      {payByKode.has(p.kode_bayar) && (
                        <div className="mt-1">
                          <PembayaranStatusBadge status={payByKode.get(p.kode_bayar)!} />
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatPesertaDateID(p.tanggal_daftar)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        statusPendaftaranBadgeClass(p.status_pendaftaran),
                        'shrink-0'
                      )}
                    >
                      {statusPendaftaranLabel(p.status_pendaftaran)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <p className="text-xs text-gray-500 mt-4 text-center sm:text-left">
            Menampilkan {filtered.length} dari {rows.length} peserta
            {isFiltering ? ' (terfilter)' : ''}
          </p>
        </>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
        className
      )}
    >
      {children}
    </th>
  );
}
