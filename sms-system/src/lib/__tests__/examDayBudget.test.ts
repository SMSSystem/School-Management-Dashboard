import { describe, expect, it } from 'vitest';
import { countsTowardDay, dayBudget, dayBudgetMessage, publishDecision, type DayExam } from '../examDayBudget';
import { EXAM_DAILY_READ_BUDGET, estimateExamWrites } from '../examBudget';
import loadRaw from '../examDayLoad.ts?raw';
import toolbarRaw from '../../components/exam/builder/BuilderToolbar.tsx?raw';
import builderHookRaw from '../../hooks/useExamBuilder.ts?raw';
import fieldsRaw from '../../components/forms/exam/OnlineExamFields.tsx?raw';

// The guard at Publish (EXAMS_FEATURE_SPEC.md §9): the online exams of one day against the Exams feature's own daily
// budget of 10,000 reads and 10,000 writes. An estimate, summed from the formula of examBudget.ts.

const norm = (s: string) => s.split('\r\n').join('\n');
const exam = (over: Partial<DayExam> & { id: string }): DayExam => ({
  online: true,
  status: 'published',
  duration: 45,
  checkpointMinutes: 10,
  releaseMode: 'auto',
  students: 30,
  ...over,
});
const cost = (students: number) => estimateExamWrites({ students, durationMinutes: 45, checkpointMinutes: 10, releaseMode: 'auto' });

describe('countsTowardDay', () => {
  it('counts online exams that are not drafts, and always the exam being published', () => {
    expect(countsTowardDay(exam({ id: 'a' }), 'x')).toBe(true);
    expect(countsTowardDay(exam({ id: 'a', status: 'closed' }), 'x')).toBe(true);
    expect(countsTowardDay(exam({ id: 'a', status: 'draft' }), 'x')).toBe(false);
    expect(countsTowardDay(exam({ id: 'a', online: false }), 'x')).toBe(false);
    expect(countsTowardDay(exam({ id: 'x', status: 'draft' }), 'x')).toBe(true);
  });
});

describe('dayBudget', () => {
  it('sums the estimates of the day’s other online exams and the one being published', () => {
    const out = dayBudget({ exams: [exam({ id: 'a', students: 30 }), exam({ id: 'b', status: 'draft' }), exam({ id: 'c', online: false })], thisExam: exam({ id: 'x', students: 20 }) });
    expect(out.lines.map((l) => l.id)).toEqual(['a', 'x']);
    expect(out.reads).toBe(cost(30).reads + cost(20).reads);
    expect(out.writes).toBe(cost(30).writes + cost(20).writes);
    expect(out.over).toEqual([]);
  });

  it('counts the exam being published once, with its current settings, even if the loaded list holds its stored copy', () => {
    const out = dayBudget({ exams: [exam({ id: 'x', students: 5 })], thisExam: exam({ id: 'x', students: 20 }) });
    expect(out.lines).toHaveLength(1);
    expect(out.reads).toBe(cost(20).reads);
  });

  it('is over on reads at 10,001 and not at exactly 10,000', () => {
    // 25 reads a student and 10 for the staff: 399 students is 9,985 and 400 is 10,010
    const under = dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 399 }) });
    expect(under.reads).toBe(9_985);
    expect(under.over).toEqual([]);
    const over = dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 400 }) });
    expect(over.reads).toBe(10_010);
    expect(over.reads).toBeGreaterThan(EXAM_DAILY_READ_BUDGET);
    expect(over.over).toEqual(['reads']);
  });

  it('is over on writes alone for a long exam with short checkpoints, and says both when both are over', () => {
    const long = { duration: 300, checkpointMinutes: 5, releaseMode: 'manual' as const };
    const writes = dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 160, ...long }) });
    expect(writes.writes).toBeGreaterThan(10_000);
    expect(writes.reads).toBeLessThan(10_000);
    expect(writes.over).toEqual(['writes']);
    expect(dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 900, ...long }) }).over).toEqual(['reads', 'writes']);
  });

  it('lists a class that was never counted and adds nothing for it', () => {
    const out = dayBudget({ exams: [exam({ id: 'a', students: null, className: 'Class 3A' })], thisExam: exam({ id: 'x', students: 10 }) });
    expect(out.unknown).toEqual(['Class 3A']);
    expect(out.reads).toBe(cost(10).reads);
    expect(dayBudgetMessage('2026-11-12', out)).toContain('Class 3A has not been counted yet, so the total may be higher.');
  });
});

