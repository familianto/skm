'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { cn, formatRupiah } from '@/lib/utils';
import type { MasterHewan } from '@/lib/qurban/master-hewan-display';
import { RT_OPTIONS } from '@/lib/qurban/muqorib-display';
import {
  hewanSlotLabel,
  statusPendaftaranLabel,
  type QurbanPeserta,
} from '@/lib/qurban/peserta-display';
import {
  classifyDuplicate,
  computeHargaPreview,
  findMaster,
  jenisOptions,
  kelasOptionsForJenis,
  resolveAtasNamaPerSlot,
  slotFieldConfig,
  validatePesertaForm,
  TIPE_QURBAN_OPTIONS,
  type DuplicateKind,
  type SlotFieldConfig,
} from '@/lib/qurban/peserta-form';
import type { TipeQurban } from '@/lib/qurban/peserta-types';
import { MuqoribLookup, type MuqoribCandidate } from '@/components/qurban/MuqoribLookup';

/**
 * F4c-B — /qurban/peserta/baru panitia registration form (PS2 create).
 *
 * Four sections: (1) pick hewan + price preview, (2) muqorib smart-lookup /
 * create-new, (3) registration detail (atas-nama per slot), (4) confirm +
 * submit. Layer-1 duplicate detection (PS6 + a BATAL probe via PS1) shows an
 * inline banner and a blocking 3-option modal. F4c-C: one registration = one
 * `kode_bayar` (shared across all N rows); jumlah_slot is context-locked per
 * jenis/tipe and capped at one ekor. PS2 freezes the authoritative price.
 */

interface Props {
  edisiId: string;
}

interface CreatedResult {
  pesertaIds: string[];
  kodeBayar: string;
  slotCount: number;
}

const NEW_MUQORIB_FIELDS = ['nama_lengkap', 'alamat', 'rt', 'no_hp'] as const;

