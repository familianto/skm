import type { AuditEntry } from '@/lib/api/audit-read';
import type { Edisi } from './edisi-repo';
import type { QurbanPeserta } from './peserta-types';
import type { QurbanDaftarHewan } from './daftar-hewan-types';
import type { Pembayaran } from './pembayaran-repo';
import { EDISI_STATUS } from './edisi-state-machine';

/**
 * LP5 — agregasi read-only Dashboard Qurban (F8 Milestone A).
 *
 * Modul PUR (tanpa I/O): route handler `GET /api/qurban/laporan/dashboard`
 * membaca sheet (peserta/pembayaran/daftar_hewan/audit_log) lalu memanggil
 * `buildDashboard(...)`. Memisahkan logika dari I/O agar bisa diuji dengan
 * fixture tanpa mock Sheets (pola yang sama dengan `audit-read.ts`).
 *
 * SADAR-ARSIP: edisi 1447H adalah arsip historis (impor massal `IMPORT_1447H`,
 * Idul Adha sudah lewat). Beberapa metrik diredefinisi agar JUJUR pada data
 * yang ada:
 *   - "Hewan Siap" → tampilkan `aktif / total` (status TERPOTONG belum ada; F7
 *     belum dibangun). `siap_metric = 'aktif'`, `terpotong_tersedia = false`.
 *   - "trend" peserta → `null` untuk arsip (impor sekali waktu, tak ada deret
 *     waktu bermakna; jangan render trend palsu).
 *   - Distribusi → `distribusi_tersedia = false` (menyusul di F7).
 */

export type FaseEdisi =
  | 'preparation'
  | 'pendaftaran'
  | 'hari_h'
  | 'distribusi'
  | 'finalisasi';

export type AktivitasTipe =
  | 'peserta'
  | 'pembayaran'
  | 'hewan'
  | 'pemetaan'
  | 'muqorib'
  | 'import'
  | 'lainnya';

export interface AktivitasItem {
  waktu: string;
  label: string;
  tipe: AktivitasTipe;
}

export interface DashboardDTO {
  edisi: {
    id: string;
    nama: string;
    status: string;
    is_arsip: boolean;
    fase: FaseEdisi;
    tanggal_idul_adha: string;
  };
  kartu: {
    peserta: {
      total: number;
      beli: number;
      bawa_sendiri: number;
      trend: number | null;
    };
    dana_terhimpun: {
      nominal: number;
      persen_lunas: number;
      jumlah_pembayaran: number;
    };
    hewan: {
      total: number;
      aktif: number;
      batal: number;
      sapi: number;
      kambing: number;
      siap_metric: 'aktif';
      terpotong_tersedia: boolean;
    };
    status_edisi: {
      fase: FaseEdisi;
      is_arsip: boolean;
    };
  };
  persiapan: {
    per_jenis: PersiapanJenis[];
    per_jenis_kelas: PersiapanJenisKelas[];
    beli: number;
    bawa_sendiri: number;
  };
  operasional: {
    urutan_pemotongan: { ter_assign: number; total_aktif: number };
    distribusi_tersedia: boolean;
  };
  aktivitas_terakhir: AktivitasItem[];
}

export interface PersiapanJenis {
  jenis: string;
  total: number;
  aktif: number;
  beli: number;
  bawa_sendiri: number;
}

export interface PersiapanJenisKelas {
  jenis: string;
  kelas: string;
  total: number;
  aktif: number;
}

const STATUS_HEWAN_AKTIF = 'AKTIF';
const STATUS_HEWAN_BATAL = 'BATAL';
const STATUS_PESERTA_TERDAFTAR = 'TERDAFTAR';
const STATUS_PEMBAYARAN_LUNAS = 'LUNAS';

/**
 * Edisi dianggap ARSIP bila Idul Adha-nya sudah lewat (`tanggal_idul_adha` <
 * hari ini) ATAU seluruh pembayaran edisi bermetode `IMPORT_1447H`. Tanggal
 * disimpan string `YYYY-MM-DD` → perbandingan leksikografis aman.
 */
