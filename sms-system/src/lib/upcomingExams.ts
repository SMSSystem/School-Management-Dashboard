import type { ExamStatus } from "@/types/exams";
import { millisOf } from "./examListLogic";
import { examsForStudent } from "./examStudentLogic";
import type { ExamListDoc } from "./examStudentRows";
import { examPhase } from "./examTiming";
import type { ClassMembership } from "./studentClasses";

// Pure logic behind the student dashboard's "Upcoming exam" card: the student's exams that start within the next
// few days, plus an online exam that is open right now, soonest first. Drafts count, as on the Exams page, where a
// student sees them as scheduled. Firebase-free; the exams come from useStudentExams.

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export type UpcomingExam = {
  id: string;
  title: string;
  /** "Midterm", "Quiz" and the like, when the exam has one. */
  typeLabel?: string;
  startMs: number;
  /** False for a schedule-only exam with a date and no start time. */
  hasTime: boolean;
  online: boolean;
  /** An online exam a student can sit now. */
  openNow: boolean;
};

/** When the exam starts: an online exam's opening time, else its date and start time (device time, as on the Exams page). */
function startOf(
  exam: ExamListDoc,
): { startMs: number; hasTime: boolean } | null {
  const opens = exam.online ? millisOf(exam.opensAt) : undefined;
  if (opens !== undefined) return { startMs: opens, hasTime: true };
  if (!exam.date || !/^\d{4}-\d{2}-\d{2}$/.test(exam.date)) return null;
  const hasTime = !!exam.startTime && /^\d{2}:\d{2}$/.test(exam.startTime);
  const ms = new Date(
    `${exam.date}T${hasTime ? exam.startTime : "00:00"}:00`,
  ).getTime();
  return Number.isNaN(ms) ? null : { startMs: ms, hasTime };
}

/** Has an exam that already started not finished yet? Online: open now. Plain: today with no time, or within its duration. */
function stillRunning(
  exam: ExamListDoc,
  startMs: number,
  hasTime: boolean,
  nowMs: number,
): boolean {
  if (exam.online) return false;
  if (!hasTime) return nowMs < startMs + DAY_MS;
  return exam.duration ? nowMs < startMs + exam.duration * MINUTE_MS : false;
}

export function upcomingExams(
  exams: readonly ExamListDoc[],
  membership: ClassMembership | null | undefined,
  nowMs: number,
  { days = 7, limit = 4 }: { days?: number; limit?: number } = {},
): UpcomingExam[] {
  const horizon = nowMs + days * DAY_MS;
  const found: UpcomingExam[] = [];
  for (const exam of examsForStudent(exams, membership)) {
    const start = startOf(exam);
    if (!start) continue;
    const online = exam.online === true;
    const openNow =
      online &&
      examPhase(
        {
          status: exam.status as ExamStatus | undefined,
          opensAtMs: millisOf(exam.opensAt),
          closesAtMs: millisOf(exam.closesAt),
        },
        nowMs,
      ) === "open";
    if (online && (exam.status === "closed" || exam.status === "finalized"))
      continue;
    const ahead = start.startMs >= nowMs && start.startMs <= horizon;
    if (
      !openNow &&
      !ahead &&
      !(
        start.startMs < nowMs &&
        stillRunning(exam, start.startMs, start.hasTime, nowMs)
      )
    )
      continue;
    found.push({
      id: exam.id,
      title: exam.title?.trim() || exam.subjectName?.trim() || "Exam",
      typeLabel: exam.valueTypeLabel || undefined,
      startMs: start.startMs,
      hasTime: start.hasTime,
      online,
      openNow,
    });
  }
  // An exam open now comes first, then the soonest start.
  found.sort(
    (a, b) => Number(b.openNow) - Number(a.openNow) || a.startMs - b.startMs,
  );
  return found.slice(0, limit);
}
