import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ExamAttemptScreen from '../../components/exam/take/ExamAttemptScreen';
import ExamStartScreen from '../../components/exam/take/ExamStartScreen';
import ExamWatermark from '../../components/exam/take/ExamWatermark';
import PictureZoom from '../../components/exam/take/PictureZoom';
import { WatermarkContext } from '../../components/exam/take/examWatermarkContext';
import { MemoryRouter } from 'react-router-dom';
import { enterFullscreen, fullscreenChange, fullscreenSupported, isFullscreen, watermarkText } from '../examFullscreen';
import { EXAM_ACTIVITY_THRESHOLDS, reviewNeeded, summarizeActivity } from '../examActivity';
import attemptScreenRaw from '../../components/exam/take/ExamAttemptScreen.tsx?raw';
import activityRaw from '../../hooks/useActivityLog.ts?raw';
import runningRaw from '../../hooks/useRunningAttempt.ts?raw';
import takePageRaw from '../../scenes/(dashboard)/list/exams/take/index.tsx?raw';
import previewRaw from '../../scenes/(dashboard)/list/exams/preview/index.tsx?raw';
import type { ExamQuestion, ExamQuestionImage } from '@/types/exams';

// An unsupervised exam (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.2): fullscreen asked for and its exits recorded,
// the faint mark with the student's name, the start screen's words and the stricter Review mark. Nothing here blocks.

const norm = (s: string) => s.split('\r\n').join('\n');
const activity = norm(activityRaw);
const running = norm(runningRaw);
const takePage = norm(takePageRaw);
const preview = norm(previewRaw);
const noop = () => undefined;

describe('what the browser says about fullscreen', () => {
  it('is supported when the standard or the WebKit name says so, and not otherwise (an iPhone has neither)', () => {
    expect(fullscreenSupported({ fullscreenEnabled: true })).toBe(true);
    expect(fullscreenSupported({ webkitFullscreenEnabled: true })).toBe(true);
    expect(fullscreenSupported({ fullscreenEnabled: false })).toBe(false);
    expect(fullscreenSupported({})).toBe(false);
  });

  it('is on when an element is fullscreen, by either name', () => {
    expect(isFullscreen({ fullscreenElement: {} })).toBe(true);
    expect(isFullscreen({ webkitFullscreenElement: {} })).toBe(true);
    expect(isFullscreen({ fullscreenElement: null })).toBe(false);
    expect(isFullscreen({})).toBe(false);
  });
});

describe('asking for fullscreen', () => {
  it('uses the standard request, then the WebKit one, and reports whether it went in', async () => {
    let asked = 0;
    expect(await enterFullscreen({ requestFullscreen: async () => void (asked += 1) })).toBe(true);
    expect(await enterFullscreen({ webkitRequestFullscreen: () => void (asked += 1) })).toBe(true);
    expect(asked).toBe(2);
  });

  it('never throws: a refusal or a missing API is just false', async () => {
    expect(await enterFullscreen({ requestFullscreen: () => Promise.reject(new Error('not from a click')) })).toBe(false);
    expect(
      await enterFullscreen({
        requestFullscreen: () => {
          throw new Error('denied');
        },
      }),
    ).toBe(false);
    expect(await enterFullscreen({})).toBe(false);
  });
});

describe('the log of fullscreen', () => {
  it('records leaving fullscreen after being in it, and nothing else', () => {
    expect(fullscreenChange(true, false)).toBe('fs_exit');
    expect(fullscreenChange(false, true)).toBeNull();
    expect(fullscreenChange(true, true)).toBeNull();
    expect(fullscreenChange(false, false)).toBeNull();
  });

  it('is on only for an unsupervised exam, says once that fullscreen is not available, and blocks nothing', () => {
    expect(running).toContain('trackFullscreen: exam.integrity === "unsupervised"');
    expect(activity).toContain('if (!trackFullscreen) return undefined;');
    expect(activity).toContain('!eventsRef.current.some((e) => e.k === "fs_unavailable")');
    expect(activity).toContain('"fs_unavailable"');
    expect(activity).toContain('fullscreenChange(was, now)');
    expect(activity).not.toMatch(/requestFullscreen|exitFullscreen/);
  });
});

describe('the mark on the paper', () => {
  it('is the name and the first six characters of the account id, in capitals', () => {
    expect(watermarkText('Ada Brown', '7k2q9fxyz123')).toBe('Ada Brown · 7K2Q9F');
    expect(watermarkText('  Ada   Brown ', 'ab-12_cd34')).toBe('Ada Brown · AB12CD');
    expect(watermarkText('', 'abc')).toBe('Student · ABC');
    expect(watermarkText(null, null)).toBe('Student');
  });

  const mark = (text: string | null) => renderToStaticMarkup(createElement(WatermarkContext.Provider, { value: text }, createElement(ExamWatermark)));

  it('is a tiled text over the area that takes no pointer event and is hidden from assistive technology', () => {
    const html = mark('Ada Brown · 7K2Q9F');
    expect(html).toContain('Ada Brown · 7K2Q9F');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<pattern');
    expect(html).toContain('data-watermark');
  });

  it('draws nothing without words', () => {
    expect(mark(null)).toBe('');
    expect(mark('')).toBe('');
  });

  it('is also over the zoomed picture', () => {
    const image: ExamQuestionImage = { id: 'i', pack: 1, w: 10, h: 10, bytes: 1, exact: true, alt: 'A vice' };
    const html = renderToStaticMarkup(
      createElement(WatermarkContext.Provider, { value: 'Ada Brown · 7K2Q9F' }, createElement(PictureZoom, { image, src: 'data:image/png;base64,AAAA', onClose: noop })),
    );
    expect(html).toContain('Ada Brown · 7K2Q9F');
    expect(renderToStaticMarkup(createElement(PictureZoom, { image, src: 'data:image/png;base64,AAAA', onClose: noop }))).not.toContain('data-watermark');
  });
});

