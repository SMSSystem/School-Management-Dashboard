import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import {
  IMPLEMENTED_TARGETS,
  IMPORT_WRITE_CAP,
  PLANNED_TARGETS,
  SHARED_STUDENT_IMPORT_PASSWORD,
  STUDENTS_IMPORT_CAP,
  TARGET_ALLOWED_ROLES,
  TARGET_COLLECTION,
  TARGET_ENUM_HELP,
  TARGET_IDENTITY_COLUMNS,
  candidatesByColumnFor,
  columnsFor,
  decisionKey,
  duplicateKeyFor,
  errorReportColumnsFor,
  exampleRowFor,
  getImportAccountMessage,
  validationRulesFor,
  type TargetKey,
} from '../importConfig';
import { resultDuplicateKey, resultsImportColumns, resultsImportExampleRow, resultsValidationRules } from '../importResults';
import { mddsDuplicateKey, mddsImportColumns, mddsImportExampleRow, mddsValidationRules } from '../importMdds';
import { gradebookImportColumns } from '../importGradebook';
import { generalAttendanceImportColumns, generalAttendanceValidationRules } from '../importGeneralAttendance';
import { subjectAttendanceImportColumns, subjectAttendanceValidationRules } from '../importSubjectAttendance';
import { studentsImportColumns, studentsImportExampleRow, studentsValidationRules } from '../importStudents';
import { ROLE_DEFAULT_PASSWORDS } from '../roleDefaultPasswords';

// The Import page's configuration and per-target lookups. Written when they were moved out of the page,
// so the move is pinned to what the page did.

const KEYS: TargetKey[] = ['results', 'mdds', 'gradebook', 'general_attendance', 'subject_attendance', 'students'];

describe('targets', () => {
  it('offers the six targets, in this order, with nothing still planned', () => {
    expect(IMPLEMENTED_TARGETS.map((t) => t.key)).toEqual(KEYS);
    expect(IMPLEMENTED_TARGETS.map((t) => t.label)).toEqual([
      'Results',
      'MDDS (Disciplinary Actions)',
      'Gradebook',
      'General Attendance',
      'Subject Attendance',
      'Students',
    ]);
    expect(PLANNED_TARGETS).toEqual([]);
  });

  it('lets each role import only what the security rules let it write', () => {
    expect(TARGET_ALLOWED_ROLES).toEqual({
      results: ['institution_admin', 'super_admin', 'senior_teacher', 'regular_teacher'],
      mdds: ['institution_admin', 'super_admin', 'senior_teacher', 'regular_teacher'],
      gradebook: ['institution_admin', 'super_admin', 'senior_teacher', 'regular_teacher'],
      general_attendance: ['institution_admin', 'senior_teacher'],
      subject_attendance: ['institution_admin', 'regular_teacher'],
      students: ['institution_admin', 'super_admin'],
    });
  });

  it('keeps students away from both teacher roles, and each attendance target from the other teacher role', () => {
    expect(TARGET_ALLOWED_ROLES.students).not.toContain('senior_teacher');
    expect(TARGET_ALLOWED_ROLES.students).not.toContain('regular_teacher');
    expect(TARGET_ALLOWED_ROLES.general_attendance).not.toContain('regular_teacher');
    expect(TARGET_ALLOWED_ROLES.subject_attendance).not.toContain('senior_teacher');
  });

  it('writes results and MDDS into their own collections', () => {
    expect(TARGET_COLLECTION).toEqual({ results: 'results', mdds: 'disciplinaryActions' });
  });

  it('caps an import at 2,000 writes and a student import at 90 accounts', () => {
    expect(IMPORT_WRITE_CAP).toBe(2000);
    expect(STUDENTS_IMPORT_CAP).toBe(90);
  });

  it("gives imported students the role's shared temporary password", () => {
    expect(SHARED_STUDENT_IMPORT_PASSWORD).toBe(ROLE_DEFAULT_PASSWORDS.student);
  });
});

