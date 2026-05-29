'use client';

import { useMemo, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { formatRupiah } from '@/lib/utils';
import {
  moveHargaOptions,
  swapHargaOptions,
  type HewanLite,
  type HargaDecisionOption,
} from '@/lib/qurban/pemetaan-board-logic';

export type HargaDecisionMoveValue = 'use_old' | 'use_new' | 'use_custom';
export type HargaDecisionSwapValue =
  | 'use_old'
  | 'use_new'
  | 'use_existing_target'
  | 'use_custom';

export interface MoveModalResult {
  decision: HargaDecisionMoveValue;
  harga_override?: number;
}

export interface SwapModalResult {
  decision: HargaDecisionSwapValue;
  harga_override_a?: number;
  harga_override_b?: number;
}

interface BaseProps {
  open: boolean;
  onCancel: () => void;
}

interface MoveProps extends BaseProps {
  kind: 'move';
  source: HewanLite & { nama_tipe: string };
  target: HewanLite & { nama_tipe: string };
  pesertaLabel: string;
  hargaLama: number;
  hargaTargetMaster: number | null;
  onConfirm: (result: MoveModalResult) => void;
}

interface SwapProps extends BaseProps {
  kind: 'swap';
  source: HewanLite & { nama_tipe: string };
  target: HewanLite & { nama_tipe: string };
  pesertaALabel: string;
  pesertaBLabel: string;
  hargaA: number;
  hargaB: number;
  onConfirm: (result: SwapModalResult) => void;
}

export type HargaDecisionModalProps = MoveProps | SwapProps;

/**
 * F5b B — Modal "Sesuaikan Harga" untuk drop cross-class.
 *
 * Same-class → modal dilewati oleh caller (silent default `use_old`).
 * Cross-tipe → opsi `use_new` di-disable dengan note; default jatuh ke
 * `use_custom`. Logika opsi murni di `pemetaan-board-logic` (tested).
 */
export function HargaDecisionModal(props: HargaDecisionModalProps) {
  if (props.kind === 'move') return <MoveModal {...props} />;
  return <SwapModal {...props} />;
}

function MoveModal({
  open,
  source,
  target,
  pesertaLabel,
  hargaLama,
  hargaTargetMaster,
  onConfirm,
  onCancel,
}: MoveProps) {
  if (!open) return null;
  return (
    <MoveModalInner
      source={source}
      target={target}
      pesertaLabel={pesertaLabel}
      hargaLama={hargaLama}
      hargaTargetMaster={hargaTargetMaster}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/**
 * Inner modal di-mount fresh setiap kali modal dibuka — state default
 * di-derive dari props sekali via `useState(() => …)`, jadi tidak butuh
 * `useEffect` reset.
 */
function MoveModalInner({
  source,
  target,
  pesertaLabel,
  hargaLama,
  hargaTargetMaster,
  onConfirm,
  onCancel,
}: Omit<MoveProps, 'open' | 'kind'>) {
  const options = useMemo(() => moveHargaOptions(source, target), [source, target]);
  const defaultDecision =
    (options.find((o) => o.isDefault)?.value as HargaDecisionMoveValue) ?? 'use_old';

  const [decision, setDecision] = useState<HargaDecisionMoveValue>(() => defaultDecision);
  const [custom, setCustom] = useState<number | null>(() => hargaLama);
  const open = true;

  const customError =
    decision === 'use_custom' && (custom == null || custom < 0)
      ? 'Harga manual wajib diisi (≥ 0)'
      : '';
  const canConfirm = decision !== 'use_custom' || (custom != null && custom >= 0);

  function submit() {
    if (!canConfirm) return;
    if (decision === 'use_custom') {
      onConfirm({ decision, harga_override: custom as number });
    } else {
      onConfirm({ decision });
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title="Sesuaikan Harga — Pindah Peserta">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
          <div className="text-gray-700">
            <span className="font-medium">{pesertaLabel}</span>
          </div>
          <div className="text-gray-600">
            Dari <span className="font-medium">{source.nama_tipe}</span> ke{' '}
            <span className="font-medium">{target.nama_tipe}</span>
          </div>
          <div className="text-gray-600">
            Harga lama: <span className="font-medium">{formatRupiah(hargaLama)}</span>
            {hargaTargetMaster != null && (
              <>
                {' '}· Harga master tujuan:{' '}
                <span className="font-medium">{formatRupiah(hargaTargetMaster)}</span>
              </>
            )}
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800 mb-1">
            Pilih penanganan harga:
          </legend>
          {(options as HargaDecisionOption[])
            .filter((o) => o.value !== 'use_existing_target')
            .map((opt) => (
              <DecisionRadio
                key={opt.value}
                opt={opt}
                checked={decision === (opt.value as HargaDecisionMoveValue)}
                onSelect={() => !opt.disabled && setDecision(opt.value as HargaDecisionMoveValue)}
              />
            ))}
        </fieldset>

        {decision === 'use_custom' && (
          <CurrencyInput
            label="Nominal harga manual"
            value={custom}
            onChange={setCustom}
            error={customError}
            placeholder="0"
          />
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onCancel}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!canConfirm}>
            Konfirmasi
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SwapModal({
  open,
  source,
  target,
  pesertaALabel,
  pesertaBLabel,
  hargaA,
  hargaB,
  onConfirm,
  onCancel,
}: SwapProps) {
  if (!open) return null;
  return (
    <SwapModalInner
      source={source}
      target={target}
      pesertaALabel={pesertaALabel}
      pesertaBLabel={pesertaBLabel}
      hargaA={hargaA}
      hargaB={hargaB}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function SwapModalInner({
  source,
  target,
  pesertaALabel,
  pesertaBLabel,
  hargaA,
  hargaB,
  onConfirm,
  onCancel,
}: Omit<SwapProps, 'open' | 'kind'>) {
  const options = useMemo(() => swapHargaOptions(source, target), [source, target]);
  const defaultDecision =
    (options.find((o) => o.isDefault)?.value as HargaDecisionSwapValue) ?? 'use_old';

  const [decision, setDecision] = useState<HargaDecisionSwapValue>(() => defaultDecision);
  const [customA, setCustomA] = useState<number | null>(() => hargaA);
  const [customB, setCustomB] = useState<number | null>(() => hargaB);
  const open = true;

  const customAError =
    decision === 'use_custom' && (customA == null || customA < 0)
      ? 'Harga A wajib diisi (≥ 0)'
      : '';
  const customBError =
    decision === 'use_custom' && (customB == null || customB < 0)
      ? 'Harga B wajib diisi (≥ 0)'
      : '';
  const canConfirm =
    decision !== 'use_custom' ||
    (customA != null && customA >= 0 && customB != null && customB >= 0);

  function submit() {
    if (!canConfirm) return;
    if (decision === 'use_custom') {
      onConfirm({
        decision,
        harga_override_a: customA as number,
        harga_override_b: customB as number,
      });
    } else {
      onConfirm({ decision });
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title="Sesuaikan Harga — Tukar Peserta">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
          <div className="text-gray-700">
            <span className="font-medium">{pesertaALabel}</span> ↔{' '}
            <span className="font-medium">{pesertaBLabel}</span>
          </div>
          <div className="text-gray-600">
            <span className="font-medium">{source.nama_tipe}</span> ↔{' '}
            <span className="font-medium">{target.nama_tipe}</span>
          </div>
          <div className="text-gray-600">
            Harga A: <span className="font-medium">{formatRupiah(hargaA)}</span> · Harga B:{' '}
            <span className="font-medium">{formatRupiah(hargaB)}</span>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800 mb-1">
            Pilih penanganan harga:
          </legend>
          {(options as Array<HargaDecisionOption & { value: HargaDecisionSwapValue }>).map((opt) => (
            <DecisionRadio
              key={opt.value}
              opt={opt}
              checked={decision === opt.value}
              onSelect={() => !opt.disabled && setDecision(opt.value as HargaDecisionSwapValue)}
            />
          ))}
        </fieldset>

        {decision === 'use_custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CurrencyInput
              label="Harga manual A"
              value={customA}
              onChange={setCustomA}
              error={customAError}
              placeholder="0"
            />
            <CurrencyInput
              label="Harga manual B"
              value={customB}
              onChange={setCustomB}
              error={customBError}
              placeholder="0"
            />
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onCancel}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!canConfirm}>
            Konfirmasi
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DecisionRadio({
  opt,
  checked,
  onSelect,
}: {
  opt: HargaDecisionOption;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={
        'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ' +
        (opt.disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : checked
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-gray-200 hover:border-gray-300')
      }
      onClick={(e) => {
        e.preventDefault();
        if (!opt.disabled) onSelect();
      }}
    >
      <input
        type="radio"
        className="mt-1"
        checked={checked}
        disabled={opt.disabled}
        readOnly
      />
      <div className="text-sm">
        <div className="font-medium text-gray-800">{opt.label}</div>
        {opt.note && <div className="text-xs text-gray-500 mt-0.5">{opt.note}</div>}
      </div>
    </label>
  );
}
