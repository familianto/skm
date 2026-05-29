import type { sheets_v4 } from 'googleapis';
import { NextRequest } from 'next/server';

import { __testing__ } from '@/lib/google-sheets';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  type SessionPayload,
} from '@/lib/api/auth';
import { PERAN } from '@/lib/api/permissions';
import { QURBAN_SHEETS } from '@/lib/qurban/sheets';
import { SHEET_NAMES } from '@/lib/constants';

import { edisiToRow, type Edisi } from '@/lib/qurban/edisi-repo';
import { mapPesertaToRow } from '@/lib/qurban/peserta-repo';
import { mapDaftarHewanToRow } from '@/lib/qurban/daftar-hewan-repo';
import { mapMasterHewanToRow, type QurbanMasterHewan } from '@/lib/qurban/master-hewan-repo';
import { mapMuqoribToRow, type QurbanMuqorib } from '@/lib/qurban/muqorib-repo';
import type { QurbanPeserta } from '@/lib/qurban/peserta-types';
import type { QurbanDaftarHewan } from '@/lib/qurban/daftar-hewan-types';

/**
 * Test harness for PM1/PM2 handler-level integration tests (F5b polish).
 *
 * Approach (Opsi A): inject a mock googleapis client into the `sheetsService`
 * singleton via the stable `__testing__` hook — no module mocking, no
 * `--experimental-test-module-mocks`. Every repo that imports `sheetsService`
 * (edisi/peserta/hewan/master/muqorib/audit) then reads/writes against the
 * canned `SheetDb` and records writes into a `MockCapture`.
 *
 * Canned rows are produced by the REAL row mappers (`edisiToRow`,
 * `mapPesertaToRow`, …) so column order/parse round-trips exactly like prod —
 * the test data can't silently drift from the schema.
 */

// ── Mock Sheets client ──────────────────────────────────────────────────────

type Cell = string | number | boolean;
/** sheetName → data rows (NO header row; data starts at sheet row 2). */
export type SheetDb = Record<string, Cell[][]>;

export interface BatchUpdateBody {
  valueInputOption: string;
  data: Array<{ range: string; values: Cell[][] }>;
}

export interface MockCapture {
  /** Captured `spreadsheets.values.batchUpdate` request bodies (PM1 atomic write). */
  batchUpdates: BatchUpdateBody[];
  /** Captured `spreadsheets.values.append` calls (audit log writes). */
  appends: Array<{ range: string; values: Cell[][] }>;
  /** Captured single-range `spreadsheets.values.update` calls. */
  updates: Array<{ range: string; values: Cell[][] }>;
}

function sheetOf(range: string): string {
  return range.split('!')[0];
}

function buildMockClient(db: SheetDb, capture: MockCapture): sheets_v4.Sheets {
  const rowsFor = (range: string): Cell[][] => {
    const rows = db[sheetOf(range)];
    return rows ? rows.map((r) => [...r]) : [];
  };

  const client = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async (req: { range: string }) => ({
          data: { values: rowsFor(req.range) },
        }),
        batchGet: async (req: { ranges: string[] }) => ({
          data: {
            valueRanges: req.ranges.map((r) => ({ values: rowsFor(r) })),
          },
        }),
        append: async (req: { range: string; requestBody: { values: Cell[][] } }) => {
          capture.appends.push({ range: req.range, values: req.requestBody.values });
          return { data: {} };
        },
        update: async (req: { range: string; requestBody: { values: Cell[][] } }) => {
          capture.updates.push({ range: req.range, values: req.requestBody.values });
          return { data: {} };
        },
        batchUpdate: async (req: { requestBody: BatchUpdateBody }) => {
          capture.batchUpdates.push(req.requestBody);
          return { data: {} };
        },
      },
    },
  };
  // Partial googleapis shape — only the surface the repos touch is implemented.
  return client as unknown as sheets_v4.Sheets;
}

export function installMockSheets(db: SheetDb): MockCapture {
  const capture: MockCapture = { batchUpdates: [], appends: [], updates: [] };
  __testing__.setClient(buildMockClient(db, capture));
  return capture;
}

export function resetMockSheets(): void {
  __testing__.reset();
}

// ── Row helpers (turn domain factories into SheetDb rows) ───────────────────

export function edisiRows(...edisi: Edisi[]): Cell[][] {
  return edisi.map((e) => edisiToRow(e));
}
export function pesertaRows(...peserta: QurbanPeserta[]): Cell[][] {
  return peserta.map((p) => mapPesertaToRow(p));
}
export function hewanRows(...hewan: QurbanDaftarHewan[]): Cell[][] {
  return hewan.map((h) => mapDaftarHewanToRow(h));
}
export function masterRows(...master: QurbanMasterHewan[]): Cell[][] {
  return master.map((m) => mapMasterHewanToRow(m) as Cell[]);
}
export function muqoribRows(...muqorib: QurbanMuqorib[]): Cell[][] {
  return muqorib.map((m) => mapMuqoribToRow(m) as Cell[]);
}

