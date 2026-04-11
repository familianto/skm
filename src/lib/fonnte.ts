/**
 * Fonnte WhatsApp API Service
 *
 * Sends WhatsApp messages via Fonnte API (https://fonnte.com).
 * Falls back to mock mode when FONNTE_API_TOKEN is not set or FONNTE_MOCK=true.
 */

// Fonnte's API returns a variety of response shapes depending on tier and
// state. Known shapes include:
//   { status: true,  detail: "success! message in queue", id: ["123"], ... }
//   { status: true,  detail: "success",                                 }
//   { status: "true", detail: "..." }                 // string variant
//   { status: false, reason: "token invalid" }
// We therefore type it loosely and normalize defensively below.
interface FonnteResponse {
  status?: boolean | string;
  detail?: string;
  reason?: string;
  id?: string | string[];
  process?: string;
  target?: string | string[];
}

interface SendMessageParams {
  target: string; // Phone number (e.g., 08123456789 or 628123456789)
  message: string;
}

interface SendResult {
  success: boolean;
  detail: string;
  mock: boolean;
}

const FONNTE_API_URL = 'https://api.fonnte.com/send';

/**
 * Normalize Indonesian phone number to international format (628xxx)
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Check if Fonnte is in mock mode
 */
function isMockMode(): boolean {
  return !process.env.FONNTE_API_TOKEN || process.env.FONNTE_MOCK === 'true';
}

/**
 * Interpret a Fonnte response as success/failure.
 *
 * Fonnte returns success with `status: true` (boolean) in most cases but has
 * been observed returning the string "true" and, for some queued responses,
 * omitting `status` while setting `detail: "success! message in queue"`.
 * We accept any of these as success to avoid false negatives.
 */
function isFonnteSuccess(httpOk: boolean, data: FonnteResponse | null): boolean {
  if (!httpOk) return false;
  if (!data) return false;

  // Explicit failure signal
  if (data.status === false || data.status === 'false') return false;

  // Explicit success signals
  if (data.status === true || data.status === 'true') return true;

  // Some responses omit `status` but include a success-ish `detail`.
  if (typeof data.detail === 'string' && /success|queue|sent|terkirim/i.test(data.detail)) {
    return true;
  }

  // HTTP 2xx with no explicit failure — treat as success rather than
  // falsely alarming the user when the message actually went through.
  return httpOk && !data.reason;
}

/**
 * Send a WhatsApp message via Fonnte API
 */
export async function sendWhatsApp(params: SendMessageParams): Promise<SendResult> {
  const target = normalizePhone(params.target);

  if (isMockMode()) {
    console.log(`[FONNTE MOCK] Sending to ${target}: ${params.message.slice(0, 50)}...`);
    return {
      success: true,
      detail: `[MOCK] Pesan akan dikirim ke ${target}. Fonnte belum terkoneksi.`,
      mock: true,
    };
  }

  try {
    const response = await fetch(FONNTE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: process.env.FONNTE_API_TOKEN!,
      },
      body: new URLSearchParams({
        target,
        message: params.message,
        countryCode: '62',
      }),
    });

    // Read as text first so we can log + fall back if it's not JSON.
    const rawBody = await response.text();
    let data: FonnteResponse | null = null;
    try {
      data = rawBody ? (JSON.parse(rawBody) as FonnteResponse) : null;
    } catch {
      console.error('[FONNTE] Non-JSON response:', rawBody.slice(0, 300));
    }

    console.log('[FONNTE] Response', {
      target,
      http: response.status,
      ok: response.ok,
      body: data ?? rawBody.slice(0, 300),
    });

    const success = isFonnteSuccess(response.ok, data);
    const detail =
      (data && (data.detail || data.reason)) ||
      rawBody.slice(0, 200) ||
      (success ? 'Pesan terkirim' : `HTTP ${response.status}`);

    return {
      success,
      detail,
      mock: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FONNTE] Send error:', message);
    return {
      success: false,
      detail: `Gagal mengirim: ${message}`,
      mock: false,
    };
  }
}

/**
 * Get Fonnte connection status
 */
export function getFonnteStatus(): { connected: boolean; mock: boolean } {
  return {
    connected: !isMockMode(),
    mock: isMockMode(),
  };
}
