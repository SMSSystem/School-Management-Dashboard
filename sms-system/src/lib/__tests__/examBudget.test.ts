import { describe, expect, it } from 'vitest';
import { DAILY_WRITE_LIMIT, estimateExamWrites, studentsInClass } from '../examBudget';

// The write estimate on the exam form (EXAMS_FEATURE_SPEC.md §9).

describe('estimateExamWrites', () => {
  it('counts a start, the checkpoints, a submit, a grade and a result per student', () => {
    // 45 minutes at a checkpoint every 10: 4 checkpoints.
    const b = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    expect(b.writesPerStudent).toBe(1 + 4 + 1 + 1 + 1);
    expect(b.writes).toBe(30 * 8 + 6);
    expect(b.deletes).toBe(30);
    expect(b.reads).toBe(30 * 8 + 10);
  });

  it('adds one write per student when the teacher releases by hand', () => {
    const auto = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    const manual = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'manual' });
    const scheduled = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'scheduled' });
    expect(manual.writesPerStudent).toBe(auto.writesPerStudent + 1);
    expect(scheduled.writesPerStudent).toBe(auto.writesPerStudent);
  });

  it('writes more checkpoints for a shorter interval and a longer exam', () => {
    const base = { students: 10, releaseMode: 'auto' as const };
    const at5 = estimateExamWrites({ ...base, durationMinutes: 60, checkpointMinutes: 5 });
    const at15 = estimateExamWrites({ ...base, durationMinutes: 60, checkpointMinutes: 15 });
    expect(at5.writesPerStudent - at15.writesPerStudent).toBe(12 - 4);
    expect(estimateExamWrites({ ...base, durationMinutes: 120, checkpointMinutes: 10 }).writesPerStudent).toBeGreaterThan(
      estimateExamWrites({ ...base, durationMinutes: 30, checkpointMinutes: 10 }).writesPerStudent,
    );
  });

  it('reports the share of the 20,000 daily writes, to one decimal', () => {
    const b = estimateExamWrites({ students: 250, durationMinutes: 60, checkpointMinutes: 10, releaseMode: 'auto' });
    expect(b.percentOfDailyWrites).toBe(Math.round((b.writes / DAILY_WRITE_LIMIT) * 1000) / 10);
    expect(DAILY_WRITE_LIMIT).toBe(20_000);
  });

  it('copes with no students and with odd inputs', () => {
    expect(estimateExamWrites({ students: 0, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' }).writes).toBe(6);
    expect(estimateExamWrites({ students: -4, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' }).deletes).toBe(0);
    expect(estimateExamWrites({ students: 5, durationMinutes: 45, checkpointMinutes: 0, releaseMode: 'auto' }).writesPerStudent).toBe(4);
    expect(estimateExamWrites({ students: 5, durationMinutes: -10, checkpointMinutes: 10, releaseMode: 'auto' }).writesPerStudent).toBe(4);
  });
});

describe('studentsInClass', () => {
  it('adds the stored head-counts once the class has been counted', () => {
    expect(studentsInClass({ population: { male: 12, female: 13, unspecified: 1 }, populationBaseline: { at: 1 } })).toBe(26);
  });

  it('is null for a class that was never counted, or has no figures', () => {
    expect(studentsInClass({ population: { male: 12, female: 13, unspecified: 0 } })).toBeNull();
    expect(studentsInClass({ populationBaseline: {} })).toBeNull();
    expect(studentsInClass(undefined)).toBeNull();
  });
});
