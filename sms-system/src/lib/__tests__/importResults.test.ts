import { describe, it, expect } from 'vitest';
import { validateStructure, parseRows, resolveIdentities, validateRows } from '../spreadsheetImport';
import {
  resultsImportColumns,
  resultsValidationRules,
  buildResultsIdentityResolvers,
  buildResultData,
  resultDuplicateKey,
  type ResultImportRow,
  type ResolvedResultImportRow,
  type ResultsIdentityCandidates,
} from '../importResults';

const candidates: ResultsIdentityCandidates = {
  students: [{ id: 'stu1', name: 'Ada Lovelace' }, { id: 'stu2', name: 'Ada Lovelace' }, { id: 'stu3', name: 'Bo Diddley' }],
  classes: [{ id: 'cls1', name: 'Class A' }],
  subjects: [{ id: 'sub1', name: 'English' }],
  terms: [{ id: 'trm1', name: 'Christmas Term' }],
};

// ─── Column parsing ───────────────────────────────────────────────────────

describe('resultsImportColumns', () => {
  it('parses a clean, fully-populated row', () => {
    const { rows, errors } = parseRows(
      [
        {
          Student: 'Bo Diddley',
          Class: 'Class A',
          Subject: 'English',
          Term: 'Christmas Term',
          Assessment: 'Mid-term',
          Type: 'Coursework',
          Score: 90,
          'Max Score': 100,
          Weight: 0.5,
          Date: '2026-09-03',
        },
      ],
      resultsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        studentName: 'Bo Diddley',
        className: 'Class A',
        subjectName: 'English',
        termName: 'Christmas Term',
        assessmentName: 'Mid-term',
        assessmentType: 'coursework',
        score: 90,
        maxScore: 100,
        weight: 0.5,
        date: '2026-09-03',
      },
    ]);
  });

  it('leaves Weight/Date unset when omitted, without an error', () => {
    const { rows, errors } = parseRows(
      [
        {
          Student: 'Bo',
          Class: 'Class A',
          Subject: 'English',
          Term: 'Christmas Term',
          Assessment: 'Quiz',
          Type: 'exam',
          Score: 5,
          'Max Score': 10,
          Weight: null,
          Date: null,
        },
      ],
      resultsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows[0].weight).toBeUndefined();
    expect(rows[0].date).toBeUndefined();
  });

  it('rejects an assessment type outside coursework/exam', () => {
    const { errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Subject: 'English', Term: 'Christmas Term',
          Assessment: 'Quiz', Type: 'homework', Score: 5, 'Max Score': 10,
          Weight: null, Date: null,
        },
      ],
      resultsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Type: "homework" must be "coursework" or "exam"' }]);
  });

  it('rejects a weight outside 0-1', () => {
    const { errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Subject: 'English', Term: 'Christmas Term',
          Assessment: 'Quiz', Type: 'exam', Score: 5, 'Max Score': 10,
          Weight: 1.5, Date: null,
        },
      ],
      resultsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Weight: weight must be between 0 and 1' }]);
  });

  it('accepts an Excel date-serial number for Date', () => {
    const { rows, errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Subject: 'English', Term: 'Christmas Term',
          Assessment: 'Quiz', Type: 'exam', Score: 5, 'Max Score': 10,
          Weight: null, Date: 46630, // 2027-08-31, per XLSX.SSF.parse_date_code
        },
      ],
      resultsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows[0].date).toBe('2027-08-31');
  });

  it('rejects a malformed Date string', () => {
    const { errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Subject: 'English', Term: 'Christmas Term',
          Assessment: 'Quiz', Type: 'exam', Score: 5, 'Max Score': 10,
          Weight: null, Date: 'not-a-date',
        },
      ],
      resultsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Date: "not-a-date" is not a valid date (expected YYYY-MM-DD)' }]);
  });

  it('flags a missing required header via validateStructure', () => {
    const result = validateStructure([{ Student: 'Bo' }], resultsImportColumns);
    expect(result.ok).toBe(false);
    expect(result.missingHeaders).toEqual([
      'Class', 'Subject', 'Term', 'Assessment', 'Type', 'Score', 'Max Score',
    ]);
  });
});

// ─── Identity resolution ──────────────────────────────────────────────────

