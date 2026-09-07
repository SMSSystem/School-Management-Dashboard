import { describe, it, expect } from 'vitest';
import { validateStructure, parseRows, resolveIdentities, validateRows, type ClassTermInfo } from '../spreadsheetImport';
import {
  subjectAttendanceImportColumns,
  subjectAttendanceValidationRules,
  buildSubjectAttendanceIdentityResolvers,
  validateSubjectAttendanceDates,
  groupSubjectAttendanceRows,
  buildSubjectAttendanceData,
  type SubjectAttendanceImportRow,
  type ResolvedSubjectAttendanceImportRow,
  type SubjectAttendanceIdentityCandidates,
} from '../importSubjectAttendance';

const candidates: SubjectAttendanceIdentityCandidates = {
  subjects: [{ id: 'sub1', name: 'English' }],
  classes: [{ id: 'cls1', name: 'Class A' }, { id: 'cls2', name: 'Class B' }],
  students: [{ id: 'stu1', name: 'Ada Lovelace' }, { id: 'stu2', name: 'Ada Lovelace' }, { id: 'stu3', name: 'Bo Diddley' }],
};

const classTermById = new Map<string, ClassTermInfo>([
  ['cls1', { termId: 'trm1', academicYearId: 'yr1', termStartDate: '2026-09-01', termEndDate: '2026-12-15' }],
]);

// ─── Column parsing ───────────────────────────────────────────────────────

describe('subjectAttendanceImportColumns', () => {
  it('parses a clean row, with no Session column (§10\'s difference from §9)', () => {
    const { rows, errors } = parseRows(
      [{ Subject: 'English', Class: 'Class A', Date: '2026-09-03', Student: 'Bo Diddley', State: 'P', Reason: null }],
      subjectAttendanceImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo Diddley', state: 'P' }]);
  });

  it('flags every missing required header via validateStructure', () => {
    const result = validateStructure([{ Subject: 'English' }], subjectAttendanceImportColumns);
    expect(result.ok).toBe(false);
    expect(result.missingHeaders).toEqual(['Class', 'Date', 'Student', 'State']);
  });
});

// ─── Business-rule validation ──────────────────────────────────────────────

describe('subjectAttendanceValidationRules', () => {
  it('rejects an E row with a reason over 50 characters', () => {
    const row: SubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo', state: 'E', reason: 'x'.repeat(51),
    };
    const { errors } = validateRows([row], subjectAttendanceValidationRules);
    expect(errors).toEqual([{ row: 2, message: 'reason must be 50 characters or fewer (only checked when State is "E")' }]);
  });

  it('passes a non-E row regardless of reason length', () => {
    const row: SubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo', state: 'P', reason: 'x'.repeat(200),
    };
    expect(validateRows([row], subjectAttendanceValidationRules).errors).toEqual([]);
  });
});

// ─── Identity resolution ──────────────────────────────────────────────────

describe('buildSubjectAttendanceIdentityResolvers', () => {
  it('auto-resolves Subject, Class, and Student when each has exactly one match', async () => {
    const row: SubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo Diddley', state: 'P',
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildSubjectAttendanceIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([{ ...row, subjectId: 'sub1', classId: 'cls1', studentId: 'stu3' }]);
  });

  it('flags an ambiguous student name', async () => {
    const row: SubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Ada Lovelace', state: 'P',
    };
    const { needsResolution } = await resolveIdentities([row], buildSubjectAttendanceIdentityResolvers(candidates));
    expect(needsResolution).toEqual([
      { column: 'Student', value: 'Ada Lovelace', matches: [{ id: 'stu1', label: 'Ada Lovelace' }, { id: 'stu2', label: 'Ada Lovelace' }] },
    ]);
  });
});

// ─── Date-vs-term validation ────────────────────────────────────────────────

describe('validateSubjectAttendanceDates', () => {
  it('rejects a date outside the class\'s assigned term', () => {
    const row: ResolvedSubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2027-01-15', studentName: 'Bo', state: 'P',
      subjectId: 'sub1', classId: 'cls1', studentId: 'stu3',
    };
    const errors = validateSubjectAttendanceDates([{ row, rowNumber: 5 }], classTermById);
    expect(errors).toEqual([
      { row: 5, message: 'date (2027-01-15) falls outside "Class A"\'s assigned term (2026-09-01 to 2026-12-15)' },
    ]);
  });
});

// ─── Grouping ───────────────────────────────────────────────────────────────

