import { describe, expect, it } from 'vitest';
import {
  DISCIPLINARY_BADGE_CLS,
  academicYearIdOf,
  formatLongDate,
  parentLinkLabel,
  studentInfoRows,
  type Student,
} from '../studentDetailLogic';

// The student detail page's rules that need no screen or database. Written when they were moved out of the
// page, so the move is pinned to what the page showed.

const classes = [
  { id: 'c1', name: 'Grade 7A' },
  { id: 'c2', name: 'Grade 7B' },
  { id: 'c3', name: 'Art Club' },
];

const student = (over: Partial<Student> = {}): Student =>
  ({ uid: 's1', name: 'Ada Lovelace', role: 'student', ...over }) as Student;

const rowsOf = (s: Student) => Object.fromEntries(studentInfoRows(s, classes).map((r) => [r.label, r.value]));

describe('formatLongDate', () => {
  it('writes the month in full, the day without a leading zero and the year', () => {
    expect(formatLongDate('2012-04-05')).toBe('April 5, 2012');
    expect(formatLongDate('2026-12-31')).toBe('December 31, 2026');
    expect(formatLongDate('2024-02-29')).toBe('February 29, 2024');
  });
});

describe('parentLinkLabel', () => {
  it('puts the relationship first, capitalised, when one was recorded', () => {
    expect(parentLinkLabel('mother', 'Jane Doe', 'p1')).toBe('Mother — Jane Doe');
    expect(parentLinkLabel('guardian', 'Sam Roe', 'p2')).toBe('Guardian — Sam Roe');
  });

  it('is just the name when no relationship was recorded', () => {
    expect(parentLinkLabel(undefined, 'Jane Doe', 'p1')).toBe('Jane Doe');
  });

  it('falls back to the id for a parent that is not in the list', () => {
    expect(parentLinkLabel('father', undefined, 'p9')).toBe('Father — p9');
    expect(parentLinkLabel(undefined, undefined, 'p9')).toBe('p9');
  });
});

describe('academicYearIdOf', () => {
  const terms = [
    { id: 't1', academicYearId: 'y1' },
    { id: 't2', academicYearId: 'y2' },
    { id: 't3' },
  ];

  it("is the term's academic year, and an empty string for an unknown term or a term with none", () => {
    expect(academicYearIdOf(terms, 't2')).toBe('y2');
    expect(academicYearIdOf(terms, 'nope')).toBe('');
    expect(academicYearIdOf(terms, 't3')).toBe('');
    expect(academicYearIdOf([], 't1')).toBe('');
  });
});

describe('studentInfoRows', () => {
  it('lists the nine rows in the order the card shows them', () => {
    expect(studentInfoRows(student(), classes).map((r) => r.label)).toEqual([
      'Class',
      'Additional classes',
      'House',
      'Gender',
      'Date of Birth',
      'Student ID',
      'Status',
      'Phone',
      'Email',
    ]);
  });

  it('shows the home class by name, and nothing when there is none', () => {
    expect(rowsOf(student({ classId: 'c1' })).Class).toBe('Grade 7A');
    expect(rowsOf(student()).Class).toBeUndefined();
    expect(rowsOf(student({ classId: 'gone' })).Class).toBe('—'); // a class that no longer exists
  });

  it('lists the further classes by name, home class left out', () => {
    expect(rowsOf(student({ classId: 'c1', classIds: ['c1', 'c2', 'c3'] } as Partial<Student>))['Additional classes']).toBe('Grade 7B, Art Club');
    expect(rowsOf(student({ classId: 'c1', classIds: ['c1'] } as Partial<Student>))['Additional classes']).toBeUndefined();
  });

  it('formats the birth date, capitalises the status and passes the other fields through', () => {
    const rows = rowsOf(
      student({ dateOfBirth: '2012-04-05', status: 'active', houseName: 'Falcon', gender: 'Female', institutionStudentId: 'S-100' } as Partial<Student>),
    );
    expect(rows['Date of Birth']).toBe('April 5, 2012');
    expect(rows.Status).toBe('Active');
    expect(rows.House).toBe('Falcon');
    expect(rows.Gender).toBe('Female');
    expect(rows['Student ID']).toBe('S-100');
  });

  it('leaves a missing birth date and status empty', () => {
    const rows = rowsOf(student());
    expect(rows['Date of Birth']).toBeUndefined();
    expect(rows.Status).toBeUndefined();
  });

  it('shows a phone number in the +1 form, an empty string when there is none, and the email as stored', () => {
    expect(rowsOf(student({ phone: '18765551234' } as Partial<Student>)).Phone).toBe('+1-876-555-1234');
    expect(rowsOf(student()).Phone).toBe('');
    expect(rowsOf(student({ email: 'ada@example.com' })).Email).toBe('ada@example.com');
  });
});

describe('DISCIPLINARY_BADGE_CLS', () => {
  it('has a colour for each of the four kinds of entry', () => {
    expect(Object.keys(DISCIPLINARY_BADGE_CLS).sort()).toEqual(['demerit', 'detention', 'merit', 'suspension']);
    expect(DISCIPLINARY_BADGE_CLS.merit).toContain('green');
    expect(DISCIPLINARY_BADGE_CLS.suspension).toContain('red');
  });
});
