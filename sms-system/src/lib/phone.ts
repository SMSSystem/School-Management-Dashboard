import { formatNanpDigits, formatNanpProgressive, isNanpPhone, planPhoneChange } from './phoneNanp';

/**
 * Formats a raw phone string as the user types.
 *
 * - First digit is 1 (with or without '+'): NANP  →  +1-XXX-XXX-XXXX,
 *   progressively ("+1", "+1-876", "+1-876-801", …), capped at 11 digits. A
 *   leading 1 can only be the country code (area codes start 2-9).
 * - No '+' and ≤10 digits: domestic mask  →  (XXX) XXX-XXXX
 * - Otherwise: International  →  +XXX XXX XXX … (groups of 3, up to 15 digits)
 *
 * Non-digit characters (except a leading '+') are stripped before formatting,
 * so calling formatPhone on an already-formatted value is idempotent.
 */
export function formatPhone(raw: string): string {
  if (!raw) return raw;
  const isIntl = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (!digits) return isIntl ? '+' : '';

  if (digits[0] === '1') return formatNanpProgressive(digits);

  if (!isIntl && digits.length <= 10) {
    const d = digits.slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  // International: group digits in threes after the leading '+'
  const limited = digits.slice(0, 15);
  const groups: string[] = [];
  for (let i = 0; i < limited.length; i += 3) {
    groups.push(limited.slice(i, i + 3));
  }
  return `+${groups.join(' ')}`;
}

/**
 * Blur/submit normalisation. A bare 10-digit number can't be proven NANP, so
 * it is converted to +1-XXX-XXX-XXXX only when its area code and exchange are
 * NANP-valid AND the institution's own phone is a +1 number. Anything else —
 * including a missing or malformed institution phone — is returned unchanged.
 */
export function canonicalizePhone(
  value: string,
  ctx: { institutionPhone?: string | null },
): string {
  const plan = planPhoneChange(value, {
    institutionIsNanp: isNanpPhone(ctx.institutionPhone),
    allowBare: true,
  });
  return plan.action === 'convert' ? plan.next : value;
}

/**
 * Display-time formatting for a STORED value: NANP-shaped numbers show in the
 * canonical +1-XXX-XXX-XXXX form; everything else is returned exactly as
 * stored (an unknown value is never regrouped).
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  return formatNanpDigits(raw.replace(/\D/g, '')) ?? raw;
}

/** A tel: URI from a phone string: a leading '+' and digits only. */
export function telHref(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return `tel:${raw.trimStart().startsWith('+') ? '+' : ''}${digits}`;
}
