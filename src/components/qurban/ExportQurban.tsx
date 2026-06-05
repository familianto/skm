'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useMe } from '@/hooks/use-me';
import {
  EXPORT_COLUMN_CATALOG,
  type ColumnDef,
  type ExportFilter,
  type ExportSort,
} from '@/lib/qurban/export-tabel';
import {
  ROW_LEVEL_PRESETS,
  SUMMARY_PRESETS,
  type RowLevelPreset,
} from '@/lib/qurban/export-presets';
import type { BagianKanonik, RekapBagianResult } from '@/lib/qurban/rekap-bagian';

/**
 * F8 Milestone E — section Export di `/qurban/laporan` (tab "Export").
 *
 * Pustaka preset (baris-level + ringkasan) + builder kolom. Preset baris-level
 * memuat ke builder (boleh diedit); preset ringkasan = tombol PDF/Excel langsung.
 * Memanggil LP6 (`POST /api/qurban/laporan/export`) lalu mengunduh file.
 * Katalog & preset di-import dari modul pur (sumber tunggal). Mobile-first.
 */

type Format = 'pdf' | 'xlsx';

interface Props {
  edisiId: string;
}

const RT_OPTIONS = ['SEMUA', '01', '02', '03', '04', '05', '06', 'LAINNYA'];
const SORT_OPTIONS: { value: ExportSort; label: string }[] = [
  { value: 'jenis_urut_slot', label: 'Jenis → No. Urut → Slot' },
  { value: 'kode_hewan', label: 'Kode Hewan' },
  { value: 'nama', label: 'Nama' },
  { value: 'rt', label: 'RT' },
];

const CATALOG_GROUPS = ['Lainnya', 'Muqorib', 'Peserta', 'Hewan', 'Pembayaran'];

