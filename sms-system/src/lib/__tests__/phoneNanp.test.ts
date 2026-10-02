import { describe, expect, it } from 'vitest';
import { formatNanpDigits, isNanpPhone, isNanpValid, planPhoneChange } from '../phoneNanp';

describe('isNanpValid', () => {
  it('requires the area code and the exchange to start 2-9', () => {
    expect(isNanpValid('8765550123')).toBe(true);
    expect(isNanpValid('0765550123')).toBe(false);
    expect(isNanpValid('1765550123')).toBe(false);
    expect(isNanpValid('8760550123')).toBe(false);
    expect(isNanpValid('8761550123')).toBe(false);
  });

  it('requires exactly ten digits', () => {
    expect(isNanpValid('876555012')).toBe(false);
    expect(isNanpValid('87655501234')).toBe(false);
    expect(isNanpValid('876555012a')).toBe(false);
  });
});

describe('formatNanpDigits / isNanpPhone', () => {
  it('formats 1 + a valid ten as +1-XXX-XXX-XXXX', () => {
    expect(formatNanpDigits('18768018972')).toBe('+1-876-801-8972');
  });

  it('returns null for the wrong shape or an invalid NXX', () => {
    expect(formatNanpDigits('8768018972')).toBeNull();
    expect(formatNanpDigits('10005550123')).toBeNull();
    expect(formatNanpDigits('442071234567')).toBeNull();
  });

  it('detects a NANP phone through any separators', () => {
    expect(isNanpPhone('+1-876-801-8972')).toBe(true);
    expect(isNanpPhone('+187 680 189 72')).toBe(true);
    expect(isNanpPhone('(876) 801-8972')).toBe(false);
    expect(isNanpPhone(undefined)).toBe(false);
    expect(isNanpPhone(null)).toBe(false);
  });
});

describe('planPhoneChange', () => {
  const nanp = { institutionIsNanp: true, allowBare: true };

  it('leaves empty, non-string, non-NANP and already-canonical values alone', () => {
    for (const raw of [undefined, null, 42, '', '   ', '+442071234567', '555-0100', '+1-876-801-8972']) {
      expect(planPhoneChange(raw, nanp)).toEqual({ action: 'unchanged' });
    }
  });

  it('converts an explicit 11-digit number regardless of the institution', () => {
    expect(planPhoneChange('+187 680 189 72', {})).toEqual({
      action: 'convert',
      next: '+1-876-801-8972',
      kind: 'explicit',
    });
  });

  it('skips an explicit 11-digit number with an invalid NXX', () => {
    expect(planPhoneChange('+1 000 555 0123', nanp)).toEqual({ action: 'skip', reason: 'invalid-nanp-digits' });
  });

  it('converts a valid bare number only for a NANP institution that allows bare numbers', () => {
    expect(planPhoneChange('(876) 555-0123', nanp)).toEqual({
      action: 'convert',
      next: '+1-876-555-0123',
      kind: 'bare',
    });
    expect(planPhoneChange('(876) 555-0123', { institutionIsNanp: false, allowBare: true })).toEqual({
      action: 'skip',
      reason: 'bare-institution-not-nanp',
    });
    expect(planPhoneChange('(876) 555-0123', { institutionIsNanp: null, allowBare: true })).toEqual({
      action: 'skip',
      reason: 'bare-institution-not-nanp',
    });
    expect(planPhoneChange('(876) 555-0123', { institutionIsNanp: true, allowBare: false })).toEqual({
      action: 'skip',
      reason: 'bare-not-allowed',
    });
  });

  it('skips a bare ten digits with an invalid area code or exchange', () => {
    expect(planPhoneChange('0765550123', nanp)).toEqual({ action: 'skip', reason: 'invalid-nanp-digits' });
  });

  it('is idempotent: re-planning a converted value changes nothing', () => {
    for (const raw of ['+187 680 189 72', '(876) 555-0123']) {
      const first = planPhoneChange(raw, nanp);
      expect(first.action).toBe('convert');
      if (first.action === 'convert') {
        expect(planPhoneChange(first.next, nanp)).toEqual({ action: 'unchanged' });
      }
    }
  });
});
