'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { formatRupiah } from '@/lib/utils';
import { useMe } from '@/hooks/use-me';
import type {
  PemetaanSnapshot,
  SnapshotHewan,
  SnapshotPesertaSlot,
  SnapshotSlot,
} from '@/lib/qurban/pemetaan-snapshot';
import type { Operation } from '@/lib/qurban/pemetaan-validators';
import {
  applyMoveLocal,
  applyRenumberLocal,
  applySwapLocal,
  buildRenumberOps,
  classifyDrop,
  type HewanLite,
} from '@/lib/qurban/pemetaan-board-logic';
import {
  HargaDecisionModal,
  type MoveModalResult,
  type SwapModalResult,
} from '@/components/qurban/HargaDecisionModal';

/**
 * F5b B — Papan Pemetaan Peserta↔Hewan (drag-drop).
 *
 * Konsumsi snapshot PM2 + commit batch via PM1. State model:
 *   - `initial`     : snapshot terakhir dari server (untuk reset & diff)
 *   - `local`       : copy dimutasi tiap drag (preview lokal)
 *   - `pendingOps`  : array Operation yang akan dikirim ke PM1
 *   - `version`     : token concurrency PM1 (dari snapshot)
 *
 * iPad Safari: TouchSensor dengan `delay: 200, tolerance: 5` membedakan
 * tap-drag dari scroll. Touch-action: none pada element draggable.
 */

const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN_QURBAN', 'PENDAFTARAN'];

interface Props {
  edisiId: string;
}

interface ApiSuccess<T> {
  ok: true;
  data: T;
}
interface ApiError {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}
type ApiResp<T> = ApiSuccess<T> | ApiError;

