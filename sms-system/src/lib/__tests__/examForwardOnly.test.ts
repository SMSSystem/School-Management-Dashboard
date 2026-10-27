import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ExamAttemptScreen from '../../components/exam/take/ExamAttemptScreen';
import ExamStartScreen from '../../components/exam/take/ExamStartScreen';
import QuestionNavigator from '../../components/exam/take/QuestionNavigator';
import { canGoTo, forwardState, isForwardOnly, navigatorState, resumeIndex } from '../examTakeLogic';
import runningRaw from '../../hooks/useRunningAttempt.ts?raw';
import takePageRaw from '../../scenes/(dashboard)/list/exams/take/index.tsx?raw';
import previewRaw from '../../scenes/(dashboard)/list/exams/preview/index.tsx?raw';
import previewScreenRaw from '../../components/exam/take/ExamPreviewScreen.tsx?raw';
import type { ExamQuestion } from '@/types/exams';

// Forward-only navigation (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.2): the student moves to the next question and
// cannot go back. It counts only with Unsupervised.

const norm = (s: string) => s.split('\r\n').join('\n');
const running = norm(runningRaw);
const takePage = norm(takePageRaw);
// The page holds the data and the state; ExamPreviewScreen draws it. Both are the preview.
const preview = norm(previewRaw) + norm(previewScreenRaw);
const noop = () => undefined;

const q = (id: string): ExamQuestion => ({ id, text: `Text of ${id}`, kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1 });
const questions = [q('q1'), q('q2'), q('q3'), q('q4')];

describe('whether an exam is forward only', () => {
  it('needs the tick and Unsupervised, and nothing else counts', () => {
    expect(isForwardOnly({ forwardOnly: true, integrity: 'unsupervised' })).toBe(true);
    expect(isForwardOnly({ forwardOnly: true, integrity: 'supervised' })).toBe(false);
    expect(isForwardOnly({ forwardOnly: true })).toBe(false);
    expect(isForwardOnly({ forwardOnly: false, integrity: 'unsupervised' })).toBe(false);
    expect(isForwardOnly({ integrity: 'unsupervised' })).toBe(false);
  });
});

describe('where a student may go', () => {
  it('anywhere inside the exam when it is free', () => {
    expect(canGoTo(2, 0, false, 4)).toBe(true);
    expect(canGoTo(0, 3, false, 4)).toBe(true);
    expect(canGoTo(0, 4, false, 4)).toBe(false);
    expect(canGoTo(0, -1, false, 4)).toBe(false);
    expect(canGoTo(0, 1.5, false, 4)).toBe(false);
  });

  it('only to the next question, or staying, when it is forward only', () => {
    expect(canGoTo(1, 2, true, 4)).toBe(true);
    expect(canGoTo(1, 1, true, 4)).toBe(true);
    expect(canGoTo(1, 0, true, 4)).toBe(false);
    expect(canGoTo(1, 3, true, 4)).toBe(false);
    expect(canGoTo(3, 4, true, 4)).toBe(false);
  });

  it('knows a button is current, already left or not reached yet', () => {
    expect([0, 1, 2, 3].map((i) => forwardState(i, 2))).toEqual(['left', 'left', 'current', 'ahead']);
  });
});

describe('where a forward-only attempt reopens', () => {
  it('on the question after the last one answered, which the student had left, and on the first when none is', () => {
    expect(resumeIndex(questions, {}, true)).toBe(0);
    expect(resumeIndex(questions, { q1: ['a'], q2: ['b'] }, true)).toBe(2);
    expect(resumeIndex(questions, { q1: ['a'], q3: ['a'] }, true)).toBe(3);
    expect(resumeIndex(questions, { q2: ['zzz'] }, true)).toBe(0);
  });

  it('on the last question when that is the one answered, and on the first for an exam with no questions', () => {
    expect(resumeIndex(questions, { q1: ['a'], q2: ['a'], q3: ['a'], q4: ['a'] }, true)).toBe(3);
    expect(resumeIndex([], {}, true)).toBe(0);
  });

  it('on the first question for a free exam, as before', () => {
    expect(resumeIndex(questions, { q1: ['a'], q3: ['a'] }, false)).toBe(0);
  });

  it('is what the running attempt starts from, and it refuses a jump in the same place it moves', () => {
    expect(running).toContain('useState(() => resumeIndex(questions, session.initial.answers, forwardOnly))');
    expect(running).toContain('canGoTo(from, target, forwardOnly, questions.length, canAdvance(questions[from], latest.current.answers, forwardOnly)) ? target : from');
    expect(running).toContain('const forwardOnly = isForwardOnly(exam);');
  });
});

