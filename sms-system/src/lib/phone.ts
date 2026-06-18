/**
 * Formats a raw phone string for display.
 *
 * - ≤10 digits with no leading '+': North American  →  (XXX) XXX-XXXX
 * - Starts with '+' or >10 digits: International   →  +XXX XXX XXX … (groups of 3)
 *
 * Non-digit characters (except a leading '+') are stripped before formatting,
 * so calling formatPhone on an already-formatted value is idempotent.
 */
export function formatPhone(raw: string): string {
  if (!raw) return raw;
  const isIntl = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (!digits) return isIntl ? '+' : '';

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
