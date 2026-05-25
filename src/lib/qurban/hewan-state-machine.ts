/**
 * Pure state-machine guards for `qurban_daftar_hewan.status` (F5a).
 *
 * Mirrors `edisi-state-machine.ts`: no I/O, safe to import anywhere (tests
 * included). Single source of truth for the H4/H6/H7 transition checks.
 *
 * State graph:
 *   DRAFT ──▶ AKTIF ──▶ TERPOTONG  (terminal)
 *     │         │
 *     └────────▶└──────▶ BATAL      (terminal)
 *
 *   AKTIF → TERPOTONG requires a `tanggal_pemotongan` (recorded in audit only;
 *   no column — Opsi A). DRAFT → BATAL is a small, deliberate extension so a
 *   mis-entered DRAFT can be voided without activating it first.
 */

import type { StatusHewan } from './daftar-hewan-types';

export const HEWAN_STATUS = {
  DRAFT: 'DRAFT',
  AKTIF: 'AKTIF',
  TERPOTONG: 'TERPOTONG',
  BATAL: 'BATAL',
} as const;

export const VALID_HEWAN_STATUS = [
  HEWAN_STATUS.DRAFT,
  HEWAN_STATUS.AKTIF,
  HEWAN_STATUS.TERPOTONG,
  HEWAN_STATUS.BATAL,
] as const;

export function isValidHewanStatus(s: string): s is StatusHewan {
  return (VALID_HEWAN_STATUS as readonly string[]).includes(s);
}

/** TERPOTONG & BATAL have no outgoing transitions. */
export function isTerminalHewanStatus(s: string): boolean {
  return s === HEWAN_STATUS.TERPOTONG || s === HEWAN_STATUS.BATAL;
}

/** Valid (from → to) pairs reachable via one status transition. */
export function isValidHewanTransition(from: string, to: string): boolean {
  if (from === HEWAN_STATUS.DRAFT && to === HEWAN_STATUS.AKTIF) return true;
  if (from === HEWAN_STATUS.DRAFT && to === HEWAN_STATUS.BATAL) return true;
  if (from === HEWAN_STATUS.AKTIF && to === HEWAN_STATUS.TERPOTONG) return true;
  if (from === HEWAN_STATUS.AKTIF && to === HEWAN_STATUS.BATAL) return true;
  return false;
}