export function TabExport({ edisiId }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Builder state.
  const [columns, setColumns] = useState<string[]>(ROW_LEVEL_PRESETS[0].columns);
  const [manualColumns, setManualColumns] = useState<string[]>([]);
  const [manualDraft, setManualDraft] = useState('');
  const [filter, setFilter] = useState<ExportFilter>({
    jenis: 'SEMUA',
    status_hewan: 'SEMUA',
    rt: 'SEMUA',
    hanya_ber_urut: false,
  });
  const [sort, setSort] = useState<ExportSort>('nama');
  const [format, setFormat] = useState<Format>('pdf');

  const selected = useMemo(() => new Set(columns), [columns]);

  const loadPreset = (p: RowLevelPreset) => {
    setColumns(p.columns);
    setManualColumns(p.manual_columns);
    setFilter({
      jenis: p.filter.jenis ?? 'SEMUA',
      status_hewan: p.filter.status_hewan ?? 'SEMUA',
      rt: p.filter.rt ?? 'SEMUA',
      hanya_ber_urut: p.filter.hanya_ber_urut ?? false,
    });
    setSort(p.sort);
    toast(`Template "${p.label}" siap disesuaikan.`, 'success');
    if (typeof document !== 'undefined') {
      document.getElementById('export-builder')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const toggleColumn = (id: string) => {
    setColumns((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const addManual = () => {
    const v = manualDraft.trim();
    if (!v) return;
    if (manualColumns.length >= 6) {
      toast('Maksimal 6 kolom isi-tangan.', 'error');
      return;
    }
    setManualColumns((prev) => [...prev, v]);
    setManualDraft('');
  };

  const download = async (body: Record<string, unknown>, fallbackName: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/qurban/laporan/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edisi_id: edisiId, ...body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j?.error?.message || 'Gagal membuat file export.', 'error');
        return;
      }
      const blob = await res.blob();
      const filename = parseFilename(res.headers.get('Content-Disposition')) || fallbackName;
      triggerDownload(blob, filename);
      toast('File berhasil dibuat.', 'success');
    } catch {
      toast('Tidak dapat terhubung ke server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportBuilder = (fmt: Format) => {
    if (columns.length === 0) {
      toast('Pilih minimal satu kolom.', 'error');
      return;
    }
    void download(
      { shape: 'tabel', columns, manual_columns: manualColumns, filter, sort, format: fmt },
      `tabel_kustom.${fmt}`
    );
  };

  const exportSummary = (presetId: string, fmt: Format) => {
    void download({ shape: 'tabel', preset: presetId, format: fmt }, `${presetId}.${fmt}`);
  };

  return (
    <div className="space-y-6">
      {/* Pustaka preset baris-level. */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Laporan Tabel</h2>
        <p className="mb-3 text-xs text-gray-500">Tap untuk memuat lalu sesuaikan & unduh.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROW_LEVEL_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPreset(p)}
              className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <p className="text-sm font-semibold text-gray-900">{p.label}</p>
              <p className="mt-1 text-xs text-gray-500">{p.deskripsi}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Pustaka preset ringkasan. */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Ringkasan</h2>
        <p className="mb-3 text-xs text-gray-500">Layout tetap — export langsung.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SUMMARY_PRESETS.map((p) => (
            <Card key={p.id} className="!p-4">
              <p className="text-sm font-semibold text-gray-900">{p.label}</p>
              <p className="mt-1 text-xs text-gray-500">{p.deskripsi}</p>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => exportSummary(p.id, 'pdf')}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  PDF
                </button>
                <button
                  disabled={busy}
                  onClick={() => exportSummary(p.id, 'xlsx')}
                  className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  Excel
                </button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Kartu Pemotongan & Label Bagikan. */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Kartu Pemotongan & Label</h2>
        <p className="mb-3 text-xs text-gray-500">Poster kartu per hewan (Hari-H) & label tempel per peserta.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KartuCard
            title="Kartu Pemotongan Sapi"
            desc="Grid 3×3, sampai 7 nama/kartu, urut potong."
            busy={busy}
            onPdf={() => download({ shape: 'kartu', jenis: 'sapi', filter: { jenis: 'SAPI' }, format: 'pdf' }, 'kartu_sapi.pdf')}
            onXlsx={() => download({ shape: 'kartu', jenis: 'sapi', filter: { jenis: 'SAPI' }, format: 'xlsx' }, 'kartu_sapi.xlsx')}
          />
          <KartuCard
            title="Kartu Pemotongan Kambing"
            desc="Grid 3×6, 1 nama/kartu, urut potong."
            busy={busy}
            onPdf={() => download({ shape: 'kartu', jenis: 'kambing', filter: { jenis: 'KAMBING' }, format: 'pdf' }, 'kartu_kambing.pdf')}
            onXlsx={() => download({ shape: 'kartu', jenis: 'kambing', filter: { jenis: 'KAMBING' }, format: 'xlsx' }, 'kartu_kambing.xlsx')}
          />
          <KartuCard
            title="Label Bagikan"
            desc="Label tempel per peserta (nama + hewan + urut)."
            busy={busy}
            onPdf={() => download({ shape: 'label', filter: { jenis: 'SEMUA' }, format: 'pdf' }, 'label_bagikan.pdf')}
            onXlsx={() => download({ shape: 'label', filter: { jenis: 'SEMUA' }, format: 'xlsx' }, 'label_bagikan.xlsx')}
          />
        </div>
      </section>

      {/* Rekap Bagian Hewan. */}
      <RekapBagianPanel edisiId={edisiId} busy={busy} onDownload={(fmt, jenis) => download({ shape: 'rekap', format: fmt, filter: { jenis } }, `rekap_bagian.${fmt}`)} />

      {/* Susun kolom sendiri. */}
      <section id="export-builder">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Susun Kolom Sendiri (Tabel)</h2>
        <Card className="space-y-5">
          {/* Cakupan & filter. */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Cakupan &amp; Filter</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SelectField
                label="Jenis"
                value={filter.jenis ?? 'SEMUA'}
                options={['SEMUA', 'SAPI', 'KAMBING']}
                onChange={(v) => setFilter((f) => ({ ...f, jenis: v as ExportFilter['jenis'] }))}
              />
              <SelectField
                label="Status Hewan"
                value={filter.status_hewan ?? 'SEMUA'}
                options={['SEMUA', 'AKTIF', 'BATAL']}
                onChange={(v) => setFilter((f) => ({ ...f, status_hewan: v as ExportFilter['status_hewan'] }))}
              />
              <SelectField
                label="RT"
                value={filter.rt ?? 'SEMUA'}
                options={RT_OPTIONS}
                onChange={(v) => setFilter((f) => ({ ...f, rt: v }))}
              />
              <label className="flex items-end gap-2 pb-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={filter.hanya_ber_urut ?? false}
                  onChange={(e) => setFilter((f) => ({ ...f, hanya_ber_urut: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                Hanya ber-urut
              </label>
            </div>
          </div>

          {/* Kolom. */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Kolom <span className="text-xs font-normal text-gray-400">({columns.length} dipilih)</span>
            </p>
            <div className="space-y-3">
              {CATALOG_GROUPS.map((group) => {
                const cols = EXPORT_COLUMN_CATALOG.filter((c) => c.group === group);
                if (cols.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {cols.map((c) => (
                        <ColumnChip
                          key={c.id}
                          col={c}
                          active={selected.has(c.id)}
                          onClick={() => toggleColumn(c.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kolom isi-tangan. */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Kolom Isi-Tangan</p>
            <div className="flex flex-wrap gap-2">
              {manualColumns.map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                >
                  {m}
                  <button
                    onClick={() => setManualColumns((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-amber-500 hover:text-amber-700"
                    aria-label={`Hapus ${m}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={manualDraft}
                onChange={(e) => setManualDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManual();
                  }
                }}
                placeholder="mis. Nama Petugas Distribusi"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                onClick={addManual}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Tambah
              </button>
            </div>
          </div>

          {/* Urutan & format. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label="Urutan"
              value={sort}
              options={SORT_OPTIONS.map((s) => s.value)}
              optionLabels={Object.fromEntries(SORT_OPTIONS.map((s) => [s.value, s.label]))}
              onChange={(v) => setSort(v as ExportSort)}
            />
            <SelectField
              label="Format"
              value={format}
              options={['pdf', 'xlsx']}
              optionLabels={{ pdf: 'PDF (A4)', xlsx: 'Excel (.xlsx)' }}
              onChange={(v) => setFormat(v as Format)}
            />
          </div>

          {/* Export. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <button
              disabled={busy || columns.length === 0}
              onClick={() => exportBuilder(format)}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? 'Menyiapkan…' : `Export ${format === 'pdf' ? 'PDF' : 'Excel'}`}
            </button>
            <span className="text-xs text-gray-400">
              {columns.length} kolom + {manualColumns.length} isi-tangan
            </span>
          </div>
        </Card>
      </section>
    </div>
  );
}

function ColumnChip({ col, active, onClick }: { col: ColumnDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white'
          : 'inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200'
      }
    >
      {col.label}
      {col.derived && (
        <span className={active ? 'text-emerald-100' : 'text-gray-400'} title="kolom turunan">
          *
        </span>
      )}
    </button>
  );
}

function KartuCard({
  title,
  desc,
  busy,
  onPdf,
  onXlsx,
}: {
  title: string;
  desc: string;
  busy: boolean;
  onPdf: () => void;
  onXlsx: () => void;
}) {
  return (
    <Card className="!p-4">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{desc}</p>
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={onPdf}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Unduh PDF
        </button>
        <button
          disabled={busy}
          onClick={onXlsx}
          className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          Excel
        </button>
      </div>
    </Card>
  );
}

function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseFilename(cd: string | null): string | null {
  if (!cd) return null;
  const m = /filename="?([^"]+)"?/.exec(cd);
  return m ? m[1] : null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Panel Rekap Bagian (F8 Milestone F) ──────────────────────────────────────

type RekapJenis = 'SEMUA' | 'SAPI' | 'KAMBING';

function RekapBagianPanel({
  edisiId,
  busy,
  onDownload,
}: {
  edisiId: string;
  busy: boolean;
  onDownload: (fmt: Format, jenis: RekapJenis) => void;
}) {
  const { me } = useMe();
  const { toast } = useToast();
  const isAdmin = me?.user.peran === 'SUPER_ADMIN' || me?.user.peran === 'ADMIN_QURBAN';

  const [jenis, setJenis] = useState<RekapJenis>('SEMUA');
  const [rekap, setRekap] = useState<RekapBagianResult | null>(null);
  const [map, setMap] = useState<BagianKanonik[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/qurban/laporan/rekap-bagian?edisi_id=${encodeURIComponent(edisiId)}&jenis=${jenis}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setRekap(json.data.rekap as RekapBagianResult);
        setMap(json.data.map as BagianKanonik[]);
      }
    } finally {
      setLoading(false);
    }
  }, [edisiId, jenis]);

  useEffect(() => {
    void load();
  }, [load]);

  const editMap = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/qurban/laporan/bagian-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok) {
      toast('Peta bagian diperbarui.', 'success');
      await load();
    } else {
      toast(json?.error?.message || 'Gagal mengubah peta bagian.', 'error');
    }
  };

  const baku = map.filter((m) => m.tipe === 'BAKU');
  const tambahan = map.filter((m) => m.tipe === 'TAMBAHAN');

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold text-gray-900">Rekap Bagian Hewan</h2>
      <p className="mb-3 text-xs text-gray-500">
        Rekap permintaan bagian (daging, paha, dll) dari data peserta.
      </p>
      <Card className="space-y-4">
        {/* Filter + unduh. */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Jenis</span>
            <select
              value={jenis}
              onChange={(e) => setJenis(e.target.value as RekapJenis)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="SEMUA">Semua</option>
              <option value="SAPI">Sapi</option>
              <option value="KAMBING">Kambing</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => onDownload('pdf', jenis)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Unduh PDF
            </button>
            <button
              disabled={busy}
              onClick={() => onDownload('xlsx', jenis)}
              className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              Unduh Excel
            </button>
          </div>
        </div>

        {/* Tabel rekap. */}
        {loading ? (
          <p className="text-sm text-gray-400">Memuat…</p>
        ) : rekap ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-medium">No</th>
                  <th className="px-3 py-2 font-medium">Bagian</th>
                  <th className="px-3 py-2 text-right font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {rekap.rows.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-400" colSpan={3}>
                      Belum ada permintaan bagian
                    </td>
                  </tr>
                ) : (
                  rekap.rows.map((r) => (
                    <tr key={r.nama} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-500">{r.no}</td>
                      <td className="px-3 py-2 text-gray-700">{r.nama}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{r.jumlah}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-900">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">Total Permintaan</td>
                  <td className="px-3 py-2 text-right">{rekap.total_permintaan}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-2 text-xs text-gray-400">
              {rekap.peserta_valid} peserta valid · {rekap.dengan_permintaan} dengan permintaan ·{' '}
              {rekap.tanpa_permintaan} tanpa permintaan · {rekap.total_bungkus_kupon} bungkus kupon (di luar bagian)
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Data tidak tersedia.</p>
        )}

        {/* Editor peta (admin). */}
        {isAdmin && (
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => setShowEditor((v) => !v)}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              {showEditor ? 'Tutup peta bagian' : 'Atur peta bagian (alias)'}
            </button>
            {showEditor && (
              <div className="mt-3 space-y-4">
                {[
                  { label: 'Bagian Baku', items: baku },
                  { label: 'Tambahan (dari data arsip)', items: tambahan },
                ].map((grp) => (
                  <div key={grp.label}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{grp.label}</p>
                    <div className="space-y-2">
                      {grp.items.map((m) => (
                        <div key={m.nama_kanonik} className="rounded-lg border border-gray-200 p-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${m.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                              {m.nama_kanonik}
                            </span>
                            <button
                              onClick={() => editMap({ action: 'set_active', nama_kanonik: m.nama_kanonik, is_active: !m.is_active })}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              {m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.aliases.map((a) => (
                              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                {a}
                                <button
                                  onClick={() => editMap({ action: 'remove_alias', nama_kanonik: m.nama_kanonik, alias: a })}
                                  className="text-gray-400 hover:text-gray-600"
                                  aria-label={`Hapus alias ${a}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="mt-1 flex gap-1">
                            <input
                              value={aliasDraft[m.nama_kanonik] ?? ''}
                              onChange={(e) => setAliasDraft((d) => ({ ...d, [m.nama_kanonik]: e.target.value }))}
                              placeholder="+ alias"
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => {
                                const v = (aliasDraft[m.nama_kanonik] ?? '').trim();
                                if (v) {
                                  void editMap({ action: 'add_alias', nama_kanonik: m.nama_kanonik, alias: v });
                                  setAliasDraft((d) => ({ ...d, [m.nama_kanonik]: '' }));
                                }
                              }}
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Tambah
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
