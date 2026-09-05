import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/reminder/send/route';
import { SESSION_COOKIE_NAME, createSessionToken, type SessionPayload } from '@/lib/api/auth';
import { PERAN } from '@/lib/api/permissions';
import { SHEET_NAMES } from '@/lib/constants';
import { __testing__ } from '@/lib/google-sheets';
import { ReminderStatus } from '@/types';
import type { sheets_v4 } from 'googleapis';

/**
 * Handler-level: pagar yang lahir dari insiden blast 2026-09-03.
 * Sheets DAN Fonnte sepenuhnya di-mock — tes ini tidak pernah menyentuh
 * jaringan maupun spreadsheet sungguhan.
 */

type Cell = string | number | boolean;

interface Capture {
  appends: Array<{ range: string; values: Cell[][] }>;
}

const ORIG_FETCH = global.fetch;

function installSheets(donaturRows: Cell[][], opts: { appendFails?: boolean } = {}): Capture {
  const capture: Capture = { appends: [] };
  const rowsFor = (range: string): Cell[][] =>
    range.startsWith(SHEET_NAMES.DONATUR) ? donaturRows.map((r) => [...r]) : [];

  const client = {
    spreadsheets: {
      values: {
        get: async (req: { range: string }) => ({ data: { values: rowsFor(req.range) } }),
        append: async (req: { range: string; requestBody: { values: Cell[][] } }) => {
          if (opts.appendFails && req.range.startsWith(SHEET_NAMES.REMINDER)) {
            throw new Error('Quota exceeded for quota metric');
          }
          capture.appends.push({ range: req.range, values: req.requestBody.values });
          return { data: {} };
        },
      },
    },
  };
  __testing__.setClient(client as unknown as sheets_v4.Sheets);
  return capture;
}

/** Baris sheet `donatur`: id, nama, telepon, alamat, kelompok, komitmen, catatan, is_active, … */
function donatur(id: string, nama: string, telepon: string): Cell[] {
  return [id, nama, telepon, 'Jatinegara Baru', '1', '0', '', 'TRUE', '', ''];
}