describe('columnsFor and exampleRowFor', () => {
  it("return each target's own columns and example row", () => {
    expect(columnsFor('results')).toBe(resultsImportColumns);
    expect(columnsFor('mdds')).toBe(mddsImportColumns);
    expect(columnsFor('gradebook')).toBe(gradebookImportColumns);
    expect(columnsFor('general_attendance')).toBe(generalAttendanceImportColumns);
    expect(columnsFor('subject_attendance')).toBe(subjectAttendanceImportColumns);
    expect(columnsFor('students')).toBe(studentsImportColumns);
    expect(exampleRowFor('results')).toBe(resultsImportExampleRow);
    expect(exampleRowFor('mdds')).toBe(mddsImportExampleRow);
    expect(exampleRowFor('students')).toBe(studentsImportExampleRow);
  });

  it('has an example row with a value for every column of every target', () => {
    for (const key of KEYS) {
      const headers = columnsFor(key).map((c) => c.header);
      expect(Object.keys(exampleRowFor(key)).sort(), key).toEqual([...headers].sort());
    }
  });
});

describe('inline help', () => {
  it('names the identity columns of each target', () => {
    expect(TARGET_IDENTITY_COLUMNS).toEqual({
      results: ['Student', 'Class', 'Subject', 'Term'],
      mdds: ['Student', 'Class', 'Term'],
      gradebook: ['Student', 'Column'],
      general_attendance: ['Class', 'Student'],
      subject_attendance: ['Subject', 'Class', 'Student'],
      students: ['Class', 'Additional Classes', 'House'],
    });
  });

  it('explains the allowed values where a column takes a fixed set, and not for the gradebook', () => {
    expect(TARGET_ENUM_HELP.results).toContain('coursework');
    expect(TARGET_ENUM_HELP.mdds).toContain('suspension');
    expect(TARGET_ENUM_HELP.general_attendance).toContain('"AM" or "PM"');
    expect(TARGET_ENUM_HELP.subject_attendance).toContain('P/A/L/S/E/B');
    expect(TARGET_ENUM_HELP.students).toContain('Male');
    expect(TARGET_ENUM_HELP.gradebook).toBeNull();
  });
});

describe('getImportAccountMessage', () => {
  const code = (c: string) => getImportAccountMessage(new FirebaseError(c, 'raw'));

  it('has plain wording for the errors account creation can hit, including the hourly limit', () => {
    expect(code('auth/email-already-in-use')).toBe('That email already belongs to another account.');
    expect(code('auth/invalid-email')).toBe('Enter a valid email address.');
    expect(code('auth/weak-password')).toBe('Password should be at least 8 characters.');
    expect(code('auth/network-request-failed')).toBe('Network error. Check your connection and try again.');
    expect(code('auth/too-many-requests')).toContain('at most 100 new accounts per hour');
    expect(code('permission-denied')).toContain('Firestore denied this write');
  });

  it("shows Firebase's own message for an unknown code, and a generic one for anything else", () => {
    expect(getImportAccountMessage(new FirebaseError('auth/new-thing', 'Something new'))).toBe('Something new');
    expect(getImportAccountMessage(new Error('boom'))).toBe('Something went wrong while creating this account.');
  });
});

