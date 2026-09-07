import { describe, it, expect } from 'vitest';
import { validateStructure, parseRows, resolveIdentities, validateRows } from '../spreadsheetImport';
import {
  generalAttendanceImportColumns,
  generalAttendanceValidationRules,
  buildGeneralAttendanceIdentityResolvers,
  validateGeneralAttendanceDates,
  groupGeneralAttendanceRows,
  buildGeneralAttendanceData,
  type GeneralAttendanceImportRow,
  type ResolvedGeneralAttendanceImportRow,
  type GeneralAttendanceIdentityCandidates,
  type ClassTermInfo,
} from '../importGeneralAttendance';

const candidates: GeneralAttendanceIdentityCandidates = {
  classes: [{ id: 'cls1', name: 'Class A' }, { id: 'cls2', name: 'Class B' }],
  students: [{ id: 'stu1', name: 'Ada Lovelace' }, { id: 'stu2', name: 'Ada Lovelace' }, { id: 'stu3', name: 'Bo Diddley' }],
};

const classTermById = new Map<string, ClassTermInfo>([
  ['cls1', { termId: 'trm1', academicYearId: 'yr1', termStartDate: '2026-09-01', termEndDate: '2026-12-15' }],
]);

// ─── Column parsing ───────────────────────────────────────────────────────

describe('generalAttendanceImportColumns', () => {
  it('parses a clean row', () => {
    const { rows, errors } = parseRows(
      [{ Class: 'Class A', Date: '2026-09-03', Session: 'AM', Student: 'Bo Diddley', State: 'P', Reason: null }],
      generalAttendanceImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo Diddley', state: 'P' }]);
  });

  it('accepts a lowercase state/session and normalizes to the canonical uppercase value', () => {
    const { rows, errors } = parseRows(
      [{ Class: 'Class A', Date: '2026-09-03', Session: 'am', Student: 'Bo Diddley', State: 'p', Reason: null }],
      generalAttendanceImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ session: 'AM', state: 'P' });
  });

  it('flags every missing required header via validateStructure', () => {
    const result = validateStructure([{ Class: 'A' }], generalAttendanceImportColumns);
    expect(result.ok).toBe(false);
    expect(result.missingHeaders).toEqual(['Date', 'Session', 'Student', 'State']);
  });

  it('rejects a state outside P/A/L/S/E/B', () => {
    const { errors } = parseRows(
      [{ Class: 'Class A', Date: '2026-09-03', Session: 'AM', Student: 'Bo', State: 'X', Reason: null }],
      generalAttendanceImportColumns,
    );
    expect(errors[0].message).toContain('must be');
  });
});

// ─── Business-rule validation ──────────────────────────────────────────────

describe('generalAttendanceValidationRules', () => {
  it('passes a non-E row with any reason text, since reason is irrelevant outside E', () => {
    const row: GeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'P', reason: 'x'.repeat(200),
    };
    const { errors } = validateRows([row], generalAttendanceValidationRules);
    expect(errors).toEqual([]);
  });

  it('passes an E row with a short reason', () => {
    const row: GeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'E', reason: 'Dentist',
    };
    expect(validateRows([row], generalAttendanceValidationRules).errors).toEqual([]);
  });

  it('rejects an E row with a reason over 50 characters', () => {
    const row: GeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'E', reason: 'x'.repeat(51),
    };
    const { errors } = validateRows([row], generalAttendanceValidationRules);
    expect(errors).toEqual([{ row: 2, message: 'reason must be 50 characters or fewer (only checked when State is "E")' }]);
  });
});

// ─── Identity resolution ──────────────────────────────────────────────────

describe('buildGeneralAttendanceIdentityResolvers', () => {
  it('auto-resolves Class and Student when each has exactly one match', async () => {
    const row: GeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo Diddley', state: 'P',
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildGeneralAttendanceIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([{ ...row, classId: 'cls1', studentId: 'stu3' }]);
  });

  it('flags an ambiguous student name', async () => {
    const row: GeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Ada Lovelace', state: 'P',
    };
    const { needsResolution } = await resolveIdentities([row], buildGeneralAttendanceIdentityResolvers(candidates));
    expect(needsResolution).toEqual([
      { column: 'Student', value: 'Ada Lovelace', matches: [{ id: 'stu1', label: 'Ada Lovelace' }, { id: 'stu2', label: 'Ada Lovelace' }] },
    ]);
  });
});

// ─── Date-vs-term validation ────────────────────────────────────────────────

describe('validateGeneralAttendanceDates', () => {
  it('passes a date within the class\'s assigned term', () => {
    const row: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'P', classId: 'cls1', studentId: 'stu3',
    };
    expect(validateGeneralAttendanceDates([{ row, rowNumber: 2 }], classTermById)).toEqual([]);
  });

  it('rejects a date outside the class\'s assigned term', () => {
    const row: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2027-01-15', session: 'AM', studentName: 'Bo', state: 'P', classId: 'cls1', studentId: 'stu3',
    };
    const errors = validateGeneralAttendanceDates([{ row, rowNumber: 5 }], classTermById);
    expect(errors).toEqual([
      { row: 5, message: 'date (2027-01-15) falls outside "Class A"\'s assigned term (2026-09-01 to 2026-12-15)' },
    ]);
  });

  it('rejects a class with no known term assignment', () => {
    const row: ResolvedGeneralAttendanceImportRow = {
      className: 'Class B', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'P', classId: 'cls2', studentId: 'stu3',
    };
    const errors = validateGeneralAttendanceDates([{ row, rowNumber: 3 }], classTermById);
    expect(errors).toEqual([{ row: 3, message: 'Class "Class B" has no assigned term on record — attendance can\'t be imported for it' }]);
  });
});

