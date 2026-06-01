'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatRupiah } from '@/lib/utils';
import { isMixedKategoriUnresolved, type PembayaranRow } from '@/lib/qurban/pembayaran-display';

/**
 * F6 D3 — Tab Triase Rekonsiliasi TRANSFER (di dalam /qurban/pembayaran).
 * Untuk [SA,BD] (RBAC ikut PY5/PY6/PY7; guard API sumber kebenaran).
 *
 *  - Jalankan Auto-match (PY5).
 *  - Antrian (PY7): pending_auto (terapkan via PY6), saran Layer 2 (konfirmasi
 *    via PY6), unmatched (taut manual via PY6 + pencarian PY8 di luar band).
 *  - Resolusi kategori "mixed" (PY9) untuk TRANSFER LUNAS lintas-jenis.
 */

interface Props {
  edisiId: string;
  onChanged: () => void;
}

interface Sinyal { key: string; poin: number; detail: string }
interface ScoredKandidat {
  pembayaran_id: string;
  kode_bayar: string;
  muqorib_nama: string;
  score: number;
  sinyal: Sinyal[];
  reason: string;
}
interface TrxLite { id: string; jumlah: number; deskripsi: string; tanggal: string }
interface SuggestionEntry { transaksi: TrxLite; kandidat: ScoredKandidat[] }
interface PendingAuto { transaksi_id: string; pembayaran_id: string; kode_bayar: string }
interface UnmatchedEntry { transaksi_id: string; jumlah: number; deskripsi: string; tanggal: string }
interface QueueData {
  pending_auto: PendingAuto[];
  suggestions: SuggestionEntry[];
  anomali: { transaksi_id: string; kode_bayar: string; alasan: string }[];
  unmatched: UnmatchedEntry[];
}

