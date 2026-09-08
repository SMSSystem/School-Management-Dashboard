import { describe, it, expect } from 'vitest';
import { validateStructure, parseRows, resolveIdentities, validateRows } from '../spreadsheetImport';
import {
  gradebookImportColumns,
  buildGradebookContextRules,
  buildGradebookIdentityResolvers,
  validateGradebookScores,
  findGradebookDuplicateRows,
  buildGradebookCreateData,
  buildGradebookUpdateData,
  type GradebookImportRow,
  type ResolvedGradebookImportRow,
  type GradebookIdentityCandidates,
  type GradebookTargetContext,
  type GradebookColumnInfo,
} from '../importGradebook';

const ctx: GradebookTargetContext = {
  classId: 'cls1', className: 'Class A',
  subjectId: 'sub1', subjectName: 'English',
  termId: 'trm1', termName: 'Christmas Term',
};

const candidates: GradebookIdentityCandidates = {
  students: [{ id: 'stu1', name: 'Ada Lovelace' }, { id: 'stu2', name: 'Ada Lovelace' }, { id: 'stu3', name: 'Bo Diddley' }],
  columns: [{ id: 'col1', name: 'Mid-term Exam' }],
};

// ─── Column parsing ───────────────────────────────────────────────────────

describe('gradebookImportColumns', () => {
  it('parses a clean row', () => {
    const { rows, errors } = parseRows(
      [{ Student: 'Bo Diddley', Class: 'Class A', Subject: 'English', Term: 'Christmas Term', Column: 'Mid-term Exam', Score: 85 }],
      gradebookImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([{
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English',
      termName: 'Christmas Term', columnLabel: 'Mid-term Exam', score: 85,
    }]);
  });

  it('flags every missing required header via validateStructure', () => {
    const result = validateStructure([{ Student: 'Bo' }], gradebookImportColumns);
    expect(result.ok).toBe(false);
    expect(result.missingHeaders).toEqual(['Class', 'Subject', 'Term', 'Column', 'Score']);
  });

  it('rejects a non-numeric Score', () => {
    const { errors } = parseRows(
      [{ Student: 'Bo', Class: 'Class A', Subject: 'English', Term: 'Christmas Term', Column: 'Mid-term Exam', Score: 'high' }],
      gradebookImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Score: "high" is not a valid score' }]);
  });
});

// ─── Context validation (single-gradebook-per-import) ─────────────────────

describe('buildGradebookContextRules', () => {
  const rules = buildGradebookContextRules(ctx);
  const baseRow: GradebookImportRow = {
    studentName: 'Bo', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
    columnLabel: 'Mid-term Exam', score: 80,
  };

  it('accepts a row matching the selected gradebook exactly', () => {
    const { valid, errors } = validateRows([baseRow], rules);
    expect(errors).toEqual([]);
    expect(valid).toEqual([baseRow]);
  });

  it('accepts a case/whitespace-different but otherwise matching row', () => {
    const row = { ...baseRow, className: '  class a  ', subjectName: 'ENGLISH' };
    const { errors } = validateRows([row], rules);
    expect(errors).toEqual([]);
  });

  it('rejects a row referencing a different class', () => {
    const row = { ...baseRow, className: 'Class B' };
    const { errors } = validateRows([row], rules);
    expect(errors).toEqual([
      { row: 2, message: 'Class "Class B" doesn\'t match the selected gradebook\'s class ("Class A")' },
    ]);
  });

  it('rejects a row referencing a different subject and term simultaneously', () => {
    const row = { ...baseRow, subjectName: 'Maths', termName: 'Easter Term' };
    const { errors } = validateRows([row], rules);
    expect(errors).toHaveLength(2);
  });
});

// ─── Identity resolution ──────────────────────────────────────────────────

describe('buildGradebookIdentityResolvers', () => {
  it('auto-resolves Student and Column when each has exactly one match', async () => {
    const row: GradebookImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English',
      termName: 'Christmas Term', columnLabel: 'Mid-term Exam', score: 80,
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildGradebookIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([{ ...row, studentId: 'stu3', columnId: 'col1' }]);
  });

  it('flags an ambiguous student name', async () => {
    const row: GradebookImportRow = {
      studentName: 'Ada Lovelace', className: 'Class A', subjectName: 'English',
      termName: 'Christmas Term', columnLabel: 'Mid-term Exam', score: 80,
    };
    const { needsResolution } = await resolveIdentities([row], buildGradebookIdentityResolvers(candidates));
    expect(needsResolution).toEqual([
      { column: 'Student', value: 'Ada Lovelace', matches: [{ id: 'stu1', label: 'Ada Lovelace' }, { id: 'stu2', label: 'Ada Lovelace' }] },
    ]);
  });

  it('flags a column label with no match', async () => {
    const row: GradebookImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English',
      termName: 'Christmas Term', columnLabel: 'Final Exam', score: 80,
    };
    const { needsResolution } = await resolveIdentities([row], buildGradebookIdentityResolvers(candidates));
    expect(needsResolution).toEqual([{ column: 'Column', value: 'Final Exam', matches: [] }]);
  });
});

// ─── Score-vs-maxScore validation ──────────────────────────────────────────

describe('validateGradebookScores', () => {
  const columnsById = new Map<string, GradebookColumnInfo>([
    ['col1', { id: 'col1', label: 'Mid-term Exam', maxScore: 100, columnWeight: 0.5, assessmentType: 'exam' }],
  ]);

  it('passes a score within the column max', () => {
    const row: ResolvedGradebookImportRow = {
      studentName: 'Bo', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      columnLabel: 'Mid-term Exam', score: 90, studentId: 'stu3', columnId: 'col1',
    };
    expect(validateGradebookScores([{ row, rowNumber: 2 }], columnsById)).toEqual([]);
  });

  it('reports a score over the column max, using the supplied original row number', () => {
    const row: ResolvedGradebookImportRow = {
      studentName: 'Bo', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      columnLabel: 'Mid-term Exam', score: 150, studentId: 'stu3', columnId: 'col1',
    };
    expect(validateGradebookScores([{ row, rowNumber: 9 }], columnsById)).toEqual([
      { row: 9, message: 'score (150) exceeds max score (100) for column "Mid-term Exam"' },
    ]);
  });

  it('preserves original row numbers across a gap left by an earlier skipped row', () => {
    const rowA: ResolvedGradebookImportRow = {
      studentName: 'Bo', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      columnLabel: 'Mid-term Exam', score: 150, studentId: 'stu3', columnId: 'col1',
    };
    // Row 2 was skipped during manual identity resolution — rowA is really row 3 in the original file.
    expect(validateGradebookScores([{ row: rowA, rowNumber: 3 }], columnsById)).toEqual([
      { row: 3, message: 'score (150) exceeds max score (100) for column "Mid-term Exam"' },
    ]);
  });
});

// ─── Same-file duplicate-row detection ─────────────────────────────────────

describe('findGradebookDuplicateRows', () => {
  it('reports a second row for the same (studentId, columnId) as a duplicate', () => {
    const rowFirst: ResolvedGradebookImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      columnLabel: 'Mid-term Exam', score: 85, studentId: 'stu3', columnId: 'col1',
    };
    const rowSecond: ResolvedGradebookImportRow = { ...rowFirst, score: 90 };
    const errors = findGradebookDuplicateRows([
      { row: rowFirst, rowNumber: 2 },
      { row: rowSecond, rowNumber: 7 },
    ]);
    expect(errors).toEqual([
      { row: 7, message: 'duplicate entry for "Bo Diddley" in column "Mid-term Exam" (already set on row 2)' },
    ]);
  });

  it('does not flag the same student in two different columns', () => {
    const rowA: ResolvedGradebookImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      columnLabel: 'Mid-term Exam', score: 85, studentId: 'stu3', columnId: 'col1',
    };
    const rowB: ResolvedGradebookImportRow = { ...rowA, columnLabel: 'Final Exam', columnId: 'col2', score: 90 };
    expect(findGradebookDuplicateRows([{ row: rowA, rowNumber: 2 }, { row: rowB, rowNumber: 3 }])).toEqual([]);
  });

  it('does not flag two different students in the same column', () => {
    const rowA: ResolvedGradebookImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      columnLabel: 'Mid-term Exam', score: 85, studentId: 'stu3', columnId: 'col1',
    };
    const rowB: ResolvedGradebookImportRow = { ...rowA, studentName: 'Ada Lovelace', studentId: 'stu1', score: 92 };
    expect(findGradebookDuplicateRows([{ row: rowA, rowNumber: 2 }, { row: rowB, rowNumber: 3 }])).toEqual([]);
  });
});

