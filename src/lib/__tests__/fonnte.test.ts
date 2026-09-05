import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendWhatsApp, getFonnteStatus, getDeviceStatus, isDeviceLevelFailure } from '@/lib/fonnte';

/**
 * Fonnte client behaviour. The HTTP layer is ALWAYS mocked — these tests never
 * hit the real Fonnte API. `process.env` + `global.fetch` are restored after
 * each case.
 */

const ORIG = {
  token: process.env.FONNTE_API_TOKEN,
  mock: process.env.FONNTE_MOCK,
  fetch: global.fetch,
};

function restore(): void {
  if (ORIG.token === undefined) delete process.env.FONNTE_API_TOKEN;
  else process.env.FONNTE_API_TOKEN = ORIG.token;
  if (ORIG.mock === undefined) delete process.env.FONNTE_MOCK;
  else process.env.FONNTE_MOCK = ORIG.mock;
  global.fetch = ORIG.fetch;
}

test('mock mode when token absent — graceful skip, no network call', async () => {
  delete process.env.FONNTE_API_TOKEN;
  delete process.env.FONNTE_MOCK;
  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error('network must not be called in mock mode');
  }) as typeof fetch;
  try {
    const res = await sendWhatsApp({ target: '08123456789', message: 'hi' });
    assert.equal(res.mock, true);
    assert.equal(res.success, true);
    assert.equal(called, false);
    assert.equal(getFonnteStatus().mock, true);
  } finally {
    restore();
  }
});

test('real mode: success via mocked fetch, phone normalized in body', async () => {
  process.env.FONNTE_API_TOKEN = 'test-token';
  delete process.env.FONNTE_MOCK;
  let sentBody: URLSearchParams | undefined;
  global.fetch = (async (...args: Parameters<typeof fetch>) => {
    sentBody = args[1]?.body as URLSearchParams;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: true, detail: 'success! message in queue' }),
    } as unknown as Response;
  }) as typeof fetch;
  try {
    const res = await sendWhatsApp({ target: '08123456789', message: 'halo' });
    assert.equal(res.mock, false);
    assert.equal(res.success, true);
    assert.equal(sentBody?.get('target'), '628123456789');
  } finally {
    restore();
  }
});

test('real mode: status=false → success=false', async () => {
  process.env.FONNTE_API_TOKEN = 'test-token';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: false, reason: 'token invalid' }),
    } as unknown as Response)) as typeof fetch;
  try {
    const res = await sendWhatsApp({ target: '08123', message: 'x' });
    assert.equal(res.success, false);
  } finally {
    restore();
  }
});

test('real mode: network error → success=false, never throws', async () => {
  process.env.FONNTE_API_TOKEN = 'test-token';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () => {
    throw new Error('boom');
  }) as typeof fetch;
  try {
    const res = await sendWhatsApp({ target: '08123', message: 'x' });
    assert.equal(res.success, false);
  } finally {
    restore();
  }
});

// ── P0-2/P0-3: pagar device + throttle (insiden 2026-09-03) ─────────────────

test('isDeviceLevelFailure: alasan insiden dikenali, alasan per-nomor tidak', () => {
  assert.equal(isDeviceLevelFailure('request invalid on disconnected device'), true);
  assert.equal(isDeviceLevelFailure('device not connected'), true);
  assert.equal(isDeviceLevelFailure('no device'), true);
  // Bukan device-level: masalah kuota / token / nomor tujuan.
  assert.equal(isDeviceLevelFailure('out of quota'), false);
  assert.equal(isDeviceLevelFailure('token invalid'), false);
  assert.equal(isDeviceLevelFailure('success! message in queue'), false);
  assert.equal(isDeviceLevelFailure(''), false);
});

test('send: gagal device-level menandai deviceDisconnected + membawa HTTP status', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () =>
    new Response(JSON.stringify({ status: false, reason: 'request invalid on disconnected device' }), {
      status: 200,
    })) as typeof fetch;
  try {
    const res = await sendWhatsApp({ target: '628111882151', message: 'hi' });
    assert.equal(res.success, false);
    assert.equal(res.deviceDisconnected, true);
    assert.equal(res.httpStatus, 200);
    assert.equal(res.target, '628111882151');
  } finally {
    restore();
  }
});

test('send: sukses menyimpan id pesan Fonnte untuk rekonsiliasi status', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () =>
    new Response(JSON.stringify({ status: true, detail: 'success! message in queue', id: ['12345'] }), {
      status: 200,
    })) as typeof fetch;
  try {
    const res = await sendWhatsApp({ target: '08123456789', message: 'hi' });
    assert.equal(res.success, true);
    assert.equal(res.messageId, '12345');
    assert.equal(res.deviceDisconnected, false);
  } finally {
    restore();
  }
});

test('send: parameter delay hanya ikut terkirim bila diminta', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  delete process.env.FONNTE_MOCK;
  const bodies: string[] = [];
  global.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return new Response(JSON.stringify({ status: true, detail: 'success' }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    await sendWhatsApp({ target: '08123456789', message: 'hi' });
    await sendWhatsApp({ target: '08123456789', message: 'hi', delay: '3-10' });
    assert.equal(bodies[0].includes('delay'), false);
    assert.match(bodies[1], /delay=3-10/);
  } finally {
    restore();
  }
});

// ── getDeviceStatus ─────────────────────────────────────────────────────────

test('device: mock mode tidak menyentuh jaringan dan dianggap terhubung', async () => {
  delete process.env.FONNTE_API_TOKEN;
  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error('network must not be called in mock mode');
  }) as typeof fetch;
  try {
    const res = await getDeviceStatus();
    assert.equal(res.mock, true);
    assert.equal(res.connected, true);
    assert.equal(called, false);
  } finally {
    restore();
  }
});

test('device: device_status connect/disconnect dibaca apa adanya', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({ status: true, device: '62822608345', device_status: 'disconnect', quota: '985', package: 'Lite' }),
      { status: 200 }
    )) as typeof fetch;
  try {
    const res = await getDeviceStatus();
    assert.equal(res.ok, true);
    assert.equal(res.connected, false);
    assert.equal(res.deviceStatus, 'disconnect');
    assert.equal(res.quota, '985');
    assert.equal(res.paket, 'Lite');
  } finally {
    restore();
  }
});

test('device: bentuk respons di luar kontrak → ok=false (tidak memblokir kirim)', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () => new Response('<html>maintenance</html>', { status: 200 })) as typeof fetch;
  try {
    const res = await getDeviceStatus();
    assert.equal(res.ok, false);
    assert.equal(res.connected, false);
  } finally {
    restore();
  }
});

test('device: error jaringan tidak melempar', async () => {
  process.env.FONNTE_API_TOKEN = 'tok';
  delete process.env.FONNTE_MOCK;
  global.fetch = (async () => { throw new Error('ECONNRESET'); }) as typeof fetch;
  try {
    const res = await getDeviceStatus();
    assert.equal(res.ok, false);
    assert.match(res.detail, /ECONNRESET/);
  } finally {
    restore();
  }
});