describe('candidatesByColumnFor', () => {
  const s = [{ id: 's1', name: 'Ada' }];
  const c = [{ id: 'c1', name: 'Grade 7A' }];
  const subj = [{ id: 'm1', name: 'Math' }];
  const terms = [{ id: 't1', name: 'Term 1' }];
  const houses = [{ id: 'h1', name: 'Falcon' }];
  const cols = [{ id: 'col1', name: 'Quiz' }];

  it('is empty until there are candidates and a target', () => {
    expect(candidatesByColumnFor(null, { students: s, classes: c, subjects: subj, terms })).toEqual({});
    expect(candidatesByColumnFor('results', null)).toEqual({});
  });

  it('keys each target by its own identity columns', () => {
    expect(candidatesByColumnFor('results', { students: s, classes: c, subjects: subj, terms })).toEqual({ Student: s, Class: c, Subject: subj, Term: terms });
    expect(candidatesByColumnFor('mdds', { students: s, classes: c, terms })).toEqual({ Student: s, Class: c, Term: terms });
    expect(candidatesByColumnFor('gradebook', { students: s, columns: cols })).toEqual({ Student: s, Column: cols });
    expect(candidatesByColumnFor('general_attendance', { students: s, classes: c })).toEqual({ Student: s, Class: c });
    expect(candidatesByColumnFor('subject_attendance', { students: s, classes: c, subjects: subj })).toEqual({ Student: s, Class: c, Subject: subj });
    expect(candidatesByColumnFor('students', { classes: c, houses })).toEqual({ Class: c, House: houses });
  });
});

describe('errorReportColumnsFor', () => {
  const headers = (key: TargetKey) => errorReportColumnsFor(key).map((col) => col.header);

  it('lists the columns of the failed-rows report for each target, ending with the error', () => {
    expect(headers('results')).toEqual(['Student', 'Class', 'Subject', 'Term', 'Assessment', 'Error']);
    expect(headers('mdds')).toEqual(['Student', 'Class', 'Term', 'Type', 'Date', 'Error']);
    expect(headers('gradebook')).toEqual(['Student', 'Column', 'Score', 'Error']);
    expect(headers('general_attendance')).toEqual(['Class', 'Date', 'Session', 'Error']);
    expect(headers('subject_attendance')).toEqual(['Subject', 'Class', 'Date', 'Error']);
    expect(headers('students')).toEqual(['First Name', 'Last Name', 'Email', 'Error']);
  });

  it('reads each cell from the failed row, and the error from its __error', () => {
    const row = { studentName: 'Ada', className: 'Grade 7A', subjectName: 'Math', termName: 'T1', assessmentName: 'Quiz', __error: 'boom' };
    const values = errorReportColumnsFor('results').map((col) => col.accessor(row));
    expect(values).toEqual(['Ada', 'Grade 7A', 'Math', 'T1', 'Quiz', 'boom']);
  });
});

describe('small helpers', () => {
  it('keys a decision by column and value', () => {
    expect(decisionKey('Student', 'Ada Lovelace')).toBe('Student::Ada Lovelace');
  });

  it("builds a result's or an MDDS record's duplicate key through its own module", () => {
    const result = { studentId: 's1', classId: 'c1', subjectId: 'm1', termId: 't1', assessmentName: 'Quiz', assessmentType: 'exam' } as never;
    const mdds = { studentId: 's1', termId: 't1', type: 'merit', date: '2026-10-01' } as never;
    expect(duplicateKeyFor('results', result)).toBe(resultDuplicateKey(result));
    expect(duplicateKeyFor('mdds', mdds)).toBe(mddsDuplicateKey(mdds));
  });
});

describe('validationRulesFor', () => {
  it("returns each target's own business rules", () => {
    expect(validationRulesFor('results', null)).toBe(resultsValidationRules);
    expect(validationRulesFor('mdds', null)).toBe(mddsValidationRules);
    expect(validationRulesFor('general_attendance', null)).toBe(generalAttendanceValidationRules);
    expect(validationRulesFor('subject_attendance', null)).toBe(subjectAttendanceValidationRules);
    expect(validationRulesFor('students', null)).toBe(studentsValidationRules);
  });

  it('builds the gradebook rules from the class, subject and term chosen for it', () => {
    const rules = validationRulesFor('gradebook', { classId: 'c1', className: 'Grade 7A', subjectId: 'm1', subjectName: 'Math', termId: 't1', termName: 'Term 1' });
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });
});
