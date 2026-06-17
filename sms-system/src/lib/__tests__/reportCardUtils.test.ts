import { describe, it, expect } from 'vitest';
import {
  letterGrade,
  gpaPoints,
  computeGPA,
  computeCWGrade,
  computeExamGrade,
  computeFinalGrade,
  computeRanks,
  nextTermStart,
} from '../reportCardUtils';

// ─── letterGrade ──────────────────────────────────────────────────────────────

describe('letterGrade', () => {
  it('returns A+ at 95 and above', () => {
    expect(letterGrade(100)).toBe('A+');
    expect(letterGrade(95)).toBe('A+');
  });
  it('returns A between 85 and 94.9', () => {
    expect(letterGrade(85)).toBe('A');
    expect(letterGrade(94.9)).toBe('A');
  });
  it('returns A- between 80 and 84.9', () => {
    expect(letterGrade(80)).toBe('A-');
    expect(letterGrade(84.9)).toBe('A-');
  });
  it('returns B+ between 75 and 79.9', () => {
    expect(letterGrade(75)).toBe('B+');
    expect(letterGrade(79.9)).toBe('B+');
  });
  it('returns B between 70 and 74.9', () => {
    expect(letterGrade(70)).toBe('B');
    expect(letterGrade(74.9)).toBe('B');
  });
  it('returns B- between 65 and 69.9', () => {
    expect(letterGrade(65)).toBe('B-');
    expect(letterGrade(69.9)).toBe('B-');
  });
  it('returns C+ between 60 and 64.9', () => {
    expect(letterGrade(60)).toBe('C+');
  });
  it('returns C between 55 and 59.9', () => {
    expect(letterGrade(55)).toBe('C');
  });
  it('returns C- between 50 and 54.9', () => {
    expect(letterGrade(50)).toBe('C-');
  });
  it('returns D+ between 45 and 49.9', () => {
    expect(letterGrade(45)).toBe('D+');
  });
  it('returns D between 40 and 44.9', () => {
    expect(letterGrade(40)).toBe('D');
  });
  it('returns D- between 30 and 39.9', () => {
    expect(letterGrade(30)).toBe('D-');
    expect(letterGrade(39.9)).toBe('D-');
  });
  it('returns E below 30', () => {
    expect(letterGrade(29.9)).toBe('E');
    expect(letterGrade(0)).toBe('E');
  });
});

// ─── gpaPoints ───────────────────────────────────────────────────────────────

describe('gpaPoints', () => {
  it('returns 4 for all A variants', () => {
    expect(gpaPoints('A+')).toBe(4);
    expect(gpaPoints('A')).toBe(4);
    expect(gpaPoints('A-')).toBe(4);
  });
  it('returns 3 for all B variants', () => {
    expect(gpaPoints('B+')).toBe(3);
    expect(gpaPoints('B')).toBe(3);
    expect(gpaPoints('B-')).toBe(3);
  });
  it('returns 2 for all C variants', () => {
    expect(gpaPoints('C+')).toBe(2);
    expect(gpaPoints('C')).toBe(2);
    expect(gpaPoints('C-')).toBe(2);
  });
  it('returns 1 for all D variants', () => {
    expect(gpaPoints('D+')).toBe(1);
    expect(gpaPoints('D')).toBe(1);
    expect(gpaPoints('D-')).toBe(1);
  });
  it('returns 0 for E', () => {
    expect(gpaPoints('E')).toBe(0);
  });
});

// ─── computeGPA ──────────────────────────────────────────────────────────────

describe('computeGPA', () => {
  it('returns null for an empty subject list', () => {
    expect(computeGPA([])).toBeNull();
  });
  it('computes correct GPA for a single subject', () => {
    // finalGrade 90 → A → 4 pts; GPA = 4.00
    expect(computeGPA([{ finalGrade: 90 }])).toBe(4.00);
  });
  it('averages GPA points across subjects', () => {
    // 90 → A (4), 70 → B (3) → avg = 3.5
    expect(computeGPA([{ finalGrade: 90 }, { finalGrade: 70 }])).toBe(3.5);
  });
  it('rounds to 2 decimal places', () => {
    // 90 (A=4), 70 (B=3), 55 (C=2) → avg = 9/3 = 3.00
    expect(computeGPA([{ finalGrade: 90 }, { finalGrade: 70 }, { finalGrade: 55 }])).toBe(3.00);
  });
});

// ─── computeCWGrade ───────────────────────────────────────────────────────────

