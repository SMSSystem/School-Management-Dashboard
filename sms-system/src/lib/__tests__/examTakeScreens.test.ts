import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ExamAttemptScreen from '../../components/exam/take/ExamAttemptScreen';
import ExamFinishedScreen from '../../components/exam/take/ExamFinishedScreen';
import ExamStartScreen from '../../components/exam/take/ExamStartScreen';
import ExamTimer from '../../components/exam/take/ExamTimer';
import SubmitDialog from '../../components/exam/take/SubmitDialog';
import pageRaw from '../../scenes/(dashboard)/list/exams/take/index.tsx?raw';
import attemptHookRaw from '../../hooks/useExamAttempt.ts?raw';
import runningHookRaw from '../../hooks/useRunningAttempt.ts?raw';
import activityHookRaw from '../../hooks/useActivityLog.ts?raw';
import routesRaw from '../../routes/academicRoutes.tsx?raw';
import lazyRaw from '../../routes/lazyPages.ts?raw';
import { scoreView } from '../examStudentLogic';
import type { ExamQuestion } from '@/types/exams';

// The attempt screens (EXAMS_FEATURE_SPEC.md §4.5): what each one shows, and pins on the hooks and the route that run
// them. The Firestore writes are checked against the rules in rules-tests/examAttemptClient.rules.test.ts.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const attemptHook = norm(attemptHookRaw);
const runningHook = norm(runningHookRaw);
const activityHook = norm(activityHookRaw);
const routes = norm(routesRaw);
const lazy = norm(lazyRaw);
const noop = () => undefined;
const inRouter = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, el));

const questions: ExamQuestion[] = [
  { id: 'q1', text: 'What is 2 + 2?', kind: 'single', options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }], points: 1 },
  { id: 'q2', text: 'Pick the primes', kind: 'multiple', options: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '7' }], points: 2 },
];
const T = Date.UTC(2026, 9, 22, 14, 0, 0);

const startScreen = (over: Partial<Parameters<typeof ExamStartScreen>[0]> = {}) =>
  inRouter(
    createElement(ExamStartScreen, {
      title: 'Unit 3 Quiz',
      subtitle: 'Maths · 3A',
      questionCount: 12,
      durationMinutes: 45,
      extraMinutes: 0,
      checkpointMinutes: 10,
      opensAtMs: T,
      closesAtMs: T + 3_600_000,
      opensYet: true,
      lateNote: null,
      starting: false,
      error: null,
      onStart: noop,
      ...over,
    }),
  );

describe('ExamStartScreen', () => {
  it('shows the exam, the questions, the time and the rules, and a Start button', () => {
    const html = startScreen();
    expect(html).toContain('Unit 3 Quiz');
    expect(html).toContain('Maths · 3A');
    expect(html).toContain('<dd>12</dd>');
    expect(html).toContain('45 minutes');
    expect(html).toContain('once. The timer cannot be paused.');
    expect(html).toContain('saved about every 10 minutes');
    expect(html).toContain('This exam records when you leave this page (by switching to another tab or window) and when you copy or print. Your teacher can see it.');
    expect(html).toContain('Copying, the right-click menu, dragging and printing the questions are switched off');
    expect(html).toContain('Leaving the page is only recorded: nothing stops you.');
    expect(html).toContain('role="note"');
    expect(html).toContain('Start exam');
  });

  it('names the extra time a student was given, and the late-start note', () => {
    expect(startScreen({ extraMinutes: 15 })).toContain('+ 15 minutes extra time given to you');
    expect(startScreen()).not.toContain('extra time');
    const late = startScreen({ lateNote: 'You have 20 minutes instead of 45, because the exam closes before the full time is up.' });
    expect(late).toContain('You have 20 minutes instead of 45');
  });

  it('shows no Start button before the window opens, and says when it opens', () => {
    const html = startScreen({ opensYet: false });
    expect(html).not.toContain('Start exam');
    expect(html).toContain('This exam has not opened yet.');
  });

  it('shows an error and disables Start while starting', () => {
    expect(startScreen({ error: 'Could not reach the server.' })).toContain('role="alert"');
    expect(startScreen({ starting: true })).toMatch(/<button[^>]*disabled=""[^>]*>Starting…/);
  });
});

