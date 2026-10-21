import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DifficultyTable from '../../components/exam/results/DifficultyTable';
import ExtraTimeDialog from '../../components/exam/results/ExtraTimeDialog';
import FinalizeDialog from '../../components/exam/results/FinalizeDialog';
import ResultsSummary from '../../components/exam/results/ResultsSummary';
import ResultsTable from '../../components/exam/results/ResultsTable';
import ResultsToolbar from '../../components/exam/results/ResultsToolbar';
import ScoreDialog from '../../components/exam/results/ScoreDialog';
import pageRaw from '../../scenes/(dashboard)/list/exams/results/index.tsx?raw';
import hookRaw from '../../hooks/useExamResults.ts?raw';
import routesRaw from '../../routes/academicRoutes.tsx?raw';
import lazyRaw from '../../routes/lazyPages.ts?raw';
import actionsRaw from '../../components/exam/ExamRowActions.tsx?raw';
import builderRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import { writesLeft, type ResultRow } from '../examResultsRows';

// The staff results screen (EXAMS_FEATURE_SPEC.md §4.7): what each part shows, who gets buttons, and pins on the page,
// the hook and the route. The writes are checked against the rules in rules-tests/examGradingClient.rules.test.ts.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const hook = norm(hookRaw);
const routes = norm(routesRaw);
const lazy = norm(lazyRaw);
const actions = norm(actionsRaw);
const builder = norm(builderRaw);
const noop = () => undefined;

const row = (over: Partial<ResultRow> = {}): ResultRow => ({
  studentId: 's1',
  name: 'Ann Lee',
  status: 'Graded',
  hasGrade: true,
  fromAttempt: true,
  released: false,
  needsRegrade: false,
  score: 8,
  maxScore: 10,
  percent: 80,
  tabSwitches: 2,
  extraMinutes: 0,
  gradedByName: 'Ms Lee',
  method: 'auto',
  manualReason: '',
  comment: '',
  ...over,
});

describe('ResultsSummary', () => {
  const html = renderToStaticMarkup(
    createElement(ResultsSummary, {
      counts: { started: 30, submitted: 29, graded: 20, released: 10, needsRegrade: 2, ungraded: 9 },
      stats: { count: 20, average: 7.25, min: 3, max: 10 },
      maxScore: 10,
      writesLeft: 22,
    }),
  );

  it('shows the counts and the class figures', () => {
    for (const label of ['Started', 'Submitted', 'Graded', 'Released', 'Re-grade needed', 'Waiting to be graded', 'Lowest', 'Highest']) expect(html).toContain(label);
    expect(html).toContain('Average (out of 10)');
    expect(html).toContain('<dd class="text-lg font-semibold">7.25</dd>');
    expect(html).toContain('>29<');
  });

  it('says how many writes are left, and when report cards see a score', () => {
    expect(html).toContain('About 22 writes are still to come');
    expect(html).toContain('Report cards see a score only once it has been released and copied');
  });

  it('shows dashes before anything is graded and says nothing about writes when none are left', () => {
    const empty = renderToStaticMarkup(
      createElement(ResultsSummary, {
        counts: { started: 0, submitted: 0, graded: 0, released: 0, needsRegrade: 0, ungraded: 0 },
        stats: { count: 0, average: null, min: null, max: null },
        maxScore: 10,
        writesLeft: 0,
      }),
    );
    expect(empty).toContain('—');
    expect(empty).not.toContain('writes are still to come');
  });
});

describe('ResultsTable', () => {
  const table = (rows: ResultRow[], over: Partial<Parameters<typeof ResultsTable>[0]> = {}) =>
    renderToStaticMarkup(createElement(ResultsTable, { rows, loading: false, canChange: true, finalized: false, onScore: noop, onExtraTime: noop, onRegrade: noop, ...over }));

  it('shows each student with the status, score, percentage, tab count and who graded', () => {
    const html = table([row()]);
    expect(html).toContain('Ann Lee');
    expect(html).toContain('Graded');
    expect(html).toContain('8 / 10 (80%)');
    expect(html).toContain('Ms Lee');
  });

  it('marks a score entered by hand', () => {
    expect(table([row({ method: 'manual' })])).toContain('Ms Lee (by hand)');
  });

  it('gives a graded student Change score and Re-grade, and an ungraded one Enter score and Extra time', () => {
    const graded = table([row()]);
    expect(graded).toContain('aria-label="Change the score of Ann Lee"');
    expect(graded).toContain('aria-label="Re-grade Ann Lee"');
    expect(graded).not.toContain('extra time');
    const waiting = table([row({ status: 'Not started', hasGrade: false, fromAttempt: false, score: null, percent: null, method: null, gradedByName: '' })]);
    expect(waiting).toContain('aria-label="Enter a score for Ann Lee"');
    expect(waiting).toContain('aria-label="Give Ann Lee extra time"');
    expect(waiting).not.toContain('Re-grade');
  });

  it('shows no buttons to someone who cannot change the exam, and none for extra time or re-grade once finalized', () => {
    expect(table([row()], { canChange: false })).not.toContain('<button');
    const finalized = table([row()], { finalized: true });
    expect(finalized).toContain('Change the score of');
    expect(finalized).not.toContain('Re-grade');
  });

  it('shows a score as a dash before it exists', () => {
    expect(table([row({ hasGrade: false, score: null, percent: null, status: 'Not started' })])).toContain('<td>—</td>');
  });
});