export function RekonsiliasiTab({ edisiId, onChanged }: Props) {
  const { toast } = useToast();
  const ep = encodeURIComponent(edisiId);

  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busyTrx, setBusyTrx] = useState<string | null>(null);

  // Manual-link modal state (target = transaksi bank unmatched).
  const [manualTrx, setManualTrx] = useState<UnmatchedEntry | null>(null);
  // Out-of-band search modal (PY8) — pilih transaksi bank di luar antrian.
  const [searchOpen, setSearchOpen] = useState(false);

  // Mixed-resolve list (TRANSFER LUNAS ber-flag mixed).
  const [mixedRows, setMixedRows] = useState<PembayaranRow[]>([]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, pRes] = await Promise.all([
        fetch(`/api/qurban/pembayaran/rekonsiliasi/queue?edisi_id=${ep}`),
        fetch(`/api/qurban/pembayaran?edisi_id=${ep}`),
      ]);
      const qJson = await qRes.json().catch(() => ({}));
      if (qRes.ok && qJson?.ok) setQueue(qJson.data as QueueData);
      else setError(qJson?.error?.message || 'Gagal memuat antrian rekonsiliasi.');

      const pJson = await pRes.json().catch(() => ({}));
      if (pRes.ok && pJson?.ok) {
        setMixedRows(((pJson.data as PembayaranRow[]) || []).filter((r) => isMixedKategoriUnresolved(r.match_metadata)));
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [ep]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const runAutoMatch = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/qurban/pembayaran/rekonsiliasi?edisi_id=${ep}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        const n = (json.data?.auto_lunas as unknown[])?.length ?? 0;
        toast(`${n} pembayaran TRANSFER otomatis LUNAS via kode bayar.`, 'success');
        await loadQueue();
        onChanged();
      } else {
        toast(json?.error?.message || 'Gagal menjalankan auto-match.', 'error');
      }
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setRunning(false);
    }
  };

  /** Taut transaksi bank ke satu pembayaran (PY6). */
  const linkTransaksi = async (pembayaranId: string, transaksiId: string) => {
    setBusyTrx(transaksiId);
    try {
      const res = await fetch(`/api/qurban/pembayaran/${pembayaranId}/link-transaksi?edisi_id=${ep}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaksi_id: transaksiId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Pembayaran ditautkan & LUNAS.', 'success');
        if (json.meta?.warning) toast(json.meta.warning, 'info');
        setManualTrx(null);
        await loadQueue();
        onChanged();
        return true;
      }
      toast(json?.error?.message || 'Gagal menautkan transaksi.', 'error');
      return false;
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
      return false;
    } finally {
      setBusyTrx(null);
    }
  };

  if (loading) return <Card><Loading /></Card>;
  if (error) return <Card><p className="text-sm text-red-600">{error}</p></Card>;

  const q = queue!;
  const nothing =
    q.pending_auto.length === 0 && q.suggestions.length === 0 && q.unmatched.length === 0 &&
    q.anomali.length === 0 && mixedRows.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          Cocokkan transfer bank (Bank Muamalat) ke pembayaran qurban. Auto-match memakai
          kode bayar di berita; sisanya ditriase manual.
        </p>
        <Button onClick={runAutoMatch} disabled={running}>
          {running ? 'Memproses…' : 'Jalankan Auto-match'}
        </Button>
      </div>

      {nothing && <Card><p className="text-sm text-gray-500">Tidak ada item rekonsiliasi. 🎉</p></Card>}

      {/* Mixed kategori — paling penting (uang sudah masuk, kategori salah). */}
      {mixedRows.length > 0 && (
        <Card padding={false}>
          <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/50">
            <h3 className="text-sm font-semibold text-amber-800">Perlu Resolusi Kategori (lintas-jenis)</h3>
            <p className="text-xs text-amber-700">LUNAS tapi kategori transaksi belum diselesaikan.</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {mixedRows.map((r) => (
              <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono">{r.kode_bayar}</span> · {r.muqorib_nama || '—'} ·{' '}
                  <span className="text-gray-500">{formatRupiah(r.nominal_total)}</span>
                </div>
                <ResolveKategoriButton edisiId={edisiId} pembayaran={r} onDone={() => { void loadQueue(); onChanged(); }} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* pending_auto — kecocokan kuat (kode + nominal). */}
      <QueueGroup title="Kecocokan Kuat (kode bayar)" hint="Jalankan Auto-match untuk menuntaskan, atau terapkan satu per satu." empty={q.pending_auto.length === 0}>
        {q.pending_auto.map((p) => (
          <li key={p.transaksi_id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="font-mono text-gray-500">{p.transaksi_id}</span> →{' '}
              <span className="font-mono">{p.kode_bayar}</span>
            </div>
            <Button size="sm" variant="secondary" disabled={busyTrx === p.transaksi_id}
              onClick={() => linkTransaksi(p.pembayaran_id, p.transaksi_id)}>
              Terapkan
            </Button>
          </li>
        ))}
      </QueueGroup>

      {/* saran Layer 2. */}
      <QueueGroup title="Saran (skor kemiripan)" hint="Periksa rincian skor, lalu konfirmasi bila cocok." empty={q.suggestions.length === 0}>
        {q.suggestions.map((s) => (
          <li key={s.transaksi.id} className="px-3 py-2 text-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-900 truncate">{s.transaksi.deskripsi || '(tanpa berita)'}</div>
                <div className="text-xs text-gray-500">
                  <span className="font-mono">{s.transaksi.id}</span> · {formatRupiah(s.transaksi.jumlah)} · {s.transaksi.tanggal?.slice(0, 10)}
                </div>
              </div>
            </div>
            {s.kandidat.map((k) => (
              <div key={k.pembayaran_id} className="rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div>
                    <span className="font-mono">{k.kode_bayar}</span> · {k.muqorib_nama || '—'}{' '}
                    <span className="text-xs text-emerald-700 font-semibold">skor {k.score}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {k.sinyal.filter((x) => x.poin > 0).map((x) => x.detail).join(' · ') || k.reason}
                  </div>
                </div>
                <Button size="sm" disabled={busyTrx === s.transaksi.id}
                  onClick={() => linkTransaksi(k.pembayaran_id, s.transaksi.id)}>
                  Konfirmasi
                </Button>
              </div>
            ))}
          </li>
        ))}
      </QueueGroup>

      {/* unmatched. */}
      <QueueGroup title="Tak Cocok" hint="Transfer dalam-band tanpa kandidat. Taut manual bila perlu." empty={q.unmatched.length === 0}>
        {q.unmatched.map((u) => (
          <li key={u.transaksi_id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="text-gray-900 truncate">{u.deskripsi || '(tanpa berita)'}</div>
              <div className="text-xs text-gray-500">
                <span className="font-mono">{u.transaksi_id}</span> · {formatRupiah(u.jumlah)} · {u.tanggal?.slice(0, 10)}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setManualTrx(u)}>Taut Manual</Button>
          </li>
        ))}
      </QueueGroup>

      {/* anomali (informasional). */}
      {q.anomali.length > 0 && (
        <QueueGroup title="Anomali" hint="Kode cocok tapi status/metode/nominal janggal — periksa manual." empty={false}>
          {q.anomali.map((a) => (
            <li key={a.transaksi_id} className="px-3 py-2 text-sm">
              <span className="font-mono text-gray-500">{a.transaksi_id}</span>{' '}
              <span className="font-mono">{a.kode_bayar}</span>
              <div className="text-xs text-amber-700">{a.alasan}</div>
            </li>
          ))}
        </QueueGroup>
      )}

      {/* Pencarian transaksi di luar band (PY8). */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            Antrian otomatis dibatasi rentang nominal qurban. Transfer di luar rentang
            (mis. Bawa Sendiri) tidak muncul di atas — cari & taut manual di sini.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setSearchOpen(true)}>Cari Transaksi…</Button>
        </div>
      </Card>

      {searchOpen && (
        <SearchTrxModal
          edisiId={edisiId}
          busyTrx={busyTrx}
          onClose={() => setSearchOpen(false)}
          onLink={(pembayaranId, transaksiId) => linkTransaksi(pembayaranId, transaksiId)}
        />
      )}

      {manualTrx && (
        <ManualLinkModal
          edisiId={edisiId}
          transaksi={manualTrx}
          busy={busyTrx === manualTrx.transaksi_id}
          onClose={() => setManualTrx(null)}
          onLink={(pembayaranId) => linkTransaksi(pembayaranId, manualTrx.transaksi_id)}
        />
      )}
    </div>
  );
}

function QueueGroup({
  title, hint, empty, children,
}: { title: string; hint: string; empty: boolean; children: React.ReactNode }) {
  return (
    <Card padding={false}>
      <div className="px-3 py-2 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      {empty ? (
        <p className="px-3 py-3 text-sm text-gray-400">Tidak ada.</p>
      ) : (
        <ul className="divide-y divide-gray-100">{children}</ul>
      )}
    </Card>
  );
}

/**
 * Modal Taut Manual: pilih pembayaran TRANSFER BELUM_BAYAR untuk transaksi bank
 * ini. (Pencarian transaksi di luar band ada di alur sebaliknya — di sini target
 * transaksi sudah dipilih dari antrian; untuk transaksi di luar band, lihat
 * tombol "Cari transaksi…" di bawah daftar.)
 */
function ManualLinkModal({
  edisiId, transaksi, busy, onClose, onLink,
}: {
  edisiId: string;
  transaksi: UnmatchedEntry;
  busy: boolean;
  onClose: () => void;
  onLink: (pembayaranId: string) => void;
}) {
  const ep = encodeURIComponent(edisiId);
  const [rows, setRows] = useState<PembayaranRow[]>([]);
  const [q, setQ] = useState('');
  const [pembayaranId, setPembayaranId] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/qurban/pembayaran?edisi_id=${ep}&status=BELUM_BAYAR&metode=TRANSFER`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) setRows((json.data as PembayaranRow[]) || []);
    })();
  }, [ep]);

  const filtered = rows.filter((r) =>
    !q.trim() || `${r.kode_bayar} ${r.muqorib_nama}`.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <Modal open onClose={onClose} title="Taut Manual ke Pembayaran">
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
          <div className="text-gray-900">{transaksi.deskripsi || '(tanpa berita)'}</div>
          <div className="text-xs text-gray-500">
            <span className="font-mono">{transaksi.transaksi_id}</span> · {formatRupiah(transaksi.jumlah)}
          </div>
        </div>

        <Input placeholder="Cari kode bayar / muqorib…" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400">Tidak ada pembayaran TRANSFER belum bayar yang cocok.</p>
          ) : filtered.map((r) => (
            <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
              <input type="radio" name="pembayaran" value={r.id} checked={pembayaranId === r.id}
                onChange={() => setPembayaranId(r.id)}
                className="text-emerald-600 focus:ring-emerald-500" />
              <span className="min-w-0">
                <span className="font-mono">{r.kode_bayar}</span> · {r.muqorib_nama || '—'} ·{' '}
                <span className="text-gray-500">{formatRupiah(r.nominal_transfer)}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          Nominal transaksi boleh berbeda dari nominal pembayaran (selisih dicatat).
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button onClick={() => onLink(pembayaranId)} disabled={busy || !pembayaranId}>
            {busy ? 'Menautkan…' : 'Tautkan & Lunaskan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Modal cari transaksi bank di LUAR band (PY8) lalu taut ke pembayaran (PY6).
 * Dua langkah: cari transaksi → pilih → pilih pembayaran TRANSFER belum bayar.
 */
function SearchTrxModal({
  edisiId, busyTrx, onClose, onLink,
}: {
  edisiId: string;
  busyTrx: string | null;
  onClose: () => void;
  onLink: (pembayaranId: string, transaksiId: string) => Promise<boolean>;
}) {
  const ep = encodeURIComponent(edisiId);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TrxLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TrxLite | null>(null);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      const res = await fetch(`/api/qurban/pembayaran/rekonsiliasi/cari-transaksi?edisi_id=${ep}&q=${encodeURIComponent(q.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) setResults((json.data as TrxLite[]) || []);
    } finally {
      setSearching(false);
    }
  }, [ep, q]);

  useEffect(() => { void search(); }, [search]);

  if (picked) {
    const u: UnmatchedEntry = { transaksi_id: picked.id, jumlah: picked.jumlah, deskripsi: picked.deskripsi, tanggal: picked.tanggal };
    return (
      <ManualLinkModal
        edisiId={edisiId}
        transaksi={u}
        busy={busyTrx === picked.id}
        onClose={() => setPicked(null)}
        onLink={async (pembayaranId) => { const ok = await onLink(pembayaranId, picked.id); if (ok) onClose(); }}
      />
    );
  }

  return (
    <Modal open onClose={onClose} title="Cari Transaksi Bank (di luar antrian)">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Cari berita / ref / nominal…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} />
          <Button variant="secondary" onClick={() => void search()} disabled={searching}>Cari</Button>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {searching ? (
            <p className="px-3 py-3 text-sm text-gray-400">Mencari…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400">Tidak ada transaksi MASUK belum terrekonsiliasi.</p>
          ) : results.map((t) => (
            <button key={t.id} type="button" onClick={() => setPicked(t)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              <div className="text-gray-900 truncate">{t.deskripsi || '(tanpa berita)'}</div>
              <div className="text-xs text-gray-500">
                <span className="font-mono">{t.id}</span> · {formatRupiah(t.jumlah)} · {t.tanggal?.slice(0, 10)}
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Tombol + modal pilih kategori untuk transaksi TRANSFER ber-flag mixed (PY9). */
function ResolveKategoriButton({
  edisiId, pembayaran, onDone,
}: { edisiId: string; pembayaran: PembayaranRow; onDone: () => void }) {
  const { toast } = useToast();
  const ep = encodeURIComponent(edisiId);
  const [open, setOpen] = useState(false);
  const [kats, setKats] = useState<{ id: string; nama: string }[]>([]);
  const [katId, setKatId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKatId('');
    (async () => {
      const res = await fetch('/api/kategori?jenis=MASUK');
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setKats(((json.data as { id: string; nama: string }[]) || []).filter((k) => /qurban/i.test(k.nama)));
      }
    })();
  }, [open]);

  const submit = async () => {
    if (!katId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/qurban/pembayaran/${pembayaran.id}/resolve-kategori?edisi_id=${ep}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kategori_id: katId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        toast('Kategori transaksi diselesaikan.', 'success');
        if (json.meta?.warning) toast(json.meta.warning, 'info');
        setOpen(false);
        onDone();
        return;
      }
      toast(json?.error?.message || 'Gagal menyelesaikan kategori.', 'error');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Pilih Kategori</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pilih Kategori Transaksi">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Pendaftaran <span className="font-mono">{pembayaran.kode_bayar}</span> mencakup lebih dari satu
            jenis hewan. Pilih kategori yang benar untuk transaksi pemasukannya (atau tangani Split di Transaksi).
          </p>
          <select
            value={katId}
            onChange={(e) => setKatId(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="">— Pilih kategori —</option>
            {kats.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={submit} disabled={busy || !katId}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
