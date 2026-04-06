'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { PageTitle } from '@/components/layout/page-title';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { useTransaksi } from '@/hooks/use-transaksi';
import { getAvailableBanks, getBankTemplate } from '@/lib/bank-templates';
import type { ImportRow, SplitRow } from '@/lib/bank-templates';
import { formatRupiah, formatTanggal } from '@/lib/utils';
import { TransaksiJenis } from '@/types';

export default function ImportPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const banks = useMemo(() => getAvailableBanks(), []);
  const { data: kategoris } = useKategori();
  const { data: rekenings } = useRekening();
  const { data: existingTransaksis } = useTransaksi();

  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);

  // Resolve rekening ID for the selected bank
  const rekeningId = useMemo(() => {
    // Find the rekening matching Bank Muamalat / 3200028199
    const r = rekenings.find((r) =>
      r.nomor_rekening === '3200028199' || r.nama_bank.toLowerCase().includes('muamalat')
    );
    return r?.id || rekenings[0]?.id || '';
  }, [rekenings]);

  // Duplicate check: tanggal + jumlah + keterangan
  const isDuplicate = useCallback((tanggal: string, jumlah: number, keterangan: string) => {
    return existingTransaksis.some((t) =>
      t.tanggal === tanggal && t.jumlah === jumlah && t.deskripsi === keterangan
    );
  }, [existingTransaksis]);

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const template = getBankTemplate(bankId);
    if (!template) {
      toast('Template bank tidak ditemukan', 'error');
      return;
    }

    Papa.parse(file, {
      complete: (results) => {
        const rawRows = results.data as string[][];
        // Skip header rows
        const dataRows = rawRows.slice(template.headerRowsToSkip);

        const parsed: ImportRow[] = [];
        let counter = 0;
        for (const raw of dataRows) {
          const parsedRow = template.parseRow(raw);
          if (!parsedRow) continue;

          const categorized = template.categorize(parsedRow);
          counter++;
          parsed.push({
            ...categorized,
            key: `import-${counter}`,
            isDuplicate: isDuplicate(categorized.tanggal, categorized.jumlah, categorized.keterangan),
          });
        }

        setRows(parsed);
        setImported(false);
        setImportResult(null);
        toast(`${parsed.length} transaksi berhasil diparsing`);
      },
      error: () => {
        toast('Gagal membaca file CSV', 'error');
      },
    });

    // Reset file input so the same file can be re-uploaded
    e.target.value = '';
  }, [bankId, isDuplicate, toast]);

  // Update kategori for a row
  const updateRowKategori = useCallback((key: string, kategori_id: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const kat = kategoris.find((k) => k.id === kategori_id);
      return {
        ...r,
        kategori_id,
        kategoriLabel: kat?.nama || '',
        status: kategori_id ? 'auto' : 'review',
      };
    }));
  }, [kategoris]);

  // --- Split logic ---
  const addSplitRow = useCallback((parentKey: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== parentKey) return r;
      const existing = r.splitRows || [];
      const newSplit: SplitRow = {
        key: `${parentKey}-split-${existing.length + 1}`,
        kategori_id: r.kategori_id,
        kategoriLabel: r.kategoriLabel,
        jumlah: 0,
      };
      return { ...r, splitRows: [...existing, newSplit] };
    }));
  }, []);

  const updateSplitRow = useCallback((parentKey: string, splitKey: string, field: 'kategori_id' | 'jumlah', value: string | number) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== parentKey || !r.splitRows) return r;
      return {
        ...r,
        splitRows: r.splitRows.map((s) => {
          if (s.key !== splitKey) return s;
          if (field === 'kategori_id') {
            const kat = kategoris.find((k) => k.id === value);
            return { ...s, kategori_id: value as string, kategoriLabel: kat?.nama || '' };
          }
          return { ...s, jumlah: typeof value === 'number' ? value : parseInt(String(value).replace(/[^\d]/g, ''), 10) || 0 };
        }),
      };
    }));
  }, [kategoris]);

  const removeSplitRow = useCallback((parentKey: string, splitKey: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== parentKey || !r.splitRows) return r;
      const updated = r.splitRows.filter((s) => s.key !== splitKey);
      return { ...r, splitRows: updated.length > 0 ? updated : undefined, status: updated.length > 0 ? 'split' : 'split' };
    }));
  }, []);

  // Summary stats
  const summary = useMemo(() => {
    const total = rows.length;
    const auto = rows.filter((r) => r.status === 'auto').length;
    const review = rows.filter((r) => r.status === 'review').length;
    const split = rows.filter((r) => r.status === 'split').length;
    const duplicates = rows.filter((r) => r.isDuplicate).length;
    return { total, auto, review, split, duplicates };
  }, [rows]);

  // Check if all rows are ready to import
  const canImport = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => {
      if (r.status === 'split' && r.splitRows && r.splitRows.length > 0) {
        // All splits must have kategori and jumlah, and total must match
        const splitsValid = r.splitRows.every((s) => s.kategori_id && s.jumlah > 0);
        const totalSplit = r.splitRows.reduce((sum, s) => sum + s.jumlah, 0);
        return splitsValid && totalSplit === r.jumlah;
      }
      return r.kategori_id !== '';
    });
  }, [rows]);

  // Handle import
  const handleImport = async () => {
    if (!rekeningId) {
      toast('Rekening bank tidak ditemukan. Pastikan rekening Bank Muamalat sudah terdaftar.', 'error');
      return;
    }

    setImporting(true);
    try {
      // Build items: expand split rows
      const items: { tanggal: string; jenis: TransaksiJenis; kategori_id: string; deskripsi: string; jumlah: number; rekening_id: string }[] = [];

      for (const row of rows) {
        if (row.status === 'split' && row.splitRows && row.splitRows.length > 0) {
          for (const split of row.splitRows) {
            items.push({
              tanggal: row.tanggal,
              jenis: row.jenis,
              kategori_id: split.kategori_id,
              deskripsi: `${row.keterangan} [Split: ${split.kategoriLabel}]`,
              jumlah: split.jumlah,
              rekening_id: rekeningId,
            });
          }
        } else {
          items.push({
            tanggal: row.tanggal,
            jenis: row.jenis,
            kategori_id: row.kategori_id,
            deskripsi: row.keterangan,
            jumlah: row.jumlah,
            rekening_id: rekeningId,
          });
        }
      }

      const res = await fetch('/api/transaksi/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();
      if (data.success) {
        setImported(true);
        setImportResult(data.data);
        toast(`${data.data.imported} transaksi berhasil diimport`);
      } else {
        toast(data.error || 'Gagal mengimport', 'error');
      }
    } catch {
      toast('Terjadi kesalahan saat import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setRows([]);
    setImported(false);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      <PageTitle
        title="Import CSV"
        subtitle="Import transaksi dari rekening koran bank"
      />

      {/* Step 1: Select bank + upload */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Bank</label>
            <select
              value={bankId}
              onChange={(e) => { setBankId(e.target.value); handleReset(); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </div>
          {rows.length > 0 && (
            <div>
              <Button variant="secondary" onClick={handleReset}>Reset</Button>
            </div>
          )}
        </div>
      </Card>

      {/* Import result */}
      {imported && importResult && (
        <Card className="mt-4">
          <div className="text-center py-4">
            <p className="text-lg font-bold text-emerald-600">{importResult.imported} transaksi berhasil diimport!</p>
            <div className="flex gap-3 justify-center mt-4">
              <Button onClick={handleReset}>Import File Lain</Button>
              <a href="/transaksi"><Button variant="secondary">Lihat Transaksi</Button></a>
            </div>
          </div>
        </Card>
      )}

      {/* Summary + Preview */}
      {rows.length > 0 && !imported && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            <Card>
              <p className="text-xs text-gray-500">Total Transaksi</p>
              <p className="text-xl font-bold">{summary.total}</p>
            </Card>
            <Card>
              <p className="text-xs text-gray-500">Auto-mapped</p>
              <p className="text-xl font-bold text-emerald-600">{summary.auto}</p>
            </Card>
            <Card>
              <p className="text-xs text-gray-500">Perlu Review</p>
              <p className="text-xl font-bold text-amber-600">{summary.review}</p>
            </Card>
            <Card>
              <p className="text-xs text-gray-500">Perlu Split</p>
              <p className="text-xl font-bold text-blue-600">{summary.split}</p>
            </Card>
            <Card>
              <p className="text-xs text-gray-500">Duplikat</p>
              <p className="text-xl font-bold text-red-600">{summary.duplicates}</p>
            </Card>
          </div>

          {/* Preview table */}
          <Card padding={false} className="mt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <RowGroup
                      key={row.key}
                      row={row}
                      kategoris={kategoris}
                      onKategoriChange={updateRowKategori}
                      onAddSplit={addSplitRow}
                      onUpdateSplit={updateSplitRow}
                      onRemoveSplit={removeSplitRow}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Confirm button */}
          <div className="mt-4 flex gap-3 items-center">
            <Button onClick={handleImport} disabled={importing || !canImport}>
              {importing ? 'Mengimport...' : `Konfirmasi Import (${rows.length} transaksi)`}
            </Button>
            {!canImport && (
              <span className="text-sm text-amber-600">Semua transaksi harus memiliki kategori sebelum import.</span>
            )}
          </div>
        </>
      )}

      {rows.length === 0 && !imported && (
        <Card className="mt-4">
          <p className="text-center text-gray-500 py-8">
            Pilih bank dan upload file CSV rekening koran untuk mulai import.
          </p>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Row Group Component (main row + optional split sub-rows)
// ============================================================

import type { Kategori } from '@/types';

interface RowGroupProps {
  row: ImportRow;
  kategoris: Kategori[];
  onKategoriChange: (key: string, kategori_id: string) => void;
  onAddSplit: (parentKey: string) => void;
  onUpdateSplit: (parentKey: string, splitKey: string, field: 'kategori_id' | 'jumlah', value: string | number) => void;
  onRemoveSplit: (parentKey: string, splitKey: string) => void;
}

function RowGroup({ row, kategoris, onKategoriChange, onAddSplit, onUpdateSplit, onRemoveSplit }: RowGroupProps) {
  const statusBadge = () => {
    if (row.isDuplicate) return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Duplikat</span>;
    if (row.status === 'auto') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Auto</span>;
    if (row.status === 'split') return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Perlu Split</span>;
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Review</span>;
  };

  const splitTotal = row.splitRows?.reduce((s, r) => s + r.jumlah, 0) || 0;
  const hasSplits = row.splitRows && row.splitRows.length > 0;

  // Format helper for split jumlah input
  const formatDots = (value: string) => {
    const digits = value.replace(/[^\d]/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  return (
    <>
      <TableRow className={row.isDuplicate ? 'bg-red-50' : undefined}>
        <TableCell className="whitespace-nowrap text-sm">{formatTanggal(row.tanggal)}</TableCell>
        <TableCell className="max-w-[250px] text-sm">
          <span className="block truncate" title={row.keterangan}>{row.keterangan}</span>
        </TableCell>
        <TableCell><Badge label={row.jenis} /></TableCell>
        <TableCell className={`text-right font-medium whitespace-nowrap ${row.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'}`}>
          {row.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(row.jumlah)}
        </TableCell>
        <TableCell>
          {row.status === 'split' && hasSplits ? (
            <span className="text-xs text-blue-600">Lihat split di bawah</span>
          ) : (
            <select
              value={row.kategori_id}
              onChange={(e) => onKategoriChange(row.key, e.target.value)}
              className="block w-full min-w-[140px] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Pilih Kategori</option>
              {kategoris
                .filter((k) => k.jenis === row.jenis)
                .map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
            </select>
          )}
        </TableCell>
        <TableCell>{statusBadge()}</TableCell>
        <TableCell>
          {row.status === 'split' && (
            <Button variant="ghost" size="sm" onClick={() => onAddSplit(row.key)}>
              + Split
            </Button>
          )}
        </TableCell>
      </TableRow>

      {/* Split sub-rows */}
      {hasSplits && row.splitRows!.map((split) => (
        <TableRow key={split.key} className="bg-blue-50/50">
          <TableCell colSpan={3} className="text-xs text-gray-500 pl-8">Split</TableCell>
          <TableCell className="text-right">
            <Input
              type="text"
              inputMode="numeric"
              value={split.jumlah ? formatDots(split.jumlah.toString()) : ''}
              onChange={(e) => {
                const val = parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0;
                onUpdateSplit(row.key, split.key, 'jumlah', val);
              }}
              className="w-28 text-xs text-right"
              placeholder="Jumlah"
            />
          </TableCell>
          <TableCell>
            <select
              value={split.kategori_id}
              onChange={(e) => onUpdateSplit(row.key, split.key, 'kategori_id', e.target.value)}
              className="block w-full min-w-[140px] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Pilih Kategori</option>
              {kategoris
                .filter((k) => k.jenis === row.jenis)
                .map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
            </select>
          </TableCell>
          <TableCell />
          <TableCell>
            <Button variant="ghost" size="sm" onClick={() => onRemoveSplit(row.key, split.key)}>Hapus</Button>
          </TableCell>
        </TableRow>
      ))}

      {/* Split total validation */}
      {hasSplits && (
        <TableRow className="bg-blue-50/30">
          <TableCell colSpan={3} className="text-xs text-right font-medium text-gray-600 pl-8">Total Split:</TableCell>
          <TableCell className={`text-right text-xs font-bold ${splitTotal === row.jumlah ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatRupiah(splitTotal)} / {formatRupiah(row.jumlah)}
            {splitTotal !== row.jumlah && <span className="ml-1">(selisih {formatRupiah(Math.abs(row.jumlah - splitTotal))})</span>}
          </TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      )}
    </>
  );
}
