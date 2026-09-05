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

// Bentuk respons `POST /device` (docs.fonnte.com — API Device Profile).
interface FonnteDeviceResponse {
  status?: boolean | string;
  device?: string;
  device_status?: string;
  quota?: string | number;
  package?: string;
  messages?: number;
  expired?: string;
  reason?: string;
  detail?: string;
}

interface SendMessageParams {
  target: string; // Phone number (e.g., 08123456789 or 628123456789)
  message: string;
  /**
   * Fonnte `delay` (detik) — "3" atau rentang acak "3-10". Pesan masuk antrean
   * di sisi Fonnte dan API langsung merespons, sehingga laju kirim ke WhatsApp
   * jadi manusiawi TANPA menahan fungsi serverless. Wajib dipakai jalur bulk.
   */
  delay?: string;
}

interface SendResult {
  success: boolean;
  detail: string;
  mock: boolean;
  /** Nomor setelah normalisasi — disimpan agar kegagalan bisa ditelusuri. */
  target: string;
  /** HTTP status Fonnte; 0 bila request tidak pernah sampai (error jaringan). */
  httpStatus: number;
  /** id pesan dari Fonnte bila ada — fondasi rekonsiliasi status kirim. */
  messageId: string;
  /**
   * Kegagalan bersifat device-level (sesi WhatsApp putus), bukan per-nomor.
   * Pemanggil bulk WAJIB berhenti saat ini true: pada insiden 2026-09-03,
   * 244 request ditembakkan ke device yang sudah mati.
   */
  deviceDisconnected: boolean;
}

/** Profil device Fonnte (`POST /device`) — dipakai sebagai pagar pra-blast. */
export interface DeviceStatus {
  /** true bila status device benar-benar terbaca (bukan tebakan). */
  ok: boolean;
  connected: boolean;
  /** Nilai mentah `device_status` Fonnte: 'connect' | 'disconnect' | ''. */
  deviceStatus: string;
  quota: string;
  paket: string;
  detail: string;
  mock: boolean;
}

const FONNTE_API_URL = 'https://api.fonnte.com/send';
const FONNTE_DEVICE_URL = 'https://api.fonnte.com/device';

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
 * Apakah alasan gagal bersifat DEVICE-level (sesi WhatsApp putus / device tidak
 * siap), bukan masalah nomor tujuan?
 *
 * Insiden 2026-09-03: 244 dari 287 target gagal dengan alasan identik
 * "request invalid on disconnected device" — device terputus di detik ke-4 dan
 * sisa request ditolak di gerbang API. Pola inilah yang harus menghentikan blast.
 */
export function isDeviceLevelFailure(detail: string): boolean {
  return /disconnect|not connected|belum terhubung|tidak terhubung|device (?:invalid|offline|not found)|no device/i.test(
    detail || ''
  );
}

/**
 * Baca status koneksi device (`POST https://api.fonnte.com/device`).
 *
 * Kontrak respons yang dipakai (docs.fonnte.com — API Device Profile):
 *   { status: true, device: "628…", device_status: "connect" | "disconnect",
 *     quota: "78", package: "Reguler", messages: 16785, expired: "…" }
 *
 * `ok: false` berarti status TIDAK terbaca (error jaringan / bentuk respons di
 * luar kontrak). Pemanggil sengaja TIDAK memblokir pengiriman pada kasus itu —
 * pagar kedua (fail-fast per pesan) tetap menahan kerusakan setelah 1 pesan,
 * dan memblokir berdasarkan parse yang tidak pasti justru mematikan fitur.
 */
export async function getDeviceStatus(): Promise<DeviceStatus> {
  if (isMockMode()) {
    return {
      ok: true,
      connected: true,
      deviceStatus: 'mock',
      quota: '',
      paket: '',
      detail: '[MOCK] Fonnte belum terkoneksi — status device tidak dicek.',
      mock: true,
    };
  }

  try {
    const response = await fetch(FONNTE_DEVICE_URL, {
      method: 'POST',
      headers: { Authorization: process.env.FONNTE_API_TOKEN! },
      body: new URLSearchParams({}),
    });

    const rawBody = await response.text();
    let data: FonnteDeviceResponse | null = null;
    try {
      data = rawBody ? (JSON.parse(rawBody) as FonnteDeviceResponse) : null;
    } catch {
      console.error('[FONNTE] /device non-JSON response:', rawBody.slice(0, 300));
    }

    console.log('[FONNTE] Device', {
      http: response.status,
      ok: response.ok,
      body: data ?? rawBody.slice(0, 300),
    });

    const deviceStatus = String(data?.device_status ?? '').toLowerCase();
    if (!response.ok || !deviceStatus) {
      return {
        ok: false,
        connected: false,
        deviceStatus,
        quota: String(data?.quota ?? ''),
        paket: String(data?.package ?? ''),
        detail:
          (data && (data.reason || data.detail)) ||
          rawBody.slice(0, 200) ||
          `HTTP ${response.status}`,
        mock: false,
      };
    }

    return {
      ok: true,
      connected: deviceStatus === 'connect',
      deviceStatus,
      quota: String(data?.quota ?? ''),
      paket: String(data?.package ?? ''),
      detail: `device_status=${deviceStatus}`,
      mock: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FONNTE] Device status error:', message);
    return {
      ok: false,
      connected: false,
      deviceStatus: '',
      quota: '',
      paket: '',
      detail: `Gagal membaca status device: ${message}`,
      mock: false,
    };
  }
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
      target,
      httpStatus: 0,
      messageId: '',
      deviceDisconnected: false,
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
        // `delay` opsional: kirim hanya bila diminta agar jalur single-send
        // (perilaku lama) tidak berubah.
        ...(params.delay ? { delay: params.delay } : {}),
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

    const rawId = data?.id;
    const messageId = Array.isArray(rawId) ? rawId[0] ?? '' : rawId ?? '';

    return {
      success,
      detail,
      mock: false,
      target,
      httpStatus: response.status,
      messageId: String(messageId),
      deviceDisconnected: !success && isDeviceLevelFailure(detail),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FONNTE] Send error:', message);
    return {
      success: false,
      detail: `Gagal mengirim: ${message}`,
      mock: false,
      target,
      httpStatus: 0,
      messageId: '',
      deviceDisconnected: false,
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
