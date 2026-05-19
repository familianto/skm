/**
 * Phone normalization per Tahap 3.E §3.4.
 *
 * Accepts variants commonly used by Indonesian users:
 *   `08xxx`, `8xxx`, `+628xxx`, `628xxx`, with spaces / hyphens / parens.
 *
 * Returns canonical `628xxxxxxxxxx` (no `+`, no spaces).
 *
 * Post-normalize validation: must match `^628\d{8,12}$`
 * (so total length is 11-15 digits including the `62` prefix).
 */

export function normalizePhone(input: string): string {
  if (typeof input !== 'string') return '';
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('08')) return '62' + digits.substring(1);
  if (digits.startsWith('8')) return '62' + digits;
  if (digits.startsWith('0')) return '62' + digits.substring(1);
  return digits;
}

export function validatePhone(phone: string): boolean {
  return /^628\d{8,12}$/.test(phone);
}