export function PemetaanBoard({ edisiId }: Props) {
  const { me } = useMe();
  const { toast } = useToast();
  const canWrite = !!me?.user.peran && WRITE_ROLES.includes(me.user.peran);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<PemetaanSnapshot | null>(null);
  const [local, setLocal] = useState<SnapshotHewan[]>([]);
  const [version, setVersion] = useState<string>('');
  const [pendingOps, setPendingOps] = useState<Operation[]>([]);

  const [reorderMode, setReorderMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);

  // Drag overlay state.
  const [activeDrag, setActiveDrag] = useState<{
    pesertaId: string;
    pesertaLabel: string;
    nominal: number;
  } | null>(null);

  // Modal harga.
  const [hargaModal, setHargaModal] = useState<HargaModalState | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/qurban/pemetaan/state?edisi_id=${encodeURIComponent(edisiId)}`,
        { cache: 'no-store' }
      );
      const json = (await res.json().catch(() => ({}))) as ApiResp<PemetaanSnapshot>;
      if (!res.ok || !json.ok) {
        const msg = (json as ApiError)?.error?.message || `Gagal memuat papan pemetaan (${res.status}).`;
        setLoadError(msg);
        return;
      }
      setInitial(json.data);
      setLocal(json.data.hewan);
      setVersion(json.data.version);
      setPendingOps([]);
      setReorderMode(false);
    } finally {
      setLoading(false);
    }
  }, [edisiId]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const dirty = pendingOps.length > 0;

  // ---------------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      if (reorderMode) return; // reorder pakai SortableContext sendiri
      const id = String(e.active.id);
      if (!id.startsWith('peserta:')) return;
      const pesertaId = id.slice('peserta:'.length);
      const p = findPeserta(local, pesertaId);
      if (!p) return;
      setActiveDrag({
        pesertaId,
        pesertaLabel: pesertaDisplayLabel(p),
        nominal: p.harga_disepakati,
      });
    },
    [local, reorderMode]
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveDrag(null);
      if (reorderMode) return;
      const overId = e.over?.id ? String(e.over.id) : null;
      const activeId = String(e.active.id);
      if (!overId || !activeId.startsWith('peserta:') || !overId.startsWith('slot:')) return;

      const pesertaId = activeId.slice('peserta:'.length);
      const [, targetHewanId, slotStr] = overId.split(':');
      const targetSlotNumber = parseInt(slotStr, 10);
      if (!targetHewanId || !Number.isFinite(targetSlotNumber)) return;

      // Cari source.
      const src = findSourceContext(local, pesertaId);
      if (!src) return;
      const targetHewan = local.find((h) => h.id === targetHewanId);
      if (!targetHewan) return;
      const targetSlot = targetHewan.slots.find((s) => s.slot_number === targetSlotNumber);
      if (!targetSlot) return;

      // Drop ke slot sama → noop.
      if (src.hewan.id === targetHewanId && src.slot.slot_number === targetSlotNumber) return;

      const result = classifyDrop({
        source: hewanLite(src.hewan),
        target: hewanLite(targetHewan),
        targetSlot,
      });

      if (result.kind === 'move') {
        if (result.needsModal) {
          setHargaModal({
            kind: 'move',
            pesertaId,
            sourceHewan: src.hewan,
            targetHewan,
            targetSlotNumber,
            hargaLama: src.slot.peserta!.harga_disepakati,
          });
        } else {
          applyMoveSilent(pesertaId, targetHewanId, targetSlotNumber);
        }
      } else if (result.kind === 'swap') {
        const pesertaBId = targetSlot.peserta!.id;
        if (result.needsModal) {
          setHargaModal({
            kind: 'swap',
            pesertaAId: pesertaId,
            pesertaBId,
            sourceHewan: src.hewan,
            targetHewan,
            hargaA: src.slot.peserta!.harga_disepakati,
            hargaB: targetSlot.peserta!.harga_disepakati,
          });
        } else {
          applySwapSilent(pesertaId, pesertaBId);
        }
      }
    },
    [local, reorderMode]
  );

  // Reorder hewan kolom (mode "Atur Urutan Hewan").
  const handleReorderEnd = useCallback(
    (e: DragEndEvent) => {
      if (!reorderMode) return;
      const activeId = String(e.active.id);
      const overId = e.over?.id ? String(e.over.id) : null;
      if (!overId || !activeId.startsWith('hcol:') || !overId.startsWith('hcol:')) return;
      const fromId = activeId.slice('hcol:'.length);
      const toId = overId.slice('hcol:'.length);
      if (fromId === toId) return;
      const fromIdx = local.findIndex((h) => h.id === fromId);
      const toIdx = local.findIndex((h) => h.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const reordered = arrayMove(local, fromIdx, toIdx);
      const orderedIds = reordered.map((h) => h.id);
      const nextLocal = applyRenumberLocal(local, orderedIds);
      setLocal(nextLocal);
      // Rebuild renumber ops dari INITIAL (bukan local) supaya tidak duplikat.
      // Setiap render kita compute ops dari posisi sekarang vs initial.
      if (!initial) return;
      const initialOrder = new Map(initial.hewan.map((h) => [h.id, h.nomor_urut] as const));
      const ops = buildRenumberOps(
        nextLocal.map((h) => ({ id: h.id, nomor_urut: initialOrder.get(h.id) ?? h.nomor_urut }))
      );
      // Drop ops renumber lama, ganti dengan set baru. Move/swap ops dipertahankan.
      setPendingOps((prev) => [
        ...prev.filter((op) => op.type !== 'renumber_hewan'),
        ...ops,
      ]);
    },
    [local, initial, reorderMode]
  );

  // ---------------------------------------------------------------------------
  // Apply silent (same-class)
  // ---------------------------------------------------------------------------

  function applyMoveSilent(pesertaId: string, hewanId: string, slot: number) {
    setLocal((prev) => applyMoveLocal(prev, pesertaId, hewanId, slot, null));
    setPendingOps((prev) => [
      ...prev,
      {
        type: 'move_peserta',
        peserta_id: pesertaId,
        target_hewan_id: hewanId,
        target_slot_number: slot,
        harga_decision: 'use_old',
      },
    ]);
  }

  function applySwapSilent(a: string, b: string) {
    setLocal((prev) => applySwapLocal(prev, a, b, null, null));
    setPendingOps((prev) => [
      ...prev,
      {
        type: 'swap_peserta',
        peserta_a_id: a,
        peserta_b_id: b,
        harga_decision: 'use_old',
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Modal harga callbacks
  // ---------------------------------------------------------------------------

  function onMoveModalConfirm(result: MoveModalResult) {
    if (!hargaModal || hargaModal.kind !== 'move') return;
    const { pesertaId, targetHewan, targetSlotNumber } = hargaModal;
    const override = result.decision === 'use_custom' ? (result.harga_override ?? null) : null;
    setLocal((prev) => applyMoveLocal(prev, pesertaId, targetHewan.id, targetSlotNumber, override));
    setPendingOps((prev) => [
      ...prev,
      {
        type: 'move_peserta',
        peserta_id: pesertaId,
        target_hewan_id: targetHewan.id,
        target_slot_number: targetSlotNumber,
        harga_decision: result.decision,
        ...(result.decision === 'use_custom' && result.harga_override !== undefined
          ? { harga_override: result.harga_override }
          : {}),
      } as Operation,
    ]);
    setHargaModal(null);
  }

  function onSwapModalConfirm(result: SwapModalResult) {
    if (!hargaModal || hargaModal.kind !== 'swap') return;
    const { pesertaAId, pesertaBId } = hargaModal;
    const overrideA = result.decision === 'use_custom' ? result.harga_override_a ?? null : null;
    const overrideB = result.decision === 'use_custom' ? result.harga_override_b ?? null : null;
    setLocal((prev) => applySwapLocal(prev, pesertaAId, pesertaBId, overrideA, overrideB));
    setPendingOps((prev) => [
      ...prev,
      {
        type: 'swap_peserta',
        peserta_a_id: pesertaAId,
        peserta_b_id: pesertaBId,
        harga_decision: result.decision,
        ...(result.decision === 'use_custom'
          ? {
              harga_override_a: result.harga_override_a,
              harga_override_b: result.harga_override_b,
            }
          : {}),
      } as Operation,
    ]);
    setHargaModal(null);
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/qurban/pemetaan/batch-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edisi_id: edisiId,
          expected_version: version,
          operations: pendingOps,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ApiResp<{
        version: string;
        applied: number;
        affected_peserta_ids: string[];
        affected_hewan_ids: string[];
      }>;
      if (res.ok && json.ok) {
        toast(`Pemetaan tersimpan (${json.data.applied} operasi).`, 'success');
        await fetchSnapshot();
        return;
      }
      // Error path.
      const err = (json as ApiError).error;
      if (err?.code === 'CONFLICT_VERSION') {
        setVersionConflict(true);
        return;
      }
      if (err?.code === 'BUSINESS_PEMETAAN_INVALID') {
        const idx = (err.details?.failed_op_index as number | undefined) ?? -1;
        const detail = idx >= 0 ? `Operasi #${idx + 1}: ${err.message}` : err.message;
        toast(detail, 'error');
        await fetchSnapshot();
        return;
      }
      toast(err?.message || 'Gagal menyimpan pemetaan.', 'error');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan pemetaan.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!initial) return;
    setLocal(initial.hewan);
    setPendingOps([]);
    setReorderMode(false);
    setDiscardConfirm(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Card>
        <Loading />
      </Card>
    );
  }
  if (loadError) {
    return (
      <Card>
        <p className="text-sm text-red-600">{loadError}</p>
        <Button className="mt-3" variant="secondary" onClick={() => fetchSnapshot()}>
          Coba lagi
        </Button>
      </Card>
    );
  }
  if (!initial) return null;

  if (initial.hewan.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-700">
          Belum ada hewan AKTIF di edisi ini. Tambahkan dari menu Hewan terlebih
          dahulu untuk mulai mengatur pemetaan.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header sticky */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-gray-900">Papan Pemetaan</span>
            {dirty && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                {pendingOps.length} perubahan belum disimpan
              </span>
            )}
            <span className="text-xs text-gray-400 hidden sm:inline">v{shortVersion(version)}</span>
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <Button
                size="sm"
                variant={reorderMode ? 'primary' : 'secondary'}
                onClick={() => setReorderMode((x) => !x)}
              >
                {reorderMode ? 'Selesai Atur Urutan' : 'Atur Urutan Hewan'}
              </Button>
            )}
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!dirty || saving}
                onClick={() => setDiscardConfirm(true)}
              >
                Buang Perubahan
              </Button>
            )}
            {canWrite && (
              <Button size="sm" disabled={!dirty || saving} onClick={save}>
                {saving ? 'Menyimpan…' : 'Simpan Pemetaan'}
              </Button>
            )}
          </div>
        </div>
        {!canWrite && (
          <p className="text-xs text-gray-500 mt-2">
            Mode lihat saja — peran Anda tidak dapat mengubah pemetaan.
          </p>
        )}
      </div>

      {/* Body */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={reorderMode ? handleReorderEnd : handleDragEnd}
      >
        <div className="overflow-x-auto -mx-4 px-4 pb-3">
          <SortableContext
            items={local.map((h) => `hcol:${h.id}`)}
            strategy={horizontalListSortingStrategy}
            disabled={!reorderMode}
          >
            <div className="flex gap-3 min-h-[400px]">
              {local.map((h) => (
                <HewanColumn
                  key={h.id}
                  hewan={h}
                  reorderMode={reorderMode}
                  canDrag={canWrite && !reorderMode}
                />
              ))}
            </div>
          </SortableContext>
        </div>

        <DragOverlay>
          {activeDrag && !reorderMode && (
            <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2 shadow-lg pointer-events-none">
              <div className="text-sm font-semibold text-gray-900">{activeDrag.pesertaLabel}</div>
              <div className="text-xs text-gray-600">{formatRupiah(activeDrag.nominal)}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Discard confirmation */}
      <ConfirmDialog
        open={discardConfirm}
        title="Buang Perubahan?"
        message={`Ada ${pendingOps.length} perubahan yang belum disimpan. Buang semua dan kembali ke kondisi semula?`}
        confirmLabel="Buang"
        variant="danger"
        onConfirm={discard}
        onCancel={() => setDiscardConfirm(false)}
      />

      {/* Version conflict modal */}
      <Modal
        open={versionConflict}
        onClose={() => setVersionConflict(false)}
        title="Papan basi"
      >
        <p className="text-sm text-gray-700">
          Pemetaan sudah diubah oleh sesi lain. Muat ulang papan untuk
          melanjutkan; perubahan lokal Anda akan hilang.
        </p>
        <div className="flex justify-end pt-4">
          <Button
            onClick={async () => {
              setVersionConflict(false);
              await fetchSnapshot();
            }}
          >
            Muat Ulang
          </Button>
        </div>
      </Modal>

      {/* Harga decision modals */}
      {hargaModal?.kind === 'move' && (
        <HargaDecisionModal
          kind="move"
          open
          source={withLabel(hargaModal.sourceHewan)}
          target={withLabel(hargaModal.targetHewan)}
          pesertaLabel={pesertaDisplayLabel(findPeserta(local, hargaModal.pesertaId)!)}
          hargaLama={hargaModal.hargaLama}
          hargaTargetMaster={hargaModal.targetHewan.harga_master_per_slot}
          onConfirm={onMoveModalConfirm}
          onCancel={() => setHargaModal(null)}
        />
      )}
      {hargaModal?.kind === 'swap' && (
        <HargaDecisionModal
          kind="swap"
          open
          source={withLabel(hargaModal.sourceHewan)}
          target={withLabel(hargaModal.targetHewan)}
          pesertaALabel={pesertaDisplayLabel(findPeserta(local, hargaModal.pesertaAId)!)}
          pesertaBLabel={pesertaDisplayLabel(findPeserta(local, hargaModal.pesertaBId)!)}
          hargaA={hargaModal.hargaA}
          hargaB={hargaModal.hargaB}
          onConfirm={onSwapModalConfirm}
          onCancel={() => setHargaModal(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HewanColumn({
  hewan,
  reorderMode,
  canDrag,
}: {
  hewan: SnapshotHewan;
  reorderMode: boolean;
  canDrag: boolean;
}) {
  const {
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
    attributes: sortableAttrs,
    listeners: sortableListeners,
  } = useSortable({ id: `hcol:${hewan.id}`, disabled: !reorderMode });
  const style: React.CSSProperties = reorderMode
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : {};
  const isiCount = hewan.slots.filter((s) => s.peserta).length;

  return (
    <div
      ref={setSortableRef}
      style={style}
      className="shrink-0 w-72 rounded-xl bg-gray-50 border border-gray-200 flex flex-col"
    >
      {/* Header */}
      <div
        className={
          'p-3 border-b border-gray-200 rounded-t-xl bg-white ' +
          (reorderMode ? 'cursor-grab active:cursor-grabbing select-none touch-none' : '')
        }
        {...(reorderMode ? { ...sortableAttrs, ...sortableListeners } : {})}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={
                'text-[10px] uppercase font-semibold px-2 py-0.5 rounded ' +
                (hewan.tipe_pembelian === 'BELI'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-purple-100 text-purple-800')
              }
            >
              {hewan.tipe_pembelian === 'BELI' ? 'Beli' : 'Bawa Sendiri'}
            </span>
            <span className="text-xs text-gray-500">#{hewan.nomor_urut}</span>
          </div>
          {reorderMode && (
            <span className="text-gray-400" aria-label="Drag handle">
              ⠿
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-gray-900 mt-1">{hewan.nama_tipe}</div>
        <div className="text-xs text-gray-500">
          Slot {isiCount}/{hewan.kapasitas_slot} terisi
        </div>
      </div>

      {/* Body slots */}
      <div className="p-2 space-y-2 flex-1">
        {hewan.slots.map((s) => (
          <SlotCard
            key={s.slot_number}
            hewan={hewan}
            slot={s}
            canDrag={canDrag}
            reorderMode={reorderMode}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  hewan,
  slot,
  canDrag,
  reorderMode,
}: {
  hewan: SnapshotHewan;
  slot: SnapshotSlot;
  canDrag: boolean;
  reorderMode: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot:${hewan.id}:${slot.slot_number}`,
    disabled: reorderMode,
  });

  return (
    <div
      ref={setDropRef}
      className={
        'rounded-lg border min-h-[64px] p-2 transition ' +
        (isOver
          ? 'border-emerald-500 bg-emerald-50'
          : slot.peserta
            ? 'border-gray-200 bg-white'
            : 'border-dashed border-gray-300 bg-white/50')
      }
    >
      {slot.peserta ? (
        <PesertaCard
          peserta={slot.peserta}
          hewanId={hewan.id}
          slotNumber={slot.slot_number}
          canDrag={canDrag}
        />
      ) : (
        <div className="text-xs text-gray-400 text-center pt-3">Slot {slot.slot_number} — kosong</div>
      )}
    </div>
  );
}

function PesertaCard({
  peserta,
  canDrag,
}: {
  peserta: SnapshotPesertaSlot;
  hewanId: string;
  slotNumber: number;
  canDrag: boolean;
}) {
  const {
    setNodeRef: setDragRef,
    transform: dragTransform,
    isDragging,
    attributes: dragAttrs,
    listeners: dragListeners,
  } = useDraggable({
    id: `peserta:${peserta.id}`,
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(dragTransform),
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none', // penting untuk iPad Safari
  };

  return (
    <div
      ref={setDragRef}
      style={style}
      className={
        'select-none ' +
        (canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')
      }
      {...(canDrag ? { ...dragAttrs, ...dragListeners } : {})}
    >
      <div className="text-sm font-semibold text-gray-900 truncate">
        {peserta.nama_atas_nama || peserta.muqorib_nama || '(tanpa nama)'}
      </div>
      {peserta.nama_atas_nama && peserta.muqorib_nama && (
        <div className="text-xs text-gray-500 truncate">a/n {peserta.muqorib_nama}</div>
      )}
      <div className="text-xs text-gray-700 mt-0.5">{formatRupiah(peserta.harga_disepakati)}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{peserta.kode_bayar}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (UI-only)
// ---------------------------------------------------------------------------

type HargaModalState =
  | {
      kind: 'move';
      pesertaId: string;
      sourceHewan: SnapshotHewan;
      targetHewan: SnapshotHewan;
      targetSlotNumber: number;
      hargaLama: number;
    }
  | {
      kind: 'swap';
      pesertaAId: string;
      pesertaBId: string;
      sourceHewan: SnapshotHewan;
      targetHewan: SnapshotHewan;
      hargaA: number;
      hargaB: number;
    };

function hewanLite(h: SnapshotHewan): HewanLite {
  return { jenis: h.jenis, kelas: h.kelas, tipe_pembelian: h.tipe_pembelian };
}

function withLabel(h: SnapshotHewan): HewanLite & { nama_tipe: string } {
  return { ...hewanLite(h), nama_tipe: h.nama_tipe };
}

function findPeserta(hewan: SnapshotHewan[], pesertaId: string): SnapshotPesertaSlot | null {
  for (const h of hewan) {
    for (const s of h.slots) {
      if (s.peserta?.id === pesertaId) return s.peserta;
    }
  }
  return null;
}

function findSourceContext(
  hewan: SnapshotHewan[],
  pesertaId: string
): { hewan: SnapshotHewan; slot: SnapshotSlot } | null {
  for (const h of hewan) {
    for (const s of h.slots) {
      if (s.peserta?.id === pesertaId) return { hewan: h, slot: s };
    }
  }
  return null;
}

function pesertaDisplayLabel(p: SnapshotPesertaSlot): string {
  return p.nama_atas_nama || p.muqorib_nama || p.id;
}

function shortVersion(v: string): string {
  if (!v) return '—';
  // ISO timestamp → "HH:mm:ss" portion (debug-only)
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(v);
  return m ? m[1] : v.slice(0, 10);
}
