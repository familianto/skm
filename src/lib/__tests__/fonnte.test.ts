import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendWhatsApp, getFonnteStatus } from '@/lib/fonnte';

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
