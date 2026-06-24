import { describe, it, expect } from 'vitest';
import type { ReportCardDocument, ReportCardSubjectRow, Timestamp } from '../firebase';
import {
  type BuilderCard,
  type ReportConfig,
  attendanceRate,
  filterPopulation,
  runReport,
  columnValue,
} from '../reportBuilder';

// ── Fixtures ────────────────────────────────────────────────────────────────────

function makeSubject(overrides: Partial<ReportCardSubjectRow> = {}): ReportCardSubjectRow {
  return {
    subjectId: 'subj-math',
    subjectName: 'Mathematics',
    teacherId: 't1',
    teacherName: 'Jane Doe',
    cwWeight: 50,
    examWeight: 50,
    cwGrade: 70,
    examGrade: 80,
    finalGrade: 75,
    letterGrade: 'B+',
    subjectPosition: null,
    conductGrade: 'G',
    commentNumber: 1,
    ...overrides,
  };
}

function makeCard(overrides: Partial<BuilderCard> = {}): BuilderCard {
  const base: BuilderCard = {
    id: 'card-1',
    studentId: 'stu-1',
    studentName: 'Alice Johnson',
    institutionStudentId: 'S001',
    dateOfBirth: '2010-05-01',
    classId: 'class-9a',
    className: '9A',
    gradeLevel: 9,
    classPopulation: 30,
    houseId: 'house-red',
    houseName: 'Red',
    termId: 'term-1',
    termName: 'Term 1',
    academicYearId: 'ay-2025',
    academicYearName: '2025-2026',
    nextTermStart: null,
    institutionId: 'inst-1',
    institutionName: 'Test School',
    institutionMotto: null,
    institutionAddress: null,
    institutionPhone: null,
    institutionEmail: null,
    institutionLogoUrl: null,
    authorizedSignature: null,
    classSupervisorLabel: 'Class Supervisor',
    gradeSupervisorLabel: 'Grade Supervisor',
    principalLabel: 'Principal',
    vicePrincipalLabel: 'Vice Principal',
    classSupervisorComment: '',
    gradeSupervisorComment: '',
    principalComment: '',
    vicePrincipalComment: '',
    totalPossibleSessions: 100,
    sessionsAbsent: 5,
    daysLate: 2,
    extraCurricularActivities: [],
    positionsOfResponsibility: [],
    gradingSystem: 'flat',
    subjects: [makeSubject()],
    studentAverage: 75,
    classAverage: 70,
    classRank: 3,
    gpa: 3.2,
    demerits: null,
    suspensions: null,
    detentions: null,
    generatedAt: null as unknown as Timestamp,
    generatedBy: 'admin',
    generatedByRole: 'institution_admin',
    generatedViaBatch: false,
  } satisfies ReportCardDocument & { id: string; gradeLevel: number | null };
  return { ...base, ...overrides };
}

const baseConfig: ReportConfig = {
  name: 'Test',
  population: { type: 'institution' },
  conditions: [],
  output: 'list',
  columns: ['studentName', 'studentAverage'],
};

// ── attendanceRate ──────────────────────────────────────────────────────────────

describe('attendanceRate', () => {
  it('computes (total - absent) / total as a percentage', () => {
    expect(attendanceRate(makeCard({ totalPossibleSessions: 100, sessionsAbsent: 5 }))).toBe(95);
  });
  it('returns null when no sessions are recorded', () => {
    expect(attendanceRate(makeCard({ totalPossibleSessions: 0 }))).toBeNull();
  });
});

// ── filterPopulation ────────────────────────────────────────────────────────────

describe('filterPopulation', () => {
  const cards = [
    makeCard({ id: 'a', classId: 'c1', gradeLevel: 9, houseId: 'h1', academicYearId: 'ay1' }),
    makeCard({ id: 'b', classId: 'c2', gradeLevel: 10, houseId: 'h2', academicYearId: 'ay2' }),
    makeCard({ id: 'c', classId: 'c1', gradeLevel: 9, houseId: 'h2', academicYearId: 'ay1' }),
  ];

  it('institution returns everything', () => {
    expect(filterPopulation(cards, { type: 'institution' })).toHaveLength(3);
  });
  it('class filters by classId', () => {
    expect(filterPopulation(cards, { type: 'class', classId: 'c1' }).map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('grade filters by numeric grade level', () => {
    expect(filterPopulation(cards, { type: 'grade', grade: 10 }).map((c) => c.id)).toEqual(['b']);
  });
  it('cohort filters by academic year', () => {
    expect(filterPopulation(cards, { type: 'cohort', academicYearId: 'ay1' }).map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('house filters by houseId', () => {
    expect(filterPopulation(cards, { type: 'house', houseId: 'h2' }).map((c) => c.id)).toEqual(['b', 'c']);
  });
  it('returns empty when the required selector is missing', () => {
    expect(filterPopulation(cards, { type: 'class' })).toHaveLength(0);
  });
});

// ── numeric conditions + percentage ─────────────────────────────────────────────

describe('runReport — numeric conditions', () => {
  const cards = [
    makeCard({ id: 'a', studentAverage: 90 }),
    makeCard({ id: 'b', studentAverage: 80 }),
    makeCard({ id: 'c', studentAverage: 39 }),
    makeCard({ id: 'd', studentAverage: null }),
  ];

  it('gte filters and excludes null metrics', () => {
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'average', operator: 'gte', value: 80 }],
    });
    expect(res.matched.map((c) => c.id)).toEqual(['a', 'b']);
    expect(res.matchedCount).toBe(2);
    expect(res.total).toBe(4);
  });

  it('lt selects the failing student', () => {
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'average', operator: 'lt', value: 40 }],
    });
    expect(res.matched.map((c) => c.id)).toEqual(['c']);
  });

  it('between is inclusive on both bounds', () => {
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'average', operator: 'between', value: 80, value2: 90 }],
    });
    expect(res.matched.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('percentage is matched / population', () => {
    const res = runReport(cards, {
      ...baseConfig,
      output: 'percentage',
      conditions: [{ metric: 'average', operator: 'gte', value: 80 }],
    });
    expect(res.percentage).toBe(50);
  });

  it('percentage is null for an empty population', () => {
    const res = runReport([], { ...baseConfig, output: 'percentage' });
    expect(res.percentage).toBeNull();
  });
});