describe('the attempt screen', () => {
  const questions: ExamQuestion[] = [{ id: 'q1', text: 'Which tool?', kind: 'single', options: [{ id: 'a', text: 'A vice' }, { id: 'b', text: 'A clamp' }], points: 1 }];
  const screen = (unsupervised: boolean) =>
    renderToStaticMarkup(
      createElement(ExamAttemptScreen, {
        title: 'Quiz',
        subtitle: 'Maths',
        remainingMs: 60_000,
        questions,
        answers: {},
        flags: [],
        current: 0,
        saveStatus: 'Saved',
        keepAliveCapMs: 1000,
        error: null,
        pictures: { stateOf: () => 'loading' as const, srcOf: () => undefined, retry: noop },
        unsupervised,
        watermark: 'Ada Brown · 7K2Q9F',
        onSelect: noop,
        onToggleOption: noop,
        onToggleFlag: noop,
        onSubmit: noop,
      }),
    );

  it('marks the question area with the student for an unsupervised exam, and not for a supervised one', () => {
    expect(screen(true)).toContain('Ada Brown · 7K2Q9F');
    expect(screen(true)).toContain('data-watermark');
    expect(screen(false)).not.toContain('Ada Brown');
    expect(screen(false)).not.toContain('data-watermark');
  });

  it('does not show the way back to fullscreen where the page has no fullscreen to offer (the server render, a phone)', () => {
    expect(screen(true)).not.toContain('Return to fullscreen');
  });

  it('shows the way back only for an unsupervised exam, where fullscreen is offered and the page is not in it, and never blocks', () => {
    const source = norm(attemptScreenRaw);
    expect(source).toContain('unsupervised && fullscreen.supported && !fullscreen.active');
    expect(source).toContain('Return to fullscreen');
    expect(source).toContain('Leaving it is recorded; nothing stops you.');
    expect(source).toContain('onClick={() => void fullscreen.enter()}');
  });
});

describe('the start screen', () => {
  const start = (unsupervised?: boolean) =>
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
          unsupervised,
          onStart: noop,
        }),
      ),
    );

  it('says what an unsupervised exam does, and nothing about it for a supervised one', () => {
    expect(start(true)).toContain('This exam is unsupervised.');
    expect(start(true)).toContain('Pressing Start asks your browser for fullscreen');
    expect(start(true)).toContain('Your name and a short code are shown faintly over the questions.');
    expect(start(false)).not.toContain('unsupervised');
    expect(start()).not.toContain('fullscreen');
  });

  it('asks for fullscreen in the click on Start, before the attempt is made, and starts anyway', () => {
    expect(takePage).toContain('if (exam.integrity === "unsupervised") void enterFullscreen(document.documentElement as unknown as FullscreenElement);\n        onStart();');
    expect(takePage).toContain('unsupervised={exam.integrity === "unsupervised"}');
  });
});

describe('the Review mark of an unsupervised exam', () => {
  it('is stricter than a supervised one for the same sitting', () => {
    expect(EXAM_ACTIVITY_THRESHOLDS.unsupervised.leavesPerHour).toBeLessThan(EXAM_ACTIVITY_THRESHOLDS.supervised.leavesPerHour);
    expect(EXAM_ACTIVITY_THRESHOLDS.unsupervised.awayShare).toBeLessThan(EXAM_ACTIVITY_THRESHOLDS.supervised.awayShare);
    // 4 leaves and a short time away in a one hour exam: fine in a room, a Review at home
    expect(reviewNeeded(4, 30, 3600, 'supervised')).toBe(false);
    expect(reviewNeeded(4, 30, 3600, 'unsupervised')).toBe(true);
  });

  it('is what the summary on the grade uses for the exam’s preset', () => {
    const events = [
      { t: 10, k: 'hidden' as const, d: 20 },
      { t: 100, k: 'hidden' as const, d: 20 },
      { t: 200, k: 'hidden' as const, d: 20 },
      { t: 300, k: 'hidden' as const, d: 20 },
    ];
    const base = { events, tabSwitches: 4, durationSeconds: 3600 };
    expect(summarizeActivity({ ...base, preset: 'supervised' }).review).toBe(false);
    expect(summarizeActivity({ ...base, preset: 'unsupervised' }).review).toBe(true);
  });
});

describe('the staff preview', () => {
  it('shows no watermark and asks for no fullscreen', () => {
    expect(preview).not.toMatch(/WatermarkContext|ExamWatermark|enterFullscreen|useFullscreen/);
  });
});