/** Fonnte: `n` panggilan pertama sukses, sisanya gagal device-level. */
function mockFonnte(successBefore: number): { calls: string[] } {
  const calls: string[] = [];
  global.fetch = (async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/device')) {
      return new Response(JSON.stringify({ status: true, device_status: 'connect', quota: '985' }), { status: 200 });
    }
    calls.push(String(init.body));
    if (calls.length <= successBefore) {
      return new Response(JSON.stringify({ status: true, detail: 'success! message in queue', id: ['9'] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ status: false, reason: 'request invalid on disconnected device' }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;
  return { calls };
}

async function makeReq(body: unknown): Promise<NextRequest> {
  if (!process.env.SESSION_SECRET && !process.env.AUTH_SECRET) {
    process.env.SESSION_SECRET = 'test-secret-reminder';
  }
  const payload: SessionPayload = {
    user_id: 'ANG-1', peran: PERAN.BENDAHARA, role: PERAN.BENDAHARA, masjidName: 'Masjid Uji',
  };
  const token = await createSessionToken(payload);
  return new NextRequest('http://localhost/api/reminder/send', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  __testing__.reset();
  global.fetch = ORIG_FETCH;
  delete process.env.FONNTE_API_TOKEN;
  delete process.env.FONNTE_MOCK;
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `DON-${i + 1}`);
const rowsFor = (n: number) =>
  Array.from({ length: n }, (_, i) => donatur(`DON-${i + 1}`, `Warga ${i + 1}`, `62811000${String(i).padStart(4, '0')}`));

// ── P0-1: fail-fast ─────────────────────────────────────────────────────────

test('fail-fast: device putus di tengah → loop berhenti, sisanya DILEWATI', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(10));
  const fonnte = mockFonnte(3); // 3 sukses, panggilan ke-4 gagal device-level

  const res = await POST(await makeReq({ donatur_ids: ids(10), tipe: 'DONASI_RUTIN', pesan: 'Halo {nama}' }));
  const json = await res.json();

  assert.equal(res.status, 201);
  assert.equal(json.data.terkirim, 3);
  assert.equal(json.data.gagal, 1);        // yang memicu deteksi tetap tercatat GAGAL
  assert.equal(json.data.dilewati, 6);     // sisanya tidak ditembakkan ke device mati
  assert.equal(json.data.stopped, true);
  // Bukti utama: hanya 4 request kirim yang pernah dibuat, bukan 10.
  assert.equal(fonnte.calls.length, 4);
});

test('fail-fast: alasan DILEWATI menjelaskan sebabnya', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(5));
  mockFonnte(1);

  const res = await POST(await makeReq({ donatur_ids: ids(5), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();
  const dilewati = json.data.reminders.filter((r: { status_kirim: string }) => r.status_kirim === ReminderStatus.DILEWATI);
  assert.equal(dilewati.length, 3);
  assert.match(dilewati[0].error_message, /device WhatsApp terputus/i);
});

// ── P0-2: pagar device ──────────────────────────────────────────────────────

test('pagar device: status disconnect → 503 tanpa mengirim satu pesan pun', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(5));
  const sends: string[] = [];
  global.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith('/device')) {
      return new Response(JSON.stringify({ status: true, device_status: 'disconnect' }), { status: 200 });
    }
    sends.push(String(init.body));
    return new Response(JSON.stringify({ status: true, detail: 'success' }), { status: 200 });
  }) as unknown as typeof fetch;

  const res = await POST(await makeReq({ donatur_ids: ids(5), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();

  assert.equal(res.status, 503);
  assert.equal(json.success, false);
  assert.match(json.error, /terputus/i);
  assert.equal(sends.length, 0);
});

test('pagar device: status tak terbaca tidak memblokir pengiriman', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(2));
  global.fetch = (async (url: string) => {
    if (String(url).endsWith('/device')) return new Response('<html>maintenance</html>', { status: 200 });
    return new Response(JSON.stringify({ status: true, detail: 'success! message in queue' }), { status: 200 });
  }) as unknown as typeof fetch;

  const res = await POST(await makeReq({ donatur_ids: ids(2), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();
  assert.equal(json.data.terkirim, 2);
  assert.equal(json.data.device_checked, false);
});

// ── P0-3 + P1-1 + P1-3 ──────────────────────────────────────────────────────

test('delay dikirim ke Fonnte pada jalur bulk', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(2));
  const fonnte = mockFonnte(2);
  await POST(await makeReq({ donatur_ids: ids(2), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  assert.match(fonnte.calls[0], /delay=3-10/);
});

test('sheets: satu appendRows untuk seluruh chunk, ID berurutan', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  const capture = installSheets(rowsFor(5));
  mockFonnte(5);

  const res = await POST(await makeReq({ donatur_ids: ids(5), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();

  const logAppends = capture.appends.filter((a) => a.range.startsWith(SHEET_NAMES.REMINDER));
  assert.equal(logAppends.length, 1);            // dulu: 5 append + 5 baca
  assert.equal(logAppends[0].values.length, 5);
  assert.equal(logAppends[0].values[0].length, 11); // 11 kolom termasuk target/http_status/fonnte_id
  const rowIds = json.data.reminders.map((r: { id: string }) => r.id);
  assert.equal(new Set(rowIds).size, 5);
});

test('nomor tidak valid ditandai lokal tanpa memanggil Fonnte', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets([
    donatur('DON-1', 'Valid', '628111882151'),
    donatur('DON-2', 'Pendek', '0812'),
    donatur('DON-3', 'Huruf', 'tidak ada'),
  ]);
  const fonnte = mockFonnte(10);

  const res = await POST(await makeReq({ donatur_ids: ['DON-1', 'DON-2', 'DON-3'], tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();

  assert.equal(json.data.terkirim, 1);
  assert.equal(json.data.gagal, 2);
  assert.equal(fonnte.calls.length, 1); // hanya nomor valid yang menghabiskan kuota
  const invalid = json.data.reminders.find((r: { donatur_id: string }) => r.donatur_id === 'DON-2');
  assert.match(invalid.error_message, /tidak valid/i);
});

test('batas keras: >50 target ditolak sebelum menyentuh sheet', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(60));
  mockFonnte(60);
  const res = await POST(await makeReq({ donatur_ids: ids(60), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();
  assert.equal(res.status, 400);
  assert.match(json.error, /Maksimal 50/);
});

// ── P2-2: observability ─────────────────────────────────────────────────────

test('gagal tulis reminder_log dilaporkan, bukan hilang diam-diam', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  installSheets(rowsFor(3), { appendFails: true });
  mockFonnte(3);
  const res = await POST(await makeReq({ donatur_ids: ids(3), tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const json = await res.json();
  assert.equal(json.success, true);          // pesan sudah terlanjur dikirim
  assert.equal(json.data.log_persisted, false);
  assert.equal(json.data.terkirim, 3);
});

test('baris log menyimpan nomor tujuan, HTTP status, dan id Fonnte', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  const capture = installSheets([donatur('DON-1', 'Warga', '081219305550')]);
  mockFonnte(1);
  await POST(await makeReq({ donatur_ids: ['DON-1'], tipe: 'DONASI_RUTIN', pesan: 'Halo' }));
  const row = capture.appends.filter((a) => a.range.startsWith(SHEET_NAMES.REMINDER))[0].values[0];
  assert.equal(row[8], '6281219305550');  // target ternormalisasi
  assert.equal(row[9], '200');            // http_status
  assert.equal(row[10], '9');             // fonnte_id
});

test('sesi wajib: tanpa cookie → 401', async () => {
  const res = await POST(
    new NextRequest('http://localhost/api/reminder/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ donatur_ids: ['DON-1'], tipe: 'DONASI_RUTIN', pesan: 'Halo' }),
    })
  );
  assert.equal(res.status, 401);
});
