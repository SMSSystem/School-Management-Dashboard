// Pure NANP (+1) phone helpers, used by the app (src/lib/phone.ts). Plain
// JavaScript so a Node .mjs script can import it directly; phoneNanp.d.ts
// carries the types. See docs/formatting/PHONE_NUMBER_FORMATTING_SPEC.md.
//
// NANP numbers are NXX-NXX-XXXX: the area code and the exchange each start
// with 2-9. +1 is the only country code beginning with 1, so any input whose
// first digit is 1 is NANP-led.

const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

// True for exactly ten digits whose area code and exchange each start 2-9.
export function isNanpValid(tenDigits) {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(tenDigits);
}

// "1" + 10 digits → "+1-XXX-XXX-XXXX", or null if the shape or NXX is invalid.
export function formatNanpDigits(digits) {
  if (!/^1\d{10}$/.test(digits)) return null;
  const ten = digits.slice(1);
  if (!isNanpValid(ten)) return null;
  return `+1-${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

// Live formatting for a digit string starting with 1: "+1", "+1-876",
// "+1-876-801", "+1-876-801-8972". Capped at 11 digits; empty parts are
// omitted so a trailing hyphen is never emitted (every prefix is a valid value).
export function formatNanpProgressive(digits) {
  const d = digits.slice(0, 11);
  if (!d) return '';
  return ['+1', d.slice(1, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join('-');
}

// True when the value's digits are exactly "1" + a NANP-valid ten.
export function isNanpPhone(value) {
  if (typeof value !== 'string') return false;
  return formatNanpDigits(onlyDigits(value)) !== null;
}

// Decide what to do with one stored or typed value.
//   ctx.institutionIsNanp: the owning institution's own phone is a +1 number
//   ctx.allowBare: whether a bare 10-digit number may be converted at all
// Returns { action: 'unchanged' }
//      or { action: 'convert', next, kind: 'explicit' | 'bare' }
//      or { action: 'skip', reason }
// A skip is something that looks convertible but fails the gate: it is never
// rewritten, and callers list it for manual follow-up. A bare 10-digit number
// that is not NANP-valid is NOT a skip (it is almost certainly not a +1 number
// at all), so it plans as unchanged and stays out of the review list.
export function planPhoneChange(raw, ctx = {}) {
  if (typeof raw !== 'string' || raw.trim() === '') return { action: 'unchanged' };
  const digits = onlyDigits(raw);

  if (digits.length === 11 && digits[0] === '1') {
    const next = formatNanpDigits(digits);
    if (next === null) return { action: 'skip', reason: 'invalid-nanp-digits' };
    return next === raw ? { action: 'unchanged' } : { action: 'convert', next, kind: 'explicit' };
  }

  if (digits.length === 10) {
    // Not NANP-shaped (area code or exchange starts 0 or 1), so most likely
    // some other country's national number: not a candidate, nothing to list.
    if (!isNanpValid(digits)) return { action: 'unchanged' };
    if (!ctx.allowBare) return { action: 'skip', reason: 'bare-not-allowed' };
    if (!ctx.institutionIsNanp) return { action: 'skip', reason: 'bare-institution-not-nanp' };
    return { action: 'convert', next: formatNanpDigits(`1${digits}`), kind: 'bare' };
  }

  return { action: 'unchanged' };
}
