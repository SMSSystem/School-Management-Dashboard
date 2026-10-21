import type { ExamReleaseMode } from '@/types/exams';

// A rough count of the Firestore operations one sitting of an online exam uses, for the note on the exam form
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §9). The Spark plan allows 20,000 writes and 50,000 reads a day.
// Pure and Firebase-free.

export const DAILY_WRITE_LIMIT = 20_000;
export const DAILY_READ_LIMIT = 50_000;

// The reads one student causes: the exam list and start screen, the questions and the rule lookups, the
// attempt on a resume, and the staff's read of the attempt when grading (spec §9 gives 6 to 8).
const READS_PER_STUDENT = 8;
// Writes that do not depend on the number of students: the questions and key, the audit entries, the finalize update.
const STAFF_WRITES = 6;
const STAFF_READS = 10;

export type ExamBudget = {
  writesPerStudent: number;
  writes: number;
  reads: number;
  deletes: number;
  percentOfDailyWrites: number;
};

/**
 * What a sitting costs. Per student: one write to start, a save at most once per checkpoint interval, one to
 * submit, one grade, one result, and one more to release when the teacher releases by hand. Deleting the attempts
 * when the exam is finalized is one delete each.
 */
export function estimateExamWrites(input: {
  students: number;
  durationMinutes: number;
  checkpointMinutes: number;
  releaseMode: ExamReleaseMode;
}): ExamBudget {
  const students = Math.max(0, Math.floor(input.students));
  const checkpoints =
    input.checkpointMinutes > 0 ? Math.floor(Math.max(0, input.durationMinutes) / input.checkpointMinutes) : 0;
  const writesPerStudent = 1 + checkpoints + 1 + 1 + 1 + (input.releaseMode === 'manual' ? 1 : 0);
  const writes = students * writesPerStudent + STAFF_WRITES;
  return {
    writesPerStudent,
    writes,
    reads: students * READS_PER_STUDENT + STAFF_READS,
    deletes: students,
    percentOfDailyWrites: Math.round((writes / DAILY_WRITE_LIMIT) * 1000) / 10,
  };
}

/**
 * The number of students in a class from its stored head-counts; null when the class was never counted (the stored
 * numbers are trusted only once a recount has set the baseline), so the form can say so instead of guessing.
 */
export function studentsInClass(
  cls: { population?: { male: number; female: number; unspecified: number }; populationBaseline?: unknown } | undefined,
): number | null {
  if (!cls?.population || cls.populationBaseline === undefined) return null;
  const { male, female, unspecified } = cls.population;
  const total = male + female + unspecified;
  return Number.isFinite(total) && total >= 0 ? total : null;
}
