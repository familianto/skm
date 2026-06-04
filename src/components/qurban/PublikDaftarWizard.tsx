'use client';

import { useEffect, useState } from 'react';

import { formatRupiah } from '@/lib/utils';
import { RT_OPTIONS } from '@/lib/qurban/muqorib-display';
import { slotFieldConfig } from '@/lib/qurban/peserta-form';
import type { TipeOption } from '@/lib/qurban/publik-options';
import type { TipeQurban } from '@/lib/qurban/peserta-types';
import { composeBagian } from '@/lib/qurban/bagian-options';
import { BagianChecklist } from '@/components/qurban/BagianChecklist';
import { HONEYPOT_FIELD } from '@/lib/qurban/publik-honeypot';
import {
  availableTipeQurban,
  dedupeKodeBayar,
  findOption,
  friendlyPublikError,
  hasAvailableOptions,
  jenisForTipe,
  kelasForTipeJenis,
  tipeQurbanLabel,
} from '@/lib/qurban/publik-daftar-form';

/**
 * F4c-E — public registration wizard (`/publik/qurban/daftar`).
 *
 * 3 steps over PB1 → PB2 → PB3 (no auth, no sidebar, mobile-first):
 *   1. Pilih Qurban  (PB1 options + slot rules from `slotFieldConfig`)
 *   2. Identitas     (F4d phone-primary lookup → muqorib_id OR muqorib_data)
 *   3. Tinjau & Kirim (PB3 + honeypot) → success screen with ONE kode_bayar
 *
 * F4d Step 2 (phone-primary):
 *   - Input cuma `no_hp` + honeypot tersembunyi.
 *   - HP ketemu → kartu konfirmasi (nama/alamat TERMASK + RT) "Ya, ini saya"
 *     atau "Bukan / nomor salah". "Bukan" tidak meneruskan ke form pendaftar
 *     baru dengan HP yang sama (PB3 akan diam-diam attach ke muqorib existing).
 *   - HP tidak ketemu → form pendaftar baru (nama, alamat, rt, notes).
 * PB3 takes a single `nama_atas_nama` (applied to all slots) — there is no
 * per-slot field in the public contract.
 */

interface RekeningInfo {
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
}

interface Pb1Data {
  edisi: { tahun_hijriah: string } | null;
  status_pendaftaran: string;
  options: { tipe_hewan: TipeOption[]; rekening: RekeningInfo[] } | null;
}

interface MatchedMuqorib {
  id: string;
  nama_masked: string;
  alamat_masked: string;
  rt: string;
}

/** F6 D1 — metode pembayaran yang dapat dipilih muqorib saat daftar. */
type MetodePembayaran = 'TRANSFER' | 'TUNAI';

interface SuccessResult {
  kode_bayar: string;
  jumlah_slot: number;
  total_harga: number;
  nominal_transfer: number;
  rekening: RekeningInfo[];
  metode: MetodePembayaran;
}

/**
 * - `idle`: belum cek HP (atau HP berubah → reset).
 * - `confirm`: HP cocok satu muqorib; tampil kartu konfirmasi (Ya / Bukan).
 * - `rejected`: user menolak ("Bukan / nomor salah") — TIDAK lanjut sebagai
 *   pendaftar baru dengan HP yang sama (anti diam-diam-attach). User wajib
 *   ganti HP atau hubungi panitia.
 * - `new`: HP tidak terdaftar; tampilkan form pendaftar baru.
 */
type LookupState = 'idle' | 'confirm' | 'rejected' | 'new';