describe('SubmitDialog', () => {
  const dialog = (over: Partial<Parameters<typeof SubmitDialog>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(SubmitDialog, { total: 10, unanswered: 2, flagged: 1, submitting: false, error: null, onConfirm: noop, onCancel: noop, ...over }),
    );

  it('states the answered, unanswered and flagged counts', () => {
    const html = dialog();
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('You have answered 8 of 10 questions.');
    expect(html).toContain('2 questions are not answered.');
    expect(html).toContain('1 question is flagged for review.');
    expect(html).toContain('you cannot change your answers');
  });

  it('leaves out the warnings when everything is answered and nothing is flagged', () => {
    const html = dialog({ unanswered: 0, flagged: 0 });
    expect(html).not.toContain('not answered');
    expect(html).not.toContain('flagged');
  });

  it('shows an error, and disables both buttons while submitting', () => {
    expect(dialog({ error: 'Could not reach the server.' })).toContain('Could not reach the server.');
    const busy = dialog({ submitting: true });
    expect(busy.match(/disabled=""/g)).toHaveLength(2);
    expect(busy).toContain('Submitting…');
  });
});

describe('ExamTimer', () => {
  it('shows the time left and stays quiet while there is plenty', () => {
    const html = renderToStaticMarkup(createElement(ExamTimer, { remainingMs: 30 * 60_000 }));
    expect(html).toContain('role="timer"');
    expect(html).toContain('30:00');
    expect(html).toContain('aria-live="polite" class="sr-only"></span>');
  });

  it('turns urgent in the last five minutes and speaks the threshold', () => {
    const html = renderToStaticMarkup(createElement(ExamTimer, { remainingMs: 4 * 60_000 }));
    expect(html).toContain('bg-red-100');
    expect(html).toContain('5 minutes left');
    expect(renderToStaticMarkup(createElement(ExamTimer, { remainingMs: 59_000 }))).toContain('1 minute left');
  });
});

describe('ExamFinishedScreen', () => {
  const finished = (kind: Parameters<typeof ExamFinishedScreen>[0]['kind'], score: Parameters<typeof ExamFinishedScreen>[0]['score'] = null) =>
    inRouter(createElement(ExamFinishedScreen, { kind, title: 'Unit 3 Quiz', subtitle: 'Maths', score }));

  it('says what happened for each way an attempt can end', () => {
    expect(finished('submitted')).toContain('Submitted. Your result will be shown here when your teacher releases it.');
    expect(finished('timeout')).toContain('Your answers were submitted. Your result will be shown here when your teacher releases it.');
    expect(finished('late')).toContain('could be sent');
    expect(finished('missed')).toContain('your teacher will mark the exam');
    expect(finished('closed')).toContain('did not start it');
  });

  it('shows a released score with its percentage and comment instead of the waiting message', () => {
    const html = finished('submitted', scoreView({ score: 17, maxScore: 20, comment: 'Well done' }));
    expect(html).toContain('17 / 20');
    expect(html).toContain('(85%)');
    expect(html).toContain('Well done');
    expect(html).not.toContain('Your result will be shown here');
  });

  it('never shows questions or answers', () => {
    expect(finished('submitted')).not.toMatch(/answer key|correct answer/i);
  });

  it('says Time’s up! above the words when the clock ran out and no score is released', () => {
    for (const kind of ['timeout', 'late', 'missed'] as const) {
      expect(finished(kind), kind).toContain('Time&#x27;s up!');
    }
  });

  it('does not say it for a submit by the student, for an exam closed unstarted, or above a released score', () => {
    expect(finished('submitted')).not.toContain('up!');
    expect(finished('closed')).not.toContain('up!');
    expect(finished('timeout', scoreView({ score: 17, maxScore: 20, comment: '' }))).not.toContain('up!');
  });

  it('says it once, in the same status box as the sentence, so both are read out', () => {
    const html = finished('timeout');
    expect(html.match(/up!/g)).toHaveLength(1);
    expect(html).toMatch(/role="status"[^>]*>[^]*up![^]*Your answers were submitted/);
  });
});

