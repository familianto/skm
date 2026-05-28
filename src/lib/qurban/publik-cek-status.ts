import type { CekStatusEntry } from './publik-status';

/**
 * Pure helpers for the F4c-F public cek-status page. Dependency-free (the
 * `CekStatusEntry` import is type-only) so it runs in the client page + tests.
 * PB4 returns one entry per peserta slot; multi-slot registrations share one
 * `kode_bayar` (F4c-C model), so the page groups entries by kode for display.
 */

export type CekStatusMode = 'kode_bayar' | 'no_hp';

/** Build the PB4 query string for a search mode + raw value. */
export function buildCekStatusQuery(mode: CekStatusMode, value: string): string {
  const params = new URLSearchParams();
  params.set(mode, value.trim());
  return params.toString();
}

export interface CekStatusGroup {
  kode_bayar: string;
  nama: string; // masked (from PB4)
  slot_count: number;
  total_harga: number;
  entries: CekStatusEntry[];
}

/** Group PB4 entries by `kode_bayar` — one registration = one card. */
export function groupByKodeBayar(entries: CekStatusEntry[]): CekStatusGroup[] {
  const order: string[] = [];
  const map = new Map<string, CekStatusEntry[]>();
  for (const e of entries) {
    if (!map.has(e.kode_bayar)) {
      map.set(e.kode_bayar, []);
      order.push(e.kode_bayar);
    }
    map.get(e.kode_bayar)!.push(e);
  }
  return order.map((kode) => {
    const list = map.get(kode)!;
    return {
      kode_bayar: kode,
      nama: list[0]?.nama ?? '',
      slot_count: list.length,
      total_harga: list.reduce((sum, e) => sum + e.harga_disepakati, 0),
      entries: list,
    };
  });
}
