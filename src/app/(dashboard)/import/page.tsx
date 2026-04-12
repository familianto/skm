'use client';

import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { PageTitle } from '@/components/layout/page-title';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useKategori } from '@/hooks/use-kategori';
import { useRekening } from '@/hooks/use-rekening';
import { useTransaksi } from '@/hooks/use-transaksi';
import { getAvailableBanks, getBankTemplate } from '@/lib/bank-templates';
import type { ImportRow, ImportStatus, SplitDraftRow } from '@/lib/bank-templates';
import { formatRupiah, formatTanggal } from '@/lib/utils';
import { TransaksiJenis } from '@/types';
import type { Kategori } from '@/types';

/** Ambang nominal MASUK yang memunculkan visual cue amber */
const LARGE_MASUK_THRESHOLD = 2_000_000;

// ============================================================
// Duplicate detection types (match /api/transaksi/check-duplicates)
// ============================================================

type DuplicateEntry =
  | { type: 'exact'; transactionId: string }
  | { type: 'split'; transactionIds: string[] };

interface PossibleDuplicateItem {
  tanggal: string;
  jumlah: number;
  jenis: TransaksiJenis;
  bank_ref: string;
  existingTransactionId: string;
  existingDescription: string;
}

interface CheckDuplicatesResponse {
  duplicates: Record<string, DuplicateEntry>;
  possibleDuplicates: PossibleDuplicateItem[];
}

/**
 * Build the final `bank_ref` stored on sheet transaksi for an ImportRow.
 * - Normal (non-split) row: `<referensi>`
 * - Split-child row: `<referensi>_split_<N>` (1-based per splitIndex)
 * - "Tidak Split" (no splitParent, even though it's a split-status row): `<referensi>`
 */
function buildBankRef(row: ImportRow): string {
  const base = row.referensi || '';
  if (!base) return '';
  if (row.splitParent) {
    return `${base}_split_${row.splitParent.splitIndex}`;
  }
  return base;
}

/**
 * Map detected SETOR TUNAI keywords → nama kategori untuk pre-fill split form.
 * TARAWIH / RAMADHAN mengoverride INFAQ → Infaq Ramadhan.
 */