describe('ScoreDialog', () => {
  const dialog = (over: Partial<Parameters<typeof ScoreDialog>[0]> = {}) =>
    renderToStaticMarkup(createElement(ScoreDialog, { studentName: 'Ann Lee', maxScore: 10, currentScore: null, currentComment: '', busy: false, error: null, onSave: noop, onClose: noop, ...over }));

  it('enters a first score without asking for a reason', () => {
    const html = dialog();
    expect(html).toContain('Enter a score for Ann Lee');
    expect(html).toContain('Score out of 10');
    expect(html).not.toContain('Reason');
  });

  it('asks for a reason when it changes a score, and starts from the current score', () => {
    const html = dialog({ currentScore: 6, currentComment: 'ok' });
    expect(html).toContain('Change the score of Ann Lee');
    expect(html).toContain('Reason (required');
    expect(html).toContain('value="6"');
  });

  it('shows an error and disables its buttons while saving', () => {
    expect(dialog({ error: 'Nope' })).toContain('Nope');
    expect(dialog({ busy: true })).toContain('Saving…');
  });
});

describe('ExtraTimeDialog', () => {
  it('says whether the student is sitting the exam now', () => {
    const sitting = renderToStaticMarkup(createElement(ExtraTimeDialog, { studentName: 'Ann Lee', currentExtra: 0, sitting: true, busy: false, error: null, onSave: noop, onClose: noop }));
    expect(sitting).toContain('Extra time for Ann Lee');
    expect(sitting).toContain('Ann Lee has no extra time yet.');
    expect(sitting).toContain('their screen updates at its next save');
    const later = renderToStaticMarkup(createElement(ExtraTimeDialog, { studentName: 'Ann Lee', currentExtra: 15, sitting: false, busy: false, error: null, onSave: noop, onClose: noop }));
    expect(later).toContain('has 15 minutes of extra time now');
    expect(later).toContain('It applies when they start.');
  });
});

describe('FinalizeDialog', () => {
  it('lists what stops it and offers no Finalize button', () => {
    const html = renderToStaticMarkup(createElement(FinalizeDialog, { blockers: ['2 scores have not been released.'], attemptCount: 30, gradeCount: 28, busy: false, error: null, onConfirm: noop, onClose: noop }));
    expect(html).toContain('It cannot be finalized yet');
    expect(html).toContain('2 scores have not been released.');
    expect(html).not.toContain('Finalize exam<');
  });

  it('says what it removes and keeps when nothing stops it', () => {
    const html = renderToStaticMarkup(createElement(FinalizeDialog, { blockers: [], attemptCount: 30, gradeCount: 31, busy: false, error: null, onConfirm: noop, onClose: noop }));
    expect(html).toContain('removes the 30 student attempts');
    expect(html).toContain('The 31 scores, the results and the per-question counts are kept');
    expect(html).toContain('cannot be re-graded or edited');
    expect(html).toContain('Finalize exam');
  });
});

