import { STATUS_TERDAFTAR } from './peserta-repo';
import { HEWAN_STATUS } from './hewan-state-machine';
import type { QurbanPeserta } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import type { Operation, MoveOp, SwapOp, RenumberOp } from './pemetaan-validators';

/**
 * F5b A2 — Engine simulasi PM1 batch-save.
 *
 * Fungsi murni: terima state awal (peserta+hewan+master harga), terapkan
 * deretan operasi secara sekuensial **terhadap state in-memory yang
 * ter-mutasi**, validasi per-op + validasi final-state, return diff (entitas
 * mana yang harus ditulis ulang). Tidak menyentuh Sheets, tidak ada audit.
 *
 * Pemisahan: skema-level (Zod di `pemetaan-validators.ts`) menjaga bentuk
 * payload; engine ini menjaga **konsistensi bisnis** (peserta ada, hewan
 * AKTIF, kapasitas slot, kolisi target, matriks harga, dst).
 */

export interface PesertaState {
  id: string;
  hewan_id: string;
  slot_number: number;
  harga_disepakati: number;
  status_pendaftaran: string;
  /** Field lain dibawa untuk write-back via PM1 handler — engine hanya butuh ini. */
  _changed: boolean;
}

export interface HewanState {
  id: string;
  master_hewan_id: string;
  kapasitas_slot: number;
  nomor_urut: number;
  status: string;
  _changed: boolean;
}

export interface MasterIndexEntry {
  /** Harga per-slot yang sudah dibagi kapasitas (frozen-time match). */
  harga: number;
}

export interface SimulateState {
  peserta: Map<string, PesertaState>;
  hewan: Map<string, HewanState>;
}

export interface SimulateChanges {
  pesertaIds: string[];
  hewanIds: string[];
}

export type SimulateResult =
  | { ok: true; state: SimulateState; changes: SimulateChanges }
  | { ok: false; failedOpIndex: number; errorCode: string; message: string };

/** Build state map dari row qurban_peserta / qurban_daftar_hewan. */
export function buildSimulateState(
  pesertaRows: readonly QurbanPeserta[],
  hewanRows: readonly QurbanDaftarHewan[]
): SimulateState {
  const peserta = new Map<string, PesertaState>();
  for (const p of pesertaRows) {
    peserta.set(p.id, {
      id: p.id,
      hewan_id: p.hewan_id,
      slot_number: p.slot_number,
      harga_disepakati: p.harga_disepakati,
      status_pendaftaran: p.status_pendaftaran,
      _changed: false,
    });
  }
  const hewan = new Map<string, HewanState>();
  for (const h of hewanRows) {
    hewan.set(h.id, {
      id: h.id,
      master_hewan_id: h.master_hewan_id,
      kapasitas_slot: h.kapasitas_slot,
      nomor_urut: h.nomor_urut,
      status: h.status,
      _changed: false,
    });
  }
  return { peserta, hewan };
}

function applyMove(
  state: SimulateState,
  masterIndex: ReadonlyMap<string, MasterIndexEntry>,
  op: MoveOp,
  opIndex: number
): { ok: true } | { ok: false; failedOpIndex: number; errorCode: string; message: string } {
  const peserta = state.peserta.get(op.peserta_id);
  if (!peserta) {
    return fail(opIndex, 'PESERTA_NOT_FOUND', `Peserta ${op.peserta_id} tidak ditemukan di edisi ini.`);
  }
  if (peserta.status_pendaftaran !== STATUS_TERDAFTAR) {
    return fail(opIndex, 'PESERTA_NOT_TERDAFTAR', `Peserta ${op.peserta_id} tidak berstatus TERDAFTAR.`);
  }
  const targetHewan = state.hewan.get(op.target_hewan_id);
  if (!targetHewan) {
    return fail(opIndex, 'HEWAN_NOT_FOUND', `Hewan target ${op.target_hewan_id} tidak ditemukan.`);
  }
  if (targetHewan.status !== HEWAN_STATUS.AKTIF) {
    return fail(opIndex, 'HEWAN_NOT_AKTIF', `Hewan target ${op.target_hewan_id} tidak berstatus AKTIF.`);
  }
  if (op.target_slot_number > targetHewan.kapasitas_slot) {
    return fail(
      opIndex,
      'SLOT_OUT_OF_RANGE',
      `target_slot_number ${op.target_slot_number} melebihi kapasitas hewan (${targetHewan.kapasitas_slot}).`
    );
  }

  // Harga decision.
  let newHarga = peserta.harga_disepakati;
  if (op.harga_decision === 'use_new') {
    const master = masterIndex.get(targetHewan.master_hewan_id);
    if (!master) {
      return fail(
        opIndex,
        'MASTER_NOT_FOUND',
        `Master hewan ${targetHewan.master_hewan_id} tidak ditemukan untuk harga_decision=use_new.`
      );
    }
    newHarga = master.harga;
  } else if (op.harga_decision === 'use_custom') {
    // Schema sudah memastikan harga_override ada & ≥ 0.
    newHarga = op.harga_override as number;
  }
  // use_old → biarkan.

  peserta.hewan_id = op.target_hewan_id;
  peserta.slot_number = op.target_slot_number;
  peserta.harga_disepakati = newHarga;
  peserta._changed = true;
  return { ok: true };
}