describe('ExamAttemptScreen', () => {
  const screen = (over: Partial<Parameters<typeof ExamAttemptScreen>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(ExamAttemptScreen, {
        title: 'Unit 3 Quiz',
        subtitle: 'Maths · 3A',
        remainingMs: 20 * 60_000,
        questions,
        answers: { q1: ['b'] },
        flags: ['q2'],
        current: 0,
        saveState: { kind: 'saved', at: Date.UTC(2026, 9, 26, 15, 42) },
        keepAliveCapMs: 3_300_000,
        error: null,
        pictures: { stateOf: () => 'loading' as const, srcOf: () => undefined, retry: noop },
        unsupervised: false,
        watermark: 'Ada Brown · 7K2Q9F',
        onSelect: noop,
        onToggleOption: noop,
        onToggleFlag: noop,
        onSubmit: noop,
        ...over,
      }),
    );

  it('shows the timer, the answered count, the save state, the navigator and the current question', () => {
    const html = screen();
    expect(html).toContain('20:00');
    expect(html).toContain('Answered 1 of 2');
    expect(html).toContain('Saved at 10:42');
    expect(html).toContain('aria-label="Question 2, not answered, flagged"');
    expect(html).toContain('What is 2 + 2?');
    expect(html).toContain('Question 1 of 2');
  });

  it('shows the question the student is on, with Previous off on the first and Next off on the last', () => {
    expect(screen()).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    const last = screen({ current: 1 });
    expect(last).toContain('Pick the primes');
    expect(last).toMatch(/<button[^>]*disabled=""[^>]*>Next/);
  });

  it('shows an error', () => {
    expect(screen({ error: 'Could not reach the server.' })).toContain('role="alert"');
  });

  it('keeps Submit off until every question is answered, and says how many are left', () => {
    const some = screen();
    expect(some).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="submit-hint"[^>]*>Submit exam/);
    expect(some).toContain('id="submit-hint"');
    expect(some).toContain('Answer all questions to submit (1 left)');
  });

  it('turns Submit on, and the hint off, once every question is answered', () => {
    const all = screen({ answers: { q1: ['b'], q2: ['a'] } });
    expect(all).toContain('Submit exam');
    expect(all).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
    expect(all).not.toContain('submit-hint');
  });

  it('does not count a flag as an answer', () => {
    expect(screen({ answers: {}, flags: ['q1', 'q2'] })).toContain('Answer all questions to submit (2 left)');
  });

  it('shows the save text on a computer, and nothing when nothing has been saved on a phone-sized check', () => {
    expect(screen({ saveState: { kind: 'none' } })).toContain('Not saved to the server yet');
    expect(screen({ saveState: { kind: 'offline' } })).toContain('no connection');
  });

  it('speaks a save problem and keeps quiet about a save that went well', () => {
    expect(screen({ saveState: { kind: 'failed' } })).toMatch(/<p role="status"[^>]*>Not saved to the server yet/);
    expect(screen({ saveState: { kind: 'saved', at: 0 } })).not.toContain('role="status" class="text-xs');
  });

  it('says Time’s up! at 00:00, while the answers are sent, and locks the controls', () => {
    const html = screen({ remainingMs: 0 });
    expect(html).toContain('Time&#x27;s up!');
    expect(html).toContain('Submitting your answers…');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
    expect(html).toMatch(/<input[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Question 1/);
  });

  it('says the answers are still being sent when the automatic submit has failed', () => {
    const html = screen({ remainingMs: 0, error: 'No connection.' });
    expect(html).toContain('We are still trying to send your answers. Stay on this page.');
    expect(html).not.toContain('Submitting your answers…');
  });

  it('says nothing about time being up while there is time', () => {
    expect(screen()).not.toContain('Time&#x27;s up!');
    expect(screen({ remainingMs: 1 })).not.toContain('Time&#x27;s up!');
  });
});