describe('ResultsToolbar', () => {
  const bar = (over: Partial<Parameters<typeof ResultsToolbar>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(ResultsToolbar, {
        canChange: true,
        busy: false,
        gradeNow: { enabled: true, reason: null },
        releasePending: 3,
        releaseMode: 'manual',
        finalized: false,
        canFinalize: true,
        difficultyShown: false,
        onGradeNow: noop,
        onRelease: noop,
        onExport: noop,
        onFinalize: noop,
        onDifficulty: noop,
        onRefresh: noop,
        ...over,
      }),
    );

  it('has Grade now, Release with the count, Export, Finalize and the difficulty button', () => {
    const html = bar();
    for (const label of ['Grade now', 'Release (3)', 'Export CSV', 'Finalize exam', 'Show question difficulty', 'Refresh']) expect(html).toContain(label);
  });

  it('turns Grade now off with the reason, and Release off when nothing waits', () => {
    const html = bar({ gradeNow: { enabled: false, reason: 'The answer key is not complete.' }, releasePending: 0 });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="The answer key is not complete\."[^>]*>Grade now|<button[^>]*title="The answer key is not complete\."[^>]*disabled=""[^>]*>Grade now/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Release</);
  });

  it('offers Release only when the exam releases on the teacher’s press', () => {
    expect(bar({ releaseMode: 'auto' })).not.toContain('Release');
    expect(bar({ releaseMode: 'scheduled' })).not.toContain('Release (');
  });

  it('gives a spectator the export and nothing that changes the exam', () => {
    const html = bar({ canChange: false });
    expect(html).toContain('Export CSV');
    for (const label of ['Grade now', 'Release', 'Finalize exam']) expect(html).not.toContain(label);
    expect(html).toContain('You can view and export these results');
  });

  it('hides Grade now and Finalize once the exam is finalized, but still allows Release', () => {
    const html = bar({ finalized: true });
    expect(html).not.toContain('Grade now');
    expect(html).not.toContain('Finalize exam');
    expect(html).toContain('Release (3)');
  });
});

describe('DifficultyTable', () => {
  it('shows each question’s counts and the share who got it right', () => {
    const html = renderToStaticMarkup(
      createElement(DifficultyTable, {
        rows: [
          { questionId: 'q1', number: 1, text: 'First?', answered: 10, correct: 7, percent: 70 },
          { questionId: 'q2', number: 2, text: 'Second?', answered: 0, correct: 0, percent: null },
        ],
        source: 'Saved when the exam was finalized.',
      }),
    );
    expect(html).toContain('First?');
    expect(html).toContain('70%');
    expect(html).toContain('Saved when the exam was finalized.');
    expect(html).toContain('<td class="p-2">—</td>');
  });
});

describe('writesLeft', () => {
  it('counts a grade and a results entry for each score still to come', () => {
    expect(writesLeft({ toGrade: 3, toRelease: 2, toSync: 1 })).toBe(12);
    expect(writesLeft({ toGrade: 0, toRelease: 0, toSync: 0 })).toBe(0);
  });
});

describe('the route, the page and the hook', () => {
  it('is a lazy route at /dashboard/list/exams/:examId/results for staff and the spectator', () => {
    expect(routes).toMatch(/exams\/:examId\/results"\s+element=\{\s+hasStaffView\(role\) \? \(\s+<ExamResultsPage \/>/);
    expect(lazy).toContain('ExamResultsPage: () => import("@/scenes/(dashboard)/list/exams/results")');
    expect(lazy).toContain('export const ExamResultsPage = lazy(load.ExamResultsPage)');
  });

  it('is linked from the list and the builder once an exam is no longer a draft', () => {
    expect(actions).toContain('`/dashboard/list/exams/${exam.id}/results`');
    expect(actions).toContain('exam.status !== "draft"');
    expect(builder).toContain('`/dashboard/list/exams/${exam.id}/results`');
  });

  it('writes nothing itself and exports the table through the shared CSV writer', () => {
    expect(page).not.toMatch(/setDoc|updateDoc|writeBatch|addDoc/);
    expect(page).toContain('downloadCSV(resultsFileName(');
  });

  it('checks access to the exam before reading anything private', () => {
    expect(hook).toContain('canViewExamContent(exam, person)');
    expect(hook).toContain('loadResultsData(institutionId, examId, (exam) =>');
  });

  it('grades by itself on opening only after the window has closed, with Auto-Grade on, a complete key and new attempts, and leaves re-grades to Grade now', () => {
    expect(hook).toContain('phase === "closed" && data.exam.autoGrade === true && autoGradeOk && fresh > 0');
    expect(hook).toContain('gradeAttempts(ctx, data, { regrade: false })');
    expect(hook).toContain('const fresh = plan.grade.length - plan.regrade.length');
    expect(hook).toContain('if (!data || !ctx || !canManage || autoRan.current) return');
  });

  it('copies released scores into the results when it opens, for staff who can change the exam only', () => {
    expect(hook).toContain('resultsToSync(current.grades, Date.now())');
    expect(hook).toContain('await syncResults(');
  });

  it('caches the class roster and gets the attempts only when the grades do not account for them', () => {
    expect(hook).toContain('staleTime: LIST_STALE_MS');
    expect(hook).toContain('"examRoster"');
  });
});