describe('computeCWGrade', () => {
  it('returns null when no coursework results exist', () => {
    expect(computeCWGrade([])).toBeNull();
    expect(computeCWGrade([{ assessmentType: 'exam', score: 80, maxScore: 100 }])).toBeNull();
  });
  it('computes percentage for a single coursework result', () => {
    expect(computeCWGrade([{ assessmentType: 'coursework', score: 75, maxScore: 100 }])).toBe(75);
  });
  it('averages multiple coursework results', () => {
    const results = [
      { assessmentType: 'coursework' as const, score: 80, maxScore: 100 },
      { assessmentType: 'coursework' as const, score: 60, maxScore: 100 },
    ];
    expect(computeCWGrade(results)).toBe(70);
  });
  it('handles non-100 maxScore correctly', () => {
    // 36/40 = 90%
    expect(computeCWGrade([{ assessmentType: 'coursework', score: 36, maxScore: 40 }])).toBe(90);
  });
  it('ignores results with maxScore of 0 to prevent division by zero', () => {
    const results = [
      { assessmentType: 'coursework' as const, score: 0, maxScore: 0 },
    ];
    expect(computeCWGrade(results)).toBeNull();
  });
  it('excludes maxScore=0 entries but still averages valid ones', () => {
    const results = [
      { assessmentType: 'coursework' as const, score: 0, maxScore: 0 },
      { assessmentType: 'coursework' as const, score: 80, maxScore: 100 },
    ];
    expect(computeCWGrade(results)).toBe(80);
  });
});

// ─── computeExamGrade ────────────────────────────────────────────────────────

describe('computeExamGrade', () => {
  it('returns null when no exam results exist', () => {
    expect(computeExamGrade([])).toBeNull();
    expect(computeExamGrade([{ assessmentType: 'coursework', score: 80, maxScore: 100 }])).toBeNull();
  });
  it('computes percentage for a single exam result', () => {
    expect(computeExamGrade([{ assessmentType: 'exam', score: 60, maxScore: 100 }])).toBe(60);
  });
  it('ignores results with maxScore of 0', () => {
    expect(computeExamGrade([{ assessmentType: 'exam', score: 0, maxScore: 0 }])).toBeNull();
  });
});

// ─── computeFinalGrade ───────────────────────────────────────────────────────

describe('computeFinalGrade', () => {
  it('computes weighted average when both components are present', () => {
    // CW=80 at 40% weight, Exam=60 at 60% weight → 80*0.4 + 60*0.6 = 32+36 = 68
    expect(computeFinalGrade(80, 60, 40, 60)).toBe(68);
  });
  it('re-normalises to exam grade when cwGrade is null', () => {
    // only exam available (weight 60) → 70 × (60/60) = 70
    expect(computeFinalGrade(null, 70, 40, 60)).toBe(70);
  });
  it('re-normalises to cw grade when examGrade is null', () => {
    // only CW available (weight 40) → 80 × (40/40) = 80
    expect(computeFinalGrade(80, null, 40, 60)).toBe(80);
  });
  it('returns 0 when both components are null', () => {
    expect(computeFinalGrade(null, null, 50, 50)).toBe(0);
  });
  it('rounds to 1 decimal place', () => {
    // CW=100 at 33% + Exam=100 at 67% → 100, but e.g. 85 at 33% = 28.05, 70 at 67% = 46.9 → 74.95 → 75
    expect(computeFinalGrade(85, 70, 33, 67)).toBe(75);
  });
});

// ─── computeRanks ────────────────────────────────────────────────────────────

describe('computeRanks', () => {
  it('returns an empty object for an empty list', () => {
    expect(computeRanks([])).toEqual({});
  });
  it('ranks a single student as 1', () => {
    expect(computeRanks([{ id: 'a', score: 75 }])).toEqual({ a: 1 });
  });
  it('ranks students from highest to lowest score', () => {
    const ranks = computeRanks([
      { id: 'a', score: 60 },
      { id: 'b', score: 90 },
      { id: 'c', score: 75 },
    ]);
    expect(ranks['b']).toBe(1);
    expect(ranks['c']).toBe(2);
    expect(ranks['a']).toBe(3);
  });
  it('assigns sequential ranks without gaps (no tie-handling)', () => {
    // Two equal scores get sequential positions (not dense ranking).
    const ranks = computeRanks([
      { id: 'a', score: 80 },
      { id: 'b', score: 80 },
      { id: 'c', score: 70 },
    ]);
    expect(ranks['c']).toBe(3);
    expect([ranks['a'], ranks['b']].sort()).toEqual([1, 2]);
  });
});

// ─── nextTermStart ───────────────────────────────────────────────────────────

describe('nextTermStart', () => {
  const terms = [
    { id: 't1', termNumber: 1, academicYearId: 'y1', startDate: '2024-01-15', status: 'completed' },
    { id: 't2', termNumber: 2, academicYearId: 'y1', startDate: '2024-04-22', status: 'completed' },
    { id: 't3', termNumber: 3, academicYearId: 'y1', startDate: '2024-09-02', status: 'completed' },
    { id: 't4', termNumber: 1, academicYearId: 'y2', startDate: '2025-01-13', status: 'upcoming' },
  ];

  it('returns the next term in the same academic year', () => {
    expect(nextTermStart(1, 'y1', terms)).toBe('2024-04-22');
  });
  it('returns the earliest upcoming term when no next term in same year', () => {
    expect(nextTermStart(3, 'y1', terms)).toBe('2025-01-13');
  });
  it('returns null when there is no subsequent term at all', () => {
    expect(nextTermStart(1, 'y2', terms)).toBeNull();
  });
  it('returns earliest upcoming term when termNumber is undefined', () => {
    expect(nextTermStart(undefined, 'y1', terms)).toBe('2025-01-13');
  });
});