export function PesertaForm({ edisiId }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const edisiParam = `edisi_id=${encodeURIComponent(edisiId)}`;

  // Master hewan + hewan-label map (for the duplicate banner).
  const [masters, setMasters] = useState<MasterHewan[]>([]);
  const [hewanLabelMap, setHewanLabelMap] = useState<Map<string, string>>(new Map());
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  // Bagian 1 — hewan selection. jumlah_slot is a string so the field can be
  // cleared/retyped (fixes the "1"+"7"→"17" bug); the numeric value is derived.
  const [jenis, setJenis] = useState('');
  const [kelas, setKelas] = useState('');
  const [tipe, setTipe] = useState<TipeQurban | ''>('');
  const [jumlahSlotStr, setJumlahSlotStr] = useState('1');
  const [availableSlots, setAvailableSlots] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Bagian 2 — muqorib.
  const [selectedMuqorib, setSelectedMuqorib] = useState<MuqoribCandidate | null>(null);
  const [creatingMuqorib, setCreatingMuqorib] = useState(false);
  const [newMuqorib, setNewMuqorib] = useState({
    nama_lengkap: '',
    alamat: '',
    rt: '',
    no_hp: '',
    notes: '',
  });
  const [newMuqoribErrors, setNewMuqoribErrors] = useState<Record<string, string>>({});

  // Duplicate state (existing-muqorib path).
  const [dupKind, setDupKind] = useState<DuplicateKind>('none');
  const [dupExisting, setDupExisting] = useState<QurbanPeserta[]>([]);
  const [allowAdditional, setAllowAdditional] = useState(false);
  const [showDupModal, setShowDupModal] = useState(false);

  // Bagian 3 — detail. Atas-nama per slot (C2): one shared name or N per-slot.
  const [atasNamaShared, setAtasNamaShared] = useState('');
  const [atasNamaList, setAtasNamaList] = useState<string[]>([]);
  const [sameForAll, setSameForAll] = useState(false);
  const [keteranganBagian, setKeteranganBagian] = useState('');
  const [notes, setNotes] = useState('');

  // Bagian 4 — confirm + submit.
  const [confirmed, setConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);

  const master = useMemo(
    () => (jenis && kelas ? findMaster(masters, jenis, kelas) ?? null : null),
    [masters, jenis, kelas]
  );
  const jumlahSlot = parseInt(jumlahSlotStr, 10) || 0;
  const slotCfg: SlotFieldConfig | null =
    master && tipe ? slotFieldConfig(master.jenis, tipe, master.kapasitas_slot) : null;
  const hargaPreview = useMemo(
    () => computeHargaPreview(master, tipe, jumlahSlot),
    [master, tipe, jumlahSlot]
  );
  const effectiveSameForAll = jumlahSlot <= 1 ? true : sameForAll;
  const atasNamaResolved = resolveAtasNamaPerSlot({
    jumlahSlot,
    sameForAll: effectiveSameForAll,
    sharedNama: atasNamaShared,
    perSlot: atasNamaList,
  });

  // ── Boot: load master hewan + hewan labels for the edisi ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      setBootError(null);
      try {
        const [mhRes, hwRes] = await Promise.all([
          fetch(`/api/qurban/master-hewan?${edisiParam}&status=active`),
          fetch(`/api/qurban/hewan?${edisiParam}`),
        ]);
        const mhJson = await mhRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!mhRes.ok || !mhJson?.ok) {
          setBootError(mhJson?.error?.message || 'Gagal memuat data hewan.');
          return;
        }
        setMasters((mhJson.data as MasterHewan[]) || []);

        const hwJson = await hwRes.json().catch(() => ({}));
        if (hwRes.ok && hwJson?.ok) {
          const map = new Map<string, string>();
          for (const h of (hwJson.data as { id: string; nama_display: string }[]) || []) {
            map.set(h.id, h.nama_display);
          }
          setHewanLabelMap(map);
        }
      } catch {
        if (!cancelled) setBootError('Tidak dapat terhubung ke server.');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [edisiParam]);

  // ── Slot availability + context-lock whenever (master, tipe) changes ────────
  const refreshSlots = useCallback(
    async (m: MasterHewan | null, t: TipeQurban | '') => {
      if (!m || !t) {
        setAvailableSlots(null);
        return;
      }
      const cfg = slotFieldConfig(m.jenis, t, m.kapasitas_slot);
      if (cfg.locked && cfg.lockedValue != null) {
        setJumlahSlotStr(String(cfg.lockedValue));
      } else {
        // Clamp the current value into the editable range (max = one ekor).
        setJumlahSlotStr((s) => {
          const n = parseInt(s, 10) || cfg.min;
          return String(Math.min(Math.max(cfg.min, n), cfg.max));
        });
      }
      setSlotsLoading(true);
      try {
        const res = await fetch(
          `/api/qurban/peserta/available-slots?${edisiParam}&master_hewan_id=${encodeURIComponent(m.id)}&tipe_qurban=${t}`
        );
        const json = await res.json().catch(() => ({}));
        setAvailableSlots(json?.ok ? (json.data?.total ?? 0) : 0);
      } catch {
        setAvailableSlots(0);
      } finally {
        setSlotsLoading(false);
      }
    },
    [edisiParam]
  );

  useEffect(() => {
    refreshSlots(master, tipe);
  }, [master, tipe, refreshSlots]);

  // ── Duplicate check when an existing muqorib is selected ────────────────────
  const runDuplicateCheck = useCallback(
    async (muqoribId: string) => {
      setDupKind('none');
      setDupExisting([]);
      setAllowAdditional(false);
      try {
        const [dupRes, batalRes] = await Promise.all([
          fetch('/api/qurban/peserta/check-duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ muqorib_id: muqoribId, edisi_id: edisiId }),
          }),
          fetch(
            `/api/qurban/peserta?${edisiParam}&muqorib_id=${encodeURIComponent(muqoribId)}&status_pendaftaran=BATAL`
          ),
        ]);
        const dupJson = await dupRes.json().catch(() => ({}));
        const batalJson = await batalRes.json().catch(() => ({}));
        const terdaftar: QurbanPeserta[] =
          dupRes.ok && dupJson?.ok ? (dupJson.data?.existing as QurbanPeserta[]) || [] : [];
        const batalCount =
          batalRes.ok && batalJson?.ok ? ((batalJson.data as QurbanPeserta[]) || []).length : 0;

        setDupExisting(terdaftar);
        setDupKind(classifyDuplicate(terdaftar.length, batalCount));
      } catch {
        // Duplicate check is advisory; PS2 enforces. Stay silent on failure.
        setDupKind('none');
      }
    },
    [edisiId, edisiParam]
  );

  const handleSelectMuqorib = (m: MuqoribCandidate) => {
    setSelectedMuqorib(m);
    setCreatingMuqorib(false);
    setNewMuqoribErrors({});
    runDuplicateCheck(m.id);
  };

  const resetMuqorib = () => {
    setSelectedMuqorib(null);
    setCreatingMuqorib(false);
    setDupKind('none');
    setDupExisting([]);
    setAllowAdditional(false);
  };

  // ── Submit helpers ──────────────────────────────────────────────────────────
  const createMuqorib = async (): Promise<string | null> => {
    const errs: Record<string, string> = {};
    if (!newMuqorib.nama_lengkap.trim()) errs.nama_lengkap = 'Nama lengkap wajib diisi.';
    if (!newMuqorib.alamat.trim()) errs.alamat = 'Alamat wajib diisi.';
    if (!newMuqorib.rt) errs.rt = 'RT wajib dipilih.';
    if (!newMuqorib.no_hp.trim()) errs.no_hp = 'No. HP wajib diisi.';
    if (Object.keys(errs).length > 0) {
      setNewMuqoribErrors(errs);
      return null;
    }
    const res = await fetch('/api/qurban/muqorib', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama_lengkap: newMuqorib.nama_lengkap.trim(),
        alamat: newMuqorib.alamat.trim(),
        rt: newMuqorib.rt,
        no_hp: newMuqorib.no_hp.trim(),
        notes: newMuqorib.notes.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok) return json.data.id as string;

    const details = (json?.error?.details ?? {}) as {
      errors?: { field: string; message: string }[];
    };
    const next: Record<string, string> = {};
    for (const e of details.errors || []) {
      if ((NEW_MUQORIB_FIELDS as readonly string[]).includes(e.field)) next[e.field] = e.message;
    }
    if (Object.keys(next).length > 0) setNewMuqoribErrors(next);
    else toast(json?.error?.message || 'Gagal membuat muqorib.', 'error');
    return null;
  };

  const createPeserta = async (muqoribId: string, allowAdd: boolean) => {
    if (!master || !tipe) return;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/qurban/peserta?${edisiParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muqorib_id: muqoribId,
          master_hewan_id: master.id,
          tipe_qurban: tipe,
          jumlah_slot: jumlahSlot,
          nama_atas_nama_per_slot: resolveAtasNamaPerSlot({
            jumlahSlot,
            sameForAll: jumlahSlot <= 1 ? true : sameForAll,
            sharedNama: atasNamaShared,
            perSlot: atasNamaList,
          }),
          keterangan_bagian: keteranganBagian.trim() || undefined,
          allow_additional_qurban: allowAdd,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.ok) {
        const records = (json.data as QurbanPeserta[]) || [];
        toast(
          records.length > 1
            ? `${records.length} slot berhasil didaftarkan.`
            : 'Peserta berhasil didaftarkan.',
          'success'
        );
        setCreated({
          pesertaIds: records.map((r) => r.id),
          kodeBayar: records[0]?.kode_bayar ?? '',
          slotCount: records.length,
        });
        return;
      }

      const code = (json?.error?.code as string) || 'INTERNAL_ERROR';
      const message = (json?.error?.message as string) || 'Gagal menyimpan pendaftaran.';
      const details = (json?.error?.details ?? {}) as {
        available?: number;
        needed?: number;
        field?: string;
        errors?: { field: string; message: string }[];
      };

      if (code === 'DUPLICATE_PESERTA') {
        // Race: duplicate appeared between check and submit. Surface the modal.
        if (selectedMuqorib) runDuplicateCheck(selectedMuqorib.id);
        setShowDupModal(true);
        return;
      }
      if (code === 'BUSINESS_INSUFFICIENT_SLOTS') {
        if (typeof details.available === 'number') setAvailableSlots(details.available);
        setFieldErrors({ jumlah_slot: message });
        return;
      }
      if (code === 'VALIDATION_FAILED') {
        const next: Record<string, string> = {};
        for (const e of details.errors || []) next[e.field] = e.message;
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setFormError(message);
        return;
      }
      if (code === 'FORBIDDEN_ROLE') {
        toast('Anda tidak punya akses untuk mendaftarkan peserta.', 'error');
        router.push('/qurban/peserta');
        return;
      }
      setFormError(message);
    } catch {
      setFormError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setFormError(null);

    let muqoribId = selectedMuqorib?.id ?? '';
    if (creatingMuqorib) {
      setSubmitting(true);
      const newId = await createMuqorib();
      setSubmitting(false);
      if (!newId) return;
      muqoribId = newId;
    }

    const errs = validatePesertaForm({
      masterHewanId: master?.id ?? '',
      tipe,
      jumlahSlot,
      availableSlots: availableSlots ?? 0,
      muqoribId,
      creatingMuqorib,
      confirmed,
    });
    if (errs.length > 0) {
      const next: Record<string, string> = {};
      for (const e of errs) next[e.field] = e.message;
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});

    // Blocking duplicate gate (existing-muqorib path only).
    if (!creatingMuqorib && dupKind === 'terdaftar' && !allowAdditional) {
      setShowDupModal(true);
      return;
    }

    await createPeserta(muqoribId, allowAdditional);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (bootLoading) return <Loading className="my-8" />;

  if (created) {
    return <SuccessCard edisiId={edisiId} created={created} />;
  }

  const jenisOpts = jenisOptions(masters);
  const kelasOpts = jenis ? kelasOptionsForJenis(masters, jenis) : [];

  return (
    <div className="max-w-2xl mx-auto">
      <BackLink edisiId={edisiId} />
      <PageHeading />

      {bootError && (
        <Card className="mb-4">
          <p className="text-sm text-red-600">{bootError}</p>
        </Card>
      )}

      {!bootError && masters.length === 0 && (
        <Card className="mb-4">
          <p className="text-sm text-gray-600">
            Belum ada master hewan aktif di edisi ini. Tambahkan tipe hewan di{' '}
            <Link href="/qurban/hewan" className="text-emerald-600 hover:underline">
              Hewan
            </Link>{' '}
            terlebih dahulu.
          </p>
        </Card>
      )}

      {/* Bagian 1 — Pilih Hewan */}
      <Section step={1} title="Pilih Hewan">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Jenis"
            value={jenis}
            onChange={(v) => {
              setJenis(v);
              setKelas('');
            }}
            placeholder="— Pilih jenis —"
            options={jenisOpts.map((j) => ({ value: j, label: titleCase(j) }))}
          />
          <SelectField
            label="Kelas"
            value={kelas}
            onChange={setKelas}
            placeholder="— Pilih kelas —"
            disabled={!jenis}
            options={kelasOpts.map((m) => ({
              value: m.kelas,
              label: `Kelas ${m.kelas} (${m.kapasitas_slot} slot)`,
            }))}
          />
          <SelectField
            label="Tipe Qurban"
            value={tipe}
            onChange={(v) => setTipe(v as TipeQurban)}
            placeholder="— Pilih tipe —"
            options={TIPE_QURBAN_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
          />
          <div>
            <label htmlFor="jumlah-slot" className="block text-sm font-medium text-gray-700 mb-1">
              Jumlah Slot
            </label>
            <input
              id="jumlah-slot"
              type="number"
              inputMode="numeric"
              min={slotCfg?.min ?? 1}
              max={slotCfg?.max ?? undefined}
              value={jumlahSlotStr}
              onChange={(e) => setJumlahSlotStr(e.target.value)}
              onBlur={() => setJumlahSlotStr((s) => normalizeSlotInput(s, slotCfg))}
              readOnly={!!slotCfg?.locked}
              disabled={!master || !tipe}
              className={cn(
                'block w-full rounded-lg border px-3 py-2 text-sm bg-white',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
                slotCfg?.locked ? 'text-gray-500 bg-gray-50' : 'text-gray-900',
                fieldErrors.jumlah_slot ? 'border-red-300' : 'border-gray-300'
              )}
            />
            {master && tipe && (
              <p className="text-xs text-gray-500 mt-1">
                {slotCfg?.hint && <span className="block">{slotCfg.hint}</span>}
                {slotsLoading
                  ? 'Mengecek slot…'
                  : availableSlots !== null
                  ? `${availableSlots} slot tersedia`
                  : ''}
              </p>
            )}
          </div>
        </div>

        {fieldErrors.hewan && <p className="mt-2 text-sm text-red-600">{fieldErrors.hewan}</p>}
        {fieldErrors.jumlah_slot && (
          <p className="mt-2 text-sm text-red-600">{fieldErrors.jumlah_slot}</p>
        )}

        {master && tipe && (availableSlots ?? 0) <= 0 && !slotsLoading && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Tidak ada slot tersedia untuk kombinasi ini. Coba kelas atau tipe lain.
          </p>
        )}

        {master && tipe && hargaPreview.per_slot > 0 && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Harga per slot</span>
              <span className="font-medium text-gray-900">{formatRupiah(hargaPreview.per_slot)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>× {jumlahSlot} slot</span>
              <span className="font-semibold text-emerald-700">{formatRupiah(hargaPreview.total)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Estimasi — harga final dibekukan saat penyimpanan.
            </p>
          </div>
        )}
      </Section>

      {/* Bagian 2 — Data Muqorib */}
      <Section step={2} title="Data Muqorib">
        {selectedMuqorib ? (
          <SelectedMuqoribCard muqorib={selectedMuqorib} onChange={resetMuqorib} />
        ) : creatingMuqorib ? (
          <NewMuqoribForm
            value={newMuqorib}
            errors={newMuqoribErrors}
            onChange={(patch) => {
              setNewMuqorib((s) => ({ ...s, ...patch }));
              setNewMuqoribErrors({});
            }}
            onCancel={() => setCreatingMuqorib(false)}
          />
        ) : (
          <>
            <MuqoribLookup onSelect={handleSelectMuqorib} />
            <button
              type="button"
              onClick={() => setCreatingMuqorib(true)}
              className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
            >
              + Buat muqorib baru
            </button>
          </>
        )}
        {fieldErrors.muqorib && <p className="mt-2 text-sm text-red-600">{fieldErrors.muqorib}</p>}
      </Section>

      {/* Bagian 3 — Detail Pendaftaran */}
      <Section step={3} title="Detail Pendaftaran">
        <div className="space-y-3">
          {jumlahSlot <= 1 ? (
            <Input
              label="Atas Nama (opsional)"
              value={atasNamaShared}
              onChange={(e) => setAtasNamaShared(e.target.value)}
              placeholder="Kosongkan untuk pakai nama muqorib"
            />
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameForAll}
                  onChange={(e) => setSameForAll(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Samakan semua slot dengan satu nama
              </label>
              {sameForAll ? (
                <Input
                  label="Atas Nama — semua slot (opsional)"
                  value={atasNamaShared}
                  onChange={(e) => setAtasNamaShared(e.target.value)}
                  placeholder="Kosongkan untuk pakai nama muqorib"
                />
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: jumlahSlot }).map((_, i) => (
                    <Input
                      key={i}
                      label={`Atas Nama — Slot ${i + 1} (opsional)`}
                      value={atasNamaList[i] ?? ''}
                      onChange={(e) =>
                        setAtasNamaList((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      placeholder="Kosongkan untuk pakai nama muqorib"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <Input
            label="Keterangan Bagian (opsional)"
            value={keteranganBagian}
            onChange={(e) => setKeteranganBagian(e.target.value)}
            placeholder="mis. Daging + Jeroan"
          />
          <TextArea label="Catatan (opsional)" value={notes} onChange={setNotes} />
        </div>
      </Section>

      {/* Bagian 4 — Konfirmasi & Submit */}
      <Section step={4} title="Konfirmasi & Submit">
        {/* Duplicate banners (B2) */}
        {selectedMuqorib && dupKind === 'terdaftar' && (
          <div className="mb-3">
            <DuplicateBanner existing={dupExisting} hewanLabelMap={hewanLabelMap} edisiId={edisiId} />
          </div>
        )}
        {selectedMuqorib && dupKind === 'batal_only' && (
          <p className="mb-3 text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            ℹ Muqorib ini sebelumnya punya pendaftaran yang dibatalkan — tidak masalah, lanjutkan.
          </p>
        )}

        <dl className="divide-y divide-gray-100 text-sm">
          <SummaryRow label="Hewan" value={master ? `${titleCase(master.jenis)} Kelas ${master.kelas}` : '—'} />
          <SummaryRow label="Tipe" value={tipe ? TIPE_QURBAN_OPTIONS.find((t) => t.value === tipe)?.label ?? tipe : '—'} />
          <SummaryRow label="Jumlah Slot" value={String(jumlahSlot)} />
          <SummaryRow label="Total Harga" value={hargaPreview.total > 0 ? formatRupiah(hargaPreview.total) : '—'} />
          <SummaryRow
            label="Muqorib"
            value={selectedMuqorib?.nama_lengkap || (creatingMuqorib && newMuqorib.nama_lengkap) || '—'}
          />
          {jumlahSlot > 1 && !effectiveSameForAll ? (
            <SummaryRow
              label="Atas Nama"
              value={
                <ul className="space-y-0.5">
                  {atasNamaResolved.map((nm, i) => (
                    <li key={i}>
                      Slot {i + 1}: {nm || '(pakai nama muqorib)'}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : (
            <SummaryRow
              label="Atas Nama"
              value={(atasNamaResolved[0] ?? '').trim() || '(pakai nama muqorib)'}
            />
          )}
        </dl>

        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-gray-700">
            Saya konfirmasi data pendaftaran di atas sudah benar.
          </span>
        </label>
        {fieldErrors.confirm && <p className="mt-1 text-sm text-red-600">{fieldErrors.confirm}</p>}

        {formError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mt-4">
          <Link href={`/qurban/peserta?edisi=${encodeURIComponent(edisiId)}`}>
            <Button type="button" variant="secondary" disabled={submitting} className="w-full sm:w-auto">
              Batal
            </Button>
          </Link>
          <Button type="button" onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
            {submitting ? 'Menyimpan…' : 'Daftarkan Peserta'}
          </Button>
        </div>
      </Section>

      {/* Duplicate blocking modal */}
      <Modal
        open={showDupModal}
        onClose={() => setShowDupModal(false)}
        title="Muqorib sudah terdaftar"
      >
        <p className="text-sm text-gray-600">
          Muqorib ini sudah punya pendaftaran <strong>TERDAFTAR</strong> di edisi ini. Lanjutkan
          sebagai qurban tambahan, atau cek pendaftaran yang sudah ada?
        </p>
        <div className="flex flex-col gap-2 mt-4">
          <Button
            type="button"
            onClick={() => {
              setAllowAdditional(true);
              setShowDupModal(false);
              if (selectedMuqorib) createPeserta(selectedMuqorib.id, true);
            }}
          >
            Ya, lanjutkan — ini qurban tambahan
          </Button>
          {dupExisting[0] && (
            <Link
              href={`/qurban/peserta/${dupExisting[0].id}?edisi=${encodeURIComponent(edisiId)}`}
              className="w-full"
            >
              <Button type="button" variant="secondary" className="w-full">
                Batalkan — cek pendaftaran existing
              </Button>
            </Link>
          )}
          <Button type="button" variant="ghost" onClick={() => setShowDupModal(false)}>
            Batalkan total
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

/** Clamp the raw slot input into the editable range on blur (default = min). */
function normalizeSlotInput(raw: string, cfg: SlotFieldConfig | null): string {
  const min = cfg?.min ?? 1;
  const max = cfg?.max ?? 99;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return String(min);
  return String(Math.min(Math.max(min, n), max));
}

function PageHeading() {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-gray-900">Daftarkan Peserta</h1>
      <p className="text-sm text-gray-500">Pendaftaran peserta qurban oleh panitia</p>
    </div>
  );
}

function BackLink({ edisiId }: { edisiId: string }) {
  return (
    <Link
      href={`/qurban/peserta?edisi=${encodeURIComponent(edisiId)}`}
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 mb-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Kembali ke Daftar Peserta
    </Link>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
      />
    </div>
  );
}

function SelectedMuqoribCard({
  muqorib,
  onChange,
}: {
  muqorib: MuqoribCandidate;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{muqorib.nama_lengkap}</p>
        <p className="text-xs text-gray-500">
          {muqorib.alamat ? `${muqorib.alamat} · ` : ''}RT {muqorib.rt} ·{' '}
          <span className="font-mono">{muqorib.no_hp}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 text-sm text-emerald-600 hover:underline"
      >
        Ganti
      </button>
    </div>
  );
}

function NewMuqoribForm({
  value,
  errors,
  onChange,
  onCancel,
}: {
  value: { nama_lengkap: string; alamat: string; rt: string; no_hp: string; notes: string };
  errors: Record<string, string>;
  onChange: (patch: Partial<typeof value>) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Muqorib Baru</p>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:underline">
          Cari yang ada
        </button>
      </div>
      <Input
        label="Nama Lengkap"
        value={value.nama_lengkap}
        onChange={(e) => onChange({ nama_lengkap: e.target.value })}
        error={errors.nama_lengkap}
      />
      <Input
        label="Alamat"
        value={value.alamat}
        onChange={(e) => onChange({ alamat: e.target.value })}
        error={errors.alamat}
      />
      <div>
        <label htmlFor="new-muqorib-rt" className="block text-sm font-medium text-gray-700 mb-1">
          RT
        </label>
        <select
          id="new-muqorib-rt"
          value={value.rt}
          onChange={(e) => onChange({ rt: e.target.value })}
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
            errors.rt ? 'border-red-300' : 'border-gray-300'
          )}
        >
          <option value="">— Pilih RT —</option>
          {RT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {errors.rt && <p className="mt-1 text-sm text-red-600">{errors.rt}</p>}
      </div>
      <Input
        label="No. HP"
        value={value.no_hp}
        onChange={(e) => onChange({ no_hp: e.target.value })}
        error={errors.no_hp}
        placeholder="08xxx atau 628xxx"
        inputMode="tel"
      />
    </div>
  );
}

function DuplicateBanner({
  existing,
  hewanLabelMap,
  edisiId,
}: {
  existing: QurbanPeserta[];
  hewanLabelMap: Map<string, string>;
  edisiId: string;
}) {
  return (
    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
      <p className="font-medium text-amber-900">ℹ Pendaftaran existing ditemukan</p>
      <ul className="mt-1.5 space-y-1">
        {existing.map((p) => (
          <li key={p.id}>
            <Link
              href={`/qurban/peserta/${p.id}?edisi=${encodeURIComponent(edisiId)}`}
              className="text-amber-800 hover:underline"
            >
              <span className="font-mono">{p.kode_bayar}</span> ·{' '}
              {hewanSlotLabel(hewanLabelMap.get(p.hewan_id), p.slot_number, p.hewan_id)} ·{' '}
              {formatRupiah(p.harga_disepakati)} · {statusPendaftaranLabel(p.status_pendaftaran)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2 gap-2">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="font-medium text-gray-900 text-right break-words">{value}</dd>
    </div>
  );
}

function SuccessCard({ edisiId, created }: { edisiId: string; created: CreatedResult }) {
  const multi = created.slotCount > 1;
  const single = created.pesertaIds.length === 1;
  return (
    <div className="max-w-md mx-auto">
      <Card>
        <div className="text-center py-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Pendaftaran Berhasil</h2>
          <p className="text-sm text-gray-500 mt-1">
            {multi ? `${created.slotCount} slot terdaftar.` : 'Peserta telah terdaftar.'}
          </p>

          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-3">
            <p className="text-xs text-gray-500 mb-1">Kode Bayar</p>
            <p className="font-mono text-lg font-semibold text-gray-900">{created.kodeBayar}</p>
            {multi && (
              <p className="text-xs text-gray-400 mt-1">Satu kode untuk seluruh {created.slotCount} slot.</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-center gap-2 mt-5">
            {single && created.pesertaIds[0] && (
              <Link href={`/qurban/peserta/${created.pesertaIds[0]}?edisi=${encodeURIComponent(edisiId)}`}>
                <Button className="w-full sm:w-auto">Lihat Detail Peserta</Button>
              </Link>
            )}
            <Link href={`/qurban/peserta?edisi=${encodeURIComponent(edisiId)}`}>
              <Button variant="secondary" className="w-full sm:w-auto">
                Kembali ke Daftar Peserta
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
