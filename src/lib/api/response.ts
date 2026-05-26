/**
 * Standard API response envelope per Tahap 3.E §2.2.
 *
 * Success: `{ ok: true, data, meta? }`
 * Error:   `{ ok: false, error: { code, message, details? } }`
 *
 * All Modul Qurban endpoints (F1+) MUST use these helpers.
 * Existing SKM endpoints retain their `{ success, data | error }` shape until
 * migrated incrementally.
 */

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    page_size?: number;
    has_more?: boolean;
    filters_applied?: Record<string, unknown>;
    /** Non-fatal advisory (e.g. PS5 cancel: peserta masih punya pembayaran). */
    warning?: string;
  };
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function success<T>(
  data: T,
  meta?: ApiSuccess<T>['meta'],
  init?: ResponseInit
): Response {
  const body: ApiSuccess<T> =
    meta !== undefined ? { ok: true, data, meta } : { ok: true, data };
  return Response.json(body, init);
}

export function error(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
  init?: Omit<ResponseInit, 'status'>
): Response {
  const body: ApiError = {
    ok: false,
    error:
      details !== undefined ? { code, message, details } : { code, message },
  };
  return Response.json(body, { ...init, status });
}
