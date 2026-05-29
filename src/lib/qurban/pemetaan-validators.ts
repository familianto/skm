import { z } from 'zod';

/**
 * F5b A2 — Skema operasi & request PM1 (`POST /api/qurban/pemetaan/batch-save`).
 *
 * Hanya validasi **bentuk**: tipe, presence, range numerik dasar. Validasi
 * **bisnis** (peserta ada, hewan AKTIF, kapasitas slot, kolisi cross-op,
 * harga_decision konsisten dengan target) dilakukan oleh
 * `pemetaan-engine.simulateBatch` yang tahu state saat runtime.
 *
 * Skema sengaja ketat: PM1 menerima body dari panitia/admin, jadi mismatch
 * lebih baik 400 cepat daripada bocor ke engine.
 */

const ID_STR = z.string().min(1, 'ID tidak boleh kosong').max(64);
const POS_INT = z.number().int('Harus bilangan bulat').min(1, 'Minimal 1');
const NON_NEG_INT = z.number().int('Harus bilangan bulat').min(0, 'Minimal 0');

const MOVE_OP = z
  .object({
    type: z.literal('move_peserta'),
    peserta_id: ID_STR,
    target_hewan_id: ID_STR,
    target_slot_number: POS_INT,
    harga_decision: z.enum(['use_old', 'use_new', 'use_custom']),
    harga_override: NON_NEG_INT.optional(),
  })
  .refine(
    (v) => v.harga_decision !== 'use_custom' || typeof v.harga_override === 'number',
    {
      message: 'harga_override wajib diisi (≥ 0) jika harga_decision=use_custom',
      path: ['harga_override'],
    }
  );

const SWAP_OP = z
  .object({
    type: z.literal('swap_peserta'),
    peserta_a_id: ID_STR,
    peserta_b_id: ID_STR,
    harga_decision: z.enum(['use_old', 'use_new', 'use_existing_target', 'use_custom']),
    harga_override_a: NON_NEG_INT.optional(),
    harga_override_b: NON_NEG_INT.optional(),
  })
  .refine((v) => v.peserta_a_id !== v.peserta_b_id, {
    message: 'peserta_a_id dan peserta_b_id harus berbeda',
    path: ['peserta_b_id'],
  })
  .refine(
    (v) =>
      v.harga_decision !== 'use_custom' ||
      (typeof v.harga_override_a === 'number' && typeof v.harga_override_b === 'number'),
    {
      message:
        'harga_override_a dan harga_override_b wajib diisi (≥ 0) jika harga_decision=use_custom',
      path: ['harga_override_a'],
    }
  );

const RENUMBER_OP = z.object({
  type: z.literal('renumber_hewan'),
  hewan_id: ID_STR,
  new_nomor_urut: POS_INT,
});

export const OPERATION_SCHEMA = z.discriminatedUnion('type', [
  MOVE_OP,
  SWAP_OP,
  RENUMBER_OP,
]);

export const PEMETAAN_BATCH_SAVE_SCHEMA = z.object({
  edisi_id: ID_STR,
  expected_version: z.string().min(1, 'expected_version wajib diisi'),
  operations: z
    .array(OPERATION_SCHEMA)
    .min(1, 'operations minimal 1')
    .max(100, 'operations maksimal 100 per request'),
  audit_notes: z.string().max(500, 'audit_notes maksimal 500 karakter').optional(),
});

export type Operation = z.infer<typeof OPERATION_SCHEMA>;
export type MoveOp = z.infer<typeof MOVE_OP>;
export type SwapOp = z.infer<typeof SWAP_OP>;
export type RenumberOp = z.infer<typeof RENUMBER_OP>;
export type PemetaanBatchSaveRequest = z.infer<typeof PEMETAAN_BATCH_SAVE_SCHEMA>;