function applySwap(
  state: SimulateState,
  masterIndex: ReadonlyMap<string, MasterIndexEntry>,
  op: SwapOp,
  opIndex: number
): { ok: true } | { ok: false; failedOpIndex: number; errorCode: string; message: string } {
  const a = state.peserta.get(op.peserta_a_id);
  if (!a) return fail(opIndex, 'PESERTA_NOT_FOUND', `Peserta ${op.peserta_a_id} tidak ditemukan.`);
  if (a.status_pendaftaran !== STATUS_TERDAFTAR) {
    return fail(opIndex, 'PESERTA_NOT_TERDAFTAR', `Peserta ${op.peserta_a_id} tidak berstatus TERDAFTAR.`);
  }
  const b = state.peserta.get(op.peserta_b_id);
  if (!b) return fail(opIndex, 'PESERTA_NOT_FOUND', `Peserta ${op.peserta_b_id} tidak ditemukan.`);
  if (b.status_pendaftaran !== STATUS_TERDAFTAR) {
    return fail(opIndex, 'PESERTA_NOT_TERDAFTAR', `Peserta ${op.peserta_b_id} tidak berstatus TERDAFTAR.`);
  }
  if (!a.hewan_id || !a.slot_number || !b.hewan_id || !b.slot_number) {
    return fail(opIndex, 'PESERTA_UNASSIGNED', 'Swap memerlukan kedua peserta sudah ter-assign hewan + slot.');
  }

  const hewanA = state.hewan.get(a.hewan_id);
  const hewanB = state.hewan.get(b.hewan_id);
  if (!hewanA || hewanA.status !== HEWAN_STATUS.AKTIF) {
    return fail(opIndex, 'HEWAN_NOT_AKTIF', `Hewan ${a.hewan_id} (peserta A) tidak AKTIF.`);
  }
  if (!hewanB || hewanB.status !== HEWAN_STATUS.AKTIF) {
    return fail(opIndex, 'HEWAN_NOT_AKTIF', `Hewan ${b.hewan_id} (peserta B) tidak AKTIF.`);
  }

  // Setelah swap, A → posisi B (kapasitas hewanB), B → posisi A (kapasitas hewanA).
  if (b.slot_number > hewanB.kapasitas_slot) {
    return fail(
      opIndex,
      'SLOT_OUT_OF_RANGE',
      `Slot target swap (${b.slot_number}) melebihi kapasitas hewan ${hewanB.id}.`
    );
  }
  if (a.slot_number > hewanA.kapasitas_slot) {
    return fail(
      opIndex,
      'SLOT_OUT_OF_RANGE',
      `Slot target swap (${a.slot_number}) melebihi kapasitas hewan ${hewanA.id}.`
    );
  }

  // Harga decision.
  let newHargaA = a.harga_disepakati;
  let newHargaB = b.harga_disepakati;
  if (op.harga_decision === 'use_new') {
    const masterDestA = masterIndex.get(hewanB.master_hewan_id); // A pindah ke hewanB
    const masterDestB = masterIndex.get(hewanA.master_hewan_id);
    if (!masterDestA || !masterDestB) {
      return fail(opIndex, 'MASTER_NOT_FOUND', 'Master hewan tujuan tidak ditemukan untuk harga_decision=use_new.');
    }
    newHargaA = masterDestA.harga;
    newHargaB = masterDestB.harga;
  } else if (op.harga_decision === 'use_existing_target') {
    // Tukar harga.
    newHargaA = b.harga_disepakati;
    newHargaB = a.harga_disepakati;
  } else if (op.harga_decision === 'use_custom') {
    newHargaA = op.harga_override_a as number;
    newHargaB = op.harga_override_b as number;
  }
  // use_old → biarkan.

  // Swap posisi.
  const origAHewan = a.hewan_id;
  const origASlot = a.slot_number;
  a.hewan_id = b.hewan_id;
  a.slot_number = b.slot_number;
  b.hewan_id = origAHewan;
  b.slot_number = origASlot;
  a.harga_disepakati = newHargaA;
  b.harga_disepakati = newHargaB;
  a._changed = true;
  b._changed = true;
  return { ok: true };
}