describe('buildResultsIdentityResolvers', () => {
  it('auto-resolves every column when each name has exactly one match', async () => {
    const row: ResultImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      assessmentName: 'Quiz', assessmentType: 'exam', score: 5, maxScore: 10,
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildResultsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([{ ...row, studentId: 'stu3', classId: 'cls1', subjectId: 'sub1', termId: 'trm1' }]);
  });

  it('flags an ambiguous student name (two students share "Ada Lovelace")', async () => {
    const row: ResultImportRow = {
      studentName: 'Ada Lovelace', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      assessmentName: 'Quiz', assessmentType: 'exam', score: 5, maxScore: 10,
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildResultsIdentityResolvers(candidates));
    expect(resolved).toEqual([]);
    expect(needsResolution).toEqual([
      { column: 'Student', value: 'Ada Lovelace', matches: [{ id: 'stu1', label: 'Ada Lovelace' }, { id: 'stu2', label: 'Ada Lovelace' }] },
    ]);
  });

  it('flags a class name with no match', async () => {
    const row: ResultImportRow = {
      studentName: 'Bo Diddley', className: 'Class Z', subjectName: 'English', termName: 'Christmas Term',
      assessmentName: 'Quiz', assessmentType: 'exam', score: 5, maxScore: 10,
    };
    const { needsResolution } = await resolveIdentities([row], buildResultsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([{ column: 'Class', value: 'Class Z', matches: [] }]);
  });
});

// ─── Business-rule validation ─────────────────────────────────────────────

describe('resultsValidationRules', () => {
  it('rejects a score above max score', () => {
    const row: ResultImportRow = {
      studentName: 'Bo', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      assessmentName: 'Quiz', assessmentType: 'exam', score: 95, maxScore: 90,
    };
    const { valid, errors } = validateRows([row], resultsValidationRules);
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ row: 2, message: 'score (95) exceeds max score (90)' }]);
  });

  it('accepts a score equal to max score', () => {
    const row: ResultImportRow = {
      studentName: 'Bo', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
      assessmentName: 'Quiz', assessmentType: 'exam', score: 90, maxScore: 90,
    };
    const { valid, errors } = validateRows([row], resultsValidationRules);
    expect(errors).toEqual([]);
    expect(valid).toEqual([row]);
  });
});

// ─── Advisory duplicate detection ──────────────────────────────────────────

describe('resultDuplicateKey', () => {
  it('is identical for two rows sharing the same Student/Class/Subject/Term/Assessment Name', () => {
    const a = { studentId: 's1', classId: 'c1', subjectId: 'sub1', termId: 't1', assessmentName: 'Mid-term' };
    const b = { studentId: 's1', classId: 'c1', subjectId: 'sub1', termId: 't1', assessmentName: 'Mid-term' };
    expect(resultDuplicateKey(a)).toBe(resultDuplicateKey(b));
  });

  it('is case/whitespace-insensitive on assessment name, matching §3\'s name-matching convention', () => {
    const a = { studentId: 's1', classId: 'c1', subjectId: 'sub1', termId: 't1', assessmentName: 'Mid-term' };
    const b = { studentId: 's1', classId: 'c1', subjectId: 'sub1', termId: 't1', assessmentName: '  MID-TERM  ' };
    expect(resultDuplicateKey(a)).toBe(resultDuplicateKey(b));
  });

  it('differs when any identity field differs', () => {
    const a = { studentId: 's1', classId: 'c1', subjectId: 'sub1', termId: 't1', assessmentName: 'Mid-term' };
    const b = { ...a, subjectId: 'sub2' };
    expect(resultDuplicateKey(a)).not.toBe(resultDuplicateKey(b));
  });
});

// ─── Write shape ───────────────────────────────────────────────────────────

describe('buildResultData', () => {
  const resolvedRow: ResolvedResultImportRow = {
    studentName: 'Bo Diddley', className: 'Class A', subjectName: 'English', termName: 'Christmas Term',
    assessmentName: 'Quiz', assessmentType: 'exam', score: 8, maxScore: 10, weight: 0.4, date: '2026-09-03',
    studentId: 'stu3', classId: 'cls1', subjectId: 'sub1', termId: 'trm1',
  };
  const ctx = { institutionId: 'inst1', teacherId: 'teacher1', teacherName: 'Mr. Doe', departmentId: 'dept1' };

  it('matches ResultDocument\'s field shape, including optional weight/date', () => {
    const data = buildResultData(resolvedRow, ctx);
    expect(data).toMatchObject({
      studentId: 'stu3', studentName: 'Bo Diddley',
      teacherId: 'teacher1', teacherName: 'Mr. Doe',
      classId: 'cls1', className: 'Class A',
      termId: 'trm1', institutionId: 'inst1', departmentId: 'dept1',
      subjectId: 'sub1', assessmentName: 'Quiz', assessmentType: 'exam',
      score: 8, maxScore: 10, weight: 0.4, date: '2026-09-03',
    });
    expect(data.createdAt).toBeDefined();
    expect(data).not.toHaveProperty('gradebookColumnId');
    expect(data).not.toHaveProperty('source');
  });

  it('omits weight and date entirely when absent, rather than writing them as undefined', () => {
    const { weight, date, ...rest } = resolvedRow;
    void weight; void date;
    const data = buildResultData(rest as ResolvedResultImportRow, ctx);
    expect(data).not.toHaveProperty('weight');
    expect(data).not.toHaveProperty('date');
  });
});
