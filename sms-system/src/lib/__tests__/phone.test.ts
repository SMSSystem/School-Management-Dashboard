import { describe, expect, it } from 'vitest';
import { canonicalizePhone, formatPhone, formatPhoneForDisplay, telHref } from '../phone';

// Characterization tests: the behaviour of the branches this work leaves
// alone (the domestic mask and the generic international grouping). Written
// against the code before the NANP change so "unchanged" has a baseline.
describe('formatPhone: domestic mask (no "+", numbers not starting with 1)', () => {
  it.each([
    ['8', '8'],
    ['876', '876'],
    ['8768', '(876) 8'],
    ['876801', '(876) 801'],
    ['8768018', '(876) 801-8'],
    ['8768018972', '(876) 801-8972'],
    ['(876) 801-8972', '(876) 801-8972'],
  ])('%s → %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });
});

describe('formatPhone: generic international grouping (non-NANP)', () => {
  it.each([
    ['+442071234567', '+442 071 234 567'],
    ['+44 20 7123 4567', '+442 071 234 567'],
    ['+2348012345678', '+234 801 234 567 8'],
  ])('%s → %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it('caps the digits at 15', () => {
    expect(formatPhone('+4412345678901234567')).toBe('+441 234 567 890 123');
  });

  it('returns "+" for a lone plus and "" for non-digit input', () => {
    expect(formatPhone('+')).toBe('+');
    expect(formatPhone('abc')).toBe('');
    expect(formatPhone('')).toBe('');
  });

  it('is idempotent', () => {
    for (const input of ['+442071234567', '8768018972', '+2348012345678']) {
      const once = formatPhone(input);
      expect(formatPhone(once)).toBe(once);
    }
  });
});

describe('formatPhone: NANP-led input (first digit 1) formats progressively', () => {
  const steps: Array<[string, string]> = [
    ['1', '+1'],
    ['18', '+1-8'],
    ['187', '+1-87'],
    ['1876', '+1-876'],
    ['18768', '+1-876-8'],
    ['187680', '+1-876-80'],
    ['1876801', '+1-876-801'],
    ['18768018', '+1-876-801-8'],
    ['187680189', '+1-876-801-89'],
    ['1876801897', '+1-876-801-897'],
    ['18768018972', '+1-876-801-8972'],
  ];

  it.each(steps)('digits %s → %s', (digits, expected) => {
    expect(formatPhone(digits)).toBe(expected);
  });

  it.each(steps)('with a leading "+": digits %s → %s', (digits, expected) => {
    expect(formatPhone(`+${digits}`)).toBe(expected);
  });

  it('fixes the reported malformed value', () => {
    expect(formatPhone('+187 680 189 72')).toBe('+1-876-801-8972');
  });

  it('ignores a twelfth digit', () => {
    expect(formatPhone('+1-876-801-8972')).toBe('+1-876-801-8972');
    expect(formatPhone('187680189723')).toBe('+1-876-801-8972');
  });

  it('is idempotent across every step', () => {
    for (const [, formatted] of steps) {
      expect(formatPhone(formatted)).toBe(formatted);
    }
  });

  it('never leaves a trailing separator, so deleting characters one at a time works', () => {
    let value = '+1-876-801-8972';
    const seen: string[] = [value];
    while (value.length > 0) {
      value = formatPhone(value.slice(0, -1));
      seen.push(value);
    }
    expect(seen).toEqual([
      '+1-876-801-8972',
      '+1-876-801-897',
      '+1-876-801-89',
      '+1-876-801-8',
      '+1-876-801',
      '+1-876-80',
      '+1-876-8',
      '+1-876',
      '+1-87',
      '+1-8',
      '+1',
      '+',
      '',
    ]);
  });
});

describe('canonicalizePhone', () => {
  const nanpInstitution = { institutionPhone: '+1-876-801-8972' };

  it('converts a valid bare number when the institution is NANP', () => {
    expect(canonicalizePhone('(876) 555-0123', nanpInstitution)).toBe('+1-876-555-0123');
  });

  it('leaves a bare number alone when the institution phone is missing, malformed or not NANP', () => {
    for (const institutionPhone of [undefined, null, '', 'abc', '+442071234567', '(876) 801-8972']) {
      expect(canonicalizePhone('(876) 555-0123', { institutionPhone })).toBe('(876) 555-0123');
    }
  });

  it('leaves a bare number with an invalid area code or exchange alone', () => {
    expect(canonicalizePhone('(076) 555-0123', nanpInstitution)).toBe('(076) 555-0123');
    expect(canonicalizePhone('(876) 155-0123', nanpInstitution)).toBe('(876) 155-0123');
  });

  it('leaves non-NANP and partial values alone', () => {
    expect(canonicalizePhone('+442 071 234 567', nanpInstitution)).toBe('+442 071 234 567');
    expect(canonicalizePhone('(876) 555', nanpInstitution)).toBe('(876) 555');
    expect(canonicalizePhone('', nanpInstitution)).toBe('');
  });

  it('is idempotent on an already canonical value', () => {
    expect(canonicalizePhone('+1-876-555-0123', nanpInstitution)).toBe('+1-876-555-0123');
  });
});

describe('formatPhoneForDisplay', () => {
  it('shows a NANP-shaped stored value in the canonical form', () => {
    expect(formatPhoneForDisplay('+187 680 189 72')).toBe('+1-876-801-8972');
    expect(formatPhoneForDisplay('1 (876) 801-8972')).toBe('+1-876-801-8972');
  });

  it('returns anything else exactly as stored', () => {
    for (const stored of ['+44 20 7123 4567', '(876) 801-8972', '555-0100', '—', '+1-000-555-0123']) {
      expect(formatPhoneForDisplay(stored)).toBe(stored);
    }
  });

  it('returns an empty string for null, undefined and empty', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
    expect(formatPhoneForDisplay('')).toBe('');
  });
});

describe('telHref', () => {
  it('keeps a leading plus and digits only', () => {
    expect(telHref('+1-876-801-8972')).toBe('tel:+18768018972');
    expect(telHref('(876) 801-8972')).toBe('tel:8768018972');
  });

  it('returns an empty string when there is nothing to dial', () => {
    expect(telHref('')).toBe('');
    expect(telHref(null)).toBe('');
    expect(telHref('—')).toBe('');
  });
});