// Re-export sheet name constants so tests build the `SheetDb` keys without
// duplicating the literals.
export const SHEETS = {
  EDISI: QURBAN_SHEETS.EDISI,
  PESERTA: QURBAN_SHEETS.PESERTA,
  DAFTAR_HEWAN: QURBAN_SHEETS.DAFTAR_HEWAN,
  MASTER_HEWAN: QURBAN_SHEETS.MASTER_HEWAN,
  MUQORIB: QURBAN_SHEETS.MUQORIB,
  AUDIT_LOG: SHEET_NAMES.AUDIT_LOG,
} as const;

// ── Domain factories ────────────────────────────────────────────────────────

const NOW = '2026-05-01T00:00:00.000Z';

export function makeEdisi(over: Partial<Edisi> = {}): Edisi {
  return {
    id: 'EDS-1',
    tahun_hijriah: '1447H',
    tahun_masehi: 2026,
    tanggal_idul_adha: '2026-06-06',
    tanggal_pendaftaran_buka: '2026-04-01',
    tanggal_pendaftaran_tutup: '2026-05-30',
    status: 'AKTIF',
    parent_edisi_id: '',
    cloned_at: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    pemetaan_version: 'VER-1',
    ...over,
  };
}

export function makeMaster(over: Partial<QurbanMasterHewan> = {}): QurbanMasterHewan {
  return {
    id: 'MHW-1',
    edisi_id: 'EDS-1',
    jenis: 'SAPI',
    kelas: 'A',
    kapasitas_slot: 7,
    harga_beli: 7_000_000, // → 1.000.000 per slot
    harga_bawa_sendiri: 500_000,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    ...over,
  };
}

export function makeHewan(over: Partial<QurbanDaftarHewan> = {}): QurbanDaftarHewan {
  return {
    id: 'HWN-1',
    edisi_id: 'EDS-1',
    master_hewan_id: 'MHW-1',
    jenis: 'SAPI',
    kelas: 'A',
    nomor_urut: 1,
    kapasitas_slot: 7,
    tipe_pembelian: 'BELI',
    vendor_nama: 'Vendor',
    harga_beli_aktual: 7_000_000,
    tanggal_pembelian: '2026-04-10',
    status: 'AKTIF',
    notes: '',
    nomor_urut_pemotongan: null,
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    ...over,
  };
}

export function makePeserta(over: Partial<QurbanPeserta> = {}): QurbanPeserta {
  return {
    id: 'PST-1',
    edisi_id: 'EDS-1',
    muqorib_id: 'MQR-1',
    hewan_id: 'HWN-1',
    slot_number: 1,
    tipe_qurban: 'BELI',
    nama_atas_nama: 'Fulan',
    keterangan_bagian: '',
    harga_disepakati: 1_000_000,
    kode_bayar: 'QRB-2026-001',
    sumber_pendaftaran: 'PANITIA',
    status_pendaftaran: 'TERDAFTAR',
    tanggal_daftar: NOW,
    notes: '',
    created_at: NOW,
    updated_at: NOW,
    created_by: 'ANG-1',
    ...over,
  };
}

export function makeMuqorib(over: Partial<QurbanMuqorib> = {}): QurbanMuqorib {
  return {
    id: 'MQR-1',
    nama_lengkap: 'Fulan bin Fulan',
    alamat: 'Jl. Masjid',
    rt: '001',
    no_hp: '628123456789',
    is_active: true,
    data_induk_ref_1447h: '',
    notes: '',
    created_at: NOW,
    created_by: 'ANG-1',
    updated_at: NOW,
    ...over,
  };
}

// ── Request builders ────────────────────────────────────────────────────────

/** Test session secret — set lazily; `getSessionSecret()` reads env at call time. */
export function ensureSessionSecret(): void {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-pemetaan-handler';
  }
}

async function sessionCookie(peran: string): Promise<string> {
  ensureSessionSecret();
  const payload: SessionPayload = {
    user_id: 'ANG-1',
    peran,
    role: peran,
    masjidName: 'Masjid Uji',
  };
  const token = await createSessionToken(payload);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** POST NextRequest with a signed session cookie + JSON body. */
export async function makePostRequest(
  body: unknown,
  peran: string = PERAN.PENDAFTARAN
): Promise<NextRequest> {
  const cookie = await sessionCookie(peran);
  return new NextRequest('http://localhost/api/qurban/pemetaan/batch-save', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

/** GET NextRequest with a signed session cookie + `?edisi_id=`. */
export async function makeGetRequest(
  edisiId: string,
  peran: string = PERAN.PENDAFTARAN
): Promise<NextRequest> {
  const cookie = await sessionCookie(peran);
  const url = new URL('http://localhost/api/qurban/pemetaan/state');
  if (edisiId) url.searchParams.set('edisi_id', edisiId);
  return new NextRequest(url, {
    method: 'GET',
    headers: { cookie },
  });
}

/** Parse a handler `Response` into `{ status, body }`. */
export async function readResponse(
  res: Response
): Promise<{ status: number; body: { ok: boolean; data?: unknown; error?: { code: string; message: string; details?: Record<string, unknown> } } }> {
  const body = await res.json();
  return { status: res.status, body };
}
