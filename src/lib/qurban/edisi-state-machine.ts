/**
 * Pure state-machine guards for `qurban_edisi.status`.
 *
 * F02-A: this module is built now so Milestone B+ endpoints (activate, close,
 * update field) can reuse the same source of truth. No I/O here — pure
 * predicate functions safe to import anywhere (Edge, Node, tests).
 *
 * State graph:
 *   DRAFT ──activate──▶ AKTIF ──close──▶ SELESAI  (terminal)
 *
 * Lock semantics per status:
 *   DRAFT    — all fields editable
 *   AKTIF    — only `tanggal_idul_adha`, `tanggal_pendaftaran_buka`,
 *              `tanggal_pendaftaran_tutup` may be edited
 *   SELESAI  — read-only (no field editable)
 */

import { ErrorCodes } from '@/lib/api/errors';

export const EDISI_STATUS = {
  DRAFT: 'DRAFT',
  AKTIF: 'AKTIF',
  SELESAI: 'SELESAI',
} as const;

export type EdisiStatus = (typeof EDISI_STATUS)[keyof typeof EDISI_STATUS];

export const VALID_EDISI_STATUS = [
  EDISI_STATUS.DRAFT,
  EDISI_STATUS.AKTIF,
  EDISI_STATUS.SELESAI,
] as const;

export function isValidEdisiStatus(s: string): s is EdisiStatus {
  return (VALID_EDISI_STATUS as readonly string[]).includes(s);
}

/** Edisi fields that DRAFT exposes for editing (single source of truth). */
const DRAFT_EDITABLE: readonly string[] = [
  'tahun_hijriah',
  'tahun_masehi',
  'tanggal_idul_adha',
  'tanggal_pendaftaran_buka',
  'tanggal_pendaftaran_tutup',
];

const AKTIF_EDITABLE: readonly string[] = [
  'tanggal_idul_adha',
  'tanggal_pendaftaran_buka',
  'tanggal_pendaftaran_tutup',
];

const SELESAI_EDITABLE: readonly string[] = [];

/** Fields the caller is allowed to PATCH given the current status. */
export function getEditableFields(status: EdisiStatus): readonly string[] {
  switch (status) {
    case EDISI_STATUS.DRAFT:
      return DRAFT_EDITABLE;
    case EDISI_STATUS.AKTIF:
      return AKTIF_EDITABLE;
    case EDISI_STATUS.SELESAI:
      return SELESAI_EDITABLE;
  }
}

export function isFieldEditable(status: EdisiStatus, field: string): boolean {
  return getEditableFields(status).includes(field);
}

export type EdisiTransition = 'activate' | 'close';

/** Valid (from, to) pairs reachable via one transition. */
export function isValidTransition(
  from: EdisiStatus,
  to: EdisiStatus
): boolean {
  if (from === EDISI_STATUS.DRAFT && to === EDISI_STATUS.AKTIF) return true;
  if (from === EDISI_STATUS.AKTIF && to === EDISI_STATUS.SELESAI) return true;
  return false;
}

export function transitionTarget(
  from: EdisiStatus,
  action: EdisiTransition
): EdisiStatus | null {
  if (action === 'activate' && from === EDISI_STATUS.DRAFT) return EDISI_STATUS.AKTIF;
  if (action === 'close' && from === EDISI_STATUS.AKTIF) return EDISI_STATUS.SELESAI;
  return null;
}

/**
 * Thrown synchronously by `assertTransition` / `assertFieldEditable`. Route
 * handlers should catch (or use try/catch around the helper call) and convert
 * via `error(err.code, err.message, err.httpStatus)`.
 */
export class EdisiStateError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function assertTransition(
  from: EdisiStatus,
  to: EdisiStatus
): void {
  if (!isValidTransition(from, to)) {
    throw new EdisiStateError(
      ErrorCodes.BUSINESS_INVALID_STATE_TRANSITION,
      `Transisi status ${from} → ${to} tidak diizinkan.`,
      422,
      { from, to }
    );
  }
}

export function assertFieldEditable(
  status: EdisiStatus,
  field: string
): void {
  if (!isFieldEditable(status, field)) {
    throw new EdisiStateError(
      ErrorCodes.BUSINESS_EDISI_LOCKED,
      `Field '${field}' tidak dapat diubah saat status edisi ${status}.`,
      422,
      { field, status, editable_fields: getEditableFields(status) }
    );
  }
}