export function PublikDaftarWizard() {
  const [step, setStep] = useState(1);

  // PB1
  const [pb1, setPb1] = useState<Pb1Data | null>(null);
  const [pb1Loading, setPb1Loading] = useState(true);
  const [pb1Error, setPb1Error] = useState<string | null>(null);

  // Step 1 — pilih qurban
  const [tipeQurban, setTipeQurban] = useState<TipeQurban | ''>('');
  const [jenis, setJenis] = useState('');
  const [kelas, setKelas] = useState('');
  const [jumlahSlotStr, setJumlahSlotStr] = useState('1');
  const [atasNama, setAtasNama] = useState('');
  // Bagian hewan (in-repo: field "Keterangan" Step-1 memetakan ke
  // `keterangan_bagian`) → checklist + Lainnya, dirakit jadi string saat submit.
  const [bagianSelected, setBagianSelected] = useState<string[]>([]);
  const [bagianLainnya, setBagianLainnya] = useState('');
  // F6 D1 — metode pembayaran (wajib dipilih; tanpa default tersembunyi).
  const [metode, setMetode] = useState<MetodePembayaran | ''>('');
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Step 2 — identitas (F4d phone-primary)
  const [noHp, setNoHp] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [matchedMuqorib, setMatchedMuqorib] = useState<MatchedMuqorib | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // Form pendaftar baru (lookupState='new' saja)
  const [newNamaLengkap, setNewNamaLengkap] = useState('');
  const [newAlamat, setNewAlamat] = useState('');
  const [newRt, setNewRt] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // honeypot (must stay empty)
  const [honeypot, setHoneypot] = useState('');

  // Step 3 — submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/publik/qurban/options');
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json?.ok) setPb1(json.data as Pb1Data);
        else setPb1Error(friendlyPublikError(json?.error?.code || '', res.status, json?.error?.message));
      } catch {
        if (!cancelled) setPb1Error('Tidak dapat terhubung ke server.');
      } finally {
        if (!cancelled) setPb1Loading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = pb1?.options?.tipe_hewan ?? [];
  const selectedOption = findOption(options, tipeQurban, jenis, kelas);
  const slotCfg = selectedOption
    ? slotFieldConfig(selectedOption.jenis, tipeQurban as TipeQurban, selectedOption.kapasitas_slot)
    : null;
  const jumlahSlot = parseInt(jumlahSlotStr, 10) || 0;
  const effectiveMax = selectedOption
    ? Math.min(slotCfg?.max ?? selectedOption.kapasitas_slot, selectedOption.slot_tersedia)
    : 1;
  const hargaPerSlot = selectedOption?.harga_per_slot ?? 0;
  const totalHarga = hargaPerSlot * jumlahSlot;

  // ── handlers ────────────────────────────────────────────────────────────────
  const pickTipe = (t: TipeQurban | '') => {
    setTipeQurban(t);
    setJenis('');
    setKelas('');
    setJumlahSlotStr('1');
    setStep1Error(null);
  };
  const pickJenis = (j: string) => {
    setJenis(j);
    setKelas('');
    setJumlahSlotStr('1');
    setStep1Error(null);
  };
  const pickKelas = (k: string) => {
    setKelas(k);
    setStep1Error(null);
    const option = findOption(options, tipeQurban, jenis, k);
    if (option) {
      const cfg = slotFieldConfig(option.jenis, option.tipe_qurban, option.kapasitas_slot);
      setJumlahSlotStr(cfg.locked && cfg.lockedValue != null ? String(cfg.lockedValue) : '1');
    }
  };

  const goStep2 = () => {
    if (!selectedOption) {
      setStep1Error('Pilih tipe, jenis, dan kelas hewan.');
      return;
    }
    if (jumlahSlot < 1) {
      setStep1Error('Jumlah slot minimal 1.');
      return;
    }
    if (jumlahSlot > effectiveMax) {
      setStep1Error(`Maksimal ${effectiveMax} slot untuk pilihan ini.`);
      return;
    }
    if (metode !== 'TRANSFER' && metode !== 'TUNAI') {
      setStep1Error('Pilih metode pembayaran.');
      return;
    }
    setStep1Error(null);
    setStep(2);
  };

  const resetLookup = () => {
    setLookupState('idle');
    setMatchedMuqorib(null);
    setLookupError(null);
    setStep2Error(null);
    // F4c-F: a changed identity invalidates any prior submit error (e.g. the
    // duplicate banner) — clear it so a stale message never lingers.
    setSubmitError(null);
  };

  const runLookup = async () => {
    setStep2Error(null);
    if (!noHp.trim()) {
      setStep2Error('Isi nomor HP.');
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await fetch('/api/publik/qurban/daftar/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ no_hp: noHp.trim(), [HONEYPOT_FIELD]: honeypot }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        if (json.data.found) {
          setMatchedMuqorib({
            id: json.data.muqorib_id,
            nama_masked: json.data.nama_masked,
            alamat_masked: json.data.alamat_masked,
            rt: json.data.rt,
          });
          setLookupState('confirm');
        } else {
          setLookupState('new');
        }
      } else {
        setLookupError(friendlyPublikError(json?.error?.code || '', res.status, json?.error?.message));
      }
    } catch {
      setLookupError('Tidak dapat terhubung ke server.');
    } finally {
      setLookupLoading(false);
    }
  };

  const goStep3 = () => {
    setStep2Error(null);
    if (lookupState === 'idle') {
      setStep2Error('Cek nomor HP Anda terlebih dahulu.');
      return;
    }
    if (lookupState === 'rejected') {
      setStep2Error('Periksa kembali nomor HP Anda, atau hubungi panitia.');
      return;
    }
    if (lookupState === 'new') {
      if (!newNamaLengkap.trim() || !newAlamat.trim() || !newRt) {
        setStep2Error('Lengkapi nama lengkap, alamat, dan RT.');
        return;
      }
    }
    setStep(3);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const identity =
        lookupState === 'confirm' && matchedMuqorib
          ? { muqorib_id: matchedMuqorib.id }
          : {
              muqorib_data: {
                nama_lengkap: newNamaLengkap.trim(),
                alamat: newAlamat.trim(),
                rt: newRt,
                no_hp: noHp.trim(),
                notes: newNotes.trim() || undefined,
              },
            };
      const res = await fetch('/api/publik/qurban/daftar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...identity,
          master_hewan_id: selectedOption!.master_hewan_id,
          tipe_qurban: tipeQurban,
          jumlah_slot: jumlahSlot,
          nama_atas_nama: atasNama.trim(),
          keterangan_bagian: composeBagian(bagianSelected, bagianLainnya),
          metode_pembayaran: metode,
          [HONEYPOT_FIELD]: honeypot,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        const data = json.data as {
          peserta: { kode_bayar: string }[];
          pembayaran: { total_harga: number; nominal_transfer: number; rekening: RekeningInfo[] };
        };
        setResult({
          kode_bayar: dedupeKodeBayar(data.peserta),
          jumlah_slot: jumlahSlot,
          total_harga: data.pembayaran.total_harga,
          nominal_transfer: data.pembayaran.nominal_transfer,
          rekening: data.pembayaran.rekening,
          metode: metode as MetodePembayaran,
        });
        return;
      }
      setSubmitError(friendlyPublikError(json?.error?.code || '', res.status, json?.error?.message));
    } catch {
      setSubmitError('Tidak dapat terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (pb1Loading) {
    return <CenterCard><Spinner /> <span className="text-sm text-gray-500">Memuat…</span></CenterCard>;
  }
  if (pb1Error) {
    return (
      <CenterCard>
        <p className="text-sm text-red-600 text-center">{pb1Error}</p>
      </CenterCard>
    );
  }
  if (!pb1?.options || pb1.status_pendaftaran !== 'BUKA') {
    return (
      <CenterCard>
        <div className="text-center">
          <div className="text-4xl mb-3">🕌</div>
          <h2 className="text-lg font-semibold text-gray-900">Pendaftaran Ditutup</h2>
          <p className="text-sm text-gray-500 mt-2">
            Mohon maaf, pendaftaran qurban sedang tidak dibuka saat ini. Silakan hubungi panitia
            masjid untuk informasi lebih lanjut.
          </p>
        </div>
      </CenterCard>
    );
  }

  // Pendaftaran BUKA tapi semua slot terisi (PB1 menyaring opsi ber-slot-0, jadi
  // daftar kosong = penuh). Tampilkan banner ramah, BUKAN dropdown kosong.
  if (!hasAvailableOptions(pb1.options.tipe_hewan)) {
    return (
      <CenterCard>
        <div className="text-center">
          <div className="text-4xl mb-3">🕌</div>
          <h2 className="text-lg font-semibold text-gray-900">Pendaftaran Penuh</h2>
          <p className="text-sm text-gray-500 mt-2">
            Mohon maaf, kuota pendaftaran qurban untuk edisi ini sudah penuh. Silakan hubungi panitia
            masjid jika ada pertanyaan.
          </p>
        </div>
      </CenterCard>
    );
  }

  if (result) {
    return <SuccessScreen result={result} />;
  }

  return (
    <div className="space-y-4">
      <ProgressBar step={step} />

      {step === 1 && (
        <StepCard title="1. Pilih Qurban">
          <Field label="Tipe Qurban">
            <Select value={tipeQurban} onChange={(v) => pickTipe(v as TipeQurban)} placeholder="— Pilih tipe —"
              options={availableTipeQurban(options).map((t) => ({ value: t, label: tipeQurbanLabel(t) }))} />
          </Field>

          <Field label="Jenis Hewan">
            <Select value={jenis} onChange={pickJenis} placeholder="— Pilih jenis —" disabled={!tipeQurban}
              options={jenisForTipe(options, tipeQurban).map((j) => ({ value: j, label: titleCase(j) }))} />
          </Field>

          <Field label="Kelas">
            <Select value={kelas} onChange={pickKelas} placeholder="— Pilih kelas —" disabled={!jenis}
              options={kelasForTipeJenis(options, tipeQurban, jenis).map((o) => ({
                value: o.kelas,
                label: `Kelas ${o.kelas} · ${formatRupiah(o.harga_per_slot)}/slot · ${o.slot_tersedia} slot tersisa`,
              }))} />
          </Field>

          <Field label="Jumlah Slot">
            <input
              type="number"
              inputMode="numeric"
              min={slotCfg?.min ?? 1}
              max={effectiveMax}
              value={jumlahSlotStr}
              readOnly={!!slotCfg?.locked}
              disabled={!selectedOption}
              onChange={(e) => setJumlahSlotStr(e.target.value)}
              onBlur={() => setJumlahSlotStr((s) => clampSlot(s, slotCfg?.min ?? 1, effectiveMax))}
              className={inputClass(!!slotCfg?.locked)}
            />
            {selectedOption && (
              <p className="text-xs text-gray-500 mt-1">
                {slotCfg?.hint ? `${slotCfg.hint} ` : ''}
                {selectedOption.slot_tersedia} slot tersisa.
              </p>
            )}
          </Field>

          <Field label="Atas Nama (opsional)">
            <input value={atasNama} onChange={(e) => setAtasNama(e.target.value)}
              placeholder="Kosongkan untuk pakai nama Anda" className={inputClass(false)} />
            {jumlahSlot > 1 && (
              <p className="text-xs text-gray-400 mt-1">Berlaku untuk semua {jumlahSlot} slot.</p>
            )}
          </Field>

          <Field label="Bagian (opsional)">
            <BagianChecklist
              selected={bagianSelected}
              lainnya={bagianLainnya}
              onChange={(sel, lain) => { setBagianSelected(sel); setBagianLainnya(lain); }}
              idPrefix="publik-bagian"
            />
          </Field>

          <Field label="Metode Pembayaran">
            <select
              value={metode}
              onChange={(e) => { setMetode(e.target.value as MetodePembayaran); setStep1Error(null); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">— Pilih metode —</option>
              <option value="TRANSFER">Transfer</option>
              <option value="TUNAI">Cash · Datang Langsung</option>
              <option value="VA" disabled>Virtual Account (segera hadir)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {metode === 'TUNAI'
                ? 'Bayar tunai langsung ke panitia di masjid.'
                : metode === 'TRANSFER'
                ? 'Transfer ke rekening masjid; cantumkan kode bayar di berita.'
                : 'Pilih cara Anda membayar.'}
            </p>
          </Field>

          {selectedOption && jumlahSlot > 0 && (
            <PriceBox perSlot={hargaPerSlot} jumlah={jumlahSlot} total={totalHarga} />
          )}

          {step1Error && <ErrorText>{step1Error}</ErrorText>}
          <NavButtons onNext={goStep2} nextLabel="Lanjut" />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard title="2. Identitas Pendaftar">
          <Field label="Nomor HP (WhatsApp)">
            <input value={noHp} onChange={(e) => { setNoHp(e.target.value); resetLookup(); }}
              placeholder="08xxx atau 628xxx" inputMode="tel" autoComplete="tel" className={inputClass(false)} />
          </Field>

          {/* Honeypot — also placed on PB2 lookup (same field name as PB3). */}
          <input
            type="text"
            name={HONEYPOT_FIELD}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          {lookupState === 'idle' && (
            <>
              <p className="text-xs text-gray-500">
                Masukkan nomor HP/WhatsApp yang sama seperti pendaftaran sebelumnya. Kami akan tampilkan
                petunjuk samar agar Anda bisa mengenali data sendiri.
              </p>
              <button type="button" onClick={runLookup} disabled={lookupLoading}
                className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {lookupLoading ? 'Mencari…' : 'Cek Nomor'}
              </button>
            </>
          )}
          {lookupError && <ErrorText>{lookupError}</ErrorText>}

          {lookupState === 'confirm' && matchedMuqorib && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Apakah ini Anda atau keluarga Anda?
                </p>
                <p className="text-xs text-emerald-800/80 mt-0.5">
                  Petunjuk samar agar Anda dapat mengenali tanpa data sensitif diumbar.
                </p>
              </div>
              <div className="rounded-md bg-white/60 border border-emerald-100 px-3 py-2 text-sm">
                <p className="text-gray-700 font-medium">{matchedMuqorib.nama_masked || '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {matchedMuqorib.alamat_masked ? `${matchedMuqorib.alamat_masked} · ` : ''}
                  RT {matchedMuqorib.rt}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLookupState('rejected')}
                  className="flex-1 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                  Bukan / nomor salah
                </button>
                <button type="button" onClick={() => setStep(3)}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                  Ya, lanjutkan
                </button>
              </div>
            </div>
          )}

          {lookupState === 'rejected' && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 space-y-2">
              <p className="text-sm font-medium text-amber-900">Periksa kembali nomor HP Anda</p>
              <p className="text-xs text-amber-800/90">
                Nomor yang Anda masukkan sudah terdaftar atas data lain. Mohon cek ulang nomor HP, atau
                hubungi panitia masjid untuk membantu pendaftaran Anda.
              </p>
              <button type="button" onClick={resetLookup}
                className="text-xs text-amber-900 font-medium underline">
                Ubah nomor HP &amp; cek ulang
              </button>
            </div>
          )}

          {lookupState === 'new' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Nomor HP belum terdaftar — lengkapi data berikut sebagai <strong>pendaftar baru</strong>.
              </p>
              <Field label="Nama Lengkap">
                <input value={newNamaLengkap} onChange={(e) => setNewNamaLengkap(e.target.value)}
                  placeholder="Nama sesuai data" className={inputClass(false)} autoComplete="name" />
              </Field>
              <Field label="Alamat">
                <input value={newAlamat} onChange={(e) => setNewAlamat(e.target.value)}
                  placeholder="Alamat tempat tinggal" className={inputClass(false)} />
              </Field>
              <Field label="RT">
                <Select value={newRt} onChange={setNewRt} placeholder="— Pilih RT —"
                  options={RT_OPTIONS.map((r) => ({ value: r, label: r }))} />
              </Field>
              <Field label="Catatan (opsional)">
                <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className={inputClass(false)} />
              </Field>
            </div>
          )}

          {step2Error && <ErrorText>{step2Error}</ErrorText>}
          <NavButtons onBack={() => setStep(1)} onNext={goStep3} nextLabel="Lanjut"
            nextDisabled={lookupState === 'idle' || lookupState === 'rejected' || lookupState === 'confirm'} />
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title="3. Tinjau & Kirim">
          <dl className="divide-y divide-gray-100 text-sm">
            <SummaryRow label="Hewan" value={selectedOption ? `${titleCase(selectedOption.jenis)} Kelas ${selectedOption.kelas}` : '—'} />
            <SummaryRow label="Tipe" value={tipeQurbanLabel(tipeQurban)} />
            <SummaryRow label="Jumlah Slot" value={String(jumlahSlot)} />
            <SummaryRow label="Atas Nama" value={atasNama.trim() || '(pakai nama Anda)'} />
            {composeBagian(bagianSelected, bagianLainnya) && (
              <SummaryRow label="Bagian" value={composeBagian(bagianSelected, bagianLainnya)} />
            )}
            <SummaryRow
              label="Pendaftar"
              value={
                lookupState === 'confirm' && matchedMuqorib
                  ? matchedMuqorib.nama_masked || '(data tersimpan)'
                  : newNamaLengkap.trim()
              }
            />
            <SummaryRow label="Metode" value={metode === 'TUNAI' ? 'Cash · Datang Langsung' : 'Transfer'} />
            <SummaryRow label="Total" value={formatRupiah(totalHarga)} />
          </dl>

          {/* Honeypot — hidden from real users (also placed on Step 2). */}
          <input
            type="text"
            name={HONEYPOT_FIELD}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          {submitError && <ErrorText>{submitError}</ErrorText>}
          <NavButtons onBack={() => { setSubmitError(null); setStep(2); }} onNext={submit}
            nextLabel={submitting ? 'Mengirim…' : 'Kirim Pendaftaran'} nextDisabled={submitting} />
        </StepCard>
      )}
    </div>
  );
}

