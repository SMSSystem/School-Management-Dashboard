/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CarouselRegion from '../../components/exam/take/CarouselRegion';
import QuestionSlide from '../../components/exam/take/QuestionSlide';
import swipeHookRaw from '../../hooks/useSwipe.ts?raw';
import regionRaw from '../../components/exam/take/CarouselRegion.tsx?raw';
import slideRaw from '../../components/exam/take/QuestionSlide.tsx?raw';
import screenRaw from '../../components/exam/take/ExamAttemptScreen.tsx?raw';
import viewRaw from '../../components/exam/take/StudentQuestionView.tsx?raw';
import headerRaw from '../../components/exam/take/ExamStickyHeader.tsx?raw';
import picturesRaw from '../../hooks/useExamPictures.ts?raw';
import { slideClassName } from '../examCarousel';
import { packOrder } from '../examPictureLoad';

// The slide, the announcement, the focus and the swipe of the carousel layout, as made and as wired. The arithmetic of a
// swipe is in swipeTracker.test.ts and examCarousel.test.ts.

const norm = (s: string) => s.split('\r\n').join('\n');
const swipeHook = norm(swipeHookRaw);
const region = norm(regionRaw);
const slide = norm(slideRaw);
const screen = norm(screenRaw);
const view = norm(viewRaw);
const header = norm(headerRaw);
const pictures = norm(picturesRaw);
// A stylesheet imported with ?raw comes back empty under the test runner, so it is read from disk.
const css = norm(readFileSync(new URL('../../index.css', import.meta.url), 'utf8'));
const noop = () => undefined;

describe('the stylesheet', () => {
  it('has a slide for forward, back and a jump, of 150 ms', () => {
    for (const name of ['exam-slide-forward', 'exam-slide-back', 'exam-slide-fade']) {
      expect(css).toContain(`@keyframes ${name} {`);
      expect(css).toContain(`.${name} {\n  animation: ${name} 150ms ease-out;\n}`);
    }
    expect(css).toContain('translateX(24px)');
    expect(css).toContain('translateX(-24px)');
  });

  it('takes the slide away for a person who asks for less motion, so the swap is instant', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce) {\n  .exam-slide-forward,\n  .exam-slide-back,\n  .exam-slide-fade {\n    animation: none;\n  }\n}');
  });

  it('names the same classes the code puts on a slide', () => {
    for (const direction of ['forward', 'back', 'jump'] as const) expect(css).toContain(`.${slideClassName(direction)} {`);
  });
});

describe('the carousel region', () => {
  const html = renderToStaticMarkup(createElement(CarouselRegion, { index: 2, total: 20, swipeEnabled: true, onSwipe: noop, className: 'p-4', children: createElement('p', null, 'the question') }));

  it('is a labelled carousel that lets the browser keep scrolling the page', () => {
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="Exam questions"');
    expect(html).toContain('touch-pan-y');
    expect(html).toContain('p-4');
    expect(html).toContain('the question');
  });

  it('has a polite announcement that says nothing on arrival', () => {
    expect(html).toContain('<p role="status" aria-live="polite" class="sr-only"></p>');
  });

  it('says where the student has arrived, and moves focus to the question’s heading, only when the question changes', () => {
    expect(region).toContain('if (seen.current === index) return;');
    expect(region).toContain('setMessage(positionText(index, total));');
    expect(region).toContain('querySelector<HTMLElement>("[data-question-heading]")?.focus();');
  });
});

describe('the heading and the position text', () => {
  it('can take focus without being in the tab order, and shows no ring of its own', () => {
    expect(view).toContain('data-question-heading');
    expect(view).toContain('tabIndex={-1}');
    expect(view).toContain('focus:outline-none');
  });

  it('is not spoken by the sticky bar on every answer: the region speaks, once, on a change', () => {
    expect(header).not.toContain('aria-live');
  });
});

describe('the slide', () => {
  const first = renderToStaticMarkup(createElement(QuestionSlide, { id: 'q1', index: 0, children: createElement('p', null, 'q1') }));

  it('plays no animation on arrival', () => {
    expect(first).toBe('<div data-slide="none" class=""><p>q1</p></div>');
  });

  it('is keyed by the question and works out its direction from the question before', () => {
    expect(slide).toContain('<div key={id} data-slide={slide.direction}');
    expect(slide).toContain('slideDirection(slide.index, index)');
  });

  it('is inside the element that holds the deterrents, never around it, so they are not lost with the old question', () => {
    const paper = screen.indexOf('ref={paper}');
    const slideUse = screen.indexOf('<QuestionSlide');
    expect(paper).toBeGreaterThan(-1);
    expect(slideUse).toBeGreaterThan(paper);
    expect(screen.slice(slideUse)).toContain('</div>\n      </WatermarkContext.Provider>');
  });

  it('is only in the carousel layout', () => {
    expect(screen).toContain('(carousel ? <QuestionSlide id={question.id} index={index}>{questionView}</QuestionSlide> : questionView)');
    expect(screen).toContain('<CarouselFrame');
    expect(screen).toContain('swipeEnabled={!timeUp}');
    expect(screen).toContain('onSwipe={swipe}');
  });
});

describe('the swipe', () => {
  it('goes where the buttons may go, through the one rule', () => {
    expect(screen).toContain('swipeTarget(direction, { index, total: questions.length, forwardOnly, currentAnswered: canAdvance(question, answers, forwardOnly) })');
    expect(screen).toContain('if (target !== null) onSelect(target);');
  });

  it('is off when time is up', () => {
    expect(screen).toContain('swipeEnabled={!timeUp}');
  });

  it('listens to a finger or a pen with pointer events, and never takes the gesture away from the browser', () => {
    expect(swipeHook).toContain('e.pointerType === "touch" || e.pointerType === "pen"');
    for (const name of ['pointerdown', 'pointerup', 'pointercancel']) expect(swipeHook).toContain(`"${name}"`);
    expect(swipeHook).not.toMatch(/\.preventDefault\(/);
    expect(swipeHook).not.toContain('"mouse"');
  });

  it('does not count a touch that begins in a dialog, such as the picture zoom', () => {
    expect(swipeHook).toContain('closest?.(\'[role="dialog"]\')');
    expect(swipeHook).toContain('blocked');
  });
});

describe('the pictures', () => {
  it('are read for the question on screen first and the next question’s pack second, so the next slide is ready', () => {
    const list = [{ image: { pack: 1 } }, { image: { pack: 2 } }, { image: { pack: 3 } }] as unknown as Parameters<typeof packOrder>[0];
    expect(packOrder(list, 0)).toEqual([1, 2, 3]);
    expect(packOrder(list, 1)).toEqual([2, 3, 1]);
    expect(pictures).toContain('packOrder(questions, current)');
  });
});
