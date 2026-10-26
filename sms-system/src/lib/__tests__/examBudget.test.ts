import { describe, expect, it } from 'vitest';
import { DAILY_READ_LIMIT, DAILY_WRITE_LIMIT, EXAM_DAILY_DOWNLOAD_MB, EXAM_DAILY_READ_BUDGET, EXAM_DAILY_WRITE_BUDGET, estimateExamWrites, studentsInClass } from '../examBudget';

// The write estimate on the exam form (EXAMS_FEATURE_SPEC.md §9).

describe('estimateExamWrites', () => {
  it('counts a start, the checkpoints, a submit, a grade and a result per student', () => {
    // 45 minutes at a checkpoint every 10: 4 checkpoints.
    const b = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    expect(b.writesPerStudent).toBe(1 + 4 + 1 + 1 + 1);
    expect(b.writes).toBe(30 * 8 + 6);
    expect(b.deletes).toBe(30);
    expect(b.reads).toBe(30 * 25 + 10);
  });

  it('adds one write per student when the score is released after it was graded: by hand or at a set time', () => {
    const auto = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    const manual = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'manual' });
    const scheduled = estimateExamWrites({ students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'scheduled' });
    expect(manual.writesPerStudent).toBe(auto.writesPerStudent + 1);
    expect(scheduled.writesPerStudent).toBe(auto.writesPerStudent + 1);
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

  it('reports the share of the Exams feature’s 10,000 daily writes, to one decimal', () => {
    const b = estimateExamWrites({ students: 250, durationMinutes: 60, checkpointMinutes: 10, releaseMode: 'auto' });
    expect(b.percentOfDailyWrites).toBe(Math.round((b.writes / EXAM_DAILY_WRITE_BUDGET) * 1000) / 10);
    expect(EXAM_DAILY_WRITE_BUDGET).toBe(10_000);
    expect(EXAM_DAILY_READ_BUDGET).toBe(10_000);
    // the Exams share is half the free plan's writes and a fifth of its reads
    expect(DAILY_WRITE_LIMIT).toBe(20_000);
    expect(DAILY_READ_LIMIT).toBe(50_000);
  });

  it('shows the share for the three-student sitting of the form’s note', () => {
    const b = estimateExamWrites({ students: 3, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });
    expect(b.writes).toBe(30);
    expect(b.percentOfDailyWrites).toBe(0.3);
  });

  it('copes with no students and with odd inputs', () => {
    expect(estimateExamWrites({ students: 0, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' }).writes).toBe(6);
    expect(estimateExamWrites({ students: -4, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' }).deletes).toBe(0);
    expect(estimateExamWrites({ students: 5, durationMinutes: 45, checkpointMinutes: 0, releaseMode: 'auto' }).writesPerStudent).toBe(4);
    expect(estimateExamWrites({ students: 5, durationMinutes: -10, checkpointMinutes: 10, releaseMode: 'auto' }).writesPerStudent).toBe(4);
  });
});

describe('the pictures in the estimate', () => {
  const MB = 1024 * 1024;
  const input = { students: 30, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' as const };

  it('change nothing for an exam without pictures, whether the figures are absent or zero', () => {
    const plain = estimateExamWrites(input);
    expect(estimateExamWrites({ ...input, imagePacks: 0, imageBytes: 0 })).toEqual(plain);
    expect(plain.downloadMbPerStudent).toBe(0);
    expect(plain.downloadMb).toBe(0);
    expect(plain.reads).toBe(30 * 25 + 10);
  });

  it('add two reads a student for each pack (the pack and its rule lookup) and one read of each pack by the staff', () => {
    const out = estimateExamWrites({ ...input, imagePacks: 3, imageBytes: 2 * MB });
    expect(out.reads).toBe(30 * (25 + 3 * 2) + 10 + 3);
    expect(out.writes).toBe(estimateExamWrites(input).writes);
  });

  it('count the megabytes a student downloads and the class downloads, with one decimal', () => {
    const out = estimateExamWrites({ ...input, imagePacks: 2, imageBytes: 1.25 * MB });
    expect(out.downloadMbPerStudent).toBe(1.3);
    expect(out.downloadMb).toBe(37.5);
    expect(estimateExamWrites({ ...input, students: 0, imagePacks: 1, imageBytes: MB }).downloadMb).toBe(0);
  });

  it('keep a daily download budget of 2,048 MiB, a fifth of the free plan’s monthly downloads', () => {
    expect(EXAM_DAILY_DOWNLOAD_MB).toBe(2048);
    expect(EXAM_DAILY_DOWNLOAD_MB).toBeLessThan((10 * 1024) / 4);
  });

  it('ignore a negative or fractional figure', () => {
    const out = estimateExamWrites({ ...input, imagePacks: -2, imageBytes: -5 });
    expect(out.reads).toBe(30 * 25 + 10);
    expect(estimateExamWrites({ ...input, imagePacks: 1.9, imageBytes: MB }).reads).toBe(30 * 27 + 10 + 1);
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
