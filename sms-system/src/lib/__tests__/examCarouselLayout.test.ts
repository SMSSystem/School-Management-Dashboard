/// <reference types="node" />
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ExamAttemptScreen from '../../components/exam/take/ExamAttemptScreen';
import barRaw from '../../components/exam/take/ExamBottomBar.tsx?raw';
import headerRaw from '../../components/exam/take/ExamStickyHeader.tsx?raw';
import screenRaw from '../../components/exam/take/ExamAttemptScreen.tsx?raw';
import frameRaw from '../../components/exam/take/CarouselFrame.tsx?raw';
import type { ExamQuestion } from '@/types/exams';

// The attempt screen in the carousel layout (a phone, or a tablet held upright): a bar at the top that sticks with the
// clock, a bar at the bottom that sticks with the buttons, and one clock only. The same screen outside it is covered in
// examTakeScreens.test.ts and examForwardOnly.test.ts.

const norm = (s: string) => s.split('\r\n').join('\n');
// A stylesheet imported with ?raw comes back empty under the test runner, so it is read from disk.
const css = norm(readFileSync(new URL('../../index.css', import.meta.url), 'utf8'));
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

const screen = (over: Partial<Parameters<typeof ExamAttemptScreen>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ExamAttemptScreen, {
      title: 'Unit 3 Quiz',
      subtitle: 'Maths · 3A',
      remainingMs: 20 * 60_000,
      questions,
      answers: { q1: ['b'] },
      flags: [],
      current: 0,
      saveState: { kind: 'none' },
      keepAliveCapMs: 1000,
      error: null,
      pictures: { stateOf: () => 'loading' as const, srcOf: () => undefined, retry: noop },
      unsupervised: false,
      watermark: 'Ada Brown',
      carouselLayout: true,
      onSelect: noop,
      onToggleOption: noop,
      onToggleFlag: noop,
      onSubmit: noop,
      ...over,
    }),
  );

describe('the layout is the carousel one only when asked', () => {
  it('is marked, so the page can let the bars stick', () => {
    expect(screen()).toContain('data-exam-attempt');
    expect(screen({ carouselLayout: false })).not.toContain('data-exam-attempt');
  });

  it('has one clock, in the bar at the top, and never a second', () => {
    for (const html of [screen(), screen({ carouselLayout: false })]) {
      expect(html.match(/role="timer"/g)).toHaveLength(1);
    }
    const html = screen();
    expect(html.indexOf('role="timer"')).toBeLessThan(html.indexOf('<header') + html.slice(html.indexOf('<header')).indexOf('</header>'));
  });
});

describe('the bar at the top', () => {
  it('sticks to the top with an opaque background, below the dialogs', () => {
    const html = screen();
    expect(html).toMatch(/<header class="sticky top-0 z-30[^"]*bg-white/);
  });

  it('holds the exam name on one line, the clock and where the student is', () => {
    const html = screen();
    expect(html).toContain('truncate');
    expect(html).toContain('Unit 3 Quiz');
    expect(html).toContain('20:00');
    expect(html).toContain('Question 1 of 3 · 1 answered');
  });

  it('does not repeat "Answered N of M" or the subtitle block of the other layout', () => {
    const html = screen();
    expect(html).not.toContain('Answered 1 of 3');
    expect(html).not.toContain('<p class="text-sm text-gray-500 dark:text-gray-400">Maths');
  });

  it('shows what is known about saving, but not "nothing saved yet", and speaks a problem', () => {
    expect(screen({ saveState: { kind: 'none' } })).not.toContain('Not saved to the server yet');
    expect(screen({ saveState: { kind: 'saving' } })).not.toContain('Saving');
    expect(screen({ saveState: { kind: 'saved', at: Date.UTC(2026, 9, 26, 15, 42) } })).toContain('Saved at 10:42');
    expect(screen({ saveState: { kind: 'offline' } })).toMatch(/<p role="status"[^>]*>Not saved to the server: no connection/);
  });

  it('says Time’s up! inside the bar, so it stays in view', () => {
    const html = screen({ remainingMs: 0 });
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(header).toContain('Time&#x27;s up!');
    expect(header).toContain('Submitting your answers…');
  });
});

