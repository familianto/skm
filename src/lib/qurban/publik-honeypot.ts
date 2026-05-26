/**
 * Honeypot bot-trap for the public pendaftaran form (F4b, captcha MVP).
 *
 * Zero-dependency anti-spam: the form (rendered in F4c) includes a hidden field
 * that real users never see and therefore leave empty, while naive bots that
 * auto-fill every input will populate it. The PB3 daftar handler (Milestone B)
 * rejects any submission where this field is non-empty.
 *
 * `email` is chosen because the pendaftaran form does NOT collect an email —
 * so a plausible-looking field name that is guaranteed unused by the real form.
 * Contract for Milestone A: the field name + the "must be empty" rule.
 */
export const HONEYPOT_FIELD = 'email';

/**
 * `true` when the honeypot field is filled → treat the submission as a bot.
 * A missing field, or a string that is empty/whitespace-only, is NOT a bot.
 * Any other present non-null value is treated as filled.
 */
export function isHoneypotTriggered(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}