export function isEdisiArsip(
  edisi: Pick<Edisi, 'tanggal_idul_adha'>,
  pembayaran: Pick<Pembayaran, 'metode'>[],
  today: string
): boolean {
  const idulAdha = (edisi.tanggal_idul_adha || '').trim();
  if (idulAdha && today && idulAdha < today) return true;
  if (
    pembayaran.length > 0 &&
    pembayaran.every((p) => p.metode === 'IMPORT_1447H')
  ) {
    return true;
  }
  return false;
}

/**
 * Turunkan fase edisi. Arsip → selalu `finalisasi`. Untuk edisi live, derivasi
 * penuh di luar scope Milestone A — beri default aman dari status + tanggal
 * pendaftaran (tanpa menyentuh distribusi/F7).
 */
export function deriveFase(
  edisi: Pick<
    Edisi,
    'status' | 'tanggal_pendaftaran_buka' | 'tanggal_pendaftaran_tutup'
  >,
  isArsip: boolean,
  today: string
): FaseEdisi {
  if (isArsip) return 'finalisasi';
  if (edisi.status === EDISI_STATUS.SELESAI) return 'finalisasi';
  if (edisi.status === EDISI_STATUS.DRAFT) return 'preparation';

  // AKTIF, belum arsip.
  const buka = (edisi.tanggal_pendaftaran_buka || '').trim();
  const tutup = (edisi.tanggal_pendaftaran_tutup || '').trim();
  if (buka && today && today < buka) return 'preparation';
  if (tutup && today && today > tutup) return 'hari_h';
  return 'pendaftaran';
}

/** Pembagian persen aman pembagian-nol, dibulatkan ke integer. */
export function safePercent(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

interface BuildInput {
  edisi: Edisi;
  peserta: QurbanPeserta[];
  pembayaran: Pembayaran[];
  hewan: QurbanDaftarHewan[];
  aktivitas: AktivitasItem[];
  /** Hari ini `YYYY-MM-DD` (di-inject agar deterministik saat tes). */
  today: string;
}

export function buildDashboard(input: BuildInput): DashboardDTO {
  const { edisi, peserta, pembayaran, hewan, aktivitas, today } = input;

  const isArsip = isEdisiArsip(edisi, pembayaran, today);
  const fase = deriveFase(edisi, isArsip, today);

  // ── Kartu Peserta ──────────────────────────────────────────────────────
  const terdaftar = peserta.filter(
    (p) => p.status_pendaftaran === STATUS_PESERTA_TERDAFTAR
  );
  const pesertaBeli = terdaftar.filter((p) => p.tipe_qurban === 'BELI').length;
  const pesertaBawa = terdaftar.filter(
    (p) => p.tipe_qurban === 'BAWA_SENDIRI'
  ).length;

  // ── Kartu Dana Terhimpun ───────────────────────────────────────────────
  const lunas = pembayaran.filter((p) => p.status === STATUS_PEMBAYARAN_LUNAS);
  const nominalLunas = lunas.reduce((sum, p) => sum + p.nominal_total, 0);
  const nilaiPendaftaranAktif = terdaftar.reduce(
    (sum, p) => sum + p.harga_disepakati,
    0
  );

  // ── Kartu Hewan ────────────────────────────────────────────────────────
  const hewanAktif = hewan.filter((h) => h.status === STATUS_HEWAN_AKTIF);
  const hewanBatal = hewan.filter((h) => h.status === STATUS_HEWAN_BATAL);
  const sapi = hewan.filter((h) => h.jenis === 'SAPI');
  const kambing = hewan.filter((h) => h.jenis === 'KAMBING');

  // ── Persiapan ──────────────────────────────────────────────────────────
  const perJenis = buildPerJenis(hewan);
  const perJenisKelas = buildPerJenisKelas(hewan);
  const hewanBeli = hewan.filter((h) => h.tipe_pembelian === 'BELI').length;
  const hewanBawa = hewan.filter(
    (h) => h.tipe_pembelian === 'BAWA_SENDIRI'
  ).length;

  // ── Operasionalisasi ───────────────────────────────────────────────────
  const terAssign = hewanAktif.filter(
    (h) => h.nomor_urut_pemotongan != null
  ).length;

  return {
    edisi: {
      id: edisi.id,
      nama: edisi.tahun_hijriah,
      status: edisi.status,
      is_arsip: isArsip,
      fase,
      tanggal_idul_adha: edisi.tanggal_idul_adha,
    },
    kartu: {
      peserta: {
        total: terdaftar.length,
        beli: pesertaBeli,
        bawa_sendiri: pesertaBawa,
        // Milestone A: trend selalu null (arsip = impor sekali waktu, tak ada
        // deret waktu bermakna). Edisi live menghitung trend di milestone lain.
        trend: null,
      },
      dana_terhimpun: {
        nominal: nominalLunas,
        persen_lunas: safePercent(nominalLunas, nilaiPendaftaranAktif),
        jumlah_pembayaran: lunas.length,
      },
      hewan: {
        total: hewan.length,
        aktif: hewanAktif.length,
        batal: hewanBatal.length,
        sapi: sapi.length,
        kambing: kambing.length,
        siap_metric: 'aktif',
        terpotong_tersedia: false,
      },
      status_edisi: { fase, is_arsip: isArsip },
    },
    persiapan: {
      per_jenis: perJenis,
      per_jenis_kelas: perJenisKelas,
      beli: hewanBeli,
      bawa_sendiri: hewanBawa,
    },
    operasional: {
      urutan_pemotongan: {
        ter_assign: terAssign,
        total_aktif: hewanAktif.length,
      },
      distribusi_tersedia: false,
    },
    aktivitas_terakhir: aktivitas,
  };
}

/** Ringkasan per-jenis (SAPI/KAMBING): total, aktif, split beli/bawa-sendiri. */
function buildPerJenis(hewan: QurbanDaftarHewan[]): PersiapanJenis[] {
  const map = new Map<string, PersiapanJenis>();
  for (const h of hewan) {
    const key = h.jenis;
    const cur =
      map.get(key) ??
      { jenis: key, total: 0, aktif: 0, beli: 0, bawa_sendiri: 0 };
    cur.total += 1;
    if (h.status === STATUS_HEWAN_AKTIF) cur.aktif += 1;
    if (h.tipe_pembelian === 'BELI') cur.beli += 1;
    else if (h.tipe_pembelian === 'BAWA_SENDIRI') cur.bawa_sendiri += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.jenis < b.jenis ? -1 : 1));
}