describe('groupSubjectAttendanceRows', () => {
  it('groups by (subjectId, classId, sessionDate) — one group per date, no session split', () => {
    const rowA: ResolvedSubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo Diddley', state: 'P',
      subjectId: 'sub1', classId: 'cls1', studentId: 'stu3',
    };
    const rowB: ResolvedSubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Ada Lovelace', state: 'A',
      subjectId: 'sub1', classId: 'cls1', studentId: 'stu1',
    };
    const { groups, duplicateErrors } = groupSubjectAttendanceRows(
      [{ row: rowA, rowNumber: 2 }, { row: rowB, rowNumber: 3 }],
      classTermById,
    );
    expect(duplicateErrors).toEqual([]);
    expect(groups).toEqual([{
      subjectId: 'sub1', subjectName: 'English', classId: 'cls1', className: 'Class A', sessionDate: '2026-09-03',
      termId: 'trm1', academicYearId: 'yr1',
      records: {
        stu3: { state: 'P', studentName: 'Bo Diddley' },
        stu1: { state: 'A', studentName: 'Ada Lovelace' },
      },
    }]);
  });

  it('splits into separate groups when the subject differs, even on the same class+date', () => {
    const rowA: ResolvedSubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo', state: 'P',
      subjectId: 'sub1', classId: 'cls1', studentId: 'stu3',
    };
    const rowB: ResolvedSubjectAttendanceImportRow = { ...rowA, subjectName: 'Maths', subjectId: 'sub2' };
    const { groups } = groupSubjectAttendanceRows([{ row: rowA, rowNumber: 2 }, { row: rowB, rowNumber: 3 }], classTermById);
    expect(groups).toHaveLength(2);
  });

  it('reports a second row for the same student in the same group as a duplicate', () => {
    const rowFirst: ResolvedSubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class A', date: '2026-09-03', studentName: 'Bo', state: 'P',
      subjectId: 'sub1', classId: 'cls1', studentId: 'stu3',
    };
    const rowSecond: ResolvedSubjectAttendanceImportRow = { ...rowFirst, state: 'A' };
    const { groups, duplicateErrors } = groupSubjectAttendanceRows(
      [{ row: rowFirst, rowNumber: 2 }, { row: rowSecond, rowNumber: 9 }],
      classTermById,
    );
    expect(duplicateErrors).toEqual([
      { row: 9, message: 'duplicate entry for "Bo" on 2026-09-03 in "English" / "Class A" (already set on row 2)' },
    ]);
    expect(groups[0].records.stu3).toEqual({ state: 'P', studentName: 'Bo' });
  });

  it('skips a row whose class has no ClassTermInfo entry rather than throwing', () => {
    const row: ResolvedSubjectAttendanceImportRow = {
      subjectName: 'English', className: 'Class B', date: '2026-09-03', studentName: 'Bo', state: 'P',
      subjectId: 'sub1', classId: 'cls2', studentId: 'stu3',
    };
    const { groups } = groupSubjectAttendanceRows([{ row, rowNumber: 2 }], classTermById);
    expect(groups).toEqual([]);
  });
});

// ─── Write shape ───────────────────────────────────────────────────────────

describe('buildSubjectAttendanceData', () => {
  const group = {
    subjectId: 'sub1', subjectName: 'English', classId: 'cls1', className: 'Class A', sessionDate: '2026-09-03',
    termId: 'trm1', academicYearId: 'yr1',
    records: { stu3: { state: 'P' as const, studentName: 'Bo' } },
  };
  const ctx = { institutionId: 'inst1', teacherId: 'teacher1' };

  it('create: includes createdAt and teacherId (unlike GeneralAttendanceDocument, per the write rule\'s ownership check)', () => {
    const data = buildSubjectAttendanceData(group, ctx, false);
    expect(data.createdAt).toBeDefined();
    expect(data).toMatchObject({
      institutionId: 'inst1', subjectId: 'sub1', subjectName: 'English',
      classId: 'cls1', className: 'Class A', sessionDate: '2026-09-03',
      teacherId: 'teacher1', termId: 'trm1', academicYearId: 'yr1',
      records: group.records, submittedBy: 'teacher1',
    });
  });

  it('update (merge): omits createdAt entirely rather than guessing its prior value', () => {
    const data = buildSubjectAttendanceData(group, ctx, true);
    expect(data).not.toHaveProperty('createdAt');
    expect(data.records).toEqual(group.records);
  });
});