describe('the take page and its hooks', () => {
  it('is a lazy, student-only route at /dashboard/list/exams/:examId/take', () => {
    expect(routes).toMatch(/exams\/:examId\/take"\s+element=\{\s+role === "student" \? \(\s+<ExamTakePage \/>/);
    expect(lazy).toContain('ExamTakePage: () => import("@/scenes/(dashboard)/list/exams/take")');
    expect(lazy).toContain('export const ExamTakePage = lazy(load.ExamTakePage)');
  });

  it('opens no live listener, and reads the questions only once the attempt exists (the rules require it), with a few tries', () => {
    expect(attemptHook).not.toContain('onSnapshot');
    expect(attemptHook.match(/loadAttemptQuestions\(/g)).toHaveLength(1);
    expect(attemptHook).toContain('await loadQuestionsWithRetry(institutionId, exam.id)');
    // begin() creates the attempt and only then enters it, which reads the questions
    const begin = attemptHook.slice(attemptHook.indexOf('const begin = useCallback'));
    expect(begin).not.toContain('loadAttemptQuestions');
    expect(begin.indexOf('await startAttempt(')).toBeLessThan(begin.indexOf('await enterAttempt('));
  });

  it('turns away an exam that is not for the student’s class, and resumes an existing attempt', () => {
    expect(attemptHook).toContain('examsForStudent([exam], { classId, classIds, classSubjects }).length === 0');
    expect(attemptHook).toContain('if (attempt) {\n          await enterAttempt(exam, attempt, offsetMs);');
  });

  it('resumes with the order worked out from the stored seed and the newer of the local backup and the last checkpoint', () => {
    expect(attemptHook).toContain('orderQuestions(doc.items, orderFromSeed(doc.items, exam.shuffle !== false, attempt.seed ?? ""))');
    expect(attemptHook).toContain('mergeLocalDraft(');
    expect(attemptHook).toContain('readExamDraft(uid, institutionId, exam.id)');
  });

  it('carries on with an attempt that was created even if reading it back failed', () => {
    expect(attemptHook).toContain('const existing = await loadMyAttempt(institutionId, exam.id, uid).catch(() => null)');
  });

  it('saves a checkpoint only when something changed and the exam’s interval has passed', () => {
    expect(runningHook).toContain('checkpointDue({ dirty, lastSavedMs: lastSavedAt.current');
    expect(runningHook).toContain('intervalMinutes: exam.checkpointMinutes ?? 10');
    expect(runningHook).toContain('await saveCheckpoint(');
  });

  it('keeps the backup on every change, removes it on submit, and counts a leave once', () => {
    expect(runningHook).toContain('writeExamDraft(uid, institutionId, examId');
    expect(runningHook).toContain('clearExamDraft(uid, institutionId, examId)');
    // the leave is counted once, by the activity log (examActivity.ts, tested against trackAway)
    expect(runningHook).toContain('useActivityLog({');
    expect(runningHook).not.toContain('trackAway');
    expect(activityHook).toContain('"visibilitychange"');
    expect(activityHook).toContain('applyObservation(');
  });

  it('submits at time-up with the timeout reason and again if the connection was down', () => {
    expect(runningHook).toContain('void submit("timeout")');
    expect(runningHook).toContain('RETRY_SUBMIT_MS');
    expect(runningHook).toContain('if (outcome === "late")');
  });

  it('picks up extra time a teacher has added: it reads its own deadline from the server near the end and at time-up, and moves the deadline later, never earlier', () => {
    expect(runningHook).toContain('loadMyDeadline(institutionId, examId, uid)');
    expect(runningHook).toContain('moved > deadlineRef.current');
    expect(runningHook).toContain('setDeadlineMs(moved)');
    expect(runningHook).toContain('useState(session.deadlineMs)');
  });

  it('asks before the page is closed or reloaded', () => {
    expect(runningHook).toContain('addEventListener("beforeunload"');
  });

  it('keeps the student active for the exam, its extra time and ten minutes', () => {
    expect(page).toContain('(exam.duration ?? 0) + session.extraMinutes + 10) * 60_000');
    expect(norm(attemptHookRaw)).not.toContain('KEEP_ALIVE');
  });
});