// ─── Grouping ───────────────────────────────────────────────────────────────

describe('groupGeneralAttendanceRows', () => {
  it('groups multiple students on the same class+date+session into one records map', () => {
    const rowA: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo Diddley', state: 'P', classId: 'cls1', studentId: 'stu3',
    };
    const rowB: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Ada Lovelace', state: 'A', classId: 'cls1', studentId: 'stu1',
    };
    const { groups, duplicateErrors } = groupGeneralAttendanceRows(
      [{ row: rowA, rowNumber: 2 }, { row: rowB, rowNumber: 3 }],
      classTermById,
    );
    expect(duplicateErrors).toEqual([]);
    expect(groups).toEqual([{
      classId: 'cls1', className: 'Class A', date: '2026-09-03', session: 'AM', termId: 'trm1', academicYearId: 'yr1',
      records: {
        stu3: { state: 'P', studentName: 'Bo Diddley' },
        stu1: { state: 'A', studentName: 'Ada Lovelace' },
      },
    }]);
  });

  it('splits rows into separate groups per distinct (class, date, session)', () => {
    const rowAM: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'P', classId: 'cls1', studentId: 'stu3',
    };
    const rowPM: ResolvedGeneralAttendanceImportRow = { ...rowAM, session: 'PM' };
    const { groups } = groupGeneralAttendanceRows([{ row: rowAM, rowNumber: 2 }, { row: rowPM, rowNumber: 3 }], classTermById);
    expect(groups).toHaveLength(2);
  });

  it('includes reason only for an E-state entry, omitting it for other states', () => {
    const rowE: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'E', reason: 'Dentist',
      classId: 'cls1', studentId: 'stu3',
    };
    const rowP: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'PM', studentName: 'Bo', state: 'P', reason: 'stray text',
      classId: 'cls1', studentId: 'stu3',
    };
    const { groups } = groupGeneralAttendanceRows([{ row: rowE, rowNumber: 2 }, { row: rowP, rowNumber: 3 }], classTermById);
    const amGroup = groups.find((g) => g.session === 'AM')!;
    const pmGroup = groups.find((g) => g.session === 'PM')!;
    expect(amGroup.records.stu3).toEqual({ state: 'E', studentName: 'Bo', reason: 'Dentist' });
    expect(pmGroup.records.stu3).toEqual({ state: 'P', studentName: 'Bo' });
  });

  it('reports a second row for the same student in the same group as a duplicate, keeping the first', () => {
    const rowFirst: ResolvedGeneralAttendanceImportRow = {
      className: 'Class A', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'P', classId: 'cls1', studentId: 'stu3',
    };
    const rowSecond: ResolvedGeneralAttendanceImportRow = { ...rowFirst, state: 'A' };
    const { groups, duplicateErrors } = groupGeneralAttendanceRows(
      [{ row: rowFirst, rowNumber: 2 }, { row: rowSecond, rowNumber: 7 }],
      classTermById,
    );
    expect(duplicateErrors).toEqual([
      { row: 7, message: 'duplicate entry for "Bo" on 2026-09-03 AM in "Class A" (already set on row 2)' },
    ]);
    expect(groups[0].records.stu3).toEqual({ state: 'P', studentName: 'Bo' });
  });

  it('skips a row whose class has no ClassTermInfo entry rather than throwing', () => {
    const row: ResolvedGeneralAttendanceImportRow = {
      className: 'Class B', date: '2026-09-03', session: 'AM', studentName: 'Bo', state: 'P', classId: 'cls2', studentId: 'stu3',
    };
    const { groups } = groupGeneralAttendanceRows([{ row, rowNumber: 2 }], classTermById);
    expect(groups).toEqual([]);
  });
});

// ─── Write shape ───────────────────────────────────────────────────────────

describe('buildGeneralAttendanceData', () => {
  const group = {
    classId: 'cls1', className: 'Class A', date: '2026-09-03', session: 'AM' as const,
    termId: 'trm1', academicYearId: 'yr1',
    records: { stu3: { state: 'P' as const, studentName: 'Bo' } },
  };
  const ctx = { institutionId: 'inst1', submittedBy: 'teacher1' };

  it('create: includes createdAt', () => {
    const data = buildGeneralAttendanceData(group, ctx, false);
    expect(data.createdAt).toBeDefined();
    expect(data).toMatchObject({
      institutionId: 'inst1', classId: 'cls1', className: 'Class A', termId: 'trm1', academicYearId: 'yr1',
      date: '2026-09-03', session: 'AM', records: group.records, submittedBy: 'teacher1',
    });
  });

  it('update (merge): omits createdAt entirely rather than guessing its prior value', () => {
    const data = buildGeneralAttendanceData(group, ctx, true);
    expect(data).not.toHaveProperty('createdAt');
    expect(data.records).toEqual(group.records);
  });
});
