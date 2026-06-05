import type { QurbanPeserta } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import type { QurbanMuqorib } from './muqorib-repo';

/**
 * LP — Kartu Pemotongan & Label Bagikan (F8 Milestone G). Modul PUR (tanpa I/O
 * & tanpa lib biner): mengelompokkan peserta TERDAFTAR per HEWAN aktif ber-urut
 * potong → kartu (slot terisi/kosong), terurut `nomor_urut_pemotongan`. Renderer
 * jspdf koordinat-absolut mengonsumsi hasil ini. Dipisah agar diuji fixture.
 */

export type JenisKartu = 'SAPI' | 'KAMBING';

export interface KartuSlot {
  slot: number;
  nama: string; // '' bila kosong
}

export interface Kartu {
  no_urut: number;
  hewan_id: string;
  label_hewan: string; // "SAPI A-03"
  jenis: string;
  kelas: string;
  kapasitas: number;
  slots: KartuSlot[];
}

const STATUS_TERDAFTAR = 'TERDAFTAR';
const STATUS_HEWAN_AKTIF = 'AKTIF';

/** Label hewan "SAPI A-03" (UPPER) dari jenis+kelas+nomor_urut. */
export function labelHewanKartu(h: QurbanDaftarHewan): string {
  return `${h.jenis.toUpperCase()} ${h.kelas}-${String(h.nomor_urut).padStart(2, '0')}`;
}

/** Nama tampil baris: `nama_atas_nama` || muqorib nama || ''. */
function namaPeserta(p: QurbanPeserta, m: QurbanMuqorib | undefined): string {
  const override = (p.nama_atas_nama || '').trim();
  if (override) return override;
  return (m?.nama_lengkap || '').trim();
}

interface BuildInput {
  jenis: JenisKartu;
  peserta: QurbanPeserta[];
  hewan: QurbanDaftarHewan[];
  muqoribById: Map<string, QurbanMuqorib>;
}

/**
 * Kelompokkan menjadi kartu per hewan untuk satu jenis. Hanya hewan AKTIF
 * ber-`nomor_urut_pemotongan`. Slot 1..kapasitas; slot tanpa peserta → nama ''.
 * Urut kartu by `nomor_urut_pemotongan` ASC (tiebreak nomor_urut, lalu id).
 */
export function buildKartuPemotongan(input: BuildInput): Kartu[] {
  const { jenis, peserta, hewan, muqoribById } = input;

  // Hewan kandidat: jenis cocok, AKTIF, punya urut potong.
  const hewanKartu = hewan.filter(
    (h) =>
      h.jenis === jenis &&
      h.status === STATUS_HEWAN_AKTIF &&
      h.nomor_urut_pemotongan != null
  );

  // Peserta TERDAFTAR per hewan_id.
  const pesertaByHewan = new Map<string, QurbanPeserta[]>();
  for (const p of peserta) {
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    const arr = pesertaByHewan.get(p.hewan_id) ?? [];
    arr.push(p);
    pesertaByHewan.set(p.hewan_id, arr);
  }

  const kartu: Kartu[] = hewanKartu.map((h) => {
    const kapasitas = h.kapasitas_slot > 0 ? h.kapasitas_slot : 1;
    const bySlot = new Map<number, QurbanPeserta>();
    for (const p of pesertaByHewan.get(h.id) ?? []) {
      // Slot pertama menang bila ada bentrok (defensif).
      if (!bySlot.has(p.slot_number)) bySlot.set(p.slot_number, p);
    }
    const slots: KartuSlot[] = [];
    for (let s = 1; s <= kapasitas; s++) {
      const p = bySlot.get(s);
      slots.push({ slot: s, nama: p ? namaPeserta(p, muqoribById.get(p.muqorib_id)) : '' });
    }
    return {
      no_urut: h.nomor_urut_pemotongan as number,
      hewan_id: h.id,
      label_hewan: labelHewanKartu(h),
      jenis: h.jenis,
      kelas: h.kelas,
      kapasitas,
      slots,
    };
  });

  kartu.sort((a, b) =>
    a.no_urut !== b.no_urut ? a.no_urut - b.no_urut : a.hewan_id < b.hewan_id ? -1 : 1
  );
  return kartu;
}

// ── Label Bagikan ────────────────────────────────────────────────────────────

export interface LabelItem {
  atas_nama: string;
  label_hewan: string;
  no_urut: number | null;
  rt: string;
}

interface LabelInput {
  /** 'SAPI' | 'KAMBING' | 'SEMUA'. */
  jenis: JenisKartu | 'SEMUA';
  peserta: QurbanPeserta[];
  hewan: QurbanDaftarHewan[];
  muqoribById: Map<string, QurbanMuqorib>;
}

/**
 * Satu label per peserta TERDAFTAR (identitas peserta — bukan label distribusi
 * per-RT; itu menyusul F7). Filter jenis opsional. Urut by no_urut potong
 * (kosong di akhir) lalu label hewan lalu nama.
 */
export function buildLabelBagikan(input: LabelInput): LabelItem[] {
  const { jenis, peserta, hewan, muqoribById } = input;
  const hewanById = new Map(hewan.map((h) => [h.id, h]));

  const items: LabelItem[] = [];
  for (const p of peserta) {
    if (p.status_pendaftaran !== STATUS_TERDAFTAR) continue;
    const h = hewanById.get(p.hewan_id);
    if (jenis !== 'SEMUA') {
      if (!h || h.jenis !== jenis) continue;
    }
    const m = muqoribById.get(p.muqorib_id);
    items.push({
      atas_nama: namaPeserta(p, m) || '-',
      label_hewan: h ? labelHewanKartu(h) : '',
      no_urut: h?.nomor_urut_pemotongan ?? null,
      rt: (m?.rt || '').trim(),
    });
  }

  items.sort((a, b) => {
    const ua = a.no_urut ?? Number.POSITIVE_INFINITY;
    const ub = b.no_urut ?? Number.POSITIVE_INFINITY;
    if (ua !== ub) return ua - ub;
    if (a.label_hewan !== b.label_hewan) return a.label_hewan < b.label_hewan ? -1 : 1;
    return a.atas_nama < b.atas_nama ? -1 : a.atas_nama > b.atas_nama ? 1 : 0;
  });
  return items;
}
