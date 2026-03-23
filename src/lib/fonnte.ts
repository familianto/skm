/**
 * Fonnte WhatsApp API Service
 *
 * Sends WhatsApp messages via Fonnte API (https://fonnte.com).
 * Falls back to mock mode when FONNTE_API_TOKEN is not set or FONNTE_MOCK=true.
 */

interface FonnteResponse {
  status: boolean;
  detail?: string;
  id?: string;
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
      }),
    });

    const data: FonnteResponse = await response.json();

    return {
      success: data.status === true,
      detail: data.detail || (data.status ? 'Pesan terkirim' : 'Gagal mengirim pesan'),
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