describe('the bar at the bottom', () => {
  it('sticks to the bottom, clear of a phone\u2019s home indicator, with big buttons', () => {
    const html = screen();
    expect(html).toMatch(/<div class="sticky bottom-0 z-30[^"]*bg-white/);
    expect(html).toContain('pb-[max(0.5rem,env(safe-area-inset-bottom))]');
    expect(html.match(/min-h-11/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('has Previous, Questions with how many are not answered, and Next, and no Submit before the last question', () => {
    const first = screen();
    expect(first).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(first).toMatch(/<button[^>]*aria-label="Questions, 2 not answered"[^>]*>Questions<span[^>]*>2<\/span>/);
    expect(first).toMatch(/<button[^>]*>Next/);
    expect(first).not.toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(first).not.toContain('Submit exam');
    expect(first).not.toContain('submit-hint');
  });

  it('says all are answered, with no badge, when they are', () => {
    const html = screen({ answers: { q1: ['a'], q2: ['a'], q3: ['a'] } });
    expect(html).toContain('aria-label="Questions, all answered"');
    expect(html).not.toMatch(/Questions<span/);
  });

  it('turns Next into Submit on the last question, off with how many are left until every question is answered', () => {
    const open = screen({ current: 2 });
    expect(open).not.toMatch(/>Next</);
    expect(open).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="submit-hint"[^>]*>Submit exam/);
    expect(open).toContain('Answer all questions to submit (2 left)');
    const done = screen({ answers: { q1: ['a'], q2: ['a'], q3: ['a'] }, current: 2 });
    expect(done).toContain('Submit exam');
    expect(done).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
    expect(done).not.toContain('submit-hint');
  });

  it('keeps the forward-only wait with its hint, in the bar', () => {
    const html = screen({ forwardOnly: true, answers: {}, current: 0 });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="advance-hint"[^>]*>Next/);
    expect(html).toContain('Choose an answer to continue');
    expect(html.match(/id="advance-hint"/g)).toHaveLength(1);
  });

  it('is locked at 00:00', () => {
    const html = screen({ remainingMs: 0, current: 1 });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(screen({ remainingMs: 0, current: 2, answers: { q1: ['a'], q2: ['a'], q3: ['a'] } })).toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
  });
});

describe('what the page no longer holds, and what it still does', () => {
  it('has no row of numbered buttons in the page: the Questions button opens them', () => {
    const html = screen();
    expect(html).not.toContain('<nav aria-label="Questions"');
    expect(html).not.toContain('aria-label="Question 1, answered');
  });

  it('still shows the question and the forward-only note', () => {
    const html = screen({ forwardOnly: true, answers: { q1: ['a'] } });
    expect(html).toContain('What is 2 + 2?');
    expect(html).toContain('Once you move to the next question you cannot come back to this one.');
  });

  it('keeps the numbered buttons in the page of the other layout', () => {
    expect(screen({ carouselLayout: false })).toContain('<nav aria-label="Questions"');
  });
});

describe('how the bars are made to stick', () => {
  it('lets the dashboard’s tour wrapper clip without scrolling, on the attempt screen only', () => {
    expect(css).toContain('#main-viewport:has([data-exam-attempt], [data-exam-preview]) {\n  overflow: clip !important;\n}');
  });

  it('sticks inside the scrolling area, never fixed to the window, so the sidebar of a tablet is respected', () => {
    for (const raw of [barRaw, headerRaw, screenRaw]) expect(norm(raw)).not.toMatch(/className="[^"]*\bfixed\b/);
    expect(norm(barRaw)).toContain('sticky bottom-0');
    expect(norm(headerRaw)).toContain('sticky top-0');
  });

  it('fills the height under the 56 px header so the bottom bar rests on the bottom of a short question', () => {
    expect(norm(frameRaw)).toContain('min-h-[calc(100dvh-3.5rem)]');
  });
});