describe('the numbered buttons', () => {
  const nav = (forwardOnly: boolean) =>
    renderToStaticMarkup(createElement(QuestionNavigator, { items: navigatorState(questions, { q1: ['a'] }, []), currentId: 'q2', onSelect: noop, forwardOnly }));

  it('are all available in a free exam', () => {
    expect(nav(false)).not.toContain('disabled');
    expect(nav(false)).not.toContain('cannot go back');
  });

  it('are off except the current one in a forward-only exam, and each says why', () => {
    const html = nav(true);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Question 1, answered, already left, you cannot go back"');
    expect(html).toContain('aria-label="Question 3, not answered, not reached yet"');
    expect(html).toContain('aria-label="Question 2, not answered" aria-current="true"');
  });
});

describe('the attempt screen', () => {
  const screen = (forwardOnly: boolean, current: number, answers: Record<string, string[]> = {}) =>
    renderToStaticMarkup(
      createElement(ExamAttemptScreen, {
        title: 'Quiz',
        subtitle: 'Maths',
        remainingMs: 60_000,
        questions,
        answers,
        flags: [],
        current,
        saveState: { kind: 'saved', at: 0 },
        keepAliveCapMs: 1000,
        error: null,
        pictures: { stateOf: () => 'loading' as const, srcOf: () => undefined, retry: noop },
        unsupervised: forwardOnly,
        watermark: 'Ada Brown · 7K2Q9F',
        forwardOnly,
        onSelect: noop,
        onToggleOption: noop,
        onToggleFlag: noop,
        onSubmit: noop,
      }),
    );

  it('turns Previous off and says you cannot come back, in a forward-only exam', () => {
    const html = screen(true, 1, { q2: ['a'] });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(html).toMatch(/<button[^>]*>Next/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(html).toContain('Once you move to the next question you cannot come back to this one.');
  });

  it('does not let the student move on from a question they have not answered, and says so', () => {
    const html = screen(true, 1);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(html).toContain('id="advance-hint"');
    expect(html).toContain('Choose an answer to continue');
    expect(html).toContain('aria-describedby="advance-hint"');
  });

  it('says nothing of the sort on the last question, where there is no next', () => {
    expect(screen(true, 3)).not.toContain('Choose an answer to continue');
  });

  it('lets a free exam move on without an answer', () => {
    const html = screen(false, 1);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(html).not.toContain('Choose an answer to continue');
  });

  it('keeps Previous for a free exam, and says nothing about coming back', () => {
    const html = screen(false, 1);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(html).not.toContain('you cannot come back');
  });

  it('gates Submit like any exam: off until every question is answered, with how many are left', () => {
    const html = screen(true, 0);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
    expect(html).toContain('Answer all questions to submit (4 left)');
    const all = screen(true, 3, { q1: ['a'], q2: ['a'], q3: ['a'], q4: ['a'] });
    expect(all).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
    expect(all).not.toContain('Answer all questions to submit');
  });
});

describe('the start screen and the screens that do not apply', () => {
  const start = (forwardOnly: boolean) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ExamStartScreen, {
          title: 'Quiz',
          subtitle: 'Maths',
          questionCount: 3,
          durationMinutes: 30,
          extraMinutes: 0,
          checkpointMinutes: 10,
          opensAtMs: 0,
          closesAtMs: 1,
          opensYet: true,
          lateNote: null,
          starting: false,
          error: null,
          unsupervised: true,
          forwardOnly,
          onStart: noop,
        }),
      ),
    );

  it('tells the student before they start', () => {
    expect(start(true)).toContain('You answer the questions in order');
    expect(start(true)).toContain('you cannot come back to this one');
    expect(start(false)).not.toContain('You answer the questions in order');
  });

  it('is passed from the exam on the take page', () => {
    expect(takePage).toContain('forwardOnly={isForwardOnly(exam)}');
    expect(takePage).toContain('forwardOnly={run.forwardOnly}');
  });

  it('leaves the staff preview free, with a note when the exam is forward only', () => {
    expect(preview).toContain('isForwardOnly(exam)');
    expect(preview).toContain('In this preview you can move freely.');
    expect(preview).not.toMatch(/canGoTo|forwardOnly=\{(?!false)/);
  });
});