// ── AND across multiple conditions ───────────────────────────────────────────────

describe('runReport — multiple conditions are AND-ed', () => {
  const cards = [
    makeCard({ id: 'a', studentAverage: 90, gpa: 3.8 }),
    makeCard({ id: 'b', studentAverage: 90, gpa: 3.0 }),
  ];
  it('requires every condition to pass', () => {
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [
        { metric: 'average', operator: 'gte', value: 85 },
        { metric: 'gpa', operator: 'gte', value: 3.5 },
      ],
    });
    expect(res.matched.map((c) => c.id)).toEqual(['a']);
  });
});

// ── topN ─────────────────────────────────────────────────────────────────────────

describe('runReport — topN is population-relative', () => {
  const cards = [
    makeCard({ id: 'a', studentAverage: 70 }),
    makeCard({ id: 'b', studentAverage: 95 }),
    makeCard({ id: 'c', studentAverage: 85 }),
  ];
  it('returns the highest N by the metric', () => {
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'average', operator: 'topN', value: 2 }],
    });
    expect(res.matched.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });
});

// ── subject + conduct metrics ────────────────────────────────────────────────────

describe('runReport — subject and conduct metrics', () => {
  it('subjectScore reads the chosen subject row', () => {
    const cards = [
      makeCard({ id: 'pass', subjects: [makeSubject({ subjectId: 's1', finalGrade: 55 })] }),
      makeCard({ id: 'fail', subjects: [makeSubject({ subjectId: 's1', finalGrade: 30 })] }),
    ];
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'subjectScore', operator: 'gte', value: 40, subjectId: 's1' }],
    });
    expect(res.matched.map((c) => c.id)).toEqual(['pass']);
  });

  it('subjectScore yields no match when the subject is absent', () => {
    const cards = [makeCard({ id: 'x', subjects: [makeSubject({ subjectId: 's1' })] })];
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'subjectScore', operator: 'gte', value: 40, subjectId: 's-other' }],
    });
    expect(res.matchedCount).toBe(0);
  });

  it('conduct matches when ANY subject row has a flagged conduct grade', () => {
    const cards = [
      makeCard({ id: 'flagged', subjects: [makeSubject({ conductGrade: 'G' }), makeSubject({ conductGrade: 'U' })] }),
      makeCard({ id: 'clean', subjects: [makeSubject({ conductGrade: 'G' })] }),
    ];
    const res = runReport(cards, {
      ...baseConfig,
      conditions: [{ metric: 'conduct', operator: 'in', values: ['U', 'F'] }],
    });
    expect(res.matched.map((c) => c.id)).toEqual(['flagged']);
  });
});

// ── sorting + projection ─────────────────────────────────────────────────────────

describe('runReport — sorting', () => {
  it('sorts descending by a numeric column with nulls last', () => {
    const cards = [
      makeCard({ id: 'a', studentAverage: 70 }),
      makeCard({ id: 'b', studentAverage: null }),
      makeCard({ id: 'c', studentAverage: 90 }),
    ];
    const res = runReport(cards, { ...baseConfig, sortBy: 'studentAverage', sortDir: 'desc' });
    expect(res.matched.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('columnValue', () => {
  const card = makeCard();
  it('formats average to one decimal and gpa to two', () => {
    expect(columnValue(card, 'studentAverage')).toBe('75.0');
    expect(columnValue(card, 'gpa')).toBe('3.20');
  });
  it('formats attendance as a rounded percentage', () => {
    expect(columnValue(card, 'attendance')).toBe('95%');
  });
  it('renders the focus subject grade and letter', () => {
    expect(columnValue(card, 'subject', 'subj-math')).toBe('75.0 (B+)');
  });
  it('falls back to an em dash for missing values', () => {
    expect(columnValue(makeCard({ houseName: null }), 'houseName')).toBe('—');
  });
});
