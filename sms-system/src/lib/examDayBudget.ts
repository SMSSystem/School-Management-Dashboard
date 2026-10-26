import { EXAM_DAILY_DOWNLOAD_MB, EXAM_DAILY_READ_BUDGET, EXAM_DAILY_WRITE_BUDGET, estimateExamWrites } from './examBudget';
import { EXAM_LIMITS, type ExamReleaseMode } from '@/types/exams';

// The guard at Publish (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §9): the Exams feature keeps to 10,000 writes,
// 10,000 reads and 2,048 MiB of downloads (the question pictures) a day, a share of the free plan's limits (20,000 writes,
// 50,000 reads, 10 GiB a month) so the rest of the school's work has room. Firestore has no per-feature quota, so this adds up the estimates of every online exam dated the same day and
// refuses (or, for an administrator, warns) when the total passes the budget. It is an estimate by the formula in
// examBudget.ts, not a meter. Pure and Firebase-free.

/** An exam as the guard needs it (the fields of the exam document). */
export type DayExam = {
  id: string;
  title?: string;
  className?: string;
  online?: boolean;
  status?: string;
  duration?: number;
  checkpointMinutes?: number;
  releaseMode?: ExamReleaseMode;
  /** The exam's pictures: how many packs and how many bytes (the exam document keeps both). */
  imagePacks?: number;
  imageBytes?: number;
  /** The students in the exam's class, or null when the class was never counted. */
  students: number | null;
};

export type DayLine = { id: string; label: string; students: number | null; writes: number; reads: number; downloadMb: number };

/** A limit the day's total can pass. */
export type BudgetKind = 'reads' | 'writes' | 'downloads';

export type DayBudget = {
  reads: number;
  writes: number;
  /** MiB downloaded for the pictures by every student of the day's exams. */
  downloadMb: number;
  lines: DayLine[];
  /** The classes whose head-count is unknown: their exams are listed but cost nothing in the total. */
  unknown: string[];
  /** The limits that are passed, in the order reads, writes, downloads; empty when the day is within all of them. */
  over: BudgetKind[];
};

/** Does this exam use the day's budget? An online exam that is not a draft, and always the one being published. */
export function countsTowardDay(exam: DayExam, thisId: string): boolean {
  if (exam.online !== true) return false;
  return exam.id === thisId || (exam.status !== undefined && exam.status !== 'draft');
}

/** The estimated reads and writes of the online exams of one day, `thisExam` included (it replaces its own stored copy). */
export function dayBudget(input: { exams: readonly DayExam[]; thisExam: DayExam }): DayBudget {
  const others = input.exams.filter((e) => e.id !== input.thisExam.id && countsTowardDay(e, input.thisExam.id));
  const lines: DayLine[] = [];
  const unknown: string[] = [];
  let reads = 0;
  let writes = 0;
  let downloadMb = 0;
  for (const exam of [...others, input.thisExam]) {
    const label = exam.title?.trim() || exam.className || 'An exam';
    if (exam.students === null) {
      unknown.push(exam.className ?? label);
      lines.push({ id: exam.id, label, students: null, writes: 0, reads: 0, downloadMb: 0 });
      continue;
    }
    const cost = estimateExamWrites({
      students: exam.students,
      durationMinutes: exam.duration ?? 0,
      checkpointMinutes: exam.checkpointMinutes ?? EXAM_LIMITS.defaultCheckpointMinutes,
      releaseMode: exam.releaseMode ?? 'manual',
      imagePacks: exam.imagePacks,
      imageBytes: exam.imageBytes,
    });
    reads += cost.reads;
    writes += cost.writes;
    downloadMb += cost.downloadMb;
    lines.push({ id: exam.id, label, students: exam.students, writes: cost.writes, reads: cost.reads, downloadMb: cost.downloadMb });
  }
  downloadMb = Math.round(downloadMb * 10) / 10;
  const over: BudgetKind[] = [];
  if (reads > EXAM_DAILY_READ_BUDGET) over.push('reads');
  if (writes > EXAM_DAILY_WRITE_BUDGET) over.push('writes');
  if (downloadMb > EXAM_DAILY_DOWNLOAD_MB) over.push('downloads');
  return { reads, writes, downloadMb, lines, unknown, over };
}

/** What Publish does with the day's total: go ahead, be refused (a teacher), or be allowed with a warning (an administrator). */
export function publishDecision(over: DayBudget['over'], isAdmin: boolean): 'ok' | 'blocked' | 'admin_override' {
  if (over.length === 0) return 'ok';
  return isAdmin ? 'admin_override' : 'blocked';
}

const n = (value: number) => value.toLocaleString('en-US');

/** The sentence shown with the confirmation, or as the reason for the refusal. */
export function dayBudgetMessage(date: string, budget: DayBudget): string {
  const names = budget.lines.filter((l) => l.students !== null).map((l) => `${l.label} (${n(l.reads)} reads)`).join(', ');
  const pictures = budget.downloadMb > 0 || budget.over.includes('downloads');
  const limits = pictures
    ? `${n(EXAM_DAILY_READ_BUDGET)} reads, ${n(EXAM_DAILY_WRITE_BUDGET)} writes and ${n(EXAM_DAILY_DOWNLOAD_MB)} MB of downloads`
    : `${n(EXAM_DAILY_READ_BUDGET)} reads and ${n(EXAM_DAILY_WRITE_BUDGET)} writes`;
  const used = `${n(budget.reads)} reads and ${n(budget.writes)} writes${pictures ? ` and ${n(budget.downloadMb)} MB of pictures downloaded` : ''}`;
  const unknown = budget.unknown.length > 0 ? ` ${budget.unknown.join(', ')} ${budget.unknown.length === 1 ? 'has' : 'have'} not been counted yet, so the total may be higher.` : '';
  if (budget.over.length === 0) {
    return `The online exams dated ${date} use about ${used}, within the daily limit of ${limits}.${unknown}`;
  }
  return `The online exams dated ${date} would use about ${used}, over the daily limit of ${limits} the Exams feature may use (${names}).${unknown}`;
}
