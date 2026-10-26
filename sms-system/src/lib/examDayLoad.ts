import { getDocs, query, where } from 'firebase/firestore';
import { institutionCollection } from './paths';
import { fetchInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { dayBudget, publishDecision, type DayBudget, type DayExam } from './examDayBudget';
import { studentsInClass } from './examBudget';
import type { ExamReleaseMode } from '@/types/exams';

// The reads behind the guard at Publish (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §9): the exams dated the same day
// (one query with an equality filter, so no index, costing a read per exam of that day) and the classes (cached), then
// the pure sum in examDayBudget.ts.

export type DayCheck = { date: string; budget: DayBudget; decision: 'ok' | 'blocked' | 'admin_override' };

type ExamFields = {
  title?: string;
  className?: string;
  classId?: string;
  date?: string;
  online?: boolean;
  status?: string;
  duration?: number;
  checkpointMinutes?: number;
  releaseMode?: ExamReleaseMode;
  imagePacks?: number;
  imageBytes?: number;
};

/** The day's total with the exam being published included, and what Publish does about it. */
export async function checkDayBudget(p: { institutionId: string; examId: string; exam: ExamFields; isAdmin: boolean }): Promise<DayCheck | null> {
  const date = p.exam.date;
  if (!date) return null;
  const [snap, classes] = await Promise.all([
    getDocs(query(institutionCollection(p.institutionId, 'exams'), where('date', '==', date))),
    fetchInstitutionClasses(p.institutionId),
  ]);
  const studentsOf = (classId: string | undefined) => studentsInClass(classes.find((c) => c.id === classId));
  const toDayExam = (id: string, e: ExamFields): DayExam => ({
    id,
    title: e.title,
    className: e.className,
    online: e.online,
    status: e.status,
    duration: e.duration,
    checkpointMinutes: e.checkpointMinutes,
    releaseMode: e.releaseMode,
    imagePacks: e.imagePacks,
    imageBytes: e.imageBytes,
    students: studentsOf(e.classId),
  });
  const exams = snap.docs.map((d) => toDayExam(d.id, d.data() as ExamFields));
  const budget = dayBudget({ exams, thisExam: toDayExam(p.examId, { ...p.exam, online: true }) });
  return { date, budget, decision: publishDecision(budget.over, p.isAdmin) };
}
