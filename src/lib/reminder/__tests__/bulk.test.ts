import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chunk,
  classifyTargets,
  sequentialIds,
  summarizeFailureReasons,
  REMINDER_CHUNK_SIZE,
  REMINDER_MAX_TARGETS_PER_REQUEST,
} from '../bulk';

// ── chunk ───────────────────────────────────────────────────────────────────

test('chunk: memecah dengan sisa di potongan terakhir', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 10), []);
  assert.deepEqual(chunk([1, 2], 10), [[1, 2]]);
});

test('chunk: 287 target terpecah rapi dan tidak melebihi batas request', () => {
  const targets = Array.from({ length: 287 }, (_, i) => i);
  const chunks = chunk(targets, REMINDER_CHUNK_SIZE);
  assert.equal(chunks.length, 12);
  assert.equal(chunks.flat().length, 287);
  assert.ok(chunks.every((c) => c.length <= REMINDER_MAX_TARGETS_PER_REQUEST));
});

// ── sequentialIds ───────────────────────────────────────────────────────────

test('id: increment lokal mempertahankan padding', () => {
  assert.deepEqual(sequentialIds('RMD-20260903-0007', 3), [
    'RMD-20260903-0007',
    'RMD-20260903-0008',
    'RMD-20260903-0009',
  ]);
});

test('id: melewati batas ratusan tanpa merusak lebar counter', () => {
  assert.deepEqual(sequentialIds('RMD-20260903-0099', 2), ['RMD-20260903-0099', 'RMD-20260903-0100']);
  assert.deepEqual(sequentialIds('RMD-20260903-9999', 2), ['RMD-20260903-9999', 'RMD-20260903-10000']);
});

test('id: count 0 → kosong; bentuk tak dikenal tetap unik', () => {
  assert.deepEqual(sequentialIds('RMD-20260903-0001', 0), []);
  assert.deepEqual(sequentialIds('TANPA-COUNTER', 2), ['TANPA-COUNTER', 'TANPA-COUNTER-2']);
});

// ── classifyTargets ─────────────────────────────────────────────────────────

const d = (id: string, telepon: string) => ({ id, nama: id, telepon });

test('classify: format umum warga dinormalisasi ke 628…', () => {
  const res = classifyTargets([d('A', '081219305550'), d('B', '+62 812-1234-5678'), d('C', '628111882151')]);
  assert.deepEqual(res.map((r) => r.target), ['6281219305550', '6281212345678', '628111882151']);
  assert.ok(res.every((r) => r.valid));
});

test('classify: nomor kosong dan tidak valid ditandai lokal dengan alasan', () => {
  const res = classifyTargets([d('A', ''), d('B', '12345'), d('C', '0812')]);
  assert.deepEqual(res.map((r) => r.valid), [false, false, false]);
  assert.match(res[0].reason, /kosong/i);
  assert.match(res[1].reason, /tidak valid/i);
  // Alasan menyertakan nilai asli agar bisa diperbaiki di sheet.
  assert.match(res[2].reason, /0812/);
});

test('classify: nomor yang kehilangan angka nol saat impor tetap diselamatkan', () => {
  // "81219305550" (nol depan hilang karena sel bertipe angka) → 628…
  const [res] = classifyTargets([d('A', '81219305550')]);
  assert.equal(res.valid, true);
  assert.equal(res.target, '6281219305550');
});

// ── summarizeFailureReasons ─────────────────────────────────────────────────

test('summary: menghitung distribusi alasan, terbanyak lebih dulu', () => {
  const details = [
    ...Array(244).fill('request invalid on disconnected device'),
    ...Array(3).fill('out of quota'),
  ];
  assert.deepEqual(summarizeFailureReasons(details), {
    'request invalid on disconnected device': 244,
    'out of quota': 3,
  });
});

test('summary: alasan kosong tetap terhitung dan ekornya digabung', () => {
  const details = ['', 'a', 'b', 'c', 'd', 'e', 'f'];
  const out = summarizeFailureReasons(details, 2);
  assert.equal(Object.values(out).reduce((a, b) => a + b, 0), details.length);
  assert.ok('(alasan lain)' in out);
  assert.ok('tanpa alasan' in out || Object.keys(out).length === 3);
});
