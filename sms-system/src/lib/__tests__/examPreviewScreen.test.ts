import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ExamPreviewScreen, { type PreviewScreenExam } from '../../components/exam/take/ExamPreviewScreen';
import ExamStickyHeader from '../../components/exam/take/ExamStickyHeader';
import QuestionSheet from '../../components/exam/take/QuestionSheet';
import pageRaw from '../../scenes/(dashboard)/list/exams/preview/index.tsx?raw';
import screenRaw from '../../components/exam/take/ExamPreviewScreen.tsx?raw';
import attemptRaw from '../../components/exam/take/ExamAttemptScreen.tsx?raw';
import type { ExamQuestion } from '@/types/exams';

// The staff preview in the carousel layout (a phone, or a tablet held upright) and out of it: the same bars, list of
// questions, swipe and slide as the student's attempt, without a clock and without Submit; elsewhere the page it always was.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const screenSource = norm(screenRaw);
const attempt = norm(attemptRaw);
const noop = () => undefined;

const q = (id: string, text: string): ExamQuestion => ({
  id,
  text,
  kind: 'single',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  points: 1,
});
const questions = [q('q1', 'What is 2 + 2?'), q('q2', 'What is 3 + 4?'), q('q3', 'What is 5 + 5?')];
const exam = { id: 'e1', title: 'Unit 3 Quiz', className: '3A', subjectName: 'Maths', duration: 30, shuffle: true } as unknown as PreviewScreenExam;

const render = (over: Partial<Parameters<typeof ExamPreviewScreen>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ExamPreviewScreen, {
      exam,
      questions,
      back: createElement('a', { href: '/back' }, '← Back to the builder'),
      current: 0,
      answers: { q1: ['b'] },
      flags: [],
      srcOf: () => undefined,
      carouselLayout: true,
      onSelect: noop,
      onToggleOption: noop,
      onToggleFlag: noop,
      onShuffle: noop,
      onClear: noop,
      ...over,
    }),
  );

