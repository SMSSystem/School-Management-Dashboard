import { describe, expect, it } from 'vitest';
import { canonicalizePhone } from '../phone';
import { describeProfileEdit, diffChangedFields } from '../profileEditDiff';

const fields = ['firstName', 'lastName', 'phone', 'classId'];

describe('diffChangedFields', () => {
  it('reports nothing when nothing changed', () => {
    const row = { firstName: 'Jane', lastName: 'Doe', phone: '555', classId: 'c1' };
    expect(diffChangedFields(row, { ...row }, fields)).toEqual([]);
  });

  it('reports one changed field by its label', () => {
    expect(
      diffChangedFields({ firstName: 'Jane', classId: 'c1' }, { firstName: 'Jane', classId: 'c2' }, fields),
    ).toEqual(['class']);
  });

  it('reports several changed fields in the order given', () => {
    expect(
      diffChangedFields({ firstName: 'A', phone: '1' }, { firstName: 'B', phone: '2' }, fields),
    ).toEqual(['first name', 'phone']);
  });

  it('treats undefined, null and empty string as the same empty value', () => {
    expect(diffChangedFields({ phone: undefined }, { phone: '' }, ['phone'])).toEqual([]);
    expect(diffChangedFields({ phone: null }, { phone: undefined }, ['phone'])).toEqual([]);
    expect(diffChangedFields({ phone: '' }, { phone: null }, ['phone'])).toEqual([]);
  });

  it('trims whitespace before comparing', () => {
    expect(diffChangedFields({ firstName: 'Jane' }, { firstName: '  Jane  ' }, ['firstName'])).toEqual([]);
    expect(diffChangedFields({ firstName: '   ' }, { firstName: '' }, ['firstName'])).toEqual([]);
  });

  it('compares Firestore Timestamps, Dates and millis by value', () => {
    const ts = { toMillis: () => 1_000 };
    expect(diffChangedFields({ dateOfBirth: ts }, { dateOfBirth: new Date(1_000) }, ['dateOfBirth'])).toEqual([]);
    expect(diffChangedFields({ dateOfBirth: ts }, { dateOfBirth: new Date(2_000) }, ['dateOfBirth'])).toEqual([
      'date of birth',
    ]);
  });

  it('counts a field missing from `before` as changed only when `after` has a value', () => {
    expect(diffChangedFields({}, { gender: 'f' }, ['gender'])).toEqual(['gender']);
    expect(diffChangedFields({}, { gender: '' }, ['gender'])).toEqual([]);
    expect(diffChangedFields(undefined, { gender: undefined }, ['gender'])).toEqual([]);
  });

  it('falls back to the raw field name when there is no label', () => {
    expect(diffChangedFields({ nickname: 'a' }, { nickname: 'b' }, ['nickname'])).toEqual(['nickname']);
  });

  it('compares arrays as sets: order and duplicates are ignored', () => {
    expect(diffChangedFields({ subjects: ['a', 'b'] }, { subjects: ['b', 'a', 'a'] }, ['subjects'])).toEqual([]);
    expect(diffChangedFields({ subjects: ['a'] }, { subjects: ['a', 'b'] }, ['subjects'])).toEqual(['subjects']);
    expect(diffChangedFields({ subjects: [] }, { subjects: undefined }, ['subjects'])).toEqual([]);
  });

  describe('phone canonicalisation', () => {
    const normalizers = { phone: (v: string) => canonicalizePhone(v, { institutionPhone: '+1-876-555-0100' }) };

    it('reports a phone that only differs in separators as unchanged', () => {
      expect(
        diffChangedFields({ phone: '8765550123' }, { phone: '+1-876-555-0123' }, ['phone'], { normalizers }),
      ).toEqual([]);
      expect(
        diffChangedFields({ phone: '(876) 555-0123' }, { phone: '+1-876-555-0123' }, ['phone'], { normalizers }),
      ).toEqual([]);
    });

    it('still reports a genuinely different number', () => {
      expect(
        diffChangedFields({ phone: '8765550123' }, { phone: '+1-876-555-0199' }, ['phone'], { normalizers }),
      ).toEqual(['phone']);
    });

    it('without the normaliser the same separator-only change would be reported', () => {
      expect(diffChangedFields({ phone: '8765550123' }, { phone: '+1-876-555-0123' }, ['phone'])).toEqual(['phone']);
    });
  });
});

describe('describeProfileEdit', () => {
  it('lists the changed fields for the target', () => {
    expect(describeProfileEdit(['phone', 'class'], 'Jane Doe')).toBe('Updated phone, class for Jane Doe');
  });

  it('is empty when nothing changed', () => {
    expect(describeProfileEdit([], 'Jane Doe')).toBe('');
  });
});