function applyRenumber(
  state: SimulateState,
  op: RenumberOp,
  opIndex: number
): { ok: true } | { ok: false; failedOpIndex: number; errorCode: string; message: string } {
  const hewan = state.hewan.get(op.hewan_id);
  if (!hewan) {
    return fail(opIndex, 'HEWAN_NOT_FOUND', `Hewan ${op.hewan_id} tidak ditemukan.`);
  }
  // Tidak ada penegakan urutan jenis (paritas H5 reorder).
  if (hewan.nomor_urut === op.new_nomor_urut) {
    // No-op: tidak dianggap berubah, supaya tidak menulis ulang baris.
    return { ok: true };
  }
  hewan.nomor_urut = op.new_nomor_urut;
  hewan._changed = true;
  return { ok: true };
}

function fail(
  failedOpIndex: number,
  errorCode: string,
  message: string
): { ok: false; failedOpIndex: number; errorCode: string; message: string } {
  return { ok: false, failedOpIndex, errorCode, message };
}

/**
 * Validasi final state setelah semua op diterapkan:
 *  1. Tidak ada dua peserta TERDAFTAR di (hewan_id, slot_number) sama.
 *  2. hewan_id setiap peserta menunjuk hewan yang ada & AKTIF.
 *  3. slot_number ≤ kapasitas_slot.
 */
function validateFinalState(
  state: SimulateState
): { ok: true } | { ok: false; errorCode: string; message: string } {
  const seen = new Map<string, string>(); // "hewan|slot" → peserta_id
  for (const p of state.peserta.values()) {
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    if (!p.hewan_id) {
      return { ok: false, errorCode: 'PESERTA_UNASSIGNED', message: `Peserta ${p.id} tidak punya hewan_id.` };
    }
    const hewan = state.hewan.get(p.hewan_id);
    if (!hewan) {
      return {
        ok: false,
        errorCode: 'HEWAN_NOT_FOUND',
        message: `Peserta ${p.id} menunjuk hewan ${p.hewan_id} yang tidak ada.`,
      };
    }
    if (hewan.status !== HEWAN_STATUS.AKTIF) {
      return {
        ok: false,
        errorCode: 'HEWAN_NOT_AKTIF',
        message: `Peserta ${p.id} berada di hewan ${p.hewan_id} yang tidak AKTIF.`,
      };
    }
    if (p.slot_number < 1 || p.slot_number > hewan.kapasitas_slot) {
      return {
        ok: false,
        errorCode: 'SLOT_OUT_OF_RANGE',
        message: `Peserta ${p.id} berada di slot ${p.slot_number} di luar kapasitas hewan ${p.hewan_id} (${hewan.kapasitas_slot}).`,
      };
    }
    const key = `${p.hewan_id}|${p.slot_number}`;
    const prev = seen.get(key);
    if (prev) {
      return {
        ok: false,
        errorCode: 'SLOT_COLLISION',
        message: `Dua peserta TERDAFTAR berada di slot yang sama (${p.hewan_id} slot ${p.slot_number}): ${prev} & ${p.id}.`,
      };
    }
    seen.set(key, p.id);
  }
  return { ok: true };
}

/**
 * Jalankan simulasi terhadap deep-clone dari state. Sekuensial per op, tiap
 * op melihat state yang sudah ter-mutasi oleh op sebelumnya.
 *
 * Catatan: clone state input agar caller bisa mendeteksi diff tanpa khawatir
 * map peserta/hewan dari snapshot aslinya termutasi.
 */
export function simulateBatch(
  initialState: SimulateState,
  masterIndex: ReadonlyMap<string, MasterIndexEntry>,
  ops: Operation[]
): SimulateResult {
  const state: SimulateState = {
    peserta: new Map(),
    hewan: new Map(),
  };
  for (const [id, p] of initialState.peserta) {
    state.peserta.set(id, { ...p, _changed: false });
  }
  for (const [id, h] of initialState.hewan) {
    state.hewan.set(id, { ...h, _changed: false });
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    let res;
    if (op.type === 'move_peserta') res = applyMove(state, masterIndex, op, i);
    else if (op.type === 'swap_peserta') res = applySwap(state, masterIndex, op, i);
    else res = applyRenumber(state, op, i);
    if (!res.ok) return res;
  }

  const final = validateFinalState(state);
  if (!final.ok) {
    return {
      ok: false,
      failedOpIndex: ops.length - 1, // tidak ada op spesifik — atribusikan ke op terakhir
      errorCode: final.errorCode,
      message: final.message,
    };
  }

  const pesertaIds: string[] = [];
  const hewanIds: string[] = [];
  for (const p of state.peserta.values()) if (p._changed) pesertaIds.push(p.id);
  for (const h of state.hewan.values()) if (h._changed) hewanIds.push(h.id);

  return { ok: true, state, changes: { pesertaIds, hewanIds } };
}