describe('the preview in the carousel layout', () => {
  it('is the shared frame, marked as a preview so the bars can stick', () => {
    const html = render();
    expect(html).toContain('data-exam-preview');
    expect(html).not.toContain('data-exam-attempt');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toMatch(/<header class="sticky top-0 z-30/);
    expect(html).toMatch(/<div class="sticky bottom-0 z-30/);
  });

  it('has a bar at the top with the exam name and where the preview is, and no clock', () => {
    const html = render();
    expect(html).toContain('Unit 3 Quiz');
    expect(html).toContain('Question 1 of 3 · 1 answered');
    expect(html).toContain('>Preview</span>');
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain('Time left');
    expect(html).not.toContain('Not saved');
  });

  it('keeps the note that nothing is saved, and the exam’s details', () => {
    const html = render();
    expect(html).toContain('Preview — nothing is saved.');
    expect(html).toContain('A student also has a countdown timer and a Submit');
    expect(html).toContain('3A · Maths · 30 minutes');
    expect(html).toContain('← Back to the builder');
  });

  it('says when the exam is forward only, and still lets staff move freely', () => {
    const html = render({ exam: { ...exam, forwardOnly: true, integrity: 'unsupervised' } as unknown as PreviewScreenExam });
    expect(html).toContain('This exam is forward only');
    expect(html).toContain('In this preview you can move freely.');
    expect(render()).not.toContain('This exam is forward only');
  });

  it('has Previous, Questions with how many are not answered, and Next, and no Submit', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(html).toContain('aria-label="Questions, 2 not answered"');
    expect(html).toMatch(/<button[^>]*>Next/);
    expect(html).not.toContain('Submit exam');
  });

  it('keeps Next, off, on the last question instead of turning it into Submit', () => {
    const html = render({ current: 2 });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(html).not.toContain('Submit exam');
    expect(html).not.toContain('submit-hint');
  });

  it('has no row of numbered buttons, no answered row, no watermark and no copy deterrents', () => {
    const html = render();
    expect(html).not.toContain('<nav aria-label="Questions"');
    expect(html).not.toContain('Answered 1 of 3');
    expect(html).not.toContain('select-none');
    expect(html).not.toContain('print:hidden');
    expect(html).toContain('What is 2 + 2?');
  });

  it('shows no sheet until the Questions button is pressed, and the sheet is a state of the screen only', () => {
    expect(render()).not.toContain('role="dialog"');
    expect(screenSource).toContain('onOpenQuestions={() => setSheetOpen(true)}');
    expect(screenSource).toContain('if (!carousel) setSheetOpen(false);');
  });

  it('swipes freely, whatever the exam says about going back', () => {
    expect(screenSource).toContain('swipeTarget(direction, { index, total: questions.length, forwardOnly: false, currentAnswered: true })');
  });
});

describe('the preview outside the carousel layout', () => {
  const html = render({ carouselLayout: false });

  it('is the page it always was: the note, the title, the answered count, the tools, the numbered buttons and the buttons', () => {
    expect(html).not.toContain('data-exam-preview');
    expect(html).toContain('<h1 class="text-lg font-semibold">Unit 3 Quiz</h1>');
    expect(html).toContain('Answered 1 of 3');
    expect(html).toContain('Shuffle again');
    expect(html).toContain('Clear my answers');
    expect(html).toContain('<nav aria-label="Questions"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(html).toContain('Preview — nothing is saved.');
  });

  it('leaves Shuffle again out when the exam does not shuffle', () => {
    expect(render({ carouselLayout: false, exam: { ...exam, shuffle: false } as unknown as PreviewScreenExam })).not.toContain('Shuffle again');
  });

  it('says so when there are no questions, in either layout', () => {
    for (const carouselLayout of [true, false]) {
      const empty = render({ questions: [], carouselLayout });
      expect(empty).toContain('This exam has no questions yet. Add some in the builder.');
      expect(empty).not.toContain('data-exam-preview');
    }
  });
});

describe('the pieces it shares with the attempt', () => {
  it('a header without a time left has a Preview pill and no clock; with one it has the clock', () => {
    const props = { title: 'Quiz', subtitle: '', position: 'Question 1 of 3 · 0 answered', saveText: null, saveRole: undefined, timeUp: false, sendingFailed: false };
    const without = renderToStaticMarkup(createElement(ExamStickyHeader, props));
    expect(without).toContain('Preview');
    expect(without).not.toContain('role="timer"');
    const withClock = renderToStaticMarkup(createElement(ExamStickyHeader, { ...props, remainingMs: 60_000 }));
    expect(withClock).toContain('role="timer"');
    expect(withClock).not.toContain('>Preview<');
  });

  it('a sheet without Submit shows the preview tools; the default sheet keeps Submit and has no tools', () => {
    const items = [{ id: 'q1', number: 1, answered: true, flagged: false }];
    const base = { items, currentId: 'q1', forwardOnly: false, timeUp: false, unanswered: 0, onSelect: noop, onSubmit: noop, onClose: noop };
    const preview = renderToStaticMarkup(createElement(QuestionSheet, { ...base, showSubmit: false, tools: createElement('button', null, 'Clear my answers') }));
    expect(preview).toContain('Preview tools');
    expect(preview).toContain('Clear my answers');
    expect(preview).not.toContain('Submit exam');
    const normal = renderToStaticMarkup(createElement(QuestionSheet, base));
    expect(normal).toContain('Submit exam');
    expect(normal).not.toContain('Preview tools');
  });

  it('the two screens use the same frame', () => {
    expect(attempt).toContain('<CarouselFrame');
    expect(attempt).toContain('kind="attempt"');
    expect(screenSource).toContain('<CarouselFrame');
    expect(screenSource).toContain('kind="preview"');
  });
});

describe('the page', () => {
  it('only reads the exam and holds the state: it writes nothing, and draws through the screen', () => {
    expect(page).not.toMatch(/setDoc|updateDoc|addDoc|writeBatch|serverTimestamp/);
    expect(page).toContain('<ExamPreviewScreen');
    expect(page).toContain('useState<Record<string, string[]>>({})');
  });
});
