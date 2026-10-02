import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';
import { phonePattern } from '../fieldPatterns';
import { formatPhone } from '../phone';

describe('phonePattern', () => {
  it.each([
    '8768018972',
    '(876) 801-8972',
    '+1-876-801-8972',
    '+44 20 7123 4567',
    '+442 071 234 567',
    '123-4567',
    '+123 456 789 012 345', // the longest generic form: 15 digits
  ])('accepts %s', (value) => {
    expect(phonePattern.test(value)).toBe(true);
  });

  it.each([
    '-------',
    '((((((((',
    '123456', // 6 digits
    '+1234567890123456', // 16 digits
    '876-801-897a',
    '876.801.8972',
    '',
    '++18768018972',
  ])('rejects %j', (value) => {
    expect(phonePattern.test(value)).toBe(false);
  });

  it('accepts everything formatPhone produces for 7 to 15 digits', () => {
    const starts = ['1', '2', '8', '4', '9'];
    for (const start of starts) {
      for (let len = 7; len <= 15; len++) {
        const digits = start + '3456789012345'.slice(0, len - 1);
        for (const input of [digits, `+${digits}`]) {
          const formatted = formatPhone(input);
          expect(phonePattern.test(formatted), `${input} → ${formatted}`).toBe(true);
        }
      }
    }
  });
});

describe('phonePattern and firestore.rules stay identical', () => {
  // The registrations rule mirrors the client pattern (RE2 has no lookahead, so
  // the pattern is written to be valid in both engines). Rules strings escape
  // backslashes, so compare after un-escaping.
  const expected = `^${phonePattern.source.slice(1, -1)}$`.replace(/\\\//g, '/');

  it('uses the exact expression for student.phone, student.phone2 and guardian.contact', () => {
    const matches = [...rules.matchAll(/\.matches\('(\^\\\\\+\?\(\[ \(\)-\]\{0,2\}\[0-9\]\)\{7,15\}\[ \(\)-\]\{0,2\}\$)'\)/g)];
    expect(matches).toHaveLength(3);
    for (const m of matches) {
      expect(m[1].replace(/\\\\/g, '\\')).toBe(expected);
    }
  });

  it('leaves no copy of the old character-set expression', () => {
    expect(rules).not.toContain('[0-9 ()-]{7,20}');
  });
});