// ─── Write shape ────────────────────────────────────────────────────────────

describe('buildGradebookCreateData / buildGradebookUpdateData', () => {
  const resolvedRow: ResolvedGradebookImportRow = {
    studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
    columnLabel: 'Mid-term Exam', score: 85, studentId: 'stu3', columnId: 'col1',
  };
  const column: GradebookColumnInfo = {
    id: 'col1', label: 'Mid-term Exam', maxScore: 100, columnWeight: 0.5, assessmentType: 'exam', date: '2026-09-03',
  };
  const writeCtx = {
    institutionId: 'inst1', classId: 'cls1', className: 'Class A', subjectId: 'sub1', termId: 'trm1',
    teacherId: 'teacher1', teacherName: 'Mr. Doe', departmentId: 'dept1',
  };

  it('create: stores the column id (not its label) as assessmentName, matching performSave\'s quirk', () => {
    const data = buildGradebookCreateData(resolvedRow, column, writeCtx);
    expect(data.assessmentName).toBe('col1');
  });

  it('create: matches ResultDocument\'s field shape with gradebook attribution', () => {
    const data = buildGradebookCreateData(resolvedRow, column, writeCtx);
    expect(data).toMatchObject({
      studentId: 'stu3', studentName: 'Bo Diddley',
      classId: 'cls1', className: 'Class A', termId: 'trm1', institutionId: 'inst1', subjectId: 'sub1',
      assessmentType: 'exam', score: 85, maxScore: 100, weight: 0.5, date: '2026-09-03',
      gradebookColumnId: 'col1', columnWeight: 0.5, source: 'gradebook',
      teacherId: 'teacher1', teacherName: 'Mr. Doe', departmentId: 'dept1',
    });
    expect(data.createdAt).toBeDefined();
  });

  it('update: touches only the substantive grading fields, leaving locked context out', () => {
    const data = buildGradebookUpdateData(resolvedRow, column);
    expect(data).toEqual({ score: 85, maxScore: 100, assessmentType: 'exam', columnWeight: 0.5, weight: 0.5 });
    expect(data).not.toHaveProperty('studentId');
    expect(data).not.toHaveProperty('gradebookColumnId');
    expect(data).not.toHaveProperty('createdAt');
  });
});
