/**
 * PIN policy per Tahap 3.E §3.3 + PROMPT_F01 §5.1.
 *
 * Rules (in order of evaluation):
 *  1. format     — 4–6 digit numeric only
 *  2. all_same   — '0000', '1111' rejected
 *  3. sequential — strictly ascending or descending consecutive (`1234`, `4321`,
 *                  `01234`, `54321`). Wrap-around like `0987` is NOT caught here
 *                  but listed in WEAK_BLOCKLIST where applicable.
 *  4. weak       — explicit blocklist of common weak PINs
 *
 * Used by:
 *  - A4 POST /api/auth/change-pin (validate new_pin)
 *  - U2 POST /api/pengaturan/anggota (validate initial_pin)
 *  - U5 POST /api/pengaturan/anggota/[id]/reset-pin (validate new_pin)
 */

const WEAK_BLOCKLIST = [
  '1234', '12345', '123456',
  '0000', '1111', '9999',
  '2580', '8686',
];

export type PinViolation = 'format' | 'all_same' | 'sequential' | 'weak';

export interface PinValidationResult {
  valid: boolean;
  violation?: PinViolation;
  constraint?: string;
}

export function validatePin(pin: string): PinValidationResult {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    return {
      valid: false,
      violation: 'format',
      constraint: 'PIN harus 4-6 digit numerik',
    };
  }

  if (/^(\d)\1+$/.test(pin)) {
    return {
      valid: false,
      violation: 'all_same',
      constraint: 'PIN tidak boleh semua digit sama',
    };
  }

  let isAsc = true;
  let isDesc = true;
  for (let i = 1; i < pin.length; i++) {
    const cur = pin.charCodeAt(i) - 48;
    const prev = pin.charCodeAt(i - 1) - 48;
    if (cur !== prev + 1) isAsc = false;
    if (cur !== prev - 1) isDesc = false;
  }
  if (isAsc || isDesc) {
    return {
      valid: false,
      violation: 'sequential',
      constraint: 'PIN tidak boleh berurutan',
    };
  }

  if (WEAK_BLOCKLIST.includes(pin)) {
    return {
      valid: false,
      violation: 'weak',
      constraint: 'PIN terlalu umum, gunakan kombinasi lain',
    };
  }

  return { valid: true };
}