// ── presentational helpers ──────────────────────────────────────────────────

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function clampSlot(raw: string, min: number, max: number): string {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return String(min);
  return String(Math.min(Math.max(min, n), Math.max(min, max)));
}

function inputClass(locked: boolean): string {
  return [
    'block w-full rounded-lg border px-3 py-2 text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
    locked ? 'text-gray-500 bg-gray-50 border-gray-300' : 'text-gray-900 border-gray-300',
  ].join(' ');
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center justify-center gap-2 min-h-[40vh]">
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />;
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-colors ${s <= step ? 'bg-emerald-600' : 'bg-gray-200'} ${
            s === step ? 'w-8' : 'w-5'
          }`}
        />
      ))}
    </div>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
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
  );
}

function PriceBox({ perSlot, jumlah, total }: { perSlot: number; jumlah: number; total: number }) {
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm">
      <div className="flex justify-between text-gray-600">
        <span>Harga per slot</span>
        <span className="font-medium text-gray-900">{formatRupiah(perSlot)}</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>× {jumlah} slot</span>
        <span className="font-semibold text-emerald-700">{formatRupiah(total)}</span>
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{children}</p>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
        >
          Kembali
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function SuccessScreen({ result }: { result: SuccessResult }) {
  const isTunai = result.metode === 'TUNAI';
  // Rekening transfer saja — Kas Tunai tak relevan untuk instruksi transfer.
  const rekeningTransfer = result.rekening.filter((r) => !/kas tunai/i.test(r.nama_bank));
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900">Pendaftaran Tercatat</h2>
        <p className="text-sm text-gray-500 mt-1">
          Alhamdulillah, pendaftaran qurban Anda telah tercatat.
        </p>
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3 text-center">
        <p className="text-xs text-gray-500 mb-1">Kode Bayar</p>
        <div className="flex items-center justify-center gap-2">
          <p className="font-mono text-xl font-bold text-gray-900">{result.kode_bayar}</p>
          <CopyButton text={result.kode_bayar} label="Salin kode bayar" />
        </div>
        {result.jumlah_slot > 1 && (
          <p className="text-xs text-gray-400 mt-1">Satu kode untuk seluruh {result.jumlah_slot} slot.</p>
        )}
      </div>

      {isTunai ? (
        <>
          <div className="rounded-lg border border-gray-200 px-3 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="font-bold text-emerald-700">{formatRupiah(result.total_harga)}</span>
            </div>
          </div>

          <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-3 text-sm text-gray-700">
            <p className="font-medium text-gray-900 mb-1">🕌 Cash · Datang Langsung</p>
            <p>
              Silakan <strong>datang ke masjid</strong> dan serahkan pembayaran ke{' '}
              <strong>panitia</strong>. Sebutkan <strong>kode bayar</strong> di atas saat membayar.
            </p>
          </div>

          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Detail & konfirmasi juga dikirim via WhatsApp ke nomor Anda.
          </p>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 px-3 py-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Total harga</span>
              <span className="font-medium text-gray-900">{formatRupiah(result.total_harga)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nominal transfer</span>
              <span className="font-bold text-emerald-700">{formatRupiah(result.nominal_transfer)}</span>
            </div>
            <p className="text-xs text-gray-400">
              Mohon transfer TEPAT sesuai nominal di atas (3 digit terakhir adalah kode unik).
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Transfer ke:</p>
            {rekeningTransfer.length === 0 ? (
              <p className="text-sm text-gray-500">Info rekening menyusul dari panitia.</p>
            ) : (
              <ul className="space-y-2">
                {rekeningTransfer.map((r, i) => (
                  <li key={i} className="rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900">{r.nama_bank}</span>{' '}
                        <span className="font-mono">{r.nomor_rekening}</span>
                        <div className="text-xs text-gray-500">a.n. {r.atas_nama}</div>
                      </div>
                      <CopyButton text={r.nomor_rekening} label={`Salin nomor rekening ${r.nama_bank}`} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ Tulis <strong>kode bayar</strong> Anda pada berita/keterangan transfer. Detail & instruksi
            juga dikirim via WhatsApp ke nomor Anda.
          </p>
        </>
      )}

      <a
        href="/publik/qurban/cek-status"
        className="block text-center py-2.5 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors"
      >
        Cek Status Pendaftaran
      </a>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (older browser / insecure context) — silent.
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-50 transition-colors"
    >
      {copied ? '✓ Disalin' : 'Salin'}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 text-right break-words">{value}</dd>
    </div>
  );
}
