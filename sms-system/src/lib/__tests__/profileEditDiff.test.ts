import { describe, expect, it } from 'vitest';
import { canonicalizePhone } from '../phone';
import {
  PARENT_EDIT_FIELDS,
  STUDENT_EDIT_FIELDS,
  describeProfileEdit,
  diffChangedFields,
  parentPhoneNormalizer,
  teacherEditFields,
} from '../profileEditDiff';

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

// Submitting a form without changing anything must produce NO profile_edit entry.
// Each case is the shape of the row the form is opened with, and the values the
// form submits for it (react-hook-form turns a missing value into '').
describe('an unchanged form reports nothing, for each form\'s own row shape', () => {
  const canon = (v: string) => canonicalizePhone(v, { institutionPhone: '+1-876-555-0100' });

  it('student row (list/students, including phone2 and idNumber)', () => {
    const row = {
      id: 's1', uid: 's1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.org', phone: '8765550123',
      phone2: '(876) 555-0199', idNumber: 'T123', institutionStudentId: 'S-9', dateOfBirth: '2012-04-05',
      gender: 'Female', classId: 'c1', houseId: 'h1', institutionId: 'i1',
    };
    const submitted = { ...row, phone: '8765550123', phone2: '(876) 555-0199' };
    expect(
      diffChangedFields(row, submitted, STUDENT_EDIT_FIELDS, { normalizers: { phone: canon, phone2: canon } }),
    ).toEqual([]);
  });

  it('student row with nothing optional filled in', () => {
    const row = { firstName: 'Ann', lastName: 'Lee', institutionId: 'i1' };
    const submitted = {
      firstName: 'Ann', lastName: 'Lee', email: '', phone: '', phone2: '', idNumber: '',
      institutionStudentId: '', dateOfBirth: '', gender: undefined, classId: '', houseId: '',
    };
    expect(diffChangedFields(row, submitted, STUDENT_EDIT_FIELDS, { normalizers: { phone: canon, phone2: canon } })).toEqual(
      [],
    );
  });

  it('student detail page (a full user document with nulls)', () => {
    const doc = {
      firstName: 'Ann', lastName: 'Lee', email: null, phone: null, phone2: null, idNumber: null,
      institutionStudentId: null, dateOfBirth: null, gender: null, classId: null, houseId: null,
    };
    const submitted = {
      firstName: 'Ann', lastName: 'Lee', email: '', phone: '', phone2: '', idNumber: '',
      institutionStudentId: '', dateOfBirth: '', gender: undefined, classId: '', houseId: '',
    };
    expect(diffChangedFields(doc, submitted, STUDENT_EDIT_FIELDS, { normalizers: { phone: canon, phone2: canon } })).toEqual(
      [],
    );
  });

  it('parent row, where a missing phone is shown as an em dash', () => {
    const row = { firstName: 'Bo', lastName: 'Kim', email: 'bo@x.org', phone: '—' };
    const submitted = { firstName: 'Bo', lastName: 'Kim', email: 'bo@x.org', phone: '' };
    expect(
      diffChangedFields(row, submitted, PARENT_EDIT_FIELDS, { normalizers: { phone: parentPhoneNormalizer(canon) } }),
    ).toEqual([]);
  });

  it('parent row: a real phone edit is still reported', () => {
    const row = { firstName: 'Bo', lastName: 'Kim', email: 'bo@x.org', phone: '—' };
    const submitted = { firstName: 'Bo', lastName: 'Kim', email: 'bo@x.org', phone: '+1-876-555-0123' };
    expect(
      diffChangedFields(row, submitted, PARENT_EDIT_FIELDS, { normalizers: { phone: parentPhoneNormalizer(canon) } }),
    ).toEqual(['phone']);
  });

  it('teacher profile as loaded into the form (regular and senior)', () => {
    const loaded = {
      firstName: 'Cy', lastName: 'Ng', phone: '8765550123', departmentId: 'd1',
      assignedClassId: 'c2', homeroomRoom: '12', homeroomBuilding: 'North',
    };
    const submitted = { ...loaded, phone: '8765550123' };
    expect(diffChangedFields(loaded, submitted, teacherEditFields(false), { normalizers: { phone: canon } })).toEqual([]);
    expect(diffChangedFields(loaded, submitted, teacherEditFields(true), { normalizers: { phone: canon } })).toEqual([]);
  });

  it('teacher: the homeroom fields count only for a senior teacher', () => {
    const loaded = { firstName: 'Cy', lastName: 'Ng', phone: '', departmentId: 'd1', homeroomRoom: '12' };
    const submitted = { ...loaded, homeroomRoom: '14' };
    expect(diffChangedFields(loaded, submitted, teacherEditFields(false))).toEqual([]);
    expect(diffChangedFields(loaded, submitted, teacherEditFields(true))).toEqual(['homeroom room']);
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

describe('additional classes', () => {
  const base = { firstName: 'Ann', classId: 'a', extraClasses: ['b'], classSubjects: { b: ['maths'] } };

  it('reports nothing when the extra classes and chosen subjects are the same', () => {
    const same = { ...base, extraClasses: ['b'], classSubjects: { b: ['maths'] } };
    expect(diffChangedFields(base, same, STUDENT_EDIT_FIELDS)).toEqual([]);
  });

  it('reports a changed extra class and changed chosen subjects separately from the home class', () => {
    expect(diffChangedFields(base, { ...base, extraClasses: ['b', 'c'] }, STUDENT_EDIT_FIELDS)).toEqual(['additional classes']);
    expect(diffChangedFields(base, { ...base, classSubjects: { b: ['maths', 'art'] } }, STUDENT_EDIT_FIELDS)).toEqual([
      'subjects in additional classes',
    ]);
    expect(diffChangedFields(base, { ...base, classId: 'z' }, STUDENT_EDIT_FIELDS)).toEqual(['class']);
  });

  it('treats an empty map like a missing one', () => {
    expect(diffChangedFields({ ...base, classSubjects: undefined }, { ...base, classSubjects: {} }, ['classSubjects'])).toEqual([]);
  });
});