function buildPrefillKategoriNames(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  const hasRamadhan =
    keywords.includes('TARAWIH') || keywords.includes('RAMADHAN');
  const mapping: Record<string, string> = {
    'ZAKAT MAL': 'Zakat Mal',
    'ZAKAT': 'Zakat Mal',
    'DONASI': 'Donasi Sosial',
    'KARPET': 'Donasi & Wakaf Pembangunan',
    'WAKAF': 'Donasi & Wakaf Pembangunan',
    'PEMBANGUNAN': 'Donasi & Wakaf Pembangunan',
    'INFAQ': hasRamadhan ? 'Infaq Ramadhan' : 'Infaq Jumat',
    'PER PEKAN': hasRamadhan ? 'Infaq Ramadhan' : 'Infaq Jumat',
    'TARAWIH': 'Infaq Ramadhan',
    'RAMADHAN': 'Infaq Ramadhan',
  };
  const result: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const name = mapping[k];
    if (name && !seen.has(name)) {
      result.push(name);
      seen.add(name);
    }
  }
  return result;
}

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
  const [importResult, setImportResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; succeeded: number } | null>(null);

  // Split editing state — ephemeral draft working set while user edits
  // a SETOR TUNAI row. `null` = no split form open.
  const [splitEditing, setSplitEditing] = useState<{
    rowKey: string;
    drafts: SplitDraftRow[];
  } | null>(null);

  // Duplicate detection flow state
  //
  // `checkingDuplicates`: shown on the Submit button while we call
  //   /api/transaksi/check-duplicates before opening the summary dialog.
  // `summaryDialog`: classification result + the set of rows that made it
  //   through to the review step. `null` = dialog closed.
  // `possibleKeep`: map of possible-duplicate bank_ref → checked state.
  //   Default UNCHECKED (user must opt-in to include fallback matches).
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [summaryDialog, setSummaryDialog] = useState<{
    totalCsv: number;
    unhandledSplit: number;
    duplicates: Record<string, DuplicateEntry>;
    possibleDuplicates: PossibleDuplicateItem[];
    // Rows that survived Layer 1 (exact/split match) — candidates for insert.
    // Possible-duplicate rows are also in here; they're filtered at confirm
    // time based on `possibleKeep`.
    importableRows: ImportRow[];
    // Rows skipped because they matched Layer 1 (exact or split), kept for
    // display in the "Duplikat (di-skip)" collapsible section.
    duplicateRows: Array<{
      row: ImportRow;
      entry: DuplicateEntry;
    }>;
  } | null>(null);
  const [possibleKeep, setPossibleKeep] = useState<Record<string, boolean>>({});
  const [showDupDetails, setShowDupDetails] = useState(false);
  const [showPossibleDetails, setShowPossibleDetails] = useState(true);

  // Resolve rekening ID for the selected bank
  const rekeningId = useMemo(() => {
    // Find the rekening matching Bank Muamalat / 3200028199
    const r = rekenings.find((r) =>
      r.nomor_rekening === '3200028199' || r.nama_bank.toLowerCase().includes('muamalat')
    );
    return r?.id || rekenings[0]?.id || '';
  }, [rekenings]);

  // Resolve kategori name → id at runtime (so templates don't hardcode IDs)
  const resolveKategori = useCallback(
    (nama: string, jenis: TransaksiJenis): string => {
      if (!nama) return '';
      const k = kategoris.find(
        (x) => x.nama === nama && x.jenis === jenis
      );
      return k?.id || '';
    },
    [kategoris]
  );

  // Re-resolve kategori IDs when kategoris data becomes available.
  // Handles race condition where CSV was uploaded before categories finished loading:
  // rows already have kategoriLabel (pattern match) but kategori_id is empty.
  useEffect(() => {
    if (kategoris.length === 0) return;
    setRows(prev => {
      if (prev.length === 0) return prev;
      let changed = false;
      const updated = prev.map(row => {
        if (row.kategori_id || !row.kategoriLabel || row.status === 'split') return row;
        const resolved = resolveKategori(row.kategoriLabel, row.jenis);
        if (!resolved) return row;
        changed = true;
        // Only upgrade to 'auto' if the review was caused by unresolved kategori
        const wasUnresolvedDowngrade = row.reviewSuggestion?.includes('belum ada di sheet');
        return {
          ...row,
          kategori_id: resolved,
          status: (wasUnresolvedDowngrade ? 'auto' : row.status) as ImportStatus,
          reviewSuggestion: wasUnresolvedDowngrade ? undefined : row.reviewSuggestion,
        };
      });
      return changed ? updated : prev;
    });
  }, [kategoris, resolveKategori]);

  // Build highlight regex per bank template (memoized — runs once per bank)
  const highlightRegex = useMemo(() => {
    const template = getBankTemplate(bankId);
    if (!template) return { masuk: null, keluar: null };
    return {
      masuk: buildHighlightRegex(template.highlightKeywords.masuk),
      keluar: buildHighlightRegex(template.highlightKeywords.keluar),
    };
  }, [bankId]);

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

    // Guard: if categories haven't loaded yet, tell the user to wait
    if (kategoris.length === 0) {
      toast('Data kategori belum tersedia. Tunggu beberapa detik lalu coba lagi.', 'error');
      e.target.value = '';
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

          const categorized = template.categorize(parsedRow, resolveKategori);
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
        // Set default date range from parsed data
        if (parsed.length > 0) {
          const dates = parsed.map((r) => r.tanggal.slice(0, 10)).sort();
          setFilterDateFrom(dates[0]);
          setFilterDateTo(dates[dates.length - 1]);
        }
        const autoCount = parsed.filter(r => r.status === 'auto').length;
        toast(`${parsed.length} transaksi diparsing (${autoCount} auto-mapped)`);
      },
      error: () => {
        toast('Gagal membaca file CSV', 'error');
      },
    });

    // Reset file input so the same file can be re-uploaded
    e.target.value = '';
  }, [bankId, isDuplicate, kategoris, resolveKategori, toast]);

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

  /**
   * Confirm a Review row — promote status to 'auto' without changing
   * kategori_id. Dipakai oleh tombol "OK" dan juga saat user berinteraksi
   * dengan dropdown (onMouseDown/onFocus) untuk menangani bug "pilih
   * kategori sama tidak berubah statusnya".
   */
  const confirmReview = useCallback((key: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (r.status !== 'review') return r;
        if (!r.kategori_id) return r;
        return { ...r, status: 'auto' };
      })
    );
  }, []);

  // --- Split logic (SETOR TUNAI) ---

  /** Open split form for a row. Pre-fills drafts based on detected keywords. */
  const openSplitForm = useCallback((rowKey: string) => {
    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;

    const prefillNames = buildPrefillKategoriNames(row.detectedKeywords);
    // Pre-fill rows — at least 2 (user will adjust jumlah)
    const initialNames = prefillNames.length >= 2 ? prefillNames : [...prefillNames, ''];
    if (initialNames.length === 0) initialNames.push('', '');

    const drafts: SplitDraftRow[] = initialNames.map((nama, idx) => {
      const kat = nama
        ? kategoris.find(
            (k) => k.nama === nama && k.jenis === row.jenis
          )
        : undefined;
      return {
        key: `${rowKey}-draft-${idx}`,
        kategori_id: kat?.id || '',
        jumlah: 0,
        deskripsi: row.keterangan,
      };
    });

    setSplitEditing({ rowKey, drafts });
  }, [rows, kategoris]);

  /**
   * Open split form for any MASUK row (Auto/Review) — non-SETOR-TUNAI case.
   * Pre-fill draft 1 with current kategori (jumlah 0), draft 2+ dari
   * hasil detectKeywords pada keterangan row.
   */
  const openManualSplit = useCallback((rowKey: string) => {
    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;
    if (row.jenis !== TransaksiJenis.MASUK) return;

    // Draft 1: current kategori
    const drafts: SplitDraftRow[] = [];
    drafts.push({
      key: `${rowKey}-draft-0`,
      kategori_id: row.kategori_id || '',
      jumlah: 0,
      deskripsi: row.keterangan,
    });

    // Drafts 2+: detected keywords (skip duplicates of draft 1)
    const template = getBankTemplate(bankId);
    const detected = template?.detectKeywords?.(row.keterangan) ?? [];
    const prefillNames = buildPrefillKategoriNames(detected);
    const currentKatName = row.kategoriLabel;
    const extras = prefillNames.filter((n) => n && n !== currentKatName);

    extras.forEach((nama, idx) => {
      const kat = kategoris.find(
        (k) => k.nama === nama && k.jenis === row.jenis
      );
      drafts.push({
        key: `${rowKey}-draft-${idx + 1}`,
        kategori_id: kat?.id || '',
        jumlah: 0,
        deskripsi: row.keterangan,
      });
    });

    // Pastikan minimal 2 baris supaya user punya slot untuk split
    if (drafts.length < 2) {
      drafts.push({
        key: `${rowKey}-draft-${drafts.length}`,
        kategori_id: '',
        jumlah: 0,
        deskripsi: row.keterangan,
      });
    }

    setSplitEditing({ rowKey, drafts });
  }, [rows, kategoris, bankId]);

  /** Close form without saving */
  const closeSplitForm = useCallback(() => setSplitEditing(null), []);

  /** Add empty draft row */
  const addDraftRow = useCallback(() => {
    setSplitEditing((prev) => {
      if (!prev) return prev;
      const newDraft: SplitDraftRow = {
        key: `${prev.rowKey}-draft-${prev.drafts.length + Date.now()}`,
        kategori_id: '',
        jumlah: 0,
        deskripsi: '',
      };
      return { ...prev, drafts: [...prev.drafts, newDraft] };
    });
  }, []);

  const removeDraftRow = useCallback((draftKey: string) => {
    setSplitEditing((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        drafts: prev.drafts.filter((d) => d.key !== draftKey),
      };
    });
  }, []);

  const updateDraftRow = useCallback(
    (draftKey: string, field: 'kategori_id' | 'jumlah' | 'deskripsi', value: string | number) => {
      setSplitEditing((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drafts: prev.drafts.map((d) => {
            if (d.key !== draftKey) return d;
            if (field === 'jumlah') {
              const num =
                typeof value === 'number'
                  ? value
                  : parseInt(String(value).replace(/[^\d]/g, ''), 10) || 0;
              return { ...d, jumlah: num };
            }
            return { ...d, [field]: value as string };
          }),
        };
      });
    },
    []
  );

  /**
   * Save split — replace the original row in rows[] with N split-child rows.
   * Each child carries `splitParent` so we can undo later.
   */
  const saveSplit = useCallback(() => {
    if (!splitEditing) return;
    const { rowKey, drafts } = splitEditing;

    const original = rows.find((r) => r.key === rowKey);
    if (!original) return;

    // Validation: total must match, all drafts must have kategori & jumlah > 0
    const total = drafts.reduce((s, d) => s + d.jumlah, 0);
    if (total !== original.jumlah) {
      toast(
        `Total split (${formatRupiah(total)}) tidak sama dengan nominal asli (${formatRupiah(original.jumlah)})`,
        'error'
      );
      return;
    }
    if (drafts.some((d) => !d.kategori_id || d.jumlah <= 0)) {
      toast('Setiap baris split harus punya kategori dan jumlah > 0', 'error');
      return;
    }

    // Snapshot the original row for undo
    const originalSnapshot = {
      tanggal: original.tanggal,
      keterangan: original.keterangan,
      jumlah: original.jumlah,
      jenis: original.jenis,
      kategori_id: original.kategori_id,
      status: original.status,
      kategoriLabel: original.kategoriLabel,
      referensi: original.referensi,
      reviewSuggestion: original.reviewSuggestion,
      isCashDeposit: original.isCashDeposit,
      detectedKeywords: original.detectedKeywords,
      key: original.key,
      isDuplicate: original.isDuplicate,
    };

    const children: ImportRow[] = drafts.map((d, idx) => {
      const kat = kategoris.find((k) => k.id === d.kategori_id);
      return {
        key: `${rowKey}-split-${idx + 1}`,
        tanggal: original.tanggal,
        keterangan: d.deskripsi || original.keterangan,
        jumlah: d.jumlah,
        jenis: original.jenis,
        // Preserve the original bank referensi on every child — the final
        // `bank_ref` stored in sheet transaksi will be `<ref>_split_<N>`
        // (composed in handleConfirmImport based on splitParent.splitIndex).
        referensi: original.referensi,
        kategori_id: d.kategori_id,
        kategoriLabel: kat?.nama || '',
        status: 'auto',
        isDuplicate: false,
        splitParent: {
          originalKey: rowKey,
          originalData: originalSnapshot,
          splitIndex: idx + 1,
          splitCount: drafts.length,
        },
      };
    });

    // Replace the original row with all children, preserving position
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === rowKey);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...children, ...prev.slice(idx + 1)];
    });
    setSplitEditing(null);
    toast(`Split menjadi ${children.length} baris`);
  }, [splitEditing, rows, kategoris, toast]);

  /**
   * Undo split — restore the original row. Finds all rows sharing the same
   * splitParent.originalKey and replaces them with the restored original
   * (menggunakan snapshot status — auto/review/split tergantung asalnya).
   */
  const undoSplit = useCallback((originalKey: string) => {
    setRows((prev) => {
      const children = prev.filter((r) => r.splitParent?.originalKey === originalKey);
      if (children.length === 0) return prev;
      const snapshot = children[0].splitParent!.originalData;
      const firstIdx = prev.findIndex((r) => r.splitParent?.originalKey === originalKey);
      const restored: ImportRow = { ...snapshot };
      return [
        ...prev.slice(0, firstIdx).filter((r) => r.splitParent?.originalKey !== originalKey),
        restored,
        ...prev.slice(firstIdx + 1).filter((r) => r.splitParent?.originalKey !== originalKey),
      ];
    });
    toast('Split dibatalkan');
  }, [toast]);

  /**
   * "Tidak Split" — convert SETOR TUNAI row from split-pending to single
   * review row so user can pick one kategori.
   */
  const convertToSingleRow = useCallback((rowKey: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== rowKey) return r;
        return {
          ...r,
          status: 'review',
          reviewSuggestion:
            'Setor tunai — pilih kategori manual (tidak di-split)',
        };
      })
    );
    setSplitEditing((prev) => (prev?.rowKey === rowKey ? null : prev));
  }, []);

  // Filtered rows by date range
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Extract YYYY-MM-DD from tanggal (may have time suffix like "2026-03-01 00:00:00")
      const rowDate = r.tanggal.slice(0, 10);
      if (filterDateFrom && rowDate < filterDateFrom) return false;
      if (filterDateTo && rowDate > filterDateTo) return false;
      return true;
    });
  }, [rows, filterDateFrom, filterDateTo]);

  // Summary stats (based on filtered rows)
  const summary = useMemo(() => {
    const filtered = rows.filter((r) => {
      const rowDate = r.tanggal.slice(0, 10);
      if (filterDateFrom && rowDate < filterDateFrom) return false;
      if (filterDateTo && rowDate > filterDateTo) return false;
      return true;
    });
    const total = filtered.length;
    const auto = filtered.filter((r) => r.status === 'auto').length;
    const review = filtered.filter((r) => r.status === 'review').length;
    // "Perlu Split" = SETOR TUNAI yang belum dihandle (status=split & bukan child)
    const split = filtered.filter((r) => r.status === 'split' && !r.splitParent).length;
    const duplicates = filtered.filter((r) => r.isDuplicate).length;
    return { total, auto, review, split, duplicates };
  }, [rows, filterDateFrom, filterDateTo]);

  // Count of SETOR TUNAI rows that are still pending split — akan di-skip saat import
  const unhandledSplitCount = useMemo(
    () =>
      filteredRows.filter((r) => r.status === 'split' && !r.splitParent).length,
    [filteredRows]
  );

  // Check if ANY filtered row is ready to import (unhandled splits di-skip)
  const canImport = useMemo(() => {
    const importable = filteredRows.filter(
      (r) => !(r.status === 'split' && !r.splitParent)
    );
    if (importable.length === 0) return false;
    return importable.every((r) => r.kategori_id !== '');
  }, [filteredRows]);

  /**
   * Actual insert — runs AFTER the summary dialog has been confirmed.
   * Chunked, with progress and partial-success reporting. Each payload item
   * carries `bank_ref` so the next import attempt can detect duplicates.
   *
   * `skippedDuplicates` count is used purely for the toast message.
   */
  const executeImport = useCallback(
    async (rowsToImport: ImportRow[], skippedDuplicates: number) => {
      setImporting(true);
      setImportResult(null);
      try {
        // Build items. Split-children sudah punya kategori_id + jumlah sendiri.
        // Format tanggal as "YYYY-MM-DD 00:00:00" (SKM convention).
        const formatTanggalForImport = (t: string) => {
          const datePart = t.slice(0, 10);
          return `${datePart} 00:00:00`;
        };

        const items = rowsToImport.map((row) => ({
          tanggal: formatTanggalForImport(row.tanggal),
          jenis: row.jenis,
          kategori_id: row.kategori_id,
          deskripsi: row.keterangan,
          jumlah: row.jumlah,
          rekening_id: rekeningId,
          bank_ref: buildBankRef(row),
        }));

        // Chunk into batches of 100 — keeps each request well under serverless
        // timeout and Google Sheets API rate limits.
        const CHUNK_SIZE = 100;
        const chunks: typeof items[] = [];
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          chunks.push(items.slice(i, i + CHUNK_SIZE));
        }

        let succeeded = 0;
        let failed = 0;
        const errors: string[] = [];
        setImportProgress({ current: 0, total: chunks.length, succeeded: 0 });

        for (let i = 0; i < chunks.length; i++) {
          setImportProgress({ current: i + 1, total: chunks.length, succeeded });
          try {
            const res = await fetch('/api/transaksi/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: chunks[i] }),
            });
            const data = await res.json();
            if (data.success && data.data) {
              succeeded += data.data.imported;
              setImportProgress({ current: i + 1, total: chunks.length, succeeded });
            } else {
              failed += chunks[i].length;
              errors.push(`Batch ${i + 1}: ${data.error || `HTTP ${res.status}`}`);
            }
          } catch (err) {
            failed += chunks[i].length;
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Batch ${i + 1}: ${msg}`);
          }

          // Small delay between chunks to be polite to Google Sheets API
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }

        setImported(true);
        setImportResult({ imported: succeeded, failed, errors });

        const dupSuffix =
          skippedDuplicates > 0 ? `, ${skippedDuplicates} duplikat di-skip` : '';

        if (failed === 0) {
          toast(`${succeeded} transaksi berhasil diimport${dupSuffix}`);
        } else if (succeeded === 0) {
          toast(`Import gagal — ${failed} transaksi tidak tersimpan`, 'error');
        } else {
          toast(
            `${succeeded} berhasil, ${failed} gagal${dupSuffix} — lihat detail`,
            'error'
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat import';
        toast(msg, 'error');
      } finally {
        setImporting(false);
        setImportProgress(null);
      }
    },
    [rekeningId, toast]
  );

  /**
   * Entry point for Submit button. Runs the duplicate check first, then
   * opens the SummaryDialog. User reviews and clicks "Import X Transaksi"
   * to actually run executeImport.
   */
  const handleImport = async () => {
    if (!rekeningId) {
      toast('Rekening bank tidak ditemukan. Pastikan rekening Bank Muamalat sudah terdaftar.', 'error');
      return;
    }

    // Separate rows into importable and unhandled split (SETOR TUNAI belum di-split)
    const importable = filteredRows.filter(
      (r) => !(r.status === 'split' && !r.splitParent)
    );
    const unhandledSplitRows = filteredRows.filter(
      (r) => r.status === 'split' && !r.splitParent
    );

    if (importable.length === 0 && unhandledSplitRows.length === 0) {
      toast('Tidak ada transaksi yang siap diimport', 'error');
      return;
    }

    setCheckingDuplicates(true);
    try {
      // Build check items from BOTH importable AND unhandled split rows.
      // Unhandled split rows need to be checked because they may have been
      // imported and split in a previous import — if so, they should show
      // as duplicates (type: 'split'), not as "belum di-split".
      const checkItems = [
        ...importable.map((row) => ({
          bank_ref: buildBankRef(row),
          tanggal: row.tanggal.slice(0, 10),
          jumlah: row.jumlah,
          jenis: row.jenis,
        })),
        ...unhandledSplitRows
          .filter((row) => !!row.referensi)
          .map((row) => ({
            bank_ref: row.referensi,
            tanggal: row.tanggal.slice(0, 10),
            jumlah: row.jumlah,
            jenis: row.jenis,
          })),
      ];

      // Guard: need at least one item to check, and every item must have
      // a non-empty bank_ref (API validator z.string().min(1) would reject).
      if (checkItems.length === 0) {
        // No items to check — skip straight to summary with no duplicates
        setSummaryDialog({
          totalCsv: rows.length,
          unhandledSplit: unhandledSplitRows.length,
          duplicates: {},
          possibleDuplicates: [],
          importableRows: importable,
          duplicateRows: [],
        });
        setCheckingDuplicates(false);
        return;
      }
      const missingRef = checkItems.some((it) => !it.bank_ref);
      if (missingRef) {
        toast(
          'Beberapa baris tidak punya nomor referensi dari CSV — tidak bisa cek duplikat.',
          'error'
        );
        setCheckingDuplicates(false);
        return;
      }

      const res = await fetch('/api/transaksi/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: checkItems }),
      });
      const data = await res.json();
      if (!data.success || !data.data) {
        toast(data.error || 'Gagal memeriksa duplikat', 'error');
        setCheckingDuplicates(false);
        return;
      }

      const result = data.data as CheckDuplicatesResponse;

      // Classify each importable row into duplicate / candidate.
      const duplicateRows: Array<{ row: ImportRow; entry: DuplicateEntry }> = [];
      for (const row of importable) {
        const ref = buildBankRef(row);
        const entry = result.duplicates[ref];
        if (entry) duplicateRows.push({ row, entry });
      }

      // Also classify unhandled split rows — if they were previously imported
      // and split, they show as duplicates instead of "belum di-split".
      for (const row of unhandledSplitRows) {
        const ref = row.referensi;
        if (!ref) continue;
        const entry = result.duplicates[ref];
        if (entry) duplicateRows.push({ row, entry });
      }

      // Unhandled split count = only those NOT already detected as duplicates
      const duplicateRefs = new Set(duplicateRows.map(d => d.row.referensi || buildBankRef(d.row)));
      const unhandledSplit = unhandledSplitRows.filter(
        (r) => !r.referensi || !duplicateRefs.has(r.referensi)
      ).length;

      // Default all possible duplicates to UNCHECKED (user must opt-in)
      const initialKeep: Record<string, boolean> = {};
      for (const pd of result.possibleDuplicates) {
        initialKeep[pd.bank_ref] = false;
      }
      setPossibleKeep(initialKeep);
      setShowDupDetails(false);
      setShowPossibleDetails(true);

      setSummaryDialog({
        totalCsv: rows.length,
        unhandledSplit,
        duplicates: result.duplicates,
        possibleDuplicates: result.possibleDuplicates,
        importableRows: importable,
        duplicateRows,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memeriksa duplikat';
      toast(msg, 'error');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  /**
   * Called when user clicks "Import X Transaksi" in the summary dialog.
   * Filters the importable rows: removes Layer 1 duplicates, and removes
   * Layer 2 possible-duplicates the user did NOT check.
   */
  const handleConfirmImport = useCallback(async () => {
    if (!summaryDialog) return;

    const { importableRows, duplicates, possibleDuplicates } = summaryDialog;

    const possibleRefs = new Set(possibleDuplicates.map((p) => p.bank_ref));

    const finalRows = importableRows.filter((row) => {
      const ref = buildBankRef(row);
      // Drop Layer 1 duplicates outright
      if (duplicates[ref]) return false;
      // Layer 2: only include if user checked the box
      if (possibleRefs.has(ref) && !possibleKeep[ref]) return false;
      return true;
    });

    const skippedCount = importableRows.length - finalRows.length;

    // Close dialog before starting the actual import so the progress
    // bar is visible on the main page.
    setSummaryDialog(null);

    if (finalRows.length === 0) {
      toast('Semua transaksi di-skip — tidak ada yang diimport', 'error');
      return;
    }

    await executeImport(finalRows, skippedCount);
  }, [summaryDialog, possibleKeep, executeImport, toast]);

  const handleReset = () => {
    setRows([]);
    setImported(false);
    setImportResult(null);
    setFilterDateFrom('');
    setFilterDateTo('');
    setSplitEditing(null);
    setSummaryDialog(null);
    setPossibleKeep({});
    setCheckingDuplicates(false);
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
          <div className="py-4 space-y-3">
            <div className="text-center">
              {importResult.imported > 0 && (
                <p className="text-lg font-bold text-emerald-600">
                  {importResult.imported} transaksi berhasil diimport
                </p>
              )}
              {importResult.failed > 0 && (
                <p className="text-sm font-medium text-red-600 mt-1">
                  {importResult.failed} transaksi gagal
                </p>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 max-h-40 overflow-y-auto">
                <p className="font-semibold mb-1">Detail error:</p>
                <ul className="space-y-1">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={handleReset}>Import File Lain</Button>
              <Link href="/transaksi"><Button variant="secondary">Lihat Transaksi</Button></Link>
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

          {/* Date range filter */}
          <Card className="mt-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Dari Tanggal</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sampai Tanggal</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {filteredRows.length !== rows.length && (
                <span className="text-xs text-gray-500">
                  Menampilkan {filteredRows.length} dari {rows.length} transaksi
                </span>
              )}
            </div>
          </Card>

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
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <RowGroup
                      key={row.key}
                      row={row}
                      kategoris={kategoris}
                      highlightRegex={row.jenis === TransaksiJenis.MASUK ? highlightRegex.masuk : highlightRegex.keluar}
                      splitEditing={splitEditing}
                      onKategoriChange={updateRowKategori}
                      onConfirmReview={confirmReview}
                      onOpenSplit={openSplitForm}
                      onOpenManualSplit={openManualSplit}
                      onCloseSplit={closeSplitForm}
                      onAddDraft={addDraftRow}
                      onRemoveDraft={removeDraftRow}
                      onUpdateDraft={updateDraftRow}
                      onSaveSplit={saveSplit}
                      onUndoSplit={undoSplit}
                      onConvertToSingle={convertToSingleRow}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Confirm button + progress */}
          <div className="mt-4 space-y-2">
            {unhandledSplitCount > 0 && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ {unhandledSplitCount} transaksi SETOR TUNAI belum di-split dan akan di-skip saat import.
                Klik badge <span className="font-semibold">Split</span> pada baris tersebut untuk memecah kategori.
              </div>
            )}
            <div className="flex gap-3 items-center">
              <Button
                onClick={handleImport}
                disabled={importing || checkingDuplicates || !canImport}
              >
                {checkingDuplicates
                  ? 'Memeriksa duplikasi...'
                  : importing
                    ? (importProgress
                      ? `Mengimport batch ${importProgress.current}/${importProgress.total}...`
                      : 'Mengimport...')
                    : `Submit Import (${filteredRows.length - unhandledSplitCount} transaksi)`}
              </Button>
              {!canImport && !importing && !checkingDuplicates && (
                <span className="text-sm text-amber-600">Semua transaksi harus memiliki kategori sebelum import.</span>
              )}
              {importing && importProgress && (
                <span className="text-sm text-gray-600">
                  {importProgress.succeeded} transaksi tersimpan
                </span>
              )}
            </div>
            {importing && importProgress && (
              <div className="w-full bg-gray-200 rounded-full h-2 max-w-md">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
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

      {/* Duplicate detection summary dialog */}
      <SummaryDialog
        data={summaryDialog}
        possibleKeep={possibleKeep}
        setPossibleKeep={setPossibleKeep}
        showDupDetails={showDupDetails}
        setShowDupDetails={setShowDupDetails}
        showPossibleDetails={showPossibleDetails}
        setShowPossibleDetails={setShowPossibleDetails}
        onClose={() => setSummaryDialog(null)}
        onConfirm={handleConfirmImport}
      />
    </div>
  );
}

// ============================================================
// Summary Dialog — shows duplicate detection result before import
// ============================================================

interface SummaryDialogProps {
  data: {
    totalCsv: number;
    unhandledSplit: number;
    duplicates: Record<string, DuplicateEntry>;
    possibleDuplicates: PossibleDuplicateItem[];
    importableRows: ImportRow[];
    duplicateRows: Array<{ row: ImportRow; entry: DuplicateEntry }>;
  } | null;
  possibleKeep: Record<string, boolean>;
  setPossibleKeep: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showDupDetails: boolean;
  setShowDupDetails: React.Dispatch<React.SetStateAction<boolean>>;
  showPossibleDetails: boolean;
  setShowPossibleDetails: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onConfirm: () => void;
}

function SummaryDialog({
  data,
  possibleKeep,
  setPossibleKeep,
  showDupDetails,
  setShowDupDetails,
  showPossibleDetails,
  setShowPossibleDetails,
  onClose,
  onConfirm,
}: SummaryDialogProps) {
  if (!data) return null;

  const {
    totalCsv,
    unhandledSplit,
    duplicates,
    possibleDuplicates,
    importableRows,
    duplicateRows,
  } = data;

  const possibleRefs = new Set(possibleDuplicates.map((p) => p.bank_ref));
  const duplicateCount = duplicateRows.length;
  const possibleCount = possibleDuplicates.length;
  const checkedPossibles = possibleDuplicates.filter(
    (p) => possibleKeep[p.bank_ref]
  ).length;

  // Clean rows = importable − layer 1 duplicates − possible duplicates
  // (possibles only count toward the final total when the user checks them)
  const cleanCount = importableRows.filter((r) => {
    const ref = buildBankRef(r);
    if (duplicates[ref]) return false;
    if (possibleRefs.has(ref)) return false;
    return true;
  }).length;

  const finalImportCount = cleanCount + checkedPossibles;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Review Duplikat Sebelum Import"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Counts summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">Total CSV</p>
            <p className="text-lg font-bold">{totalCsv}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-700">Siap Import</p>
            <p className="text-lg font-bold text-emerald-700">{cleanCount}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-xs text-red-700">Duplikat (auto-skip)</p>
            <p className="text-lg font-bold text-red-700">{duplicateCount}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700">Mungkin Duplikat</p>
            <p className="text-lg font-bold text-amber-700">{possibleCount}</p>
          </div>
          {unhandledSplit > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700">Belum di-split (skip)</p>
              <p className="text-lg font-bold text-blue-700">{unhandledSplit}</p>
            </div>
          )}
        </div>

        {/* Duplikat section (read-only, skip otomatis) */}
        {duplicateCount > 0 && (
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDupDetails((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-red-50 hover:bg-red-100 transition-colors text-left"
            >
              <span className="text-sm font-semibold text-red-800">
                Duplikat — {duplicateCount} akan di-skip otomatis
              </span>
              <span className="text-xs text-red-700">
                {showDupDetails ? 'Sembunyikan' : 'Tampilkan'}
              </span>
            </button>
            {showDupDetails && (
              <div className="max-h-60 overflow-y-auto text-xs divide-y divide-red-100">
                {duplicateRows.map(({ row, entry }) => (
                  <div key={row.key} className="px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-gray-700">
                        {row.tanggal.slice(0, 10)}
                      </span>
                      <span className="font-semibold">
                        {formatRupiah(row.jumlah)}
                      </span>
                    </div>
                    <div className="text-gray-600 mt-0.5 line-clamp-2">
                      {row.keterangan}
                    </div>
                    <div className="text-red-700 mt-0.5">
                      {entry.type === 'exact'
                        ? `↪ Sudah diimport sebagai ${entry.transactionId}`
                        : `↪ Sudah diimport sebagai ${entry.transactionIds.length} split: ${entry.transactionIds.join(', ')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mungkin Duplikat section (checkboxes — default UNCHECKED) */}
        {possibleCount > 0 && (
          <div className="border border-amber-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPossibleDetails((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
            >
              <span className="text-sm font-semibold text-amber-800">
                Mungkin Duplikat — {possibleCount} ditemukan ({checkedPossibles} dipilih)
              </span>
              <span className="text-xs text-amber-700">
                {showPossibleDetails ? 'Sembunyikan' : 'Tampilkan'}
              </span>
            </button>
            {showPossibleDetails && (
              <div className="max-h-72 overflow-y-auto text-xs divide-y divide-amber-100">
                <div className="px-3 py-2 bg-amber-50/50 text-[11px] text-amber-900">
                  Centang baris yang kamu <strong>yakin</strong> adalah transaksi
                  berbeda (bukan duplikat dari data manual existing). Default:
                  tidak dicentang = tidak diimport.
                </div>
                {possibleDuplicates.map((pd) => {
                  const checked = !!possibleKeep[pd.bank_ref];
                  const csvRow = importableRows.find(
                    (r) => buildBankRef(r) === pd.bank_ref
                  );
                  return (
                    <label
                      key={pd.bank_ref}
                      className="px-3 py-2 flex gap-3 items-start cursor-pointer hover:bg-amber-50/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setPossibleKeep((prev) => ({
                            ...prev,
                            [pd.bank_ref]: e.target.checked,
                          }))
                        }
                        className="mt-0.5 accent-emerald-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-gray-700">
                            {pd.tanggal}
                          </span>
                          <span className="font-semibold">
                            {formatRupiah(pd.jumlah)}
                          </span>
                        </div>
                        {csvRow && (
                          <div className="text-gray-600 mt-0.5 line-clamp-2">
                            CSV: {csvRow.keterangan}
                          </div>
                        )}
                        <div className="text-amber-800 mt-0.5 line-clamp-2">
                          ↪ Mirip existing {pd.existingTransactionId}
                          {pd.existingDescription
                            ? `: ${pd.existingDescription}`
                            : ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={onConfirm} disabled={finalImportCount === 0}>
            Import {finalImportCount} Transaksi
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Row Group Component (main row + optional split sub-rows)
// ============================================================

// ============================================================
// Highlight helpers
// ============================================================

/**
 * Build a single case-insensitive regex from a list of keywords.
 * Sorts longest-first so multi-word phrases match before sub-words.
 */
function buildHighlightRegex(keywords: string[]): RegExp | null {
  if (!keywords || keywords.length === 0) return null;
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('|')})`, 'gi');
}

/**
 * Render text with matching keyword spans wrapped in <mark>.
 * Creates a local regex to avoid mutating the prop's lastIndex state.
 */
function HighlightedText({ text, regex }: { text: string; regex: RegExp | null }) {
  if (!regex) return <>{text}</>;
  // Create fresh local regex from the source so we don't mutate prop's state
  const localRegex = new RegExp(regex.source, regex.flags);
  const testRegex = new RegExp(regex.source, regex.flags.replace('g', ''));
  const parts = text.split(localRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (testRegex.test(part)) {
          return (
            <mark key={i} className="bg-yellow-100 text-yellow-900 font-semibold rounded px-0.5">
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface RowGroupProps {
  row: ImportRow;
  kategoris: Kategori[];
  highlightRegex: RegExp | null;
  splitEditing: { rowKey: string; drafts: SplitDraftRow[] } | null;
  onKategoriChange: (key: string, kategori_id: string) => void;
  onConfirmReview: (key: string) => void;
  onOpenSplit: (rowKey: string) => void;
  onOpenManualSplit: (rowKey: string) => void;
  onCloseSplit: () => void;
  onAddDraft: () => void;
  onRemoveDraft: (draftKey: string) => void;
  onUpdateDraft: (draftKey: string, field: 'kategori_id' | 'jumlah' | 'deskripsi', value: string | number) => void;
  onSaveSplit: () => void;
  onUndoSplit: (originalKey: string) => void;
  onConvertToSingle: (rowKey: string) => void;
}

const RowGroup = memo(function RowGroup({
  row,
  kategoris,
  highlightRegex,
  splitEditing,
  onKategoriChange,
  onConfirmReview,
  onOpenSplit,
  onOpenManualSplit,
  onCloseSplit,
  onAddDraft,
  onRemoveDraft,
  onUpdateDraft,
  onSaveSplit,
  onUndoSplit,
  onConvertToSingle,
}: RowGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const isFormOpen = splitEditing?.rowKey === row.key;
  const isSplitChild = !!row.splitParent;
  const isSplitPending = row.status === 'split' && !row.splitParent;
  const showLargeMasukCue =
    row.jenis === TransaksiJenis.MASUK && row.jumlah > LARGE_MASUK_THRESHOLD;
  // Link "Split" manual muncul untuk row MASUK Auto/Review (bukan SETOR
  // TUNAI, bukan split-child, bukan baris yang sedang di-edit split-nya).
  const canManualSplit =
    row.jenis === TransaksiJenis.MASUK &&
    !isSplitPending &&
    !isSplitChild &&
    !isFormOpen &&
    !row.isDuplicate;

  const statusBadge = () => {
    if (row.isDuplicate) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
          Duplikat
        </span>
      );
    }
    if (isSplitChild) {
      const info = row.splitParent!;
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
          Split {info.splitIndex}/{info.splitCount}
        </span>
      );
    }
    if (isSplitPending) {
      return (
        <button
          type="button"
          onClick={() => onOpenSplit(row.key)}
          title="Klik untuk split ke beberapa kategori"
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 ring-1 ring-inset ring-amber-600/20 px-2 py-0.5 rounded-full hover:bg-amber-200 cursor-pointer"
        >
          Split
        </button>
      );
    }
    if (row.status === 'auto') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20 px-2 py-0.5 rounded-full">
          Auto
        </span>
      );
    }
    // Review: badge + optional OK button (kalau kategori sudah terpilih)
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 ring-1 ring-inset ring-orange-600/20 px-2 py-0.5 rounded-full">
          Review
        </span>
        {row.kategori_id && (
          <button
            type="button"
            onClick={() => onConfirmReview(row.key)}
            title="Konfirmasi: setujui kategori ini tanpa mengubahnya"
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20 px-2 py-0.5 rounded-full cursor-pointer hover:bg-emerald-100"
          >
            OK
          </button>
        )}
      </span>
    );
  };

  const isReview = row.status === 'review' && !row.kategori_id;

  return (
    <>
      <TableRow className={row.isDuplicate ? 'bg-red-50' : (isSplitChild ? 'bg-blue-50/40' : undefined)}>
        <TableCell className="whitespace-nowrap text-sm align-top">{formatTanggal(row.tanggal)}</TableCell>
        <TableCell className="max-w-[280px] text-sm align-top">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Sembunyikan keterangan lengkap' : 'Tap untuk lihat keterangan lengkap'}
            className={`text-left w-full ${expanded ? 'whitespace-normal break-words' : 'truncate'} hover:text-emerald-700`}
          >
            <HighlightedText text={row.keterangan} regex={highlightRegex} />
          </button>
          {isSplitChild && (
            <p className="mt-0.5 text-[11px] text-blue-600 leading-snug">
              Split {row.splitParent!.splitIndex} dari {row.splitParent!.splitCount}
            </p>
          )}
          {isReview && row.reviewSuggestion && (
            <p className="mt-0.5 text-[11px] text-gray-500 italic leading-snug">
              ⚠ {row.reviewSuggestion}
            </p>
          )}
          {isSplitPending && row.reviewSuggestion && (
            <p className="mt-0.5 text-[11px] text-amber-700 italic leading-snug">
              ⚠ {row.reviewSuggestion}
            </p>
          )}
        </TableCell>
        <TableCell className="align-top"><Badge label={row.jenis} /></TableCell>
        <TableCell className={`text-right font-medium whitespace-nowrap ${row.jenis === TransaksiJenis.MASUK ? 'text-emerald-600' : 'text-red-600'}`}>
          <span className="inline-flex items-center gap-1.5 justify-end">
            {showLargeMasukCue && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
                title="Nominal MASUK > Rp 2.000.000 — perhatikan kategori"
                aria-label="Nominal besar"
              />
            )}
            <span>
              {row.jenis === TransaksiJenis.MASUK ? '+' : '-'}{formatRupiah(row.jumlah)}
            </span>
          </span>
        </TableCell>
        <TableCell>
          {isSplitPending ? (
            <span className="text-xs text-amber-700 italic">Perlu split — klik badge</span>
          ) : (
            <div className="space-y-1">
              <select
                value={row.kategori_id}
                onChange={(e) => onKategoriChange(row.key, e.target.value)}
                onMouseDown={() => {
                  // Setiap interaksi dengan dropdown menandakan user
                  // mengkonfirmasi kategori — fix bug "pilih kategori sama
                  // tidak mengubah status".
                  if (row.status === 'review' && row.kategori_id) {
                    onConfirmReview(row.key);
                  }
                }}
                onFocus={() => {
                  if (row.status === 'review' && row.kategori_id) {
                    onConfirmReview(row.key);
                  }
                }}
                className="block w-full min-w-[140px] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                disabled={isSplitChild}
              >
                <option value="">Pilih Kategori</option>
                {kategoris
                  .filter((k) => k.jenis === row.jenis)
                  .map((k) => (
                    <option key={k.id} value={k.id}>{k.nama}</option>
                  ))}
              </select>
              {canManualSplit && (
                <button
                  type="button"
                  onClick={() => onOpenManualSplit(row.key)}
                  className="text-amber-600 text-xs underline cursor-pointer hover:text-amber-800"
                  title="Pecah transaksi ini ke beberapa kategori"
                >
                  Split
                </button>
              )}
            </div>
          )}
        </TableCell>
        <TableCell>{statusBadge()}</TableCell>
        <TableCell className="text-center">
          {isSplitChild && row.splitParent!.splitIndex === 1 && (
            <Button variant="ghost" size="sm" onClick={() => onUndoSplit(row.splitParent!.originalKey)}>
              Undo Split
            </Button>
          )}
          {isSplitPending && !isFormOpen && (
            <Button variant="ghost" size="sm" onClick={() => onConvertToSingle(row.key)}>
              Tidak Split
            </Button>
          )}
        </TableCell>
      </TableRow>

      {/* Split form row (expanded) */}
      {isFormOpen && splitEditing && (
        <SplitForm
          row={row}
          drafts={splitEditing.drafts}
          kategoris={kategoris}
          onAddDraft={onAddDraft}
          onRemoveDraft={onRemoveDraft}
          onUpdateDraft={onUpdateDraft}
          onSave={onSaveSplit}
          onCancel={onCloseSplit}
        />
      )}
    </>
  );
});

// ============================================================
// Split Form (inline expand row for SETOR TUNAI)
// ============================================================

interface SplitFormProps {
  row: ImportRow;
  drafts: SplitDraftRow[];
  kategoris: Kategori[];
  onAddDraft: () => void;
  onRemoveDraft: (draftKey: string) => void;
  onUpdateDraft: (draftKey: string, field: 'kategori_id' | 'jumlah' | 'deskripsi', value: string | number) => void;
  onSave: () => void;
  onCancel: () => void;
}

function SplitForm({
  row,
  drafts,
  kategoris,
  onAddDraft,
  onRemoveDraft,
  onUpdateDraft,
  onSave,
  onCancel,
}: SplitFormProps) {
  const total = drafts.reduce((s, d) => s + d.jumlah, 0);
  const diff = row.jumlah - total;
  const isBalanced = diff === 0;

  const formatDots = (value: string) => {
    const digits = value.replace(/[^\d]/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  return (
    <TableRow className="bg-amber-50/60">
      <TableCell colSpan={7} className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-800">
                Split ke beberapa kategori
              </h4>
              <p className="text-xs text-gray-600">
                Total asli: <span className="font-semibold">{formatRupiah(row.jumlah)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel}>Batal</Button>
              <Button size="sm" onClick={onSave} disabled={!isBalanced}>Simpan Split</Button>
            </div>
          </div>

          <div className="space-y-2">
            {drafts.map((draft, idx) => (
              <div
                key={draft.key}
                className="grid grid-cols-12 gap-2 items-start bg-white rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="col-span-12 sm:col-span-1 text-xs text-gray-500 pt-2 font-medium">
                  #{idx + 1}
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Kategori</label>
                  <select
                    value={draft.kategori_id}
                    onChange={(e) => onUpdateDraft(draft.key, 'kategori_id', e.target.value)}
                    className="block w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Pilih Kategori</option>
                    {kategoris
                      .filter((k) => k.jenis === row.jenis)
                      .map((k) => (
                        <option key={k.id} value={k.id}>{k.nama}</option>
                      ))}
                  </select>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Jumlah</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={draft.jumlah ? formatDots(draft.jumlah.toString()) : ''}
                    onChange={(e) =>
                      onUpdateDraft(draft.key, 'jumlah', e.target.value)
                    }
                    className="w-full text-xs text-right"
                    placeholder="0"
                  />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Deskripsi</label>
                  <Input
                    type="text"
                    value={draft.deskripsi}
                    onChange={(e) => onUpdateDraft(draft.key, 'deskripsi', e.target.value)}
                    className="w-full text-xs"
                    placeholder="Keterangan split"
                  />
                </div>
                <div className="col-span-12 sm:col-span-1 flex sm:justify-end pt-5">
                  {drafts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveDraft(draft.key)}
                    >
                      Hapus
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={onAddDraft}>
              + Tambah Baris
            </Button>
            <div className={`text-xs font-semibold ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
              Total: {formatRupiah(total)} / {formatRupiah(row.jumlah)}
              {!isBalanced && (
                <span className="ml-1 font-normal">
                  (selisih {formatRupiah(Math.abs(diff))})
                </span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