/** Agregasi per (jenis, kelas): total + aktif. Urut jenis lalu kelas. */
function buildPerJenisKelas(hewan: QurbanDaftarHewan[]): PersiapanJenisKelas[] {
  const map = new Map<string, PersiapanJenisKelas>();
  for (const h of hewan) {
    const key = `${h.jenis}|${h.kelas}`;
    const cur =
      map.get(key) ??
      { jenis: h.jenis, kelas: h.kelas, total: 0, aktif: 0 };
    cur.total += 1;
    if (h.status === STATUS_HEWAN_AKTIF) cur.aktif += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) =>
    a.jenis !== b.jenis
      ? a.jenis < b.jenis
        ? -1
        : 1
      : a.kelas < b.kelas
      ? -1
      : a.kelas > b.kelas
      ? 1
      : 0
  );
}

// ── Aktivitas Terakhir ──────────────────────────────────────────────────────

/** Entitas audit_log yang relevan dengan modul qurban. */
const QURBAN_ENTITAS = new Set([
  'peserta',
  'pembayaran',
  'daftar_hewan',
  'master_hewan',
  'pemetaan',
  'muqorib',
  'publik',
]);

/** event_type → label manusiawi (Bahasa Indonesia) + tipe (untuk ikon). */
const EVENT_META: Record<string, { label: string; tipe: AktivitasTipe }> = {
  'peserta.created': { label: 'Peserta didaftarkan', tipe: 'peserta' },
  'peserta.updated': { label: 'Data peserta diperbarui', tipe: 'peserta' },
  'peserta.status_changed': { label: 'Status pendaftaran diubah', tipe: 'peserta' },
  'peserta.harga_changed': { label: 'Harga disepakati diperbarui', tipe: 'peserta' },
  'pembayaran.created': { label: 'Pembayaran dicatat', tipe: 'pembayaran' },
  'pembayaran.terima_panitia': { label: 'Pembayaran diterima panitia', tipe: 'pembayaran' },
  'pembayaran.lunas': { label: 'Pembayaran LUNAS', tipe: 'pembayaran' },
  'pembayaran.lunas_via_rekonsiliasi': { label: 'Pembayaran LUNAS (rekonsiliasi)', tipe: 'pembayaran' },
  'pembayaran.batal': { label: 'Pembayaran dibatalkan', tipe: 'pembayaran' },
  'hewan.created': { label: 'Hewan ditambahkan', tipe: 'hewan' },
  'hewan.updated': { label: 'Data hewan diperbarui', tipe: 'hewan' },
  'hewan.cancelled': { label: 'Hewan dibatalkan', tipe: 'hewan' },
  'hewan.status_changed': { label: 'Status hewan diubah', tipe: 'hewan' },
  'hewan.nomor_urut_changed': { label: 'Urutan hewan diubah', tipe: 'hewan' },
  'hewan.batch_terpotong': { label: 'Hewan ditandai terpotong', tipe: 'hewan' },
  'master_hewan.harga_updated': { label: 'Harga master hewan diperbarui', tipe: 'hewan' },
  'master_hewan.kapasitas_updated': { label: 'Kapasitas master hewan diperbarui', tipe: 'hewan' },
  'pemetaan.batch_save': { label: 'Pemetaan hewan diperbarui', tipe: 'pemetaan' },
  'muqorib.auto_created_from_publik': { label: 'Muqorib baru (dari publik)', tipe: 'muqorib' },
  'publik.daftar_succeeded': { label: 'Pendaftaran publik berhasil', tipe: 'peserta' },
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** Ambil edisi_id dari detail audit (after lalu before), bila ada. */
function edisiIdOfEntry(entry: AuditEntry): string | null {
  const after = asRecord(entry.after);
  const fromAfter = after?.edisi_id;
  if (typeof fromAfter === 'string' && fromAfter) return fromAfter;
  const before = asRecord(entry.before);
  const fromBefore = before?.edisi_id;
  if (typeof fromBefore === 'string' && fromBefore) return fromBefore;
  return null;
}

/** Label + tipe untuk satu entry. Fallback aman ke entitas + aksi. */
export function activityLabel(entry: AuditEntry): { label: string; tipe: AktivitasTipe } {
  const meta = EVENT_META[entry.event_type];
  if (meta) return meta;
  // Fallback manusiawi tanpa membangun mesin display_hints penuh (AL1 ditunda).
  const tipe: AktivitasTipe = QURBAN_ENTITAS.has(entry.entitas)
    ? tipeOfEntitas(entry.entitas)
    : 'lainnya';
  return { label: entry.event_type || `${entry.entitas} ${entry.aksi}`.trim() || 'Aktivitas', tipe };
}

function tipeOfEntitas(entitas: string): AktivitasTipe {
  switch (entitas) {
    case 'peserta':
    case 'publik':
      return 'peserta';
    case 'pembayaran':
      return 'pembayaran';
    case 'daftar_hewan':
    case 'master_hewan':
      return 'hewan';
    case 'pemetaan':
      return 'pemetaan';
    case 'muqorib':
      return 'muqorib';
    default:
      return 'lainnya';
  }
}

/**
 * Pilih ≤ `limit` aktivitas qurban terbaru. Filter ke entitas qurban; bila
 * entry membawa `edisi_id` yang berbeda dari edisi terpilih → buang. Entry
 * tanpa `edisi_id` terdeteksi tetap disertakan (best-effort, lintas-edisi
 * tipis). Urut terbaru dulu (timestamp desc, tiebreak id desc).
 */
export function selectRecentQurbanActivity(
  entries: AuditEntry[],
  opts: { edisiId: string; limit?: number }
): AktivitasItem[] {
  const limit = opts.limit ?? 5;
  return entries
    .filter((e) => QURBAN_ENTITAS.has(e.entitas))
    .filter((e) => {
      const eid = edisiIdOfEntry(e);
      return eid == null || eid === opts.edisiId;
    })
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(0, limit)
    .map((e) => {
      const { label, tipe } = activityLabel(e);
      return { waktu: e.timestamp, label, tipe };
    });
}