describe('publishDecision', () => {
  it('lets Publish go on when under the budget, refuses a teacher over it, and lets an administrator publish anyway', () => {
    expect(publishDecision([], false)).toBe('ok');
    expect(publishDecision(['reads'], false)).toBe('blocked');
    expect(publishDecision(['writes'], false)).toBe('blocked');
    expect(publishDecision(['downloads'], false)).toBe('blocked');
    expect(publishDecision(['reads', 'writes'], true)).toBe('admin_override');
    expect(publishDecision(['downloads'], true)).toBe('admin_override');
    expect(publishDecision([], true)).toBe('ok');
  });
});

describe('the pictures in the day’s total', () => {
  const MB = 1024 * 1024;

  it('add their reads and megabytes for every student of every exam of the day', () => {
    const plain = dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 30 }) });
    const withPictures = dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 30, imagePacks: 2, imageBytes: 3 * MB }) });
    expect(plain.downloadMb).toBe(0);
    expect(withPictures.reads).toBe(plain.reads + 30 * 2 * 4 + 2);
    expect(withPictures.writes).toBe(plain.writes);
    expect(withPictures.downloadMb).toBe(90);
    expect(withPictures.lines[0].downloadMb).toBe(90);
  });

  it('are over the daily download budget at 2,049 MB and not at exactly 2,048', () => {
    const at = (mb: number) => dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 1, imagePacks: 1, imageBytes: mb * MB }) });
    expect(at(2048).over).toEqual([]);
    expect(at(2049).over).toEqual(['downloads']);
  });

  it('can be the only limit passed, and are named in the message with the megabytes', () => {
    const heavy = dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 30, imagePacks: 1, imageBytes: 100 * MB }) });
    expect(heavy.reads).toBeLessThan(EXAM_DAILY_READ_BUDGET);
    expect(heavy.over).toEqual(['downloads']);
    const text = dayBudgetMessage('2026-11-12', heavy);
    expect(text).toContain('over the daily limit of 10,000 reads, 10,000 writes and 2,048 MB of downloads');
    expect(text).toContain('3,000 MB of pictures downloaded');
  });

  it('leave the sentence as it was for an exam with no pictures', () => {
    const text = dayBudgetMessage('2026-11-12', dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 10 }) }));
    expect(text).toContain('within the daily limit of 10,000 reads and 10,000 writes.');
    expect(text).not.toContain('MB');
  });
});

describe('dayBudgetMessage', () => {
  it('names the date, the totals, the limits and the exams counted', () => {
    const out = dayBudget({ exams: [exam({ id: 'a', title: 'Maths quiz', students: 300 })], thisExam: exam({ id: 'x', title: 'Science test', students: 300 }) });
    const text = dayBudgetMessage('2026-11-12', out);
    expect(text).toContain('dated 2026-11-12 would use about');
    expect(text).toContain('10,000 reads and 10,000 writes');
    expect(text).toContain('Maths quiz (7,510 reads), Science test (7,510 reads)');
  });

  it('says it is within the limit when it is', () => {
    expect(dayBudgetMessage('2026-11-12', dayBudget({ exams: [], thisExam: exam({ id: 'x', students: 10 }) }))).toContain('within the daily limit');
  });
});

describe('the loader, the builder and the note', () => {
  const load = norm(loadRaw);

  it('reads the day’s exams with one equality filter on the date, no listener and no ordering', () => {
    expect(load).toContain("where('date', '==', date)");
    expect(load).not.toMatch(/onSnapshot|orderBy|subscribeSnapshot/);
  });

  it('asks before Publish and Reopen, lets an administrator publish anyway, and never blocks a teacher silently', () => {
    const toolbar = norm(toolbarRaw);
    expect(toolbar).toContain('(action.action === "published" || action.action === "reopened") && checkDay');
    expect(toolbar).toContain('dayCheck?.decision === "blocked"');
    expect(toolbar).toContain('Yes, publish anyway');
    expect(toolbar).toContain('Move one of the exams to another day, or ask an administrator to publish it.');
    expect(norm(builderHookRaw)).toContain('isAdmin: role === "institution_admin" || role === "super_admin"');
  });

  it('words the form’s note with the Exams feature’s 10,000 daily limit', () => {
    const fields = norm(fieldsRaw);
    expect(fields).toContain('% of the ${EXAM_DAILY_WRITE_BUDGET.toLocaleString("en-US")} daily limit, plus about');
    expect(fields).not.toContain('the free plan allows per day');
  });
});
