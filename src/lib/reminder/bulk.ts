import { normalizePhone, validatePhone } from '@/lib/api/phone';

/**
 * Logika murni untuk pengiriman reminder massal.
 *
 * Dipisah dari route handler supaya bisa diuji tanpa Google Sheets maupun
 * Fonnte — semua aturan yang lahir dari insiden 2026-09-03 ada di sini:
 * batas ukuran kiriman, ID yang dihitung sekali (bukan per donatur), validasi
 * nomor sebelum kuota Fonnte terpakai, dan ringkasan alasan gagal untuk audit.
 */

/** Ukuran chunk yang dikirim UI per request. */
export const REMINDER_CHUNK_SIZE = 25;

/**
 * Batas keras target per request. UI memecah sendiri; batas ini menahan
 * pemanggil lain (atau UI versi lama) agar tidak mengulang blast 287 target
 * dalam satu fungsi serverless.
 */
export const REMINDER_MAX_TARGETS_PER_REQUEST = 50;

/** Jeda default yang diminta ke Fonnte untuk jalur bulk (detik, rentang acak). */
export const REMINDER_BULK_DELAY = '3-10';

/** Pecah array jadi potongan berukuran `size` (potongan terakhir boleh lebih pendek). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Turunkan `count` ID berurutan dari satu ID awal hasil `getNextId`.
 *
 * Sebelumnya tiap donatur memanggil `getNextId` (membaca SELURUH sheet) lalu
 * `appendRow` → ±574 panggilan Sheets untuk 287 target, dan 29 baris log hilang
 * kena kuota. Sekarang ID dihitung sekali lalu di-increment lokal.
 *
 * Contoh: `sequentialIds('RMD-20260903-0007', 3)`
 *   → ['RMD-20260903-0007', 'RMD-20260903-0008', 'RMD-20260903-0009']
 */
export function sequentialIds(firstId: string, count: number): string[] {
  if (count <= 0) return [];
  const match = /^(.*-)(\d+)$/.exec(firstId);
  if (!match) {
    // Bentuk ID tak dikenal — jangan menebak, pakai suffix agar tetap unik.
    return Array.from({ length: count }, (_, i) => (i === 0 ? firstId : `${firstId}-${i + 1}`));
  }
  const [, prefix, counter] = match;
  const width = counter.length;
  const start = parseInt(counter, 10);
  return Array.from({ length: count }, (_, i) =>
    `${prefix}${String(start + i).padStart(width, '0')}`
  );
}

export interface TargetCandidate {
  id: string;
  nama: string;
  telepon: string;
}

export interface ClassifiedTarget<T extends TargetCandidate> {
  donatur: T;
  /** Nomor ternormalisasi `628…`; string kosong bila tidak valid. */
  target: string;
  valid: boolean;
  /** Alasan siap-tampil bila tidak valid. */
  reason: string;
}

/**
 * Pisahkan target yang nomornya layak kirim dari yang tidak, memakai
 * `lib/api/phone.ts` (`^628\d{8,12}$`) yang sudah dipakai modul Qurban tapi
 * selama ini menganggur di jalur reminder. Nomor tak valid tidak pernah
 * dikirim ke Fonnte sehingga tidak membuang kuota.
 */
export function classifyTargets<T extends TargetCandidate>(
  donaturs: readonly T[]
): ClassifiedTarget<T>[] {
  return donaturs.map((donatur) => {
    const target = normalizePhone(donatur.telepon ?? '');
    if (!target) {
      return { donatur, target: '', valid: false, reason: 'Nomor telepon kosong.' };
    }
    if (!validatePhone(target)) {
      return {
        donatur,
        target: '',
        valid: false,
        reason: `Nomor tidak valid setelah normalisasi: "${donatur.telepon}" → "${target}".`,
      };
    }
    return { donatur, target, valid: true, reason: '' };
  });
}

/**
 * Ringkas alasan gagal jadi distribusi `{alasan: jumlah}` untuk audit —
 * mis. `{"request invalid on disconnected device": 244}`.
 *
 * Sebelumnya seluruh `waResult.detail` dibuang begitu saja saat menulis audit,
 * sehingga penyebab 273 kegagalan hanya tersisa di log Vercel.
 */
export function summarizeFailureReasons(
  details: readonly string[],
  maxKeys = 5
): Record<string, number> {
  const tally = new Map<string, number>();
  for (const raw of details) {
    const key = (raw || 'tanpa alasan').trim().slice(0, 120);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = sorted.slice(0, maxKeys);
  const rest = sorted.slice(maxKeys);
  const out: Record<string, number> = {};
  for (const [key, n] of kept) out[key] = n;
  if (rest.length > 0) out['(alasan lain)'] = rest.reduce((sum, [, n]) => sum + n, 0);
  return out;
}
